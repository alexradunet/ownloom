import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type { WebSocketTransportConfig } from "../../config.js";
import type { InboundMessage } from "../../core/types.js";
import type { GatewayTransport } from "../types.js";

// Bundled web UI shipped alongside this file: dist/ui/
const BUNDLED_UI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "ui");

// ── Wire protocol ─────────────────────────────────────────────────────────────

/**
 * Messages sent from a PWA / web client to the gateway.
 *
 * Auth flow (when authToken is configured):
 *   1. Client sends `{ type: "auth", token: "..." }` as its first message.
 *   2. Gateway replies with `{ type: "auth_ok" }` or `{ type: "auth_fail" }`.
 *
 * Normal flow:
 *   1. Client sends `{ type: "message", text: "..." }`.
 *   2. Gateway streams zero or more `{ type: "chunk", text: "..." }` messages.
 *   3. Gateway sends `{ type: "done" }` when the reply is complete.
 *      (For builtin commands like /help the reply arrives as `{ type: "reply",
 *      text }` followed by `{ type: "done" }` without intermediate chunks.)
 *   4. If something goes wrong: `{ type: "error", text: "..." }`.
 */
export type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "message"; text: string };

export type ServerMessage =
  | { type: "auth_ok" }
  | { type: "auth_fail" }
  | { type: "chunk"; text: string }
  | { type: "reply"; text: string }
  | { type: "done" }
  | { type: "error"; text: string };

// ── Transport ─────────────────────────────────────────────────────────────────

/**
 * WebSocket transport — one connection = one persistent chat session.
 *
 * - HTTP server optionally serves static web UI files from `staticDir`.
 * - Each WebSocket connection gets a unique `chatId` so the Router can persist
 *   Pi session state across messages within the same connection.
 * - Passes `onChunk` to the Router so token-level streaming reaches the client.
 */
export class WebSocketTransport implements GatewayTransport {
  readonly name = "websocket";

  /** Live connections keyed by chatId. Used by sendText / sendTextToRecipient. */
  private readonly connections = new Map<string, WebSocket>();

  constructor(private readonly config: WebSocketTransportConfig) {}

  async healthCheck(): Promise<void> {
    // Server starts inside startReceiving; nothing to check before that.
  }

  startReceiving(
    onMessage: (msg: InboundMessage, onChunk?: (chunk: string) => void) => Promise<void>,
  ): Promise<never> {
    return new Promise<never>((_, reject) => {
      const server = createServer((req, res) => {
        void this.serveHttp(req, res);
      });
      const wss = new WebSocketServer({ server });

      wss.on("connection", (ws) => this.handleConnection(ws, onMessage));
      wss.on("error", (err) => {
        console.error("websocket transport: server error:", err);
        reject(err);
      });

      server.listen(this.config.port, this.config.host, () => {
        console.log(`websocket transport: listening on ${this.config.host}:${this.config.port}`);
      });
    });
  }

