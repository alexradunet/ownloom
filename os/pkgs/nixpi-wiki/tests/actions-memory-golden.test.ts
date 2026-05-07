import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRegistry, scanPages } from "../src/wiki/actions-meta.ts";
import { searchRegistry } from "../src/wiki/actions-search.ts";
import type { RegistryData } from "../src/wiki/types.ts";

function writePage(root: string, relPath: string, content: string): void {
  const absPath = path.join(root, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
}

describe.skip("memory golden retrieval", () => {
  let wikiRoot: string;
  let registry: RegistryData;
  const oldHost = process.env.NIXPI_WIKI_HOST;

  beforeEach(() => {
    wikiRoot = os.tmpdir() + path.sep + "nixpi-wiki-golden-" + Math.random().toString(16).slice(2);
    seedGoldenWiki(wikiRoot);
    registry = buildRegistry(scanPages(wikiRoot));
    process.env.NIXPI_WIKI_HOST = "nixpi-vps";
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
    if (oldHost === undefined) delete process.env.NIXPI_WIKI_HOST;
    else process.env.NIXPI_WIKI_HOST = oldHost;
  });

  it.each([
    {
      query: "personal-domain retrieval single wiki root",
      expectedPath: "pages/resources/knowledge/wiki-memory-automation-policy.md",
      expectedSummary: "technical and personal domains share one wiki",
    },
    {
      query: "fresh technical wiki baseline current implemented state",
      expectedPath: "pages/areas/infrastructure/nixpi/evolution/technical-wiki-fresh-baseline.md",
      expectedSummary: "current implemented NixPI state",
    },
    {
      query: "current host nixpi-vps fleet hub",
      expectedPath: "pages/resources/technical/nixpi-vps.md",
      expectedSummary: "Git, wiki, and gateway hub",
    },
    {
      query: "whatsapp direct message audio transcription gateway",
      expectedPath: "pages/resources/technical/nixpi-gateway.md",
      expectedSummary: "audio transcription enabled",
    },
  ])("retrieves $expectedPath for '$query'", ({ query, expectedPath, expectedSummary }) => {
    const result = searchRegistry(registry, query, { domain: "technical", hostScope: "all", limit: 3 });
    expect(result.matches.map((match) => match.path)).toContain(expectedPath);
    const match = result.matches.find((entry) => entry.path === expectedPath);
    expect(match?.summary).toContain(expectedSummary);
  });

  it("can return personal-domain memory from the single wiki unless a domain filter narrows results", () => {
    const ambient = searchRegistry(registry, "private reflection journal", { hostScope: "all", limit: 5 });
    expect(ambient.matches.map((match) => match.path)).toContain("pages/journal/daily/private-reflection.md");

    const technical = searchRegistry(registry, "private reflection journal", { domain: "technical", hostScope: "all", limit: 5 });
    expect(technical.matches.map((match) => match.path)).not.toContain("pages/journal/daily/private-reflection.md");
  });
});

function seedGoldenWiki(root: string): void {
  mkdirSync(root, { recursive: true });
  writePage(root, "pages/resources/knowledge/wiki-memory-automation-policy.md", `---
id: decision/wiki-memory-automation-policy
schema_version: 1
type: decision
object_type: decision
title: Wiki Memory Automation Policy
aliases: []
tags: [knowledge-system, automation, decision]
domain: technical
areas: [knowledge-system, organization]
hosts: []
status: active
validation_level: working
created: 2026-04-27
updated: 2026-04-27
source_ids: []
summary: Policy for which wiki/memory actions Pi may automate; technical and personal domains share one wiki root with Git-reviewed durable changes.
---
# Wiki Memory Automation Policy

## Decision
Automate capture, indexing, validation, and proposals before trusted canonical edits.
`);

  writePage(root, "pages/areas/infrastructure/nixpi/evolution/technical-wiki-fresh-baseline.md", `---
id: evolution/nixpi-technical-wiki-fresh-baseline
schema_version: 1
type: evolution
object_type: evolution
title: Technical wiki fresh baseline
aliases: [fresh technical wiki baseline]
tags: [nixpi, evolution, baseline]
domain: technical
areas: [knowledge-system, infrastructure]
hosts: []
status: implementing
validation_level: working
created: 2026-04-27
updated: 2026-04-27
source_ids: [SRC-BASELINE]
summary: Normalize host identities and prune invalid historical technical wiki pages so the wiki starts from the current implemented NixPI state.
---
# Technical wiki fresh baseline

## Motivation
The wiki starts from current implemented, configured, and used NixPI state.
`);

  writePage(root, "pages/resources/technical/nixpi-vps.md", `---
id: host/nixpi-vps
schema_version: 1
type: entity
object_type: host
title: nixpi-vps
aliases: [vps-nixos]
tags: [host, infrastructure]
domain: technical
areas: [infrastructure, nixos]
hosts: [nixpi-vps]
status: active
validation_level: working
created: 2026-04-24
updated: 2026-04-27
source_ids: [SRC-BASELINE]
summary: Current NixPI VPS host running NixOS and serving as the wiki and gateway hub.
---
# nixpi-vps

## Fleet integration
Current host identity is nixpi-vps.
`);

  writePage(root, "pages/resources/technical/nixpi-gateway.md", `---
id: service/nixpi-gateway
schema_version: 1
type: entity
object_type: service
title: NixPI Gateway
domain: technical
areas: [ai, infrastructure]
hosts: [nixpi-vps]
status: active
validation_level: working
created: 2026-04-27
updated: 2026-04-27
source_ids: [SRC-BASELINE]
summary: Declared VPS service that runs the NixPI gateway with WhatsApp direct-message intake and audio transcription enabled.
---
# NixPI Gateway

WhatsApp direct messages and audio transcription are enabled.
`);

  writePage(root, "pages/journal/daily/private-reflection.md", `---
id: journal/private-reflection
schema_version: 1
type: journal
object_type: daily-note
title: Private Reflection
aliases: []
tags: [journal]
domain: personal
areas: [journal]
hosts: []
status: active
validation_level: working
created: 2026-04-27
updated: 2026-04-27
summary: Personal private reflection journal entry for privacy-domain retrieval tests.
---
# Private Reflection
`);
}
