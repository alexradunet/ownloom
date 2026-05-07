import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWikiDigest, rebuildAllMeta } from "../src/wiki/actions-meta.ts";

describe("actions-meta wiki digest", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "ownloom-wiki-digest-"));
    mkdirSync(path.join(wikiRoot, "pages", "journal", "daily"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "resources", "knowledge"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "planner", "tasks"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(wikiRoot, { recursive: true, force: true });
    delete process.env.OWNLOOM_WIKI_HOST;
  });

  it("surfaces today's note and active knowledge notes but not planner context pages", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T09:00:00Z"));
    process.env.OWNLOOM_WIKI_HOST = "vps-nixos";

    writeFileSync(
      path.join(wikiRoot, "pages", "journal", "daily", "2026-04-21.md"),
      `---
type: journal
title: 2026-04-21
domain: technical
areas: [planning]
status: active
updated: 2026-04-21
summary: Daily note
---
# 2026-04-21
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "knowledge", "planner-policy.md"),
      `---
type: concept
object_type: concept
title: Planner Policy
domain: technical
areas: [planning]
status: active
updated: 2026-04-21
summary: Live planner state lives in CalDAV.
---
# Planner Policy

CalDAV is the live planner backend. Wiki pages keep context and reviews.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "tasks", "context.md"),
      `---
type: task
object_type: task
title: Context Task
domain: technical
areas: [planning]
status: open
updated: 2026-04-21
summary: context only
---
# Context Task
`,
      "utf8",
    );

    rebuildAllMeta(wikiRoot);
    const digest = buildWikiDigest(wikiRoot);

    expect(digest).toContain("[WIKI DIGEST");
    expect(digest).toContain("TODAY NOTE: pages/journal/daily/2026-04-21.md");
    expect(digest).toContain("Planner Policy");
    expect(digest).not.toContain("Context Task");
  });

  it("can restrict digest content to one domain", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T09:00:00Z"));

    for (const [domain, title] of [["personal", "Personal Note"], ["technical", "Technical Note"]] as const) {
      writeFileSync(
        path.join(wikiRoot, "pages", "resources", "knowledge", `${domain}.md`),
        `---
type: concept
object_type: concept
title: ${title}
domain: ${domain}
areas: [planning]
status: active
updated: 2026-04-21
summary: ${domain}
---
# ${title}
`,
        "utf8",
      );
    }

    rebuildAllMeta(wikiRoot);
    const digest = buildWikiDigest(wikiRoot, { domain: "personal" });

    expect(digest).toContain("[WIKI DIGEST — personal");
    expect(digest).toContain("Personal Note");
    expect(digest).not.toContain("Technical Note");
  });
});
