---
name: object-store
description: Create, read, update, search, and link objects in the Bloom flat-file memory store
---

# Object Store Skill

Use this skill when the user wants to create, read, update, search, or link any type of object in Bloom's memory.

## Object Model

Every object is a Markdown file with YAML frontmatter stored at:
```
~/.bloom/objects/{type}/{slug}.md
```

### Core frontmatter fields

- `type`: object type (e.g. `task`, `journal`, `note`)
- `slug`: kebab-case unique identifier within the type
- `title`: human-readable name
- `created`: ISO timestamp (set automatically)
- `modified`: ISO timestamp (updated automatically)
- `tags`: comma-separated labels
- `links`: references to related objects in `type/slug` format

### Object types

| Type | Purpose |
|------|---------|
| `journal` | Daily entries, reflections, logs |
| `task` | Actionable items with status and priority |
| `note` | Reference notes, permanent records |
| *(custom)* | Any type the user or agent defines |

## PARA Methodology

Organize objects using PARA:

- `project`: active project (e.g. `home-renovation`)
- `area`: ongoing responsibility (e.g. `household`, `career`, `health`)
- Tags for cross-cutting concerns

## Available Tools

Use the registered bloom-memory tools:

- `memory_create` — Create a new object with type, slug, and fields
- `memory_read` — Read an object by type and slug
- `memory_list` — List objects, optionally filtered by type and fields
- `memory_search` — Search objects by content pattern
- `memory_link` — Create bidirectional links between objects

## When to Use Each Tool

| Situation | Tool |
|-----------|------|
| User mentions something new to track | `memory_create` |
| User asks about a specific item | `memory_read` |
| User wants to see items of a type | `memory_list` |
| User remembers content but not the name | `memory_search` |
| Two objects are related | `memory_link` |

## Behavior Guidelines

- Always set `title` when creating objects.
- Suggest PARA fields (`project`, `area`) when the user hasn't provided them.
- Prefer update over create when an object already exists.
- After search, offer to read matched objects.
- Use link proactively when connections are mentioned.
