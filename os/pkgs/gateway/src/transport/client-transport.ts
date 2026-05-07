import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  type ConnectFrame,
  type ResponseFrame,
  type EventFrame,
  type ClientFrame,
  type ConnectOkPayload,
  EVENTS,
  type AgentAcceptedPayload,
} from "../protocol/types.js";
import { MethodRegistry, registerV1Methods, type ConnectedClient, type MethodContext, type MethodResult } from "../protocol/methods.js";
import type { ClientTransportConfig } from "../config.js";
import type { InboundMessage } from "../core/types.js";
import type { GatewayTransport } from "../transports/types.js";
import type { Store } from "../core/store.js";
import type { CommandRegistry } from "../core/commands.js";
import type { IdentityResolver, Identity } from "../core/identity.js";
import type { Router } from "../core/router.js";

// ── ClientTransport ──────────────────────────────────────────────────────────
// First-party client transport. Speaks protocol/v1 only:
//   connect -> res hello-ok
//   req     -> res
//   event   <- server-pushed events
// No legacy web-chat protocol and no bundled static UI.

export class ClientTransport implements GatewayTransport {
  readonly name = "client";

  private readonly connections = new Map<string, { ws: WebSocket; client: ConnectedClient }>();
  private readonly methodRegistry = new MethodRegistry();
  private router!: Router;
  private startedAtMs = Date.now();

  constructor(
    private readonly config: ClientTransportConfig,
    private readonly store: Store,
    private readonly commands: CommandRegistry,
    private readonly identityResolver?: IdentityResolver,
    private readonly agentName = "pi",
    private readonly transportNames: string[] = [],
  ) {
    registerV1Methods(this.methodRegistry, {
      store,
      commands,
      identityResolver,
      agentName,
      transportNames,
      startedAtMs: this.startedAtMs,
      handleAgent: (ctx) => this.handleAgentMethod(ctx),
    });
  }

  /** Must be called before startReceiving so the agent method can reach the Router. */
  setRouter(router: Router): void {
    this.router = router;
  }

  async healthCheck(): Promise<void> {
    // Server starts inside startReceiving; nothing to check before that.
  }

  startReceiving(_onMessage: (msg: InboundMessage, onChunk?: (chunk: string) => void) => Promise<void>): Promise<never> {
    return new Promise<never>((_, reject) => {
      const server = createServer((req, res) => {
        void this.serveHttp(req, res);
      });
      const wss = new WebSocketServer({ server });

      wss.on("connection", (ws) => this.handleConnection(ws));
      wss.on("error", (err) => {
        console.error("client transport: server error:", err);
        reject(err);
      });

      server.listen(this.config.port, this.config.host, () => {
        console.log(`client transport: listening on ${this.config.host}:${this.config.port}`);
      });
    });
  }

  async sendText(message: InboundMessage, text: string): Promise<void> {
    await this.sendTextToRecipient(`client:${message.chatId}`, text);
  }

