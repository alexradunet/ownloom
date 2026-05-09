---
name: wiki
description: 'ownloom Wiki memory layer. Use for searching knowledge, ingesting notes/sources, creating typed objects, managing daily notes, linting wiki structure, running decay passes, capturing session memory, or running any ownloom-wiki CLI operation. Keywords: wiki, notes, memory, journal, knowledge, search, objects, lint, ingest, sources.'
allowed-tools: shell
---

# ownloom Wiki

Manage the ownloom Wiki using the `ownloom-wiki` CLI. Configuration is via environment variables set at install time.

## Check configuration

Always start by reading context:

```bash
ownloom-wiki context --format markdown
```

This shows the active wiki root, workspace, host, and domain.

## Read-only operations

Safe to run at any time:

```bash
ownloom-wiki call wiki_status
ownloom-wiki call wiki_search '{"query":"..."}'
ownloom-wiki call wiki_lint '{"mode":"strict"}'
ownloom-wiki call wiki_daily '{"action":"get"}'
```

## Write operations

Use for intentional ingest, object creation, daily-note append, or maintenance:

```bash
ownloom-wiki mutate wiki_ingest '{"content":"...","channel":"journal"}'
ownloom-wiki mutate wiki_session_capture '{"summary":"..."}'
ownloom-wiki mutate wiki_ensure_object '{"type":"concept","title":"..."}'
ownloom-wiki mutate wiki_daily '{"action":"append","bullets":["..."]}'
ownloom-wiki mutate wiki_decay_pass '{"dry_run":false}'
ownloom-wiki mutate wiki_rebuild
```

## Domain scoping

All commands accept an optional `domain` parameter:

```bash
ownloom-wiki call wiki_search '{"query":"...","domain":"technical"}'
ownloom-wiki mutate wiki_ingest '{"content":"...","channel":"journal","domain":"personal"}'
```

## Rules

- Prefer read operations before writes.
- Use `mutate` only for intentional wiki writes or cache rebuilds.
- Do not create wiki task/reminder/event pages as the live source of truth; use `ownloom-planner` for live planner items.
- Use `wiki_ingest` for raw evidence/source capture and `wiki_session_capture` for explicit session memory.
- All object pages require v2 YAML frontmatter: `id`, `type`, `title`, `domain`, `areas`, `confidence`, `last_confirmed`, `decay`, `created`, `updated`, `summary`.
- Pages with `hosts` apply only to those hosts; pages without `hosts` are global.
