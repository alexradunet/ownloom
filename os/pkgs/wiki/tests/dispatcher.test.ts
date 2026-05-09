import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callWikiTool } from "../src/tools/dispatcher.ts";

const originalRoot = process.env.OWNLOOM_WIKI_ROOT;

describe("wiki dispatcher", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "ownloom-wiki-dispatcher-"));
    process.env.OWNLOOM_WIKI_ROOT = wikiRoot;
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
    if (originalRoot) process.env.OWNLOOM_WIKI_ROOT = originalRoot;
    else delete process.env.OWNLOOM_WIKI_ROOT;
  });

  it("does not treat missing wiki_daily action as append", async () => {
    const result = await callWikiTool("wiki_daily", { bullets: ["bypass"] }, { policy: { allowMutation: true } });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid wiki_daily action");
    expect(existsSync(path.join(wikiRoot, "daily"))).toBe(false);
  });
});
