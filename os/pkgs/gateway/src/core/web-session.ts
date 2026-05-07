import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { AgentSession } from "@mariozechner/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type WebSessionConfig = {
  /** AgentSession created by the gateway (shared with WhatsApp or dedicated). */
  session: AgentSession;
  /** Host to bind. Must stay loopback. */
  host: string;
  /** Port to bind. */
  port: number;
};

/** Serve the embedded static client as a fallback for any unknown path (SPA). */
function readClientHtml(): string {
  // Look for a sibling client.html first (dev), otherwise fail over to a minimal inline page
  try {
    return readFileSync(join(__dirname, "client.html"), "utf-8");
  } catch {
    return MINIMAL_HTML;
  }
}

/** Broadcast a JSON message to every open WebSocket client. */
function broadcast(wss: WebSocketServer, msg: unknown) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

export function startWebSession(config: WebSessionConfig): void {
  const { session, host, port } = config;
  const clientHtml = readClientHtml();

  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(clientHtml);
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  // Forward every AgentSession event to all connected browser tabs.
  const unsub = session.subscribe((event) => {
    broadcast(wss, event);
  });

  wss.on("connection", (ws: WebSocket) => {
    // Send current conversation snapshot so the tab catches up immediately.
    ws.send(
      JSON.stringify({
        type: "state_sync",
        messages: session.messages,
        streaming: session.isStreaming,
        model: session.model?.id ?? null,
        thinkingLevel: session.thinkingLevel,
      }),
    );

    ws.on("message", async (raw) => {
      let cmd: Record<string, unknown>;
      try {
        cmd = JSON.parse(raw.toString());
      } catch {
        return;
      }

      try {
        switch (cmd.type) {
          case "prompt": {
            const text = cmd.message as string;
            if (!text) break;
            if (session.isStreaming) {
              void session.prompt(text, {
                streamingBehavior: "steer" as any,
              });
            } else {
              void session.prompt(text).catch((err) => {
                console.error("[web-session prompt error]", err);
              });
            }
            break;
          }
          case "steer": {
            const text = cmd.message as string;
            if (text) void session.prompt(text, { streamingBehavior: "steer" as any });
            break;
          }
          case "abort":
            await session.abort();
            break;
          case "new_session": {
            const newSessionManager = (session.sessionManager.constructor as any).create(
              session.sessionManager.getCwd?.() ?? process.cwd(),
              session.sessionManager.getSessionDir?.(),
            );
            // AgentSession doesn't expose a direct "replace session manager" API.
            // We close the old session and broadcast empty state.
            unsub();
            ws.send(
              JSON.stringify({
                type: "state_sync",
                messages: [],
                streaming: false,
                model: null,
                thinkingLevel: "off",
              }),
            );
            break;
          }
        }
      } catch (err) {
        console.error("[web-session cmd error]", cmd.type, err);
      }
    });

    ws.on("error", (err) => console.error("[web-session ws error]", err));
  });

  server.listen(port, host, () => {
    console.log(`web-session: listening on http://${host}:${port}`);
  });
}

/* ── Minimal fallback HTML (never shown in production, client.html replaces it) ── */
const MINIMAL_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Pi Gateway</title></head>
<body><p>client.html not found</p></body></html>`;
