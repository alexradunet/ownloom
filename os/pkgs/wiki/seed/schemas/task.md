# Schema: task context note

object_type: task
type: task
home: pages/planner/tasks/

Wiki task pages are context/archive notes only. The live task record belongs in the standards-based planner backend as CalDAV/iCalendar `VTODO`.

## Required fields

| field | value |
|---|---|
| `id` | `task/<slug>` |
| `schema_version` | `1` |
| `type` | `task` |
| `object_type` | `task` |
| `title` | task context title |
| `domain` | `personal` or `technical` |
| `status` | context-note lifecycle only |
| `summary` | why this context note exists |

## Do not store live planner state here

Do not use wiki frontmatter for `priority`, `due`, `schedule`, `depends_on`, `blocked_by`, or `completed`. Use CalDAV/iCalendar `VTODO` via `nixpi-planner`.

## Template structure

```markdown
# Task Context

## Context

## Outcome

## Notes

## Related
```
