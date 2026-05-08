import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CommandRegistry } from "../src/core/commands.js";
import { Store } from "../src/core/store.js";
import { ClientTransport } from "../src/transport/client-transport.js";
import type { InboundMessage } from "../src/core/types.js";
import type { MethodContext } from "../src/protocol/methods.js";
import { FULL_OPERATOR_SCOPES, SimpleIdentityResolver, type Scope } from "../src/core/identity.js";

class FakeWs extends EventEmitter {
  readyState = 1;
  readonly sent: any[] = [];

  send(raw: string): void {
    this.sent.push(JSON.parse(raw));
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(predicate());
}

function makeMockRes() {
  return {
    status: 0,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status;
      this.headers = headers;
    },
    end(body: string) {
      this.body = body;
    },
  };
}

function makeCtx(params: Record<string, unknown>): MethodContext {
  return {
    client: {
      connId: "conn-1",
      identity: null,
      role: "operator",
      scopes: ["read", "write", "admin"] as Scope[],
      seq: 0,
      send: () => {},
    },
    params,
    emit: () => {},
  };
}

test("ClientTransport agent uses protocol sessionKey as stable Pi chat session", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    const seen: InboundMessage[] = [];
    transport.setRouter({
      handleMessage: async (msg: InboundMessage) => {
        seen.push(msg);
        return { replies: ["ok"], markProcessed: true };
      },
    } as any);

    const result = await (transport as any).handleAgentMethod(makeCtx({ message: "hello", sessionKey: "web-main" }));

    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.channel, "client");
    assert.equal(seen[0]?.chatId, "client:web-main");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport agent can attach to an existing WhatsApp chat session", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    store.upsertChatSession("whatsapp:+15550001111", "whatsapp:+15550001111", "/tmp/pi-session.json");
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    const seen: InboundMessage[] = [];
    transport.setRouter({
      handleMessage: async (msg: InboundMessage) => {
        seen.push(msg);
        return { replies: ["ok"], markProcessed: true };
      },
    } as any);

    const result = await (transport as any).handleAgentMethod(makeCtx({ message: "continue", chatId: "whatsapp:+15550001111" }));

    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.channel, "whatsapp");
    assert.equal(seen[0]?.chatId, "whatsapp:+15550001111");
    assert.equal(seen[0]?.senderId, "whatsapp:+15550001111");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport rejects unknown non-client chat attachment", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    transport.setRouter({
      handleMessage: async () => ({ replies: ["ok"], markProcessed: true }),
    } as any);

    const result = await (transport as any).handleAgentMethod(makeCtx({ message: "continue", chatId: "whatsapp:+15550001111" }));

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "NOT_FOUND");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport rejects concurrent agent runs for the same protocol session", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    transport.setRouter({
      handleMessage: async () => {
        calls += 1;
        await blocked;
        return { replies: ["ok"], markProcessed: true };
      },
    } as any);

    const first = (transport as any).handleAgentMethod(makeCtx({ message: "first", sessionKey: "web-main" }));
    await waitFor(() => calls === 1);

    const second = await (transport as any).handleAgentMethod(makeCtx({ message: "second", sessionKey: "web-main" }));
    assert.equal(second.ok, false);
    assert.equal(second.error.code, "AGENT_BUSY");
    assert.equal(calls, 1);

    const other = (transport as any).handleAgentMethod(makeCtx({ message: "other", sessionKey: "web-other" }));
    await waitFor(() => calls === 2);

    release();
    assert.equal((await first).ok, true);
    assert.equal((await other).ok, true);

    const third = await (transport as any).handleAgentMethod(makeCtx({ message: "third", sessionKey: "web-main" }));
    assert.equal(third.ok, true);
    assert.equal(calls, 3);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport replays stored response for duplicate idempotencyKey", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    let calls = 0;
    transport.setRouter({
      handleMessage: async () => {
        calls += 1;
        return { replies: [`ok-${calls}`], markProcessed: true };
      },
    } as any);

    const client = {
      connId: "conn-1",
      identity: null,
      role: "operator" as const,
      scopes: ["read", "write", "admin"] as Scope[],
      seq: 0,
      send: () => {},
    };
    const responses: any[] = [];
    const sendJson = (frame: any) => responses.push(frame);

    (transport as any).handleRequest({
      type: "req",
      id: "req-1",
      method: "agent.wait",
      params: { message: "hello", idempotencyKey: "same-request" },
    }, client, sendJson);
    await waitFor(() => responses.length === 2);

    (transport as any).handleRequest({
      type: "req",
      id: "req-2",
      method: "agent.wait",
      params: { message: "hello again", idempotencyKey: "same-request" },
    }, client, sendJson);
    await waitFor(() => responses.length === 3);

    assert.equal(calls, 1);
    assert.equal(responses[1].type, "res");
    assert.equal(responses[1].id, "req-1");
    assert.equal(responses[1].ok, true);
    assert.equal(responses[2].type, "res");
    assert.equal(responses[2].id, "req-2");
    assert.equal(responses[2].ok, true);
    assert.deepEqual(responses[2].payload, responses[1].payload);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport consumes attachment refs after successful agent run", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const attachment = store.saveAttachment({
      kind: "image",
      mimeType: "image/png",
      fileName: "photo.png",
      data: Buffer.from("png-bytes"),
    });
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    let seen: InboundMessage | undefined;
    transport.setRouter({
      handleMessage: async (msg: InboundMessage) => {
        seen = msg;
        return { replies: ["ok"], markProcessed: true };
      },
    } as any);

    const result = await (transport as any).handleAgentMethod(makeCtx({
      message: "describe",
      attachments: [{ id: attachment.id, kind: "image", mimeType: "image/png", fileName: "photo.png" }],
    }));

    assert.equal(result.ok, true);
    assert.equal(seen?.attachments?.[0]?.path, attachment.path);
    assert.equal(store.getAttachment(attachment.id), null);
    assert.equal(existsSync(attachment.path), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport rejects unknown tokens when named clients are configured", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "web", displayName: "Web", token: "good", scopes: ["read", "write"] }] },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "web", displayName: "Web", scopes: ["read", "write"], keys: ["token:good"] }]),
    );

    const responses: any[] = [];
    let closed = false;
    (transport as any).handleConnect(
      { } as any,
      "conn-1",
      { type: "connect", protocol: 1, role: "operator", scopes: ["read"], auth: { token: "bad" } },
      (frame: any) => responses.push(frame),
      () => { closed = true; },
      () => assert.fail("should not connect"),
    );

    assert.equal(closed, true);
    assert.equal(responses[0].ok, false);
    assert.equal(responses[0].error.code, "UNAUTHORIZED");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport accepts named client tokens and grants full operator scopes", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "web", displayName: "Web", token: "good", scopes: ["read"] }] },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "web", displayName: "Web", scopes: ["read"], keys: ["token:good"] }]),
    );

    let connectedClient: any;
    const responses: any[] = [];
    (transport as any).handleConnect(
      { } as any,
      "conn-1",
      { type: "connect", protocol: 1, role: "operator", scopes: ["read", "write", "admin"], auth: { token: "good" }, client: { id: "web-main" } },
      (frame: any) => responses.push(frame),
      () => assert.fail("should not close"),
      (_chatId: string, client: any) => { connectedClient = client; },
    );

    assert.equal(responses[0].ok, true);
    assert.equal(connectedClient.identity.id, "web");
    assert.deepEqual(connectedClient.identity.scopes, FULL_OPERATOR_SCOPES);
    assert.deepEqual(connectedClient.scopes, FULL_OPERATOR_SCOPES);
    assert.equal(connectedClient.clientId, "web-main");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport validates protocol frames before dispatch", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
    );

    const rejected = new FakeWs();
    (transport as any).handleConnection(rejected);
    rejected.emit("message", Buffer.from(JSON.stringify({ type: "req", id: "too-early", method: "health" })));
    assert.equal(rejected.sent[0].ok, false);
    assert.equal(rejected.sent[0].error.code, "CONNECT_REQUIRED");
    assert.equal(rejected.readyState, 3);

    const ws = new FakeWs();
    (transport as any).handleConnection(ws);
    ws.emit("message", Buffer.from(JSON.stringify({ type: "connect", protocol: 1, auth: {} })));
    await waitFor(() => ws.sent.some((frame) => frame.id === "connect" && frame.ok));

    ws.emit("message", Buffer.from(JSON.stringify({ type: "req", id: "bad", method: "health", params: [] })));
    await waitFor(() => ws.sent.some((frame) => frame.id === "bad"));
    assert.equal(ws.sent.find((frame) => frame.id === "bad").error.code, "INVALID_FRAME");

    ws.emit("message", Buffer.from(JSON.stringify({ type: "req", id: "health-1", method: "health" })));
    await waitFor(() => ws.sent.some((frame) => frame.id === "health-1"));
    assert.equal(ws.sent.find((frame) => frame.id === "health-1").ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport treats accepted clients as full operators", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    store.upsertChatSession("client:web", "sender", "/tmp/session");
    const delivery = store.enqueueDelivery("client:web", "client", "hello", "offline");
    store.rotateRuntimeClient({ id: "runtime", displayName: "Runtime", scopes: ["read"] });
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    const acceptedClient = {
      connId: "conn-1",
      identity: null,
      role: "operator" as const,
      scopes: ["read"] as Scope[],
      seq: 0,
      send: () => {},
    };
    const responses: any[] = [];
    (transport as any).handleRequest({
      type: "req",
      id: "req-1",
      method: "sessions.reset",
      params: { chatId: "client:web" },
    }, acceptedClient, (frame: any) => responses.push(frame));
    (transport as any).handleRequest({
      type: "req",
      id: "req-2",
      method: "deliveries.retry",
      params: { id: delivery.id },
    }, acceptedClient, (frame: any) => responses.push(frame));
    (transport as any).handleRequest({
      type: "req",
      id: "req-3",
      method: "clients.rotateToken",
      params: { id: "runtime" },
    }, acceptedClient, (frame: any) => responses.push(frame));

    await waitFor(() => responses.length === 3);
    assert.equal(responses.find((frame) => frame.id === "req-1").ok, true);
    assert.equal(store.getChatSession("client:web"), null);
    assert.equal(responses.find((frame) => frame.id === "req-2").ok, true);
    assert.equal(responses.find((frame) => frame.id === "req-3").ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport keeps configured clients declarative and rotates runtime clients only", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const initialRuntime = store.rotateRuntimeClient({ id: "phone", displayName: "Phone", scopes: ["read", "write"] });
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "web", displayName: "Web", token: "old-token", scopes: ["read", "write", "admin"] }] },
      store,
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "web", displayName: "Web", scopes: ["read", "write", "admin"], keys: ["token:old-token"] }]),
    );

    assert.equal((transport as any).rotateRuntimeClientToken("web"), null);
    assert.equal((transport as any).resolveTokenIdentity("old-token")?.id, "web");
    assert.equal((transport as any).resolveTokenIdentity(initialRuntime.token)?.id, "phone");

    const rotated = (transport as any).rotateRuntimeClientToken("phone");
    assert.match(rotated.token, /^ogw_/);
    assert.equal(rotated.client.tokenHash, undefined);
    assert.equal((transport as any).resolveTokenIdentity(initialRuntime.token), null);
    assert.equal((transport as any).resolveTokenIdentity(rotated.token).id, "phone");

    const revoked = (transport as any).revokeRuntimeClient("phone");
    assert.notEqual(revoked.revokedAt, undefined);
    assert.equal((transport as any).resolveTokenIdentity(rotated.token), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport emits change events for mutating methods", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    store.upsertChatSession("client:web", "sender", "/tmp/session");
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    const sent: any[] = [];
    const client = {
      connId: "conn-1",
      identity: null,
      role: "operator" as const,
      scopes: ["read", "write", "admin"] as Scope[],
      seq: 0,
      send: () => {},
    };
    (transport as any).connections.set("v1-test", {
      ws: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)) },
      client,
    });

    const responses: any[] = [];
    (transport as any).handleRequest({
      type: "req",
      id: "req-1",
      method: "sessions.reset",
      params: { chatId: "client:web" },
    }, client, (frame: any) => responses.push(frame));

    await waitFor(() => responses.length === 1 && sent.length === 1);
    assert.equal(responses[0].ok, true);
    assert.equal(sent[0].event, "sessions.changed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport REST pairs a loopback browser as a runtime client", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "web", displayName: "Web", token: "read-token", scopes: ["read"] }] },
      store,
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "web", displayName: "Web", scopes: ["read"], keys: ["token:read-token"] }]),
    );
    const req = {
      method: "POST",
      url: "/api/v1/pair?clientId=browser-test&displayName=Test%20Browser",
      headers: { host: "localhost" },
      socket: { remoteAddress: "127.0.0.1" },
      resume: () => {},
    };
    const res = makeMockRes();

    await (transport as any).serveRestApi(req, res);

    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.client.id, "browser-test");
    assert.equal(body.client.managedBy, "runtime");
    assert.deepEqual(body.client.scopes, FULL_OPERATOR_SCOPES);
    assert.match(body.token, /^ogw_/);
    assert.equal((transport as any).resolveTokenIdentity(body.token).id, "browser-test");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport REST rejects non-loopback browser pairing", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
    );
    const req = {
      method: "POST",
      url: "/api/v1/pair?clientId=browser-test",
      headers: { host: "localhost" },
      socket: { remoteAddress: "203.0.113.10" },
      resume: () => {},
    };
    const res = makeMockRes();

    await (transport as any).serveRestApi(req, res);

    assert.equal(res.status, 403);
    assert.equal(JSON.parse(res.body).error, "Pairing is only allowed from loopback");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport REST refuses to pair over a config-managed client id", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "web", displayName: "Web", token: "read-token", scopes: ["read"] }] },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "web", displayName: "Web", scopes: ["read"], keys: ["token:read-token"] }]),
    );
    const req = {
      method: "POST",
      url: "/api/v1/pair?clientId=web",
      headers: { host: "localhost" },
      socket: { remoteAddress: "::ffff:127.0.0.1" },
      resume: () => {},
    };
    const res = makeMockRes();

    await (transport as any).serveRestApi(req, res);

    assert.equal(res.status, 409);
    assert.equal(JSON.parse(res.body).error, "Client id is config-managed: web");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport REST accepts named client token as full operator", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "status", displayName: "Status", token: "read-token", scopes: ["read"] }] },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "status", displayName: "Status", scopes: ["read"], keys: ["token:read-token"] }]),
    );
    const req = { method: "GET", url: "/api/v1/status", headers: { authorization: "Bearer read-token", host: "localhost" } };
    const res = makeMockRes();

    await (transport as any).serveRestApi(req, res);

    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.state.chatSessions, 0);
    assert.equal(body.state.deliveries.queued, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport REST accepts named client token for write endpoints regardless configured scopes", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "status", displayName: "Status", token: "read-token", scopes: ["read"] }] },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "status", displayName: "Status", scopes: ["read"], keys: ["token:read-token"] }]),
    );
    const req = Object.assign(new EventEmitter(), {
      method: "POST",
      url: "/api/v1/attachments",
      headers: {
        authorization: "Bearer read-token",
        host: "localhost",
        "x-ownloom-attachment-kind": "image",
        "content-type": "image/png",
      },
      resume: () => {},
    });
    const res = makeMockRes();

    const pending = (transport as any).serveRestApi(req, res);
    req.emit("data", Buffer.from("png"));
    req.emit("end");
    await pending;

    assert.equal(res.status, 201);
    const body = JSON.parse(res.body);
    assert.match(body.id, /^attachment-/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport agent falls back to connection id when sessionKey is absent", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    let seen: InboundMessage | undefined;
    transport.setRouter({
      handleMessage: async (msg: InboundMessage) => {
        seen = msg;
        return { replies: [], markProcessed: true };
      },
    } as any);

    await (transport as any).handleAgentMethod(makeCtx({ message: "hello" }));

    assert.equal(seen?.chatId, "client:conn-1");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