  async sendTextToRecipient(recipientId: string, text: string): Promise<void> {
    const key = recipientId.startsWith("client:") ? recipientId.slice("client:".length) : recipientId;
    const connection = this.connections.get(key);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`client: no active connection for recipient ${recipientId}`);
    }

    connection.client.seq += 1;
    connection.ws.send(JSON.stringify({
      type: "event",
      event: "message",
      payload: { text },
      seq: connection.client.seq,
    } satisfies EventFrame));
  }

  // ── HTTP REST API ────────────────────────────────────────────────────────

  private async serveHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    if (url.startsWith("/api/v1/")) {
      this.serveRestApi(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private serveRestApi(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (this.config.authToken && token !== this.config.authToken) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = parsedUrl.pathname;

    let result: unknown;
    if (path === "/api/v1/health") {
      result = {
        ok: true,
        agent: this.agentName,
        transports: this.transportNames,
        uptimeMs: Date.now() - this.startedAtMs,
      };
    } else if (path === "/api/v1/status") {
      result = {
        ok: true,
        agent: this.agentName,
        transports: this.transportNames,
        connections: this.connections.size,
        commands: this.commands.listNames(),
      };
    } else if (path === "/api/v1/commands") {
      result = { commands: this.commands.listNames() };
    } else if (path === "/api/v1/sessions") {
      result = { sessions: this.store.listChatSessions() };
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  }

  // ── WebSocket protocol/v1 ────────────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    const connId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let client: ConnectedClient | null = null;
    let chatId: string | null = null;

    const sendJson = (frame: ResponseFrame | EventFrame): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
    };

    const close = (reason: string): void => {
      console.log(`client: closing ${connId} — ${reason}`);
      if (chatId) this.connections.delete(chatId);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    ws.on("close", () => {
      if (chatId) this.connections.delete(chatId);
      console.log(`client: client ${connId} disconnected`);
    });

    ws.on("error", (err) => close(`ws error: ${err.message}`));

    ws.on("message", (rawData) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(rawData.toString()) as ClientFrame;
      } catch {
        close("invalid JSON");
        return;
      }

      if (!client) {
        if (frame.type !== "connect") {
          sendJson({
            type: "res",
            id: "connect",
            ok: false,
            error: { message: "First frame must be connect", code: "CONNECT_REQUIRED" },
          });
          close("non-connect first frame");
          return;
        }
        this.handleConnect(ws, connId, frame, sendJson, close, (newChatId, newClient) => {
          chatId = newChatId;
          client = newClient;
        });
        return;
      }

      if (frame.type === "connect") {
        sendJson({
          type: "res",
          id: "connect",
          ok: false,
          error: { message: "Already connected", code: "ALREADY_CONNECTED" },
        });
        return;
      }

      this.handleRequest(frame, client, sendJson);
    });
  }

  private handleConnect(
    ws: WebSocket,
    connId: string,
    frame: ConnectFrame,
    sendJson: (frame: ResponseFrame | EventFrame) => void,
    close: (reason: string) => void,
    onConnected: (chatId: string, client: ConnectedClient) => void,
  ): void {
    if (frame.protocol !== PROTOCOL_VERSION) {
      sendJson({
        type: "res",
        id: "connect",
        ok: false,
        error: { message: `Unsupported protocol: ${frame.protocol}`, code: "UNSUPPORTED_PROTOCOL" },
      });
      close("unsupported protocol");
      return;
    }

    if (this.config.authToken && frame.auth.token !== this.config.authToken) {
      sendJson({
        type: "res",
        id: "connect",
        ok: false,
        error: { message: "Unauthorized", code: "UNAUTHORIZED" },
      });
      close("auth failed");
      return;
    }

    const identity = this.resolveTokenIdentity(frame.auth.token);
    const chatId = `v1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client: ConnectedClient = {
      connId,
      identity,
      role: frame.role ?? "operator",
      scopes: identity?.scopes ?? frame.scopes ?? ["read", "write", "admin"],
      seq: 0,
      send: (f) => sendJson(f),
    };

    this.connections.set(chatId, { ws, client });
    onConnected(chatId, client);

    const helloOk: ConnectOkPayload = {
      type: "hello-ok",
      protocol: PROTOCOL_VERSION,
      server: { version: "1.0.0", connId },
      features: {
        methods: this.methodRegistry.listMethods(),
        events: this.methodRegistry.listEvents(),
      },
      auth: {
        role: client.role,
        scopes: client.scopes,
      },
      policy: {
        maxPayload: 25 * 1024 * 1024,
        tickIntervalMs: 15_000,
      },
    };

    sendJson({ type: "res", id: "connect", ok: true, payload: helloOk });
  }

  private handleRequest(frame: ClientFrame, client: ConnectedClient, sendJson: (frame: ResponseFrame | EventFrame) => void): void {
    if (frame.type !== "req") {
      sendJson({
        type: "res",
        id: "unknown",
        ok: false,
        error: { message: `Unsupported frame type: ${frame.type}`, code: "INVALID_FRAME" },
      });
      return;
    }

    const ctx: MethodContext = {
      client,
      params: { ...frame.params, _method: frame.method },
      emit: (event, payload) => {
        client.seq += 1;
        sendJson({ type: "event", event, payload, seq: client.seq });
      },
    };

    void (async () => {
      try {
        const result = await this.methodRegistry.dispatch(ctx);
        sendJson({
          type: "res",
          id: frame.id,
          ok: result.ok,
          ...(result.ok ? { payload: result.payload } : { error: result.error }),
        } as ResponseFrame);
      } catch (err) {
        sendJson({
          type: "res",
          id: frame.id,
          ok: false,
          error: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    })();
  }

  // ── Agent method handler ────────────────────────────────────────────────

  private async handleAgentMethod(ctx: MethodContext): Promise<MethodResult> {
    if (!this.router) {
      return { ok: false, error: { message: "Router not initialized", code: "UNAVAILABLE" } };
    }

    const message = ctx.params["message"] as string | undefined;
    if (!message) {
      return { ok: false, error: { message: "message is required", code: "INVALID_REQUEST" } };
    }

    const runId = randomUUID();
    const chatId = `agent-${runId}`;
    const senderId = ctx.client.identity ? `client:${ctx.client.identity.id}` : `client:${ctx.client.connId}`;

    const inbound: InboundMessage = {
      channel: "client",
      chatId,
      senderId,
      messageId: runId,
      timestamp: new Date().toISOString(),
      text: message,
      isGroup: false,
      access: {
        allowedSenderIds: [senderId],
        adminSenderIds: ctx.client.identity?.scopes?.includes("admin") ? [senderId] : [],
        directMessagesOnly: false,
        selfSenderIds: [],
      },
    };

    const onChunk = (chunk: string): void => {
      ctx.emit(EVENTS.AGENT, { runId, stream: "chunk", text: chunk });
    };

    try {
      const result = await this.router.handleMessage(inbound, onChunk);
      for (const reply of result.replies) {
        ctx.emit(EVENTS.AGENT, { runId, stream: "result", text: reply });
      }
      return {
        ok: true,
        payload: { runId, status: "accepted" } as AgentAcceptedPayload,
      };
    } catch (err) {
      return {
        ok: false,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  private resolveTokenIdentity(token?: string): Identity | null {
    if (!token || !this.identityResolver) return null;
    return this.identityResolver.resolve("token", token);
  }
}
