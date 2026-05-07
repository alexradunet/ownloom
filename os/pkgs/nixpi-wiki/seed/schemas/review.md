---
id: schema/review
schema_version: 1
type: concept
object_type: schema
title: Schema - Review
domain: personal
areas: [knowledge-system, planning]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-04-21
summary: Per-type schema for review objects — periodic synthesis of wins, friction, lessons, and next focus.
---

# Schema: Review

A review note is a periodic synthesis. It surfaces patterns from the journal and tasks, and resets focus for the next period. Reviews live in `pages/planner/reviews/` or `pages/journal/weekly/`.

## Required fields

| field | value |
|---|---|
| `id` | `review/<period>-<slug>` |
| `schema_version` | `1` |
| `type` | `journal` |
| `object_type` | `review` |
| `title` | clear period-based title |
| `domain` | `personal` |
| `areas` | `[review]` at minimum |
| `status` | `active` |
| `period` | `weekly`, `monthly`, or `quarterly` |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | key takeaway from this review period |

## Optional fields

| field | type | notes |
|---|---|---|
| `tags` | array | from `meta/tags.md` |
| `validation_level` | enum | default: `seed` |

Do **not** add review-cycle fields to review notes.

## Standard relations

| field | expected IDs | notes |
|---|---|---|
| `projects` | `project/*` | projects reviewed |
| `people` | `person/*` | people surfaced in review |
| `related` | any | tasks, journal notes, reminders |

## Status values

- `active` — always `active` for review notes

## Recommended body sections

- `## Wins`
- `## Friction`
- `## Lessons`
- `## Next focus`
- `## Related`

## Example

```yaml
id: review/weekly-2026-04-21
schema_version: 1
type: journal
object_type: review
title: Weekly Review 2026-04-21
domain: personal
areas: [review, organisation]
status: active
validation_level: seed
period: weekly
created: 2026-04-21
updated: 2026-04-21
projects: [project/example-knowledge-base]
people: [person/operator]
related: [task/plan-wiki-migration, journal/2026-04-21]
summary: Example weekly review after a clean wiki rebuild — structure solid, migration next.
```
