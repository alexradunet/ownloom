# Schema: daily-note

object_type: daily-note
type: journal
home: pages/journal/daily/

## Required fields

| field | value |
|---|---|
| `id` | `journal/YYYY-MM-DD` |
| `schema_version` | `1` |
| `type` | `journal` |
| `object_type` | `daily-note` |
| `title` | `YYYY-MM-DD` |
| `domain` | `personal` |
| `areas` | `[journal]` |
| `status` | `active` |
| `validation_level` | `seed` (always for daily notes) |
| `summary` | `Daily log for YYYY-MM-DD.` |

## No review cycle for daily notes

## Template structure

```markdown
# YYYY-MM-DD

## Focus

## Calendar

## Log

## Wins

## Friction / lessons

## Tomorrow

## Follow-ups
```
