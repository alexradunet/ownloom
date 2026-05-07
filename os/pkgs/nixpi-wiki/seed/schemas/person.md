# Schema: person

object_type: person
type: entity
domain: personal
home: pages/resources/people/

## Required fields

| field | value |
|---|---|
| `id` | `person/<slug>` |
| `schema_version` | `1` |
| `type` | `entity` |
| `object_type` | `person` |
| `title` | full name |
| `domain` | `personal` |
| `areas` | `[relationships]` |
| `status` | `active` or `archived` |
| `validation_level` | `seed` (migrated) or `working` / `trusted` (written fresh) |
| `summary` | `<Name> — <relationship context>.` |

## Optional fields

| field | description |
|---|---|
| `aliases` | nicknames, short names |
| `tags` | `[person]` always; add extras if relevant |
| `hosts` | omit (not host-specific) |
| `projects` | shared project IDs |
| `people` | close associates |
| `related` | linked notes |

## Review cycle

- `review_cycle_days: 60`
- `last_reviewed: YYYY-MM-DD`
- `next_review: YYYY-MM-DD`

## Template structure

```markdown
# Name

## Context

## Relationship

## Open loops

## Related
```
