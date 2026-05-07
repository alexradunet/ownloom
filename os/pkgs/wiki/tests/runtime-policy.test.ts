import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCompactionContext,
  loadContext,
  readText,
  restoredContextBlock,
  saveContext,
} from "../../nixpi-pi-adapter/extensions/nixpi/nixpi/wiki/runtime-policy.ts";

describe("runtime-policy helpers", () => {
  const originalHome = process.env.HOME;
  const originalHostname = process.env.HOSTNAME;

  beforeEach(() => {
    process.env.HOME = path.join("/tmp", "nixpi-wiki-runtime-policy-home");
    rmSync(process.env.HOME, { recursive: true, force: true });
    mkdirSync(process.env.HOME, { recursive: true });
    process.env.HOSTNAME = "runtime-test-host";
  });

  afterEach(() => {
    if (process.env.HOME) rmSync(process.env.HOME, { recursive: true, force: true });
    if (originalHome) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalHostname) process.env.HOSTNAME = originalHostname;
    else delete process.env.HOSTNAME;
  });

  it("reads text or returns null for missing files", () => {
    expect(readText(path.join(process.env.HOME!, "missing.txt"))).toBeNull();
    const filePath = path.join(process.env.HOME!, "note.txt");
    writeFileSync(filePath, "hello", "utf-8");
    expect(readText(filePath)).toBe("hello");
  });

  it("saves and loads restored context data", () => {
    expect(loadContext()).toBeNull();
    saveContext({ savedAt: "2026-04-23T00:00:00.000Z", host: "old-host", cwd: "/tmp/work" });
    expect(loadContext()).toEqual({ savedAt: "2026-04-23T00:00:00.000Z", host: "old-host", cwd: "/tmp/work" });
    expect(restoredContextBlock({ savedAt: "2026-04-23T00:00:00.000Z", host: "old-host", cwd: "/tmp/work" })).toContain("Previous cwd: /tmp/work");
  });

  it("returns null for invalid saved context json", () => {
    const contextPath = path.join(process.env.HOME!, ".pi", "agent", "context.json");
    mkdirSync(path.dirname(contextPath), { recursive: true });
    writeFileSync(contextPath, "{ invalid json", "utf-8");
    expect(loadContext()).toBeNull();
  });

  it("builds compaction context with host and cwd", () => {
    const context = buildCompactionContext("/tmp/project");
    expect(context.cwd).toBe("/tmp/project");
    expect(context.host).toBe("runtime-test-host");
    expect(typeof context.savedAt).toBe("string");
  });
});
