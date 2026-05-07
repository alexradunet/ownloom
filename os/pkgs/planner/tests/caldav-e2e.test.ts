/**
 * End-to-end planner tests that drive a real Radicale CalDAV server.
 *
 * These tests are intentionally separate from the mocked unit tests so that:
 * - The unit tests remain fast and sandbox-safe for all environments.
 * - The E2E tests provide confidence that the PlannerClient works against a
 *   live CalDAV backend (radicale must be in PATH — available in the Nix build).
 *
 * The suite auto-skips gracefully if radicale is not found in PATH.
 */
import assert from "node:assert/strict";
import { spawnSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PlannerClient } from "../src/caldav.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function radicaleAvailable(): boolean {
  const result = spawnSync("radicale", ["--version"], { timeout: 3000 });
  return result.status === 0;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("no address"));
      const port = addr.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function startRadicale(port: number, storageDir: string, configDir: string): Promise<ChildProcess> {
  const configPath = path.join(configDir, "radicale.cfg");
  writeFileSync(
    configPath,
    [
      "[server]",
      `hosts = 127.0.0.1:${port}`,
      "[auth]",
      "type = none",
      "[storage]",
      `filesystem_folder = ${storageDir}`,
      "[logging]",
      "level = warning",
    ].join("\n"),
    "utf-8",
  );

  const proc = spawn("radicale", ["-C", configPath], {
    env: { ...process.env, HOME: configDir },
    stdio: "pipe",
  });

  // Poll until the server responds (up to 5 s).
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/`);
      if (resp.status < 500) break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return proc;
}

// ── Test suite ────────────────────────────────────────────────────────────────

if (!radicaleAvailable()) {
  test("caldav-e2e: skipped (radicale not in PATH)", (t) => {
    t.skip("radicale binary not found");
  });
} else {
  test("PlannerClient: full round-trip against real Radicale", async () => {
    const port = await findFreePort();
    const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-planner-e2e-"));
    const storageDir = path.join(tmp, "collections");
    let proc: ChildProcess | undefined;

    try {
      proc = await startRadicale(port, storageDir, tmp);

      const client = new PlannerClient({
        baseUrl: `http://127.0.0.1:${port}/`,
        user: "testuser",
        collection: "planner",
      });

      // init: creates the principal + calendar collection.
      await client.init();

      // add-task and verify basic fields.
      const task = await client.addTask({ title: "E2E test task", due: "2026-06-01" });
      assert.equal(task.title, "E2E test task");
      assert.equal(task.kind, "task");
      assert.ok(task.uid, "uid must be set");

      // add-reminder.
      const reminder = await client.addReminder({ title: "E2E reminder", at: "2026-06-15T09:00:00" });
      assert.equal(reminder.kind, "reminder");

      // list returns both items.
      const all = await client.list("all");
      const titles = all.map((i) => i.title);
      assert.ok(titles.includes("E2E test task"), `task not in list: ${JSON.stringify(titles)}`);
      assert.ok(titles.includes("E2E reminder"), `reminder not in list: ${JSON.stringify(titles)}`);

      // done: marks the task completed.
      const done = await client.done(task.uid);
      assert.equal(done.status, "done");

      // delete: removes the reminder.
      await client.delete(reminder.uid);
      const afterDelete = await client.list("all");
      assert.ok(!afterDelete.some((i) => i.uid === reminder.uid), "deleted item must not be in list");
    } finally {
      proc?.kill();
      rmSync(tmp, { recursive: true });
    }
  });

  test("PlannerClient: reschedule updates due date", async () => {
    const port = await findFreePort();
    const tmp = mkdtempSync(path.join(os.tmpdir(), "ownloom-planner-e2e-"));
    let proc: ChildProcess | undefined;

    try {
      proc = await startRadicale(port, path.join(tmp, "collections"), tmp);

      const client = new PlannerClient({
        baseUrl: `http://127.0.0.1:${port}/`,
        user: "testuser",
        collection: "planner",
      });
      await client.init();

      const task = await client.addTask({ title: "Reschedule me", due: "2026-06-01" });
      const rescheduled = await client.reschedule(task.uid, { due: "2026-07-01" });
      assert.equal(rescheduled.due?.slice(0, 10), "2026-07-01");
    } finally {
      proc?.kill();
      rmSync(tmp, { recursive: true });
    }
  });
}
