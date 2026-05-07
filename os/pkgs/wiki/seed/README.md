# Generic Ownloom Wiki Seed

This seed contains the harness-neutral plain-Markdown wiki schema, rules, object model, templates, and object schemas.

Use this when bootstrapping a standalone wiki workspace. It intentionally excludes deployment-specific host pages, client prompt-layer pages, local sources, and personal planner data.

Recommended bootstrap shape:

```text
wiki-root/
  WIKI_SCHEMA.md
  WIKI_RULES.md
  WIKI_OBJECT_MODEL.md
  WIKI_CANONICAL_STRUCTURE.md
  templates/
  schemas/
  pages/
  meta/
```

After copying the seed into a new root, run:

```bash
OWNLOOM_WIKI_ROOT=/path/to/wiki ownloom-wiki mutate wiki_rebuild '{"domain":"work"}'
```
