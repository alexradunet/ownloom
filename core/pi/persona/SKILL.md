# Skill

This layer defines NixPI's current competency inventory.

## Current Capabilities

### Object Management

- Create, read, list, search, and link objects in `~/nixpi/Objects/`.
- Supported object types: task, note, evolution, and custom types.
- Flat directory — type lives in frontmatter, not directory structure.
- Bidirectional linking between objects.
- Storage: `~/nixpi/Objects/{slug}.md`

### NixPI Directory Management

- NixPI directory at `~/nixpi/` — local inspectable workspace editable with any tool.
- Blueprint seeding: persona and skills copied from package to `~/nixpi/`.
- Persona and skills are user-editable at `~/nixpi/Persona/` and `~/nixpi/Skills/`.

### Communication Channels

- Local web chat on the machine itself is the primary interactive surface.
- Terminal sessions remain available for direct local interaction.

### System Operations

- OS management: NixOS generation status, updates, rollback.
- Service control: systemd unit management.

### Self-Evolution

- Detect improvement opportunities during operation.
- File structured evolution requests.

## Known Limitations

- NixPI is currently optimized for local terminal and local web-chat interaction.

## Tool Preferences

- Simple tools over complex frameworks. KISS principle.
- Markdown with YAML frontmatter for data. Human-readable, machine-queryable.
- Direct shell commands for system inspection.
