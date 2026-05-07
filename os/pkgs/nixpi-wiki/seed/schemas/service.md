---
id: schema/service
schema_version: 1
type: concept
object_type: schema
title: Schema - Service
domain: technical
areas: [knowledge-system, infrastructure]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for service objects — running software services that support projects or areas.
---

# Schema: Service

A service is a running software process: a daemon, an application, or a managed platform. It may run on one or more hosts.

## Required fields

| field | value |
|---|---|
| `id` | `service/<slug>` |
| `schema_version` | `1` |
| `type` | `entity` |
| `object_type` | `service` |
| `title` | service name |
| `domain` | `technical` |
| `areas` | `[infrastructure]` at minimum |
| `status` | `active` or `archived` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | what the service does and which host runs it |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `hosts` | array | hosts this service runs on |
| `validation_level` | enum | default: `working` |
| `review_cycle_days` | integer | recommended: `60` |
| `last_reviewed` | date | ISO |
| `next_review` | date | ISO |

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | |
| `people` | `person/*` | operators |
| `systems` | `host/*` or `service/*` | depends on / runs alongside |
| `related` | any | |

## Status values

- `active` — running
- `archived` — decommissioned

## Recommended body sections

- `## Purpose`
- `## Dependencies`
- `## Operational notes`
- `## Change log`
- `## Related`

## Example

```yaml
id: service/example-sync-service
schema_version: 1
type: entity
object_type: service
title: Example Sync Service
domain: technical
areas: [infrastructure, sync]
hosts: [example-server]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
review_cycle_days: 60
last_reviewed: 2026-04-21
next_review: 2026-06-20
projects: [project/example-project, project/example-knowledge-base]
people: [person/operator]
systems: [host/example-server]
summary: Example service that keeps workspace data available across devices.
```
