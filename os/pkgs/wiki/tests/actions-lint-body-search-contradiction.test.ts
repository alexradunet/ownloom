import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleWikiLint } from "../src/wiki/actions-lint.ts";

describe.skip("actions-lint contradiction review and body-search-backed concept discovery", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-body-search-"));
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
    delete process.env.NIXPI_WIKI_BODY_SEARCH_BIN;
  });

  afterEach(() => {
    delete process.env.NIXPI_WIKI_BODY_SEARCH_BIN;
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("flags contradiction-review candidates when overlapping evidence diverges", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "alpha.md"),
      `---
type: concept
id: concept/alpha
object_type: concept
title: Authentication Strategy
domain: technical
areas: [security]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: Session tokens remain the preferred default for this system.
---
# Authentication Strategy

This page explains the current recommendation in detail with enough body text to avoid thin-content noise for this test.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "beta.md"),
      `---
type: analysis
id: analysis/beta
object_type: analysis
title: Auth Session Review
domain: technical
areas: [security]
status: contested
updated: 2026-04-21
source_ids: [SRC-1]
summary: Session tokens should be phased out in favor of short-lived API keys.
---
# Auth Session Review

This page deliberately disagrees while citing the same source context, so it should be surfaced for manual review.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "contradiction-review");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.contradictionReview).toBe(1);
      expect(result.value.details?.issues[0]?.message).toContain("overlapping context but divergent summaries/status");
      expect(result.value.details?.issues[0]?.message).toContain("beta.md");
    }
  });

  it("ignores broad baseline source IDs when looking for contradiction-review candidates", () => {
    const titles = ["Alpha Runtime", "Bravo Storage", "Charlie Gateway", "Delta Retrieval", "Echo Secrets", "Foxtrot Sync"];
    for (const [index, title] of titles.entries()) {
      writeFileSync(
        path.join(wikiRoot, "pages", "resources", "technical", `baseline-${index}.md`),
        `---
type: concept
id: concept/baseline-${index}
object_type: concept
title: ${title}
domain: technical
areas: [area-${index}]
status: active
updated: 2026-04-21
source_ids: [SRC-BASELINE]
summary: Distinct ${title.toLowerCase()} summary.
---
# ${title}

This page cites a shared broad baseline source, which should not by itself create contradiction-review noise.
`,
        "utf8",
      );
    }

    const result = handleWikiLint(wikiRoot, "contradiction-review");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.contradictionReview).toBe(0);
    }
  });

  it("does not report missing concepts that are covered by existing page titles", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "nixpi-gateway.md"),
      `---
type: entity
id: service/nixpi-gateway
object_type: service
title: NixPI Gateway
domain: technical
areas: [infrastructure]
status: active
updated: 2026-04-27
source_ids: [SRC-1]
summary: Gateway service.
---
# NixPI Gateway

The Gateway is already modeled by this page.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-one.md"),
      `---
type: concept
id: concept/page-one
object_type: concept
title: Page One
domain: technical
areas: [infrastructure]
status: active
updated: 2026-04-27
source_ids: [SRC-1]
summary: First page.
---
# Page One

The Gateway remains important.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-two.md"),
      `---
type: concept
id: concept/page-two
object_type: concept
title: Page Two
domain: technical
areas: [infrastructure]
status: active
updated: 2026-04-27
source_ids: [SRC-2]
summary: Second page.
---
# Page Two

The Git Server is mentioned again, but it already has a page.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "missing-concepts");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.missingConcepts).toBe(0);
    }
  });

  it("does not report contradiction-review candidates already related in frontmatter", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "install.md"),
      `---
type: procedure
id: procedure/install
object_type: procedure
title: Install Host
domain: technical
areas: [infrastructure]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
related: [procedure/recover]
summary: Install procedure for the host.
---
# Install Host

Install procedure with enough content for the semantic lint tests and explicit relation to recovery.
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "recover.md"),
      `---
type: procedure
id: procedure/recover
object_type: procedure
title: Recover Host
domain: technical
areas: [infrastructure]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
related: [procedure/install]
summary: Recovery procedure for the host.
---
# Recover Host

Recovery procedure with enough content for the semantic lint tests and explicit relation to install.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "contradiction-review");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.contradictionReview).toBe(0);
    }
  });

  it("surfaces missing concept candidates when body search is configured", () => {
    const fakeBodySearch = path.join(wikiRoot, "fake-rga.sh");
    writeFileSync(
      fakeBodySearch,
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "--files-with-matches" ]; then
  printf '%s\n' 'pages/resources/technical/page-one.md' 'pages/resources/technical/page-two.md'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeBodySearch, 0o755);
    process.env.NIXPI_WIKI_BODY_SEARCH_BIN = fakeBodySearch;

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-one.md"),
      `---
type: concept
id: concept/page-one
object_type: concept
title: Page One
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: First page
---
# Page One

GPU Scheduler should be tuned more carefully on this host.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-two.md"),
      `---
type: concept
id: concept/page-two
object_type: concept
title: Page Two
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
summary: Second page
---
# Page Two

We also need a better GPU Scheduler for batch jobs.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "missing-concepts");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.missingConcepts).toBe(1);
      expect(result.value.details?.issues[0]?.message).toContain('Missing concept candidate: "gpu scheduler"');
      expect(result.value.details?.issues[0]?.message).toMatch(/confirmed by body search|local heuristic/);
    }
  });

  it("falls back to local heuristic when body search is unavailable", () => {
    process.env.NIXPI_WIKI_BODY_SEARCH_BIN = path.join(wikiRoot, "does-not-exist-rga");

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-a.md"),
      `---
type: concept
id: concept/page-a
object_type: concept
title: Page A
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: A page
---
# Page A

Control Plane Latency keeps showing up in diagnostics.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-b.md"),
      `---
type: concept
id: concept/page-b
object_type: concept
title: Page B
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
summary: B page
---
# Page B

We need to monitor Control Plane Latency during upgrades too.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "missing-concepts");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.missingConcepts).toBe(1);
      expect(result.value.details?.issues[0]?.message).toContain("local heuristic");
    }
  });
});
