# Schema: area

object_type: area
type: concept
home: pages/areas/<area-slug>/

## Required fields

| field | value |
|---|---|
| `id` | `area/<slug>` |
| `schema_version` | `1` |
| `type` | `concept` |
| `object_type` | `area` |
| `title` | area name |
| `domain` | `personal` or `technical` |
| `areas` | `[<area-slug>]` (self-referential is fine) |
| `status` | `active` or `archived` |
| `validation_level` | `seed` / `working` / `trusted` |
| `summary` | scope and current focus sentence |

## Review cycle

- `review_cycle_days: 90`

## Template structure

```markdown
# Area Name

## Scope

## Principles

## Current focus

## Risks / tensions

## Related
```
