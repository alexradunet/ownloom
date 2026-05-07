# Object Schemas

Per-object-type field definitions for the wiki.

These files define the expected frontmatter fields for each `object_type`.
They are used by migration tooling and linting to validate notes.

## Files

| schema | object_type | common home |
|---|---|---|
| [project.md](project.md) | `project` | `pages/projects/` |
| [area.md](area.md) | `area` | `pages/areas/` |
| [person.md](person.md) | `person` | `pages/resources/people/` |
| [concept.md](concept.md) | `concept` | `pages/resources/knowledge/` |
| [source.md](source.md) | `source` | `pages/sources/` |
| [host.md](host.md) | `host` | `pages/resources/technical/` |
| [service.md](service.md) | `service` | `pages/resources/technical/` |
| [task.md](task.md) | `task` context | `pages/planner/tasks/` |
| [event.md](event.md) | `event` context | `pages/planner/calendar/` |
| [meeting.md](meeting.md) | `meeting` context | `pages/planner/calendar/` |
| [reminder.md](reminder.md) | `reminder` context | `pages/planner/reminders/` |
| [daily-note.md](daily-note.md) | `daily-note` | `pages/journal/daily/` |
| [review.md](review.md) | `review` | `pages/planner/reviews/` |
| [dashboard.md](dashboard.md) | `dashboard` | `pages/home/` |

## Format

Each schema file documents:
- required fields
- optional fields
- expected values or types
- review cycle
