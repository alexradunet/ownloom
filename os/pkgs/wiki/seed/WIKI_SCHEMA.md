# Wiki Schema

Plain Markdown + YAML frontmatter.
Designed for humans, LLMs, and generic tooling.

Schema version: `1`

---

## What changed in the current schema

| field | status | change |
|---|---|---|
| `schema_version` | **new, required** | integer, must be `1` |
| `validation_level` | **new, optional** | confidence tier for the note's content |
| `review_cycle_days` | **new, optional** | how often to revisit this note |
| `last_reviewed` | **new, optional** | date of last deliberate review |
| `next_review` | **new, optional** | computed next review date |
| `schemas/` | **new** | per-object-type validation specs |
| `meta/tags.md` | **new** | controlled tag vocabulary |
| `meta/relation-types.md` | **new** | controlled relation type vocabulary |

Notes without `schema_version` are considered **v1 (legacy)**.

---

## Canonical frontmatter

```yaml
---
id: project/example
schema_version: 1
type: evolution
object_type: project
title: Example Project
aliases: []
tags: []
domain: technical
areas: [knowledge-system]
hosts: []
status: active
validation_level: working
created: 2026-04-21
updated: 2026-04-21
review_cycle_days: 90
last_reviewed: 2026-04-21
next_review: 2026-07-20
projects: []
people: []
systems: []
sources: []
related: []
source_ids: []
summary: One-line dense summary.
---
```

---

## Required fields (all notes)

| field | type | description |
|---|---|---|
| `id` | string | stable canonical identifier |
| `schema_version` | integer | schema generation, must be `1` |
| `type` | enum | document role |
| `object_type` | enum | real-world object kind |
| `title` | string | human-readable title |
| `domain` | enum | `technical` or `personal` |
| `areas` | array | long-lived thematic scope |
| `status` | enum | lifecycle state |
| `created` | date | ISO date |
| `updated` | date | ISO date |
| `summary` | string | dense routing summary |

---

## Optional common fields

| field | type | description |
|---|---|---|
| `aliases` | array | alternate names |
| `tags` | array | cross-cutting themes, from `meta/tags.md` |
| `hosts` | array | machine-specific scope |
| `validation_level` | enum | confidence tier |
| `review_cycle_days` | integer | review frequency in days |
| `last_reviewed` | date | ISO date |
| `next_review` | date | ISO date |
| `projects` | array | related project IDs |
| `people` | array | related person IDs |
| `systems` | array | related technical object IDs |
| `sources` | array | related source IDs |
| `related` | array | generic related IDs |
| `depends_on` | array | hard dependencies |
| `blocked_by` | array | blocking items |
| `source_ids` | array | external source references |

---

## `validation_level` values

| value | meaning |
|---|---|
| `seed` | rough capture, structure not yet checked |
| `working` | being actively used and updated |
| `trusted` | stable, reviewed, reliable |
| `superseded` | replaced by a newer note |

Use `seed` for all new notes. Promote to `working` once the note is in regular use. Promote to `trusted` after a deliberate review.

---

## `status` values

Most canonical notes use:

```text
draft | active | contested | superseded | archived
```

Type-specific exceptions:

| type | additional / specific statuses |
|---|---|
| `evolution` | `proposed`, `planning`, `implementing`, `validating`, `reviewing`, `applied`, `rejected`, `active` |
| `decision` | canonical statuses plus `applied`, `rejected` |
| `concept` | canonical statuses plus `applied` |
| `entity` | canonical statuses plus `planned`, `retired` |
| `task` | `open`, `in-progress`, `waiting`, `done`, `cancelled` |
| `event` | `scheduled`, `done`, `cancelled` |
| `reminder` | `open`, `snoozed`, `done`, `cancelled` |
| `source` | `captured`, `integrated`, `superseded` |

---

## Review fields

Use only for durable notes such as projects, areas, hosts, concepts, and dashboards.

```yaml
review_cycle_days: 90
last_reviewed: 2026-04-21
next_review: 2026-07-20
```

Do not add review fields to tasks, events, reminders, journal entries, or sources.

---

## Controlled `type` values

| type | use for |
|---|---|
| `concept` | evergreen concept or explanation |
| `entity` | specific thing: person, host, service, tool |
| `synthesis` | cross-cutting summary or integration |
| `analysis` | focused deep dive |
| `evolution` | change over time, project page |
| `procedure` | step-by-step instructions |
| `decision` | a decision and its rationale |
| `identity` | self-referential system note |
| `journal` | time-based log or reflection |
| `task` | actionable work item |
| `event` | scheduled item |
| `reminder` | follow-up prompt |

