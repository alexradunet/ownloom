import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWikiLint } from "../src/wiki/actions-lint.ts";

describe.skip("actions-lint robustness", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-lint-robust-"));
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("checks markdown links, stale reviews, empty summaries, duplicate ids, and unresolved relation ids", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "target.md"),
      `---
type: concept
id: concept/target
object_type: concept
title: Target
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-1]
summary: Valid target
---
# Target
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "alpha.md"),
      `---
type: concept
id: concept/shared-id
object_type: concept
title: Alpha
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-1]
summary: Alpha summary
next_review: 2026-04-01
projects: [project/missing]
---
# Alpha

See [Target](./target.md) and [Ghost](./ghost.md).
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "beta.md"),
      `---
type: concept
id: concept/shared-id
object_type: concept
title: Beta
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-2]
summary: Beta summary
related: [concept/target]
---
# Beta
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "empty-summary.md"),
      `---
type: concept
id: concept/empty-summary
object_type: concept
title: Empty Summary
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-3]
summary: ""
---
# Empty Summary
`,
      "utf8",
    );

    const links = handleWikiLint(wikiRoot, "links");
    expect(links.isOk()).toBe(true);
    if (links.isOk()) {
      expect(links.value.details?.counts.brokenLinks).toBe(1);
      expect(links.value.details?.issues.some((issue) => issue.message.includes("Broken markdown link"))).toBe(true);
    }

    const stale = handleWikiLint(wikiRoot, "stale-reviews");
    expect(stale.isOk()).toBe(true);
    if (stale.isOk()) {
      expect(stale.value.details?.counts.staleReviews).toBe(1);
      expect(stale.value.details?.issues[0]?.message).toContain("Review overdue since 2026-04-01");
    }

    const empty = handleWikiLint(wikiRoot, "empty-summary");
    expect(empty.isOk()).toBe(true);
    if (empty.isOk()) {
      expect(empty.value.details?.counts.emptySummary).toBe(1);
    }

    const dupId = handleWikiLint(wikiRoot, "duplicate-id");
    expect(dupId.isOk()).toBe(true);
    if (dupId.isOk()) {
      expect(dupId.value.details?.counts.duplicateIds).toBe(1);
      expect(dupId.value.details?.issues[0]?.message).toContain("Duplicate id \"concept/shared-id\"");
    }

    const unresolved = handleWikiLint(wikiRoot, "unresolved-ids");
    expect(unresolved.isOk()).toBe(true);
    if (unresolved.isOk()) {
      expect(unresolved.value.details?.counts.unresolvedIds).toBe(1);
      expect(unresolved.value.details?.issues[0]?.message).toContain("project/missing");
    }
  });
});
