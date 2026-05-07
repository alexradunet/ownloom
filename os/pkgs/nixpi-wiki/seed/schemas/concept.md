---
id: schema/concept
schema_version: 1
type: concept
object_type: schema
title: Schema - Concept
domain: technical
areas: [knowledge-system]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for concept objects — evergreen ideas, definitions, and mental models.
---

# Schema: Concept

A concept note is an evergreen piece of knowledge: a definition, a model, a principle, or an insight that stays relevant over time. Concepts live in `pages/resources/knowledge/`.

## Required fields

| field | value |
|---|---|
| `id` | `concept/<slug>` |
| `schema_version` | `1` |
| `type` | `concept` |
| `object_type` | `concept` |
| `title` | clear, specific concept name |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | `active` or `archived` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | core claim or definition in one sentence |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | alternate names or synonyms |
| `tags` | array | from `meta/tags.md` |
| `validation_level` | enum | default: `seed` |
| `review_cycle_days` | integer | recommended: `180` |
| `last_reviewed` | date | ISO |
| `next_review` | date | ISO |

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | projects using this concept |
| `sources` | `source/*` | evidence behind this concept |
| `related` | any | related concepts and notes |

## Status values

- `active` — current, maintained
- `archived` — superseded or no longer relevant

## Recommended body sections

- `## Core idea`
- `## Evidence`
- `## Tensions / caveats`
- `## Open questions`
- `## Related`

## Example

```yaml
id: concept/object-based-knowledge-system
schema_version: 1
type: concept
object_type: concept
title: Object-Based Knowledge System
domain: technical
areas: [knowledge-system]
status: active
validation_level: working
created: 2026-04-21
updated: 2026-04-21
review_cycle_days: 180
last_reviewed: 2026-04-21
next_review: 2026-10-18
projects: [project/example-project, project/example-knowledge-base]
sources: [source/capacities-object-model-research]
summary: Design principle for modeling notes as objects with stable IDs, typed metadata, and explicit relations.
```
