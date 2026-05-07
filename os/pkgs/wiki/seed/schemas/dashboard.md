---
id: schema/dashboard
schema_version: 1
type: concept
object_type: schema
title: Schema - Dashboard
domain: technical
areas: [knowledge-system]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for dashboard objects — curated navigation and overview pages in pages/home/.
---

# Schema: Dashboard

A dashboard is a navigation page. It is a curated, human-maintained entry point — not a generated query. Dashboards live in `pages/home/`.

## Required fields

| field | value |
|---|---|
| `id` | `home/<slug>` |
| `schema_version` | `1` |
| `type` | `synthesis` |
| `object_type` | `dashboard` |
| `title` | clear navigation-oriented title |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | `active` or `archived` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | what this dashboard surfaces and for whom |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `validation_level` | enum | default: `working` |
| `review_cycle_days` | integer | recommended: `30` |
| `last_reviewed` | date | ISO |
| `next_review` | date | ISO |

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | projects featured |
| `people` | `person/*` | people featured |
| `systems` | `host/*` or `service/*` | systems featured |
| `sources` | `source/*` | supporting research |
| `related` | any | related dashboards or notes |

## Status values

- `active` — in use
- `archived` — replaced or no longer used

## Recommended body sections

Structure dashboards with clearly labelled sections for each category of content.
Prefer links over prose to keep them scannable.

## Example

```yaml
id: home/today-dashboard
schema_version: 1
type: synthesis
object_type: dashboard
title: Today Dashboard
domain: personal
areas: [organisation, planning]
status: active
validation_level: working
created: 2026-04-21
updated: 2026-04-21
review_cycle_days: 30
last_reviewed: 2026-04-21
next_review: 2026-05-21
projects: [project/example-knowledge-base, project/example-project]
people: [person/operator]
summary: Daily operational view connecting today's note, open tasks, upcoming events, and reminders.
```
