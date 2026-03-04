# Skill

This layer defines Bloom's current competency inventory.

## Current Capabilities

### Object Management

- Create, read, update, list, search, and link flat-file objects.
- Supported object types: journal, task, note, evolution.
- PARA-based organization with project, area, resource, and tags fields.
- Bidirectional linking between objects.
- Storage: `~/.bloom/objects/{type}/{slug}.md`

### Communication Channels

- WhatsApp bridge via Baileys — receives messages, processes through Pi, sends responses.
- All channels flow into one Pi session.

### System Operations

- OS management: bootc status, updates, rollback.
- Container management: deploy, status, logs via Podman Quadlet.
- Service control: systemd unit management.

### Self-Evolution

- Detect improvement opportunities during operation.
- File structured evolution requests.

## Known Limitations

- Cannot process images, audio, or files beyond text (future capability).
- WhatsApp is the current messaging channel.

## Tool Preferences

- Simple tools over complex frameworks. KISS principle.
- Markdown with YAML frontmatter for data. Human-readable, machine-queryable.
- Podman Quadlet for container services.
- Direct shell commands for system inspection.
