import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Store } from "../src/core/store.js";

test("Store records and replays idempotent request results", () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-idempotency-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    assert.deepEqual(store.beginIdempotentRequest("client:agent:k1", 1000), { status: "started" });
    assert.deepEqual(store.beginIdempotentRequest("client:agent:k1", 1000), { status: "pending" });

    const result = { ok: true, payload: { runId: "r1", status: "accepted" } };
    store.finishIdempotentRequest("client:agent:k1", result);
    assert.deepEqual(store.beginIdempotentRequest("client:agent:k1", 1000), { status: "duplicate", result });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Store saves and resolves uploaded attachments", () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-attachments-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const attachment = store.saveAttachment({
      kind: "image",
      mimeType: "image/png",
      fileName: "hello image.png",
      data: Buffer.from("png-bytes"),
    });

    assert.equal(attachment.kind, "image");
    assert.equal(attachment.mimeType, "image/png");
    assert.equal(attachment.fileName, "hello image.png");
    assert.equal(attachment.sizeBytes, 9);
    assert.ok(existsSync(attachment.path));
    assert.equal(readFileSync(attachment.path, "utf-8"), "png-bytes");

    const resolved = store.getAttachment(attachment.id);
    assert.deepEqual(resolved, attachment);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
