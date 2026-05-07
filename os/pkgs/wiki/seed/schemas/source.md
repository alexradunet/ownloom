---
id: schema/source
schema_version: 1
type: concept
object_type: schema
title: Schema - Source
domain: technical
areas: [knowledge-system]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for source objects — structured notes derived from external evidence.
---

# Schema: Source

A source note represents processed external material: an article, paper, video, conversation, or raw document. Sources are static once processed — they record what an external thing said, not ongoing knowledge.

## Required fields

| field | value |
|---|---|
| `id` | `source/<slug>` |
| `schema_version` | `1` |
| `type` | `synthesis` |
| `object_type` | `source` |
| `title` | descriptive title of the source |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | `active` or `archived` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | what the source says and why it matters |

## Optional fields

| field | type | notes |
|---|---|---|
| `aliases` | array | |
| `tags` | array | from `meta/tags.md` |
| `validation_level` | enum | default: `seed` |
| `source_ids` | array | external reference IDs or URLs |

Do **not** add review-cycle fields to source notes — sources are static.

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | |
| `people` | `person/*` | authors, interviewees |
| `related` | any | concepts or notes derived from this |

## Status values

- `active` — processed and in use
- `archived` — superseded or no longer relevant

## Recommended body sections

- `## Source details`
- `## Key takeaways`
- `## Open questions`
- `## Related`

## Example

```yaml
id: source/capacities-object-model-research
schema_version: 1
type: synthesis
object_type: source
title: Capacities Object Model Research
domain: technical
areas: [knowledge-system, research]
status: active
validation_level: working
created: 2026-04-21
updated: 2026-04-21
source_ids: [web:capacities-docs-object-types, web:llm-wiki-pattern]
projects: [project/example-project, project/example-knowledge-base]
summary: Research on translating Capacities-style objects into plain Markdown and llm-wiki conventions.
```
