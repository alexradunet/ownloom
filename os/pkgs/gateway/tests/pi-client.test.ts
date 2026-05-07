import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PiClient, type PiSdkSession, type PiSdkSessionFactory, type SdkImageContent } from "../src/core/pi-client.js";
import type { AgentSessionEventListener } from "@mariozechner/pi-coding-agent";

function fakeSession(options: {
  sessionFile?: string;
  text?: string;
  prompt?: PiSdkSession["prompt"];
  onAbort?: () => void;
  onDispose?: () => void;
  /** Listeners attached via subscribe(). Keyed for easy inspection in tests. */
  listeners?: AgentSessionEventListener[];
} = {}): PiSdkSession {
  const listeners: AgentSessionEventListener[] = options.listeners ?? [];
  return {
    sessionFile: options.sessionFile,
    prompt: options.prompt ?? (async () => {}),
    getLastAssistantText: () => options.text ?? "ok",
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    abort: async () => {
      options.onAbort?.();
    },
    dispose: () => {
      options.onDispose?.();
    },
  };
}

test("PiClient applies per-call environment overrides around SDK prompts and restores them", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-pi-sdk-env-"));
  const previous = process.env.PI_GATEWAY_PROFILE;
  delete process.env.PI_GATEWAY_PROFILE;

  try {
    let envDuringFactory: string | undefined;
    let envDuringPrompt: string | undefined;
    const factory: PiSdkSessionFactory = async () => {
      envDuringFactory = process.env.PI_GATEWAY_PROFILE;
      return fakeSession({
        sessionFile: path.join(tmp, "sessions", "session.jsonl"),
        text: "env-ok",
        prompt: async () => {
          envDuringPrompt = process.env.PI_GATEWAY_PROFILE;
        },
      });
    };

    const client = new PiClient({
      sessionDir: path.join(tmp, "sessions"),
      cwd: tmp,
      sessionFactory: factory,
      healthCheckFactory: async () => {},
    });
    const reply = await client.prompt("hello", null, {
      env: { PI_GATEWAY_PROFILE: "whatsapp-personal" },
    });

    assert.equal(reply.text, "env-ok");
    assert.equal(envDuringFactory, "whatsapp-personal");
    assert.equal(envDuringPrompt, "whatsapp-personal");
    assert.equal(process.env.PI_GATEWAY_PROFILE, undefined);
  } finally {
    if (previous === undefined) delete process.env.PI_GATEWAY_PROFILE;
    else process.env.PI_GATEWAY_PROFILE = previous;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("PiClient passes model, session, cwd, agentDir, and gateway prompt append to the SDK factory", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-pi-sdk-options-"));
  try {
    const sessionPath = path.join(tmp, "sessions", "existing.jsonl");
    let seen: Parameters<PiSdkSessionFactory>[0] | undefined;
    const factory: PiSdkSessionFactory = async (options) => {
      seen = options;
      return fakeSession({ sessionFile: sessionPath, text: "model-ok" });
    };

    const client = new PiClient({
      sessionDir: path.join(tmp, "sessions"),
      cwd: tmp,
      agentDir: path.join(tmp, "agent"),
      timeoutMs: 10_000,
      sessionFactory: factory,
      healthCheckFactory: async () => {},
    });
    const reply = await client.prompt("hello", sessionPath, {
      model: "synthetic/hf:moonshotai/Kimi-K2.6",
      systemPromptAddendum: "Use a test profile.",
    });

    assert.equal(reply.text, "model-ok");
    assert.equal(reply.sessionPath, sessionPath);
    assert.equal(seen?.cwd, tmp);
    assert.equal(seen?.agentDir, path.join(tmp, "agent"));
    assert.equal(seen?.sessionDir, path.join(tmp, "sessions"));
    assert.equal(seen?.sessionPath, sessionPath);
    assert.equal(seen?.model, "synthetic/hf:moonshotai/Kimi-K2.6");
    assert.match(seen?.systemPromptAppend ?? "", /same Pi SDK tools/i);
    assert.match(seen?.systemPromptAppend ?? "", /Use a test profile\./);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("PiClient converts image attachments to SDK image content", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-pi-sdk-attachments-"));
  try {
    const imagePath = path.join(tmp, "image.png");
    writeFileSync(imagePath, "fake-image", "utf-8");
    let images: SdkImageContent[] | undefined;
    const factory: PiSdkSessionFactory = async () => fakeSession({
      sessionFile: path.join(tmp, "sessions", "session.jsonl"),
      text: "image-ok",
      prompt: async (_message, options) => {
        images = options?.images as SdkImageContent[] | undefined;
      },
    });

    const client = new PiClient({
      sessionDir: path.join(tmp, "sessions"),
      cwd: tmp,
      sessionFactory: factory,
      healthCheckFactory: async () => {},
    });
    const reply = await client.prompt("describe this", null, {
      attachments: [{ path: imagePath, mimeType: "image/png", kind: "image" }],
    });

    assert.equal(reply.text, "image-ok");
    assert.equal(images?.length, 1);
    assert.equal(images?.[0]?.type, "image");
    assert.equal(images?.[0]?.mimeType, "image/png");
    assert.equal(images?.[0]?.data, Buffer.from("fake-image").toString("base64"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("PiClient aborts and disposes the SDK session on timeout", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-pi-sdk-timeout-"));
  try {
    let aborted = false;
    let disposed = false;
    const factory: PiSdkSessionFactory = async () => fakeSession({
      sessionFile: path.join(tmp, "sessions", "session.jsonl"),
      prompt: async () => new Promise<void>(() => {}),
      onAbort: () => {
        aborted = true;
      },
      onDispose: () => {
        disposed = true;
      },
    });

    const client = new PiClient({
      sessionDir: path.join(tmp, "sessions"),
      cwd: tmp,
      timeoutMs: 5,
      sessionFactory: factory,
      healthCheckFactory: async () => {},
    });

    await assert.rejects(() => client.prompt("slow", null), /timed out/);
    assert.equal(aborted, true);
    assert.equal(disposed, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("PiClient healthCheck delegates to the SDK health check", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-pi-sdk-health-"));
  try {
    let calledWith: { cwd: string; agentDir?: string } | undefined;
    const client = new PiClient({
      sessionDir: path.join(tmp, "sessions"),
      cwd: tmp,
      agentDir: path.join(tmp, "agent"),
      sessionFactory: async () => fakeSession(),
      healthCheckFactory: async (options) => {
        calledWith = options;
      },
    });

    await client.healthCheck();
    assert.deepEqual(calledWith, { cwd: tmp, agentDir: path.join(tmp, "agent") });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("PiClient calls onChunk for each text_delta event during streaming", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-pi-sdk-streaming-"));
  try {
    const listeners: AgentSessionEventListener[] = [];
    const factory: PiSdkSessionFactory = async () =>
      fakeSession({
        sessionFile: path.join(tmp, "sessions", "session.jsonl"),
        text: "hello world",
        // Emit two text_delta events during prompt()
        prompt: async () => {
          for (const listener of listeners) {
            listener({
              type: "message_update",
              message: {} as any,
              assistantMessageEvent: { type: "text_delta", delta: "hello " },
            } as any);
            listener({
              type: "message_update",
              message: {} as any,
              assistantMessageEvent: { type: "text_delta", delta: "world" },
            } as any);
          }
        },
        listeners,
      });

    const client = new PiClient({
      sessionDir: path.join(tmp, "sessions"),
      cwd: tmp,
      sessionFactory: factory,
      healthCheckFactory: async () => {},
    });

    const chunks: string[] = [];
    const reply = await client.prompt("hello", null, {
      onChunk: (chunk) => chunks.push(chunk),
    });

    assert.deepEqual(chunks, ["hello ", "world"]);
    assert.equal(reply.text, "hello world");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
