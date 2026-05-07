---
id: schema/event
schema_version: 1
type: concept
object_type: schema
title: Schema - Event Context
domain: personal
areas: [knowledge-system, planning]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-05-06
summary: Per-type schema for event context notes; live scheduled event data belongs in CalDAV/iCalendar VEVENT.
---

# Schema: Event Context

An event context note records durable purpose, notes, decisions, and links around an event. The live scheduled event itself belongs in the standards-based planner backend as CalDAV/iCalendar `VEVENT`.

## Required fields

| field | value |
|---|---|
| `id` | `event/<slug>` |
| `schema_version` | `1` |
| `type` | `event` |
| `object_type` | `event` |
| `title` | descriptive title |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | context-note lifecycle only |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | why this context note exists |

## Do not store live calendar state here

Do not use wiki frontmatter for `start`, `end`, `location`, `attendees`, or `completed`. Use CalDAV/iCalendar `VEVENT` via `ownloom-planner`.

## Recommended body sections

- `## Purpose`
- `## Notes`
- `## Follow-ups`
- `## Related`
