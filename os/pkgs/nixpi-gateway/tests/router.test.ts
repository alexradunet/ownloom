import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentClient, PromptOptions } from "../src/core/agent-client.js";
import { Router } from "../src/core/router.js";
import { Store } from "../src/core/store.js";
import type { InboundMessage } from "../src/core/types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channel: "websocket",
    chatId: "test-chat",
    senderId: "test-sender",
    messageId: `msg-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    text: "hello",
    isGroup: false,
    access: {
      allowedSenderIds: ["test-sender"],
      adminSenderIds: ["test-sender"],
      directMessagesOnly: false,
      selfSenderIds: [],
    },
    ...overrides,
  };
}

function makeStore(tmpDir: string): Store {
  return new Store(path.join(tmpDir, "state.json"));
}

/**
 * Minimal AgentClient whose `prompt` behaviour is controlled per-call via
 * a queue of handlers.  Each `prompt()` call shifts the next handler off the
 * front of the queue; if the queue is empty the call throws an error.
 */
function makeAgent(
  handlers: Array<
    (msg: string, sessionPath: string | null, opts: PromptOptions) => Promise<{ text: string; sessionPath: string }>
  >,
): AgentClient {
  let calls = 0;
  return {
    name: "fake",
    async healthCheck() {},
    async prompt(msg, sessionPath, opts) {
      const handler = handlers[calls++];
      if (!handler) throw new Error(`Unexpected prompt call #${calls}`);
      return handler(msg, sessionPath, opts ?? {});
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Router: delivers primary reply when provider succeeds", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    const agent = makeAgent([async () => ({ text: "primary reply", sessionPath: "/tmp/s.jsonl" })]);
    const router = new Router(makeStore(tmp), agent, 1400, 4);
    const result = await router.handleMessage(makeMsg());
    assert.ok(result.replies.some((r) => r.includes("primary reply")));
    assert.equal(result.markProcessed, true);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test("Router: falls back to local model when primary fails and no chunks sent", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    const agent = makeAgent([
      async () => { throw new Error("upstream 503"); },
      async () => ({ text: "fallback reply", sessionPath: "/tmp/s.jsonl" }),
    ]);
    const router = new Router(makeStore(tmp), agent, 1400, 4, {}, undefined, "ollama/qwen2.5:3b");
    const result = await router.handleMessage(makeMsg());
    assert.ok(
      result.replies.some((r) => r.includes("fallback reply")),
      `Expected fallback reply; got: ${JSON.stringify(result.replies)}`,
    );
    // Reply is annotated with [⚡ local] so the operator knows it used the fallback.
    assert.ok(
      result.replies.some((r) => r.includes("[⚡ local]")),
      `Expected [⚡ local] annotation; got: ${JSON.stringify(result.replies)}`,
    );
    assert.equal(result.markProcessed, true);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test("Router: does NOT fall back when chunks are already streaming", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    const agent = makeAgent([
      async () => { throw new Error("upstream 503"); },
    ]);
    const router = new Router(makeStore(tmp), agent, 1400, 4, {}, undefined, "ollama/qwen2.5:3b");
    // Pass a streaming onChunk callback — fallback must be skipped.
    const result = await router.handleMessage(makeMsg(), () => {});
    assert.ok(!result.replies.some((r) => r.includes("[⚡ local]")));
    assert.ok(result.replies.some((r) => r.includes("internal error")));
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test("Router: returns generic error when both primary and fallback fail", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    const agent = makeAgent([
      async () => { throw new Error("primary failed"); },
      async () => { throw new Error("fallback also failed"); },
    ]);
    const router = new Router(makeStore(tmp), agent, 1400, 4, {}, undefined, "ollama/qwen2.5:3b");
    const result = await router.handleMessage(makeMsg());
    assert.ok(result.replies.some((r) => r.includes("internal error")));
    assert.equal(result.markProcessed, true);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test("Router: skips fallback when no fallback model configured", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    const agent = makeAgent([
      async () => { throw new Error("primary failed"); },
    ]);
    const router = new Router(makeStore(tmp), agent, 1400, 4);
    const result = await router.handleMessage(makeMsg());
    assert.ok(result.replies.some((r) => r.includes("internal error")));
    assert.ok(!result.replies.some((r) => r.includes("[⚡ local]")));
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test("Router: /private prefix routes to fallback model, skips synthetic", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    let usedModel: string | undefined;
    const agent = makeAgent([
      async (_msg, _sp, opts) => {
        usedModel = opts.model;
        return { text: "private reply", sessionPath: "/tmp/s.jsonl" };
      },
    ]);
    const router = new Router(makeStore(tmp), agent, 1400, 4, {}, undefined, "ollama/gemma3:4b");
    const result = await router.handleMessage(makeMsg({ text: "/private my secret prompt" }));
    assert.ok(result.replies.some((r) => r.includes("private reply")));
    assert.equal(usedModel, "ollama/gemma3:4b", "Privacy routing must use fallback model");
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test("Router: /private returns error when no local model configured", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    const agent = makeAgent([]);
    const router = new Router(makeStore(tmp), agent, 1400, 4);
    const result = await router.handleMessage(makeMsg({ text: "/private secret" }));
    assert.ok(result.replies.some((r) => r.includes("Privacy routing is not available")));
    assert.equal(result.markProcessed, true);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test("Router: skips fallback when no fallback model configured", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-router-"));
  try {
    const agent = makeAgent([
      async () => { throw new Error("primary failed"); },
    ]);
    const router = new Router(makeStore(tmp), agent, 1400, 4);
    const result = await router.handleMessage(makeMsg());
    assert.ok(result.replies.some((r) => r.includes("internal error")));
    assert.ok(!result.replies.some((r) => r.includes("[⚡ local]")));
  } finally {
    rmSync(tmp, { recursive: true });
  }
});