---

## Core `object_type` values

| object_type | typical home | schema file |
|---|---|---|
| `dashboard` | `pages/home/` | `schemas/dashboard.md` |
| `project` | `pages/projects/` | `schemas/project.md` |
| `area` | `pages/areas/` | `schemas/area.md` |
| `person` | `pages/resources/people/` | `schemas/person.md` |
| `host` | `pages/resources/technical/` | `schemas/host.md` |
| `service` | `pages/resources/technical/` | `schemas/service.md` |
| `concept` | `pages/resources/knowledge/` | `schemas/concept.md` |
| `source` | `pages/sources/` | `schemas/source.md` |
| `meeting` | `pages/planner/calendar/` | `schemas/meeting.md` |
| `task` | `pages/planner/tasks/` context only | `schemas/task.md` |
| `event` | `pages/planner/calendar/` context only | `schemas/event.md` |
| `reminder` | `pages/planner/reminders/` context only | `schemas/reminder.md` |
| `daily-note` | `pages/journal/daily/` | `schemas/daily-note.md` |
| `review` | `pages/planner/reviews/` or `pages/journal/weekly/` | `schemas/review.md` |

---

## Type-specific extra fields

### task / event / reminder context notes

Live planner state is not stored in wiki frontmatter. Use the standards-based planner backend:

- tasks: CalDAV/iCalendar `VTODO`
- events/meetings: CalDAV/iCalendar `VEVENT`
- reminders: CalDAV/iCalendar `VTODO` with `VALARM`

Wiki `task`, `event`, and `reminder` pages are optional context/archive notes only. Do not put planner fields such as `priority`, `due`, `schedule`, `start`, `end`, `location`, `attendees`, `remind_at`, `snooze_until`, or `completed` in wiki frontmatter.

### journal / daily-note

```yaml
period:
```

---

## Status conventions

### Knowledge notes (`concept`, `entity`, `synthesis`, `analysis`, `evolution`, `procedure`, `decision`, `identity`)

- `active`
- `archived`

### Task notes

- `open`
- `in-progress`
- `waiting`
- `done`
- `cancelled`

### Event notes

- `scheduled`
- `done`
- `cancelled`

### Reminder notes

- `open`
- `snoozed`
- `done`
- `cancelled`

---

## Relation fields

Use only the fields that add signal.
All values must be stable IDs from the registry.

```yaml
projects: []
people: []
systems: []
sources: []
related: []
```

Relation types used inside note bodies should come from `meta/relation-types.md`.

---

## Controlled vocabularies

- Tags: `meta/tags.md`
- Relation types: `meta/relation-types.md`
- Per-type schemas: `schemas/<object_type>.md`

---

## Body linking

Use standard Markdown links in note bodies.

```md
See [the example project](pages/projects/example-project/index.md).
```

Never use wikilinks or app-specific link syntax as the canonical reference.

---

## File naming

- use kebab-case filenames
- use `index.md` inside project and area folders
- keep titles readable

---

## ID conventions

| object_type | id pattern |
|---|---|
| `project` | `project/<slug>` |
| `area` | `area/<slug>` |
| `person` | `person/<slug>` |
| `host` | `host/<slug>` |
| `service` | `service/<slug>` |
| `concept` | `concept/<slug>` |
| `source` | `source/<slug>` |
| `meeting` | `meeting/<slug>-YYYY-MM-DD` |
| `task` | `task/<slug>` |
| `event` | `event/<slug>-YYYY-MM-DD` |
| `reminder` | `reminder/<slug>-YYYY-MM-DD` |
| `daily-note` | `journal/YYYY-MM-DD` |
| `review` | `review/<period>-<slug>` |
| `dashboard` | `home/<slug>` |

---

## Anti-patterns to avoid

- ❌ missing `schema_version`
- ❌ missing `summary`
- ❌ `validation_level: trusted` on a brand new note
- ❌ tags not in `meta/tags.md`
- ❌ relation types not in `meta/relation-types.md`
- ❌ wikilinks or path-based app links instead of Markdown relative links
- ❌ review fields on tasks, events, reminders, or journals
- ❌ new notes placed in legacy folders
