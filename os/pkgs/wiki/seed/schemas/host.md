---
id: schema/host
schema_version: 1
type: concept
object_type: schema
title: Schema - Host
domain: technical
areas: [knowledge-system, infrastructure]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for host objects — physical or virtual machines in the system.
---

# Schema: Host

A host is a machine: workstation, server, VM, or container. It should be scoped to `hosts: [<slug>]` to match the machine it describes.

## Required fields

| field | value |
|---|---|
| `id` | `host/<slug>` |
| `schema_version` | `1` |
| `type` | `entity` |
| `object_type` | `host` |
| `title` | machine hostname |
| `domain` | `technical` |
| `areas` | `[infrastructure]` at minimum |
| `hosts` | `[<slug>]` — scoped to itself |
| `status` | `active` or `archived` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | role, OS, and primary use in one sentence |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `validation_level` | enum | default: `working` |
| `review_cycle_days` | integer | recommended: `60` |
| `last_reviewed` | date | ISO |
| `next_review` | date | ISO |

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | projects this host supports |
| `people` | `person/*` | responsible operators |
| `systems` | `service/*` | services running on this host |
| `related` | any | related notes |

## Status values

- `active` — in use
- `archived` — decommissioned

## Recommended body sections

- `## Role`
- `## Services`
- `## Operational notes`
- `## Change log`
- `## Related`

## Example

```yaml
id: host/example-server
schema_version: 1
type: entity
object_type: host
title: example-server
domain: technical
areas: [infrastructure]
hosts: [example-server]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
review_cycle_days: 60
last_reviewed: 2026-04-21
next_review: 2026-06-20
projects: [project/example-project]
people: [person/operator]
systems: [service/example-sync-service]
summary: Example server used for a shared knowledge workspace.
```
