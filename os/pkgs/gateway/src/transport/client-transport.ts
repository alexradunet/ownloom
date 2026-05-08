import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  type ConnectFrame,
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type ConnectOkPayload,
  EVENTS,
  type AgentAcceptedPayload,
  type AttachmentRef,
} from "../protocol/types.js";
import { MethodRegistry, registerV1Methods, type ConnectedClient, type MethodContext, type MethodResult } from "../protocol/methods.js";
import type { ClientTransportConfig } from "../config.js";
import type { DeliveryService } from "../core/delivery.js";
import type { InboundAttachment, InboundMessage } from "../core/types.js";
import type { GatewayTransport } from "../transports/types.js";
import type { RuntimeClientRecord, Store } from "../core/store.js";
import type { CommandRegistry } from "../core/commands.js";
import type { IdentityResolver, Identity, Scope } from "../core/identity.js";
import type { Router } from "../core/router.js";

const CLIENT_WS_MAX_PAYLOAD_BYTES = 1024 * 1024;
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const TICK_INTERVAL_MS = 15_000;

type ClientSummary = {
  id: string;
  displayName: string;
  scopes: Scope[];
  managedBy: "config" | "runtime";
  canRotate: boolean;
  canRevoke: boolean;
  tokenPreview?: string;
  rotatedAt?: string;
  revokedAt?: string;
};

// ── ClientTransport ──────────────────────────────────────────────────────────
// First-party client transport. Speaks protocol/v1 only:
//   connect -> res hello-ok
//   req     -> res
//   event   <- server-pushed events
// No legacy web-chat protocol and no bundled static UI.

export class ClientTransport implements GatewayTransport {
  readonly name = "client";

