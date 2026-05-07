import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CommandRegistry } from "../src/core/commands.js";
import { Store } from "../src/core/store.js";
import { ClientTransport } from "../src/transport/client-transport.js";
import type { InboundMessage } from "../src/core/types.js";
import type { MethodContext } from "../src/protocol/methods.js";
import type { Scope } from "../src/core/identity.js";

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
