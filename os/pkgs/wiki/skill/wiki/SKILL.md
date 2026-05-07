---
name: wiki
description: 'NixPI Wiki memory layer. Use for searching knowledge, ingesting notes/sources, creating typed objects, managing daily notes, linting wiki structure, running decay passes, capturing session memory, or running any nixpi-wiki CLI operation. Keywords: wiki, notes, memory, journal, knowledge, search, objects, lint, ingest, sources.'
allowed-tools: shell
---

# NixPI Wiki

Manage the NixPI Wiki using the `nixpi-wiki` CLI. Configuration is via environment variables set at install time.

## Check configuration

Always start by reading context:

```bash
nixpi-wiki context --format markdown
```

This shows the active wiki root, workspace, host, and domain.

## Read-only operations

Safe to run at any time:

```bash
nixpi-wiki call wiki_status
nixpi-wiki call wiki_search '{"query":"..."}'
nixpi-wiki call wiki_lint '{"mode":"strict"}'
nixpi-wiki call wiki_daily '{"action":"get"}'
```

## Write operations

Use for intentional ingest, object creation, daily-note append, or maintenance:

```bash
nixpi-wiki mutate wiki_ingest '{"content":"...","channel":"journal"}'
nixpi-wiki mutate wiki_session_capture '{"summary":"..."}'
nixpi-wiki mutate wiki_ensure_object '{"type":"concept","title":"..."}'
nixpi-wiki mutate wiki_daily '{"action":"append","bullets":["..."]}'
nixpi-wiki mutate wiki_decay_pass '{"dry_run":false}'
nixpi-wiki mutate wiki_rebuild
```

## Domain scoping

All commands accept an optional `domain` parameter:

```bash
nixpi-wiki call wiki_search '{"query":"...","domain":"work"}'
nixpi-wiki mutate wiki_ingest '{"content":"...","channel":"journal","domain":"work"}'
```

## Rules

- Prefer read operations before writes.
- Use `mutate` only for intentional wiki writes or cache rebuilds.
- Do not create wiki task/reminder/event pages as the live source of truth; use `nixpi-planner` for live planner items.
- Use `wiki_ingest` for raw evidence/source capture and `wiki_session_capture` for explicit session memory.
- All object pages require v2 YAML frontmatter: `id`, `type`, `title`, `domain`, `areas`, `confidence`, `last_confirmed`, `decay`, `created`, `updated`, `summary`.
- Pages with `hosts` apply only to those hosts; pages without `hosts` are global.