  private readonly connections = new Map<string, { ws: WebSocket; client: ConnectedClient }>();
  private readonly activeAgentSessions = new Set<string>();
  private readonly methodRegistry = new MethodRegistry();
  private router!: Router;
  private delivery?: DeliveryService;
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
      connectionCount: () => this.connections.size,
      handleAgent: (ctx) => this.handleAgentMethod(ctx),
      onDeliveryRetry: () => this.delivery?.drainQueuedDeliveries(),
      listClients: () => this.listClientSummaries(),
      rotateClientToken: (id) => this.rotateRuntimeClientToken(id),
      revokeClient: (id) => this.revokeRuntimeClient(id),
    });
  }

  /** Must be called before startReceiving so the agent method can reach the Router. */
  setRouter(router: Router): void {
    this.router = router;
  }

  setDeliveryService(delivery: DeliveryService): void {
    this.delivery = delivery;
  }

  async healthCheck(): Promise<void> {
    // Server starts inside startReceiving; nothing to check before that.
  }

  startReceiving(_onMessage: (msg: InboundMessage, onChunk?: (chunk: string) => void) => Promise<void>): Promise<never> {
    return new Promise<never>((_, reject) => {
      const server = createServer((req, res) => {
        void this.serveHttp(req, res);
      });
      const wss = new WebSocketServer({ server, maxPayload: CLIENT_WS_MAX_PAYLOAD_BYTES });

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
      await this.serveRestApi(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private async serveRestApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = parsedUrl.pathname;

    if (path === "/api/v1/pair") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      this.handleClientPair(req, res, parsedUrl);
      return;
    }

    const requiredScope = req.method === "POST" && path === "/api/v1/attachments" ? "write" : "read";
    const auth = this.authenticateRestRequest(req, requiredScope);
    if (!auth.ok) {
      res.writeHead(auth.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: auth.error }));
      return;
    }

    if (req.method === "POST" && path === "/api/v1/attachments") {
      await this.handleAttachmentUpload(req, res);
      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

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
        state: this.store.getStats(),
      };
    } else if (path === "/api/v1/commands") {
      result = { commands: this.commands.listNames() };
    } else if (path === "/api/v1/sessions") {
      result = { sessions: this.store.listChatSessions() };
    } else if (path === "/api/v1/deliveries") {
      result = { deliveries: this.store.listQueuedDeliveries(undefined, { includeDead: true }) };
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  }

  private handleClientPair(req: IncomingMessage, res: ServerResponse, url: URL): void {
    req.resume();
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Pairing is only allowed from loopback" }));
      return;
    }

    const id = sanitizeClientId(url.searchParams.get("clientId") ?? "") ?? `browser-${randomUUID()}`;
    if (this.config.clients?.some((client) => client.id === id)) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Client id is config-managed: ${id}` }));
      return;
    }

    const displayName = sanitizeDisplayName(url.searchParams.get("displayName") ?? "") ?? "Paired browser";
    const result = this.store.rotateRuntimeClient({ id, displayName, scopes: ["read", "write"] });
    const client = this.clientSummary({
      id: result.client.id,
      displayName: result.client.displayName,
      scopes: result.client.scopes,
      managedBy: "runtime",
      runtime: result.client,
    });

    this.broadcastEvent(EVENTS.CLIENTS_CHANGED, this.clientsChangedPayload());
    setTimeout(() => this.disconnectIdentity(id), 0);
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ client, token: result.token }));
  }

  private async handleAttachmentUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const kind = req.headers["x-ownloom-attachment-kind"];
    if (kind !== "image" && kind !== "audio") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "x-ownloom-attachment-kind must be image or audio" }));
      return;
    }

    const mimeType = req.headers["content-type"]?.split(";")[0]?.trim() || "application/octet-stream";
    const fileNameHeader = req.headers["x-ownloom-filename"];
    const fileName = Array.isArray(fileNameHeader) ? fileNameHeader[0] : fileNameHeader;
    let data: Buffer;
    try {
      data = await readRequestBody(req, ATTACHMENT_MAX_BYTES);
    } catch (err) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      return;
    }
    if (data.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "attachment body must not be empty" }));
      return;
    }

    this.store.pruneAttachments(24 * 60 * 60 * 1000);
    const attachment = this.store.saveAttachment({ kind, mimeType, fileName, data });
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
    }));
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
      if (chatId) {
        this.connections.delete(chatId);
        chatId = null;
        this.broadcastEvent(EVENTS.CLIENTS_CHANGED, this.clientsChangedPayload());
      }
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    ws.on("close", () => {
      if (chatId) {
        this.connections.delete(chatId);
        chatId = null;
        this.broadcastEvent(EVENTS.CLIENTS_CHANGED, this.clientsChangedPayload());
      }
      console.log(`client: client ${connId} disconnected`);
    });

    ws.on("error", (err) => close(`ws error: ${err.message}`));

    ws.on("message", (rawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawData.toString());
      } catch {
        close("invalid JSON");
        return;
      }

      if (!client) {
        const connectFrame = parseConnectFrame(parsed);
        if (!connectFrame.ok) {
          sendJson({
            type: "res",
            id: "connect",
            ok: false,
            error: { message: connectFrame.error, code: connectFrame.code },
          });
          close("invalid connect frame");
          return;
        }
        this.handleConnect(ws, connId, connectFrame.frame, sendJson, close, (newChatId, newClient) => {
          chatId = newChatId;
          client = newClient;
        });
        return;
      }

      if (isRecord(parsed) && parsed.type === "connect") {
        sendJson({
          type: "res",
          id: "connect",
          ok: false,
          error: { message: "Already connected", code: "ALREADY_CONNECTED" },
        });
        return;
      }

      const requestFrame = parseRequestFrame(parsed);
      if (!requestFrame.ok) {
        sendJson({
          type: "res",
          id: requestFrame.id,
          ok: false,
          error: { message: requestFrame.error, code: requestFrame.code },
        });
        return;
      }

      this.handleRequest(requestFrame.frame, client, sendJson);
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

    const identity = this.resolveTokenIdentity(frame.auth.token);
    const hasClientIdentities = this.hasClientIdentities();
    const tokenMatchesGlobalAuth = !!this.config.authToken && frame.auth.token === this.config.authToken;
    if ((this.config.authToken || hasClientIdentities) && !tokenMatchesGlobalAuth && !identity) {
      sendJson({
        type: "res",
        id: "connect",
        ok: false,
        error: { message: "Unauthorized", code: "UNAUTHORIZED" },
      });
      close("auth failed");
      return;
    }

    const chatId = `v1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client: ConnectedClient = {
      connId,
      ...(typeof frame.client?.id === "string" && frame.client.id.trim() ? { clientId: frame.client.id.trim() } : {}),
      identity,
      role: frame.role ?? "operator",
      scopes: identity?.scopes ?? frame.scopes,
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
        maxPayload: CLIENT_WS_MAX_PAYLOAD_BYTES,
        tickIntervalMs: TICK_INTERVAL_MS,
      },
    };

    sendJson({ type: "res", id: "connect", ok: true, payload: helloOk });
    this.broadcastEvent(EVENTS.CLIENTS_CHANGED, this.clientsChangedPayload());
  }

  private handleRequest(frame: RequestFrame, client: ConnectedClient, sendJson: (frame: ResponseFrame | EventFrame) => void): void {
    if (frame.type !== "req") {
      sendJson({
        type: "res",
        id: "unknown",
        ok: false,
        error: { message: `Unsupported frame type: ${frame.type}`, code: "INVALID_FRAME" },
      });
      return;
    }

    const requiredScope = requiredScopeForMethod(frame.method);
    if (requiredScope && !client.scopes.includes(requiredScope)) {
      sendJson({
        type: "res",
        id: frame.id,
        ok: false,
        error: { message: `Method ${frame.method} requires ${requiredScope} scope`, code: "FORBIDDEN" },
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
      const idempotencyKey = typeof frame.params["idempotencyKey"] === "string"
        ? frame.params["idempotencyKey"].trim()
        : "";
      const storeKey = idempotencyKey ? this.makeIdempotencyStoreKey(client, frame.method, idempotencyKey) : "";

      if (idempotencyKey.length > 200) {
        sendJson({
          type: "res",
          id: frame.id,
          ok: false,
          error: { message: "idempotencyKey must be at most 200 characters", code: "INVALID_REQUEST" },
        });
        return;
      }

      if (storeKey) {
        const begin = this.store.beginIdempotentRequest(storeKey, 7 * 24 * 60 * 60 * 1000);
        if (begin.status === "duplicate") {
          sendJson({
            type: "res",
            id: frame.id,
            ok: begin.result.ok,
            ...(begin.result.ok ? { payload: begin.result.payload } : { error: begin.result.error }),
          } as ResponseFrame);
          return;
        }
        if (begin.status === "pending") {
          sendJson({
            type: "res",
            id: frame.id,
            ok: false,
            error: { message: "Request with this idempotencyKey is already running", code: "REQUEST_PENDING" },
          });
          return;
        }
      }

      try {
        const result = await this.methodRegistry.dispatch(ctx);
        if (storeKey) this.store.finishIdempotentRequest(storeKey, result);
        sendJson({
          type: "res",
          id: frame.id,
          ok: result.ok,
          ...(result.ok ? { payload: result.payload } : { error: result.error }),
        } as ResponseFrame);
        if (result.ok) this.emitChangedEventForMethod(frame.method, frame.params);
      } catch (err) {
        const result: MethodResult = {
          ok: false,
          error: { message: err instanceof Error ? err.message : String(err) },
        };
        if (storeKey) this.store.finishIdempotentRequest(storeKey, result);
        sendJson({
          type: "res",
          id: frame.id,
          ok: false,
          error: result.error,
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

    const sessionKey = typeof ctx.params["sessionKey"] === "string" && ctx.params["sessionKey"].trim()
      ? ctx.params["sessionKey"].trim()
      : ctx.client.connId;
    const chatId = `client:${sessionKey}`;
    if (this.activeAgentSessions.has(chatId)) {
      return {
        ok: false,
        error: { message: `Agent is already running for ${chatId}`, code: "AGENT_BUSY" },
      };
    }

    const attachmentRefs = Array.isArray(ctx.params["attachments"])
      ? (ctx.params["attachments"] as AttachmentRef[])
      : [];
    const attachments = this.resolveAttachmentRefs(attachmentRefs);

    const runId = randomUUID();
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
      ...(attachments.length > 0 ? { attachments } : {}),
    };

    const onChunk = (chunk: string): void => {
      ctx.emit(EVENTS.AGENT, { runId, stream: "chunk", text: chunk });
    };

    this.activeAgentSessions.add(chatId);
    try {
      const result = await this.router.handleMessage(inbound, onChunk);
      this.broadcastEvent(EVENTS.SESSIONS_CHANGED, { chatId });
      for (const ref of attachmentRefs) this.store.deleteAttachment(ref.id);
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
    } finally {
      this.activeAgentSessions.delete(chatId);
    }
  }

  private resolveAttachmentRefs(refs: AttachmentRef[]): InboundAttachment[] {
    const attachments: InboundAttachment[] = [];
    for (const ref of refs) {
      const stored = this.store.getAttachment(ref.id);
      if (!stored) throw new Error(`Unknown attachment id: ${ref.id}`);
      attachments.push({
        kind: stored.kind,
        path: stored.path,
        mimeType: stored.mimeType,
        ...(stored.fileName ? { fileName: stored.fileName } : {}),
      });
    }
    return attachments;
  }

  private resolveTokenIdentity(token?: string): Identity | null {
    if (!token) return null;
    const runtimeClient = this.store.resolveRuntimeClientToken(token);
    if (runtimeClient) {
      return {
        id: runtimeClient.id,
        displayName: runtimeClient.displayName,
        scopes: runtimeClient.scopes,
        source: "token",
        matchedBy: `runtime-token:${runtimeClient.id}`,
      };
    }
    if (!this.identityResolver) return null;
    return this.identityResolver.resolve("token", token);
  }

  private authenticateRestRequest(req: IncomingMessage, requiredScope: "read" | "write" | "admin"):
    | { ok: true }
    | { ok: false; status: 401 | 403; error: string } {
    const authHeader = req.headers["authorization"];
    const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const hasClientIdentities = this.hasClientIdentities();
    const authRequired = !!this.config.authToken || hasClientIdentities;
    if (!authRequired) return { ok: true };

    if (this.config.authToken && token === this.config.authToken) return { ok: true };

    const identity = this.resolveTokenIdentity(token);
    if (!identity) return { ok: false, status: 401, error: "Unauthorized" };
    if (!identity.scopes.includes(requiredScope)) return { ok: false, status: 403, error: "Forbidden" };
    return { ok: true };
  }

  private listClientSummaries(): ClientSummary[] {
    const configuredIds = new Set((this.config.clients ?? []).map((client) => client.id));
    const configured = (this.config.clients ?? []).map((client) => this.clientSummary({
      id: client.id,
      displayName: client.displayName,
      scopes: client.scopes,
      managedBy: "config",
    }));
    const runtimeOnly = this.store.listRuntimeClients()
      .filter((client) => !configuredIds.has(client.id))
      .map((client) => this.clientSummary({
        id: client.id,
        displayName: client.displayName,
        scopes: client.scopes,
        managedBy: "runtime",
        runtime: client,
      }));
    return [...configured, ...runtimeOnly].sort((a, b) => a.id.localeCompare(b.id));
  }

  private clientSummary(input: {
    id: string;
    displayName: string;
    scopes: Array<"read" | "write" | "admin">;
    managedBy: "config" | "runtime";
    runtime?: RuntimeClientRecord;
  }): ClientSummary {
    const revoked = !!input.runtime?.revokedAt;
    return {
      id: input.id,
      displayName: input.displayName,
      scopes: input.runtime?.scopes ?? input.scopes,
      managedBy: input.managedBy,
      canRotate: input.managedBy === "runtime",
      canRevoke: input.managedBy === "runtime" && !revoked,
      ...(input.runtime?.tokenPreview ? { tokenPreview: input.runtime.tokenPreview } : {}),
      ...(input.runtime?.rotatedAt ? { rotatedAt: input.runtime.rotatedAt } : {}),
      ...(input.runtime?.revokedAt ? { revokedAt: input.runtime.revokedAt } : {}),
    };
  }

  private rotateRuntimeClientToken(id: string): { client: ClientSummary; token: string } | null {
    const runtime = this.store.getRuntimeClient(id);
    if (!runtime) return null;
    const result = this.store.rotateRuntimeClient({ id: runtime.id, displayName: runtime.displayName, scopes: runtime.scopes });
    return { client: this.clientSummary({ ...runtime, managedBy: "runtime", runtime: result.client }), token: result.token };
  }

  private revokeRuntimeClient(id: string): ClientSummary | null {
    const runtime = this.store.getRuntimeClient(id);
    if (!runtime) return null;
    const client = this.store.revokeRuntimeClient({ id: runtime.id, displayName: runtime.displayName, scopes: runtime.scopes });
    return this.clientSummary({ ...runtime, managedBy: "runtime", runtime: client });
  }

  private emitChangedEventForMethod(method: string, params: Record<string, unknown>): void {
    if (method === "clients.rotateToken" || method === "clients.revoke") {
      this.broadcastEvent(EVENTS.CLIENTS_CHANGED, this.clientsChangedPayload());
      const id = typeof params["id"] === "string" ? params["id"] : "";
      if (id) setTimeout(() => this.disconnectIdentity(id), 0);
      return;
    }
    if (method === "sessions.reset") {
      this.broadcastEvent(EVENTS.SESSIONS_CHANGED, {});
      return;
    }
    if (method === "deliveries.retry" || method === "deliveries.delete") {
      this.broadcastEvent(EVENTS.DELIVERIES_CHANGED, {});
    }
  }

  private hasClientIdentities(): boolean {
    return (this.config.clients?.length ?? 0) > 0 || this.store.listRuntimeClients().length > 0;
  }

  private disconnectIdentity(identityId: string): void {
    for (const connection of this.connections.values()) {
      if (connection.client.identity?.id !== identityId) continue;
      if (connection.ws.readyState === WebSocket.OPEN) connection.ws.close(1008, "client credentials changed");
    }
  }

  private broadcastEvent(event: string, payload?: unknown): void {
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState !== WebSocket.OPEN) continue;
      connection.client.seq += 1;
      connection.ws.send(JSON.stringify({ type: "event", event, payload, seq: connection.client.seq } satisfies EventFrame));
    }
  }

  private clientsChangedPayload(): { connections: number } {
    return { connections: this.connections.size };
  }

  private makeIdempotencyStoreKey(client: ConnectedClient, method: string, idempotencyKey: string): string {
    const owner = client.identity
      ? `identity:${client.identity.id}`
      : client.clientId
        ? `client:${client.clientId}`
        : `conn:${client.connId}`;
    return `${owner}:${method}:${idempotencyKey}`;
  }
}

function requiredScopeForMethod(method: string): "read" | "write" | "admin" | null {
  if (method === "health" || method === "status" || method === "commands.list" || method === "clients.list" || method === "sessions.list" || method === "sessions.get" || method === "deliveries.list") {
    return "read";
  }
  if (method === "agent" || method === "agent.wait") return "write";
  if (method === "sessions.reset" || method === "deliveries.retry" || method === "deliveries.delete" || method === "clients.rotateToken" || method === "clients.revoke") return "admin";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConnectFrame(value: unknown):
  | { ok: true; frame: ConnectFrame }
  | { ok: false; error: string; code: "CONNECT_REQUIRED" | "INVALID_FRAME" } {
  if (!isRecord(value) || value.type !== "connect") {
    return { ok: false, error: "First frame must be connect", code: "CONNECT_REQUIRED" };
  }
  if (typeof value.protocol !== "number" || !Number.isFinite(value.protocol)) {
    return { ok: false, error: "connect.protocol must be a number", code: "INVALID_FRAME" };
  }
  const role = value.role === "node" ? "node" : value.role === undefined || value.role === "operator" ? "operator" : null;
  if (!role) return { ok: false, error: "connect.role must be operator or node", code: "INVALID_FRAME" };

  const scopes = parseScopes(value.scopes, ["read", "write"]);
  if (!scopes) return { ok: false, error: "connect.scopes must contain read, write, or admin", code: "INVALID_FRAME" };

  let auth: { token?: string } = {};
  if (value.auth !== undefined) {
    if (!isRecord(value.auth)) return { ok: false, error: "connect.auth must be an object", code: "INVALID_FRAME" };
    if (value.auth.token !== undefined && typeof value.auth.token !== "string") {
      return { ok: false, error: "connect.auth.token must be a string", code: "INVALID_FRAME" };
    }
    auth = value.auth.token ? { token: value.auth.token } : {};
  }

  let client: ConnectFrame["client"];
  if (value.client !== undefined) {
    if (!isRecord(value.client)) return { ok: false, error: "connect.client must be an object", code: "INVALID_FRAME" };
    client = {
      ...(typeof value.client.id === "string" ? { id: value.client.id } : {}),
      ...(typeof value.client.version === "string" ? { version: value.client.version } : {}),
      ...(typeof value.client.platform === "string" ? { platform: value.client.platform } : {}),
    };
  }

  return { ok: true, frame: { type: "connect", protocol: value.protocol, role, scopes, auth, ...(client ? { client } : {}) } };
}

function parseRequestFrame(value: unknown):
  | { ok: true; frame: RequestFrame }
  | { ok: false; id: string; error: string; code: "INVALID_FRAME" } {
  if (!isRecord(value) || value.type !== "req") {
    return { ok: false, id: "unknown", error: "Frame type must be req", code: "INVALID_FRAME" };
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id : "unknown";
  if (id === "unknown") return { ok: false, id, error: "req.id must be a non-empty string", code: "INVALID_FRAME" };
  if (typeof value.method !== "string" || !value.method.trim()) {
    return { ok: false, id, error: "req.method must be a non-empty string", code: "INVALID_FRAME" };
  }
  if (value.params !== undefined && !isRecord(value.params)) {
    return { ok: false, id, error: "req.params must be an object", code: "INVALID_FRAME" };
  }
  return {
    ok: true,
    frame: {
      type: "req",
      id,
      method: value.method.trim(),
      params: value.params ?? {},
    },
  };
}

function parseScopes(value: unknown, fallback: Scope[]): Scope[] | null {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) return null;
  const scopes: Scope[] = [];
  for (const scope of value) {
    if (scope !== "read" && scope !== "write" && scope !== "admin") return null;
    if (!scopes.includes(scope)) scopes.push(scope);
  }
  return scopes;
}

function isLoopbackAddress(address?: string): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function sanitizeClientId(value: string): string | null {
  const sanitized = value.trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || null;
}

function sanitizeDisplayName(value: string): string | null {
  const sanitized = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return sanitized || null;
}

function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;

    req.on("data", (chunk: Buffer) => {
      if (done) return;
      total += chunk.length;
      if (total > maxBytes) {
        done = true;
        chunks.length = 0;
        req.resume();
        reject(new Error(`request body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on("error", (err) => {
      if (!done) reject(err);
    });
  });
}