  async sendText(message: InboundMessage, text: string): Promise<void> {
    const ws = this.connections.get(message.chatId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "reply", text } satisfies ServerMessage));
    }
  }

  async sendTextToRecipient(recipientId: string, text: string): Promise<void> {
    // recipientId may be a bare chatId or prefixed with "websocket:"
    const key = recipientId.startsWith("websocket:") ? recipientId.slice("websocket:".length) : recipientId;
    const ws = this.connections.get(key);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "reply", text } satisfies ServerMessage));
      return;
    }
    console.warn(`websocket: no active connection for recipient ${recipientId}`);
  }

  // ── HTTP: static file server ───────────────────────────────────────────────

  private async serveHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const uiDir = resolve(this.config.staticDir ?? BUNDLED_UI_DIR);
    const url = req.url ?? "/";
    let filePath: string;
    try {
      filePath = decodeURIComponent(url.split("?")[0] ?? "/");
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    if (filePath === "/" || filePath === "") filePath = "/index.html";

    // Prevent path traversal: reject paths containing parent directory references
    if (filePath.includes("..") || filePath.includes("\0")) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    const fullPath = resolve(join(uiDir, filePath));
    // Double-check resolved path stays inside uiDir
    if (!fullPath.startsWith(uiDir + "/") && fullPath !== uiDir) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const data = await readFile(fullPath);
      res.writeHead(200, { "Content-Type": guessMime(filePath) });
      res.end(data);
    } catch {
      // SPA fallback: serve index.html for unknown paths
      try {
        const fallbackPath = resolve(join(uiDir, "index.html"));
        const data = await readFile(fallbackPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    }
  }

  // ── WebSocket: per-connection chat ────────────────────────────────────────

  private handleConnection(
    ws: WebSocket,
    onMessage: (msg: InboundMessage, onChunk?: (chunk: string) => void) => Promise<void>,
  ): void {
    const chatId = `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const senderId = `websocket:${chatId}`;

    const sendJson = (data: ServerMessage): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
    };

    const close = (reason: string): void => {
      console.log(`websocket: closing ${chatId} — ${reason}`);
      this.connections.delete(chatId);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    ws.on("close", () => {
      this.connections.delete(chatId);
      console.log(`websocket: client ${chatId} disconnected`);
    });

    ws.on("error", (err) => close(`ws error: ${err.message}`));

    const { authToken } = this.config;
    if (authToken) {
      ws.once("message", (rawData) => {
        try {
          const msg = JSON.parse(rawData.toString()) as { type?: string; token?: string };
          if (msg.type === "auth" && msg.token === authToken) {
            sendJson({ type: "auth_ok" });
            this.connections.set(chatId, ws);
            this.attachMessageHandler(ws, chatId, senderId, sendJson, close, onMessage);
          } else {
            sendJson({ type: "auth_fail" });
            close("auth failed");
          }
        } catch {
          close("invalid auth message");
        }
      });
    } else {
      this.connections.set(chatId, ws);
      this.attachMessageHandler(ws, chatId, senderId, sendJson, close, onMessage);
    }
  }

  private attachMessageHandler(
    ws: WebSocket,
    chatId: string,
    senderId: string,
    sendJson: (data: ServerMessage) => void,
    _close: (reason: string) => void,
    onMessage: (msg: InboundMessage, onChunk?: (chunk: string) => void) => Promise<void>,
  ): void {
    // Serialize messages within a connection — one in-flight at a time.
    let chain = Promise.resolve();

    ws.on("message", (rawData) => {
      let cmd: { type: string; text?: string };
      try {
        cmd = JSON.parse(rawData.toString()) as typeof cmd;
      } catch {
        console.warn("websocket: invalid JSON from client, ignoring");
        return;
      }

      if (cmd.type !== "message") {
        console.warn(`websocket: unknown client message type: ${cmd.type}`);
        return;
      }

      const text = cmd.text ?? "";
      const inbound: InboundMessage = {
        channel: "websocket",
        chatId,
        senderId,
        messageId: `wsmsg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toISOString(),
        text,
        isGroup: false,
        access: {
          allowedSenderIds: [senderId],
          adminSenderIds: [senderId],
          directMessagesOnly: false,
          selfSenderIds: [],
        },
      };

      const onChunk = (chunk: string): void => sendJson({ type: "chunk", text: chunk });

      // Queue behind any in-flight message for this connection
      chain = chain
        .catch(() => undefined)
        .then(async () => {
          try {
            await onMessage(inbound, onChunk);
            sendJson({ type: "done" });
          } catch (err) {
            const text = err instanceof Error ? err.message : String(err);
            console.error(`websocket: message handler failed for ${chatId}:`, err);
            sendJson({ type: "error", text });
          }
        });
    });
  }
}

// ── MIME helpers ───────────────────────────────────────────────────────────────

function guessMime(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}
