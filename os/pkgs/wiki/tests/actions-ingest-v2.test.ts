/**
 * actions-ingest tests — wiki_ingest single-step pipeline.
 *
 * Covers: secret stripping (8 patterns), source file creation per channel,
 * daily-note bullet insertion, append-mode for repeat ingests, error on
 * empty content, daily auto-creation, wikilink format.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleIngest, stripSecrets } from "../src/wiki/actions-ingest.ts";
import { todayStamp } from "../src/wiki/paths.ts";

describe("stripSecrets", () => {
  it("redacts password=value patterns", () => {
    expect(stripSecrets("password=hunter2")).not.toContain("hunter2");
  });

  it("redacts api_key: value patterns", () => {
    expect(stripSecrets("api_key: sk-1234567890abcdef")).not.toContain("sk-1234567890abcdef");
  });

  it("redacts UPPER_KEY=value env-var style", () => {
    expect(stripSecrets("SECRET_KEY=abc123_very_long_secret_xyz789")).not.toContain("abc123_very_long_secret_xyz789");
    expect(stripSecrets("API_KEY=mysecretvalue12345")).not.toContain("mysecretvalue12345");
    expect(stripSecrets("GITHUB_TOKEN=ghp_xxxxxxxxxxxxx")).not.toContain("ghp_xxxxxxxxxxxxx");
  });

  it("redacts IBANs", () => {
    expect(stripSecrets("RO49AAAA1B31007593840000")).toContain("[REDACTED-IBAN]");
  });

  it("redacts card numbers", () => {
    expect(stripSecrets("1234 5678 9012 3456")).toContain("[REDACTED-CARD]");
    expect(stripSecrets("1234-5678-9012-3456")).toContain("[REDACTED-CARD]");
  });

  it("leaves normal prose untouched", () => {
    const text = "My name is Alex and I live in Brașov.";
    expect(stripSecrets(text)).toBe(text);
  });

  it("leaves short tokens alone", () => {
    const text = "id=42 status=ok";
    // 'id' and 'status' are not secret-named fields and the values are short
    expect(stripSecrets(text)).toBe(text);
  });
});

describe("handleIngest", () => {
  let wikiRoot: string;
  const today = todayStamp();

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "ownloom-wiki-ingest-"));
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("rejects empty content", () => {
    const r = handleIngest(wikiRoot, "   \n\n  ", { channel: "web" });
    expect(r.isErr()).toBe(true);
  });

  it("creates source file under sources/<channel>/<today>.md", () => {
    const r = handleIngest(wikiRoot, "hello world", { channel: "whatsapp", title: "msg-1", domain: "personal" });
    expect(r.isOk()).toBe(true);

    const sourcePath = path.join(wikiRoot, "sources", "whatsapp", `${today}.md`);
    expect(existsSync(sourcePath)).toBe(true);
    const content = readFileSync(sourcePath, "utf-8");
    expect(content).toContain("type: source");
    expect(content).toContain("channel: whatsapp");
    expect(content).toContain("hello world");
  });

  it("strips secrets from source file", () => {
    handleIngest(wikiRoot, "SECRET_KEY=very_long_secret_value_xyz789 and password=hunter2", {
      channel: "web",
    });
    const content = readFileSync(path.join(wikiRoot, "sources", "web", `${today}.md`), "utf-8");
    expect(content).not.toContain("very_long_secret_value_xyz789");
    expect(content).not.toContain("hunter2");
    expect(content).toContain("[REDACTED");
  });

  it("creates today's daily note if missing and writes a bullet under ## Captured", () => {
    handleIngest(wikiRoot, "test content", { channel: "voice", summary: "voice memo" });
    const dailyPath = path.join(wikiRoot, "daily", `${today}.md`);
    expect(existsSync(dailyPath)).toBe(true);
    const content = readFileSync(dailyPath, "utf-8");
    expect(content).toContain("## Captured");
    // Bullet uses correct v2 wikilink form: [[sources/<channel>/<date>]]
    expect(content).toContain(`[[sources/voice/${today}]]`);
    expect(content).toContain("voice memo");
  });

  it("uses default bullet when no summary provided", () => {
    handleIngest(wikiRoot, "test content", { channel: "gmail" });
    const content = readFileSync(path.join(wikiRoot, "daily", `${today}.md`), "utf-8");
    expect(content).toContain(`[[sources/gmail/${today}]]`);
    expect(content).toContain("captured from gmail");
  });

  it("appends to existing source file on second ingest in same day", () => {
    handleIngest(wikiRoot, "first message", { channel: "whatsapp" });
    handleIngest(wikiRoot, "second message", { channel: "whatsapp" });

    const content = readFileSync(path.join(wikiRoot, "sources", "whatsapp", `${today}.md`), "utf-8");
    expect(content).toContain("first message");
    expect(content).toContain("second message");
    expect(content).toContain("---"); // separator between ingests
  });

  it("defaults channel to 'other' when not provided", () => {
    handleIngest(wikiRoot, "ambient content");
    expect(existsSync(path.join(wikiRoot, "sources", "other", `${today}.md`))).toBe(true);
  });

  it("returns details with sourcePath and dailyPath", () => {
    const r = handleIngest(wikiRoot, "x", { channel: "web" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.details?.sourcePath).toBe(`sources/web/${today}.md`);
      expect(r.value.details?.dailyPath).toBe(`daily/${today}.md`);
    }
  });
});
