---
id: schema/meeting
schema_version: 1
type: concept
object_type: schema
title: Schema - Meeting Context
domain: technical
areas: [knowledge-system, planning]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-05-06
summary: Per-type schema for meeting context notes; live scheduling belongs in CalDAV/iCalendar VEVENT.
---

# Schema: Meeting Context

A meeting note records what was discussed, what was decided, and what needs to happen next. The live scheduled meeting belongs in the standards-based planner backend as CalDAV/iCalendar `VEVENT`.

## Required fields

| field | value |
|---|---|
| `id` | `meeting/<slug>` |
| `schema_version` | `1` |
| `type` | `event` |
| `object_type` | `meeting` |
| `title` | descriptive title |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | context-note lifecycle only |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | purpose + durable outcome in one sentence |

## Do not store live calendar state here

Do not use wiki frontmatter for `start`, `end`, `location`, `attendees`, or `completed`. Use CalDAV/iCalendar `VEVENT` via `nixpi-planner`.

## Recommended body sections

- `## Agenda`
- `## Notes`
- `## Decisions`
- `## Follow-ups`
- `## Related`
