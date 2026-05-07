---
id: schema/reminder
schema_version: 1
type: concept
object_type: schema
title: Schema - Reminder Context
domain: personal
areas: [knowledge-system, planning]
status: active
validation_level: trusted
created: 2026-04-21
updated: 2026-05-06
summary: Per-type schema for reminder context notes; live reminder alarms belong in CalDAV/iCalendar VALARM.
---

# Schema: Reminder Context

A reminder context note records durable background for a reminder. The live reminder itself belongs in the standards-based planner backend as CalDAV/iCalendar `VTODO` with `VALARM`.

## Required fields

| field | value |
|---|---|
| `id` | `reminder/<slug>` |
| `schema_version` | `1` |
| `type` | `reminder` |
| `object_type` | `reminder` |
| `title` | reminder context title |
| `domain` | `technical` or `personal` |
| `areas` | one or more area slugs |
| `status` | context-note lifecycle only |
| `created` | ISO date |
| `updated` | ISO date |
| `summary` | why this context note exists |

## Do not store live reminder state here

Do not use wiki frontmatter for `remind_at`, `snooze_until`, `for`, or `completed`. Use CalDAV/iCalendar `VALARM` via `nixpi-planner`.

## Recommended body sections

- `## Context`
- `## What to remember`
- `## Related`
