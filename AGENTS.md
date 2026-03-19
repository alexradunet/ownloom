# AGENTS.md

> 📖 [Emoji Legend](docs/LEGEND.md)

This file is the Bloom reference index for current tools, hooks, runtime paths, and packaged capabilities.

## 🌱 Current Model

Bloom extends Pi through two runtime mechanisms, with built-in user services supplied directly by the base NixOS system.

| Layer | What | Current use |
|------|------|-------------|
| 📜 Skill | bundled or user-created `SKILL.md` files | guidance, procedures, local workflows |
| 🧩 Extension | in-process TypeScript | tools, hooks, commands, stateful host integration |

Built-in service surface:

- `Bloom Home` on `:8080`
- `Bloom Web Chat` on `:8081`
- `Bloom Files` on `:5000`
- `code-server` on `:8443`

OS-level infrastructure:

- `bloom-matrix.service`
- `netbird.service`
- `pi-daemon.service`

## 🌿 Bloom Directory

Default Bloom home is `~/Bloom/` unless `BLOOM_DIR` is set.

| Path | Purpose |
|------|---------|
| `~/Bloom/Persona/` | active persona files |
| `~/Bloom/Skills/` | installed and seeded skills |
| `~/Bloom/Evolutions/` | proposed persona / system evolutions |
| `~/Bloom/Objects/` | flat-file object store |
| `~/Bloom/Episodes/` | append-only episodic memory |
| `~/Bloom/Agents/` | multi-agent overlays (`AGENTS.md`) |
| `~/Bloom/guardrails.yaml` | command-block policy override |
| `~/Bloom/blueprint-versions.json` | blueprint seeding state |

Related state outside `~/Bloom/`:

| Path | Purpose |
|------|---------|
| `~/.pi/` | Pi runtime state |
| `~/.pi/bloom-context.json` | compacted Bloom context |
| `~/.pi/matrix-credentials.json` | primary Matrix credentials |
| `~/.pi/matrix-agents/` | per-agent Matrix credentials |
| `~/.pi/agent/sessions/bloom-rooms/` | daemon session directories |
| `~/.bloom/pi-bloom/` | local repo clone used for human-reviewed proposal work |
| `~/.config/bloom/` | generated runtime config for built-in services |

## 🧩 Extensions

### `bloom-persona`

Purpose:

- seed Bloom identity into Pi
- enforce shell guardrails
- inject a compact durable-memory digest at session start
- persist compacted context

Hooks:

- `session_start`
- `before_agent_start`
- `tool_call`
- `session_before_compact`

### `bloom-localai`

Purpose:

- register LocalAI as a Pi provider for local LLM inference

### `bloom-os`

Purpose:

- host OS management for NixOS, local proposal validation, systemd, and updates

Tools:

- `nixos_update`
- `nix_config_proposal`
- `systemd_control`
- `system_health`
- `update_status`
- `schedule_reboot`

### `bloom-episodes`

Tools:

- `episode_create`
- `episode_list`
- `episode_promote`
- `episode_consolidate`

### `bloom-objects`

Tools:

- `memory_create`
- `memory_update`
- `memory_upsert`
- `memory_read`
- `memory_query`
- `memory_search`
- `memory_link`
- `memory_list`

### `bloom-garden`

Tools:

- `garden_status`

Hooks / commands:

- `session_start`
- `resources_discover`
- `/bloom` with `init`, `status`, `update-blueprints`

### `bloom-setup`

Tools:

- `setup_status`
- `setup_advance`
- `setup_reset`

## 📜 Bundled Skills

Bundled skill directories seeded into `~/Bloom/Skills/`:

- `builtin-services`
- `first-boot`
- `local-llm`
- `object-store`
- `os-operations`
- `recovery`
- `self-evolution`

## 📦 Built-In Services

Current built-in user-facing services:

| Unit | Purpose |
|------|---------|
| `bloom-home` | landing page with service links |
| `bloom-fluffychat` | web Matrix client |
| `bloom-dufs` | WebDAV and file browser for `~/Public/Bloom` |
| `bloom-code-server` | browser IDE |

## 📡 Daemon

`pi-daemon.service` is the always-on Matrix daemon.

Current behavior:

- always runs through one supervisor/runtime path
- synthesizes a default host agent from the primary Pi account if no valid agent overlays exist
- skips malformed agent overlays with warnings instead of aborting startup
- keeps one room session per `(room, agent)` pair
- schedules optional proactive agent jobs declared in agent frontmatter
- prunes duplicate-event and reply-budget state over time so long-lived sessions stay bounded

## 🛡️ Safety And Trust

- shell command guardrails are loaded from `~/Bloom/guardrails.yaml` if present, else from the packaged default
- local proposal workflow is documented in [docs/fleet-pr-workflow.md](docs/fleet-pr-workflow.md)
- the built-in web services should be treated as part of the base host surface, not as optional packages

## 🔗 Related Docs

- [README.md](README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/README.md](docs/README.md)
- [docs/daemon-architecture.md](docs/daemon-architecture.md)
- [docs/memory-model.md](docs/memory-model.md)
- [docs/service-architecture.md](docs/service-architecture.md)
- [docs/quick_deploy.md](docs/quick_deploy.md)
- [docs/pibloom-setup.md](docs/pibloom-setup.md)
- [docs/fleet-pr-workflow.md](docs/fleet-pr-workflow.md)
