import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CommandRegistry } from "../src/core/commands.js";
import { Store } from "../src/core/store.js";
import { ClientTransport } from "../src/transport/client-transport.js";
import type { InboundMessage } from "../src/core/types.js";
import type { MethodContext } from "../src/protocol/methods.js";
import { SimpleIdentityResolver, type Scope } from "../src/core/identity.js";

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

test("ClientTransport accepts named client tokens and uses identity scopes", () => {
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
    assert.deepEqual(connectedClient.scopes, ["read"]);
    assert.equal(connectedClient.clientId, "web-main");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport enforces method scopes", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
    );

    const readOnlyClient = {
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
      method: "agent.wait",
      params: { message: "hello" },
    }, readOnlyClient, (frame: any) => responses.push(frame));

    assert.equal(responses.length, 1);
    assert.equal(responses[0].ok, false);
    assert.equal(responses[0].error.code, "FORBIDDEN");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport requires admin scope for admin methods", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const store = new Store(path.join(tmp, "state.json"));
    store.upsertChatSession("client:web", "sender", "/tmp/session");
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0 },
      store,
      new CommandRegistry(),
    );

    const writeClient = {
      connId: "conn-1",
      identity: null,
      role: "operator" as const,
      scopes: ["read", "write"] as Scope[],
      seq: 0,
      send: () => {},
    };
    const responses: any[] = [];
    (transport as any).handleRequest({
      type: "req",
      id: "req-1",
      method: "sessions.reset",
      params: { chatId: "client:web" },
    }, writeClient, (frame: any) => responses.push(frame));

    assert.equal(responses.length, 1);
    assert.equal(responses[0].ok, false);
    assert.equal(responses[0].error.code, "FORBIDDEN");
    assert.notEqual(store.getChatSession("client:web"), null);

    (transport as any).handleRequest({
      type: "req",
      id: "req-2",
      method: "deliveries.retry",
      params: { id: "delivery-1" },
    }, writeClient, (frame: any) => responses.push(frame));

    (transport as any).handleRequest({
      type: "req",
      id: "req-3",
      method: "clients.list",
      params: {},
    }, writeClient, (frame: any) => responses.push(frame));

    await waitFor(() => responses.length === 3);
    assert.equal(responses[1].ok, false);
    assert.equal(responses[1].error.code, "FORBIDDEN");
    assert.equal(responses[2].ok, true);
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

test("ClientTransport REST accepts named client token with read scope", async () => {
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
    assert.equal(JSON.parse(res.body).ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ClientTransport REST rejects named client without required write scope", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-client-transport-"));
  try {
    const transport = new ClientTransport(
      { enabled: true, host: "127.0.0.1", port: 0, clients: [{ id: "status", displayName: "Status", token: "read-token", scopes: ["read"] }] },
      new Store(path.join(tmp, "state.json")),
      new CommandRegistry(),
      new SimpleIdentityResolver([{ id: "status", displayName: "Status", scopes: ["read"], keys: ["token:read-token"] }]),
    );
    const req = { method: "POST", url: "/api/v1/attachments", headers: { authorization: "Bearer read-token", host: "localhost" } };
    const res = makeMockRes();

    await (transport as any).serveRestApi(req, res);

    assert.equal(res.status, 403);
    assert.equal(JSON.parse(res.body).error, "Forbidden");
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
