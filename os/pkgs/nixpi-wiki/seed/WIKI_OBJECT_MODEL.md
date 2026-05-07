# Object Model

This wiki borrows the best ideas from object-based note-taking while staying in plain Markdown.

## The model

Each meaningful note is treated as an **object**.

An object has:
- a stable `id`
- a document `type`
- an `object_type`
- structured properties in frontmatter
- explicit relationships to other objects
- a Markdown body for narrative context

## Mapping from Capacities-style concepts

| Concept | In this wiki |
|---|---|
| Object | A Markdown note with `id`, `type`, and `object_type` |
| Object type | `object_type:` |
| Properties | YAML frontmatter fields |
| Property schema | Per-type schema files in `schemas/` |
| Object relations | Typed ID arrays such as `projects:` or `people:` |
| Labels | Per-type enums like `status`, `priority`, `validation_level` |
| Tags | `tags:` from controlled vocabulary in `meta/tags.md` |
| Backlinks | Derived from body links and registry |
| Queries | Generated indexes or dashboard notes |
| Collections | Curated dashboard / map-of-content pages |
| Dashboard | A note in `pages/home/` |

## Why this works well with llm-wiki

LLM-wiki is good at:
- creating notes from sources
- maintaining summaries
- updating relationships
- generating indexes and dashboards
- spotting orphan notes and missing links
- synthesizing across many objects

The combination is:
- **plain Markdown** for portability
- **frontmatter schema** for structure
- **LLM maintenance** for compounding value

## Two layers of classification

### 1. `type`
Describes the document role.

Examples:
- `entity`
- `concept`
- `analysis`
- `evolution`
- `journal`
- `task`
- `event`
- `reminder`

### 2. `object_type`
Describes the real-world object being modeled.

Examples:
- `person`
- `project`
- `area`
- `meeting`
- `host`
- `service`
- `dashboard`
- `source`
- `daily-note`
- `review`

## Relationship strategy

Relationships are stored as IDs in frontmatter.

Example:

```yaml
projects: [project/example-project]
people: [person/operator]
systems: [host/example-server, service/example-sync-service]
sources: [source/capacities-object-model-research]
related: [concept/object-based-knowledge-system]
```

This makes the graph:
- easy for LLMs to parse
- stable across tools
- independent of a specific editor

## Query strategy

Instead of relying on one application's query engine, this wiki uses:
- `meta/registry.json` for machine-readable indexing
- `meta/index.md` for human-readable indexing
- `pages/home/` for dashboard pages
- future scripts or LLM passes for generated views

## Collections

Collections are just curated notes.

Examples:
- a page listing important people
- a page listing active systems
- a page listing this week's focus items

## Rule for new object types

Add a new `object_type` when all three are true:

1. the pattern appears repeatedly
2. the object needs repeatable fields
3. the object benefits from typed relationships

Examples of good object types:
- `book`
- `place`
- `habit`
- `trip`
- `repository`

## Anti-patterns

- using folders as the only structure
- burying important relations only in prose
- relying on one editor's private syntax
- storing references only as filenames without stable IDs
