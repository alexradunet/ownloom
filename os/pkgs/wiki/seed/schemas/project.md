# Schema: project

object_type: project
type: evolution
home: pages/projects/<project-slug>/

## Required fields

| field | value |
|---|---|
| `id` | `project/<slug>` |
| `schema_version` | `1` |
| `type` | `evolution` |
| `object_type` | `project` |
| `title` | project name |
| `domain` | `technical` or `personal` |
| `areas` | relevant area slugs |
| `status` | `active` or `archived` |
| `validation_level` | `seed` / `working` / `trusted` |
| `summary` | outcome + current state sentence |

## Optional fields

| field | description |
|---|---|
| `people` | people involved |
| `systems` | technical systems in scope |
| `sources` | research that informs the project |
| `related` | related notes |

## Review cycle

- `review_cycle_days: 90`

## Template structure

```markdown
# Project Name

## Outcome

## Current state

## Next steps

## Notes

## Related
```
