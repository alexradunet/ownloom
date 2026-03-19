# Bloom

> 📖 [Emoji Legend](docs/LEGEND.md)

Very opinionated NixOS build personally for me and my workflows and how I imagine a PC will be in the future. My goal is to leverage the current AI Agents Technology to build an AI Firsts OS designed specifically for one end user to act like a personal life assistant and knowledge management system.

It is very experimental and I am still currently developing it based on my needs and my own code engineering preferences.

I plan to keep this project as minimal as possible so the end user can evolve the OS through Pi without carrying a large default runtime surface.

## 🌱 Why Bloom Exists

BloomOS packages Pi, host integration, memory, and a small set of built-in user services into one self-hosted system.

Bloom exists to give Pi:

- a durable home directory under `~/Bloom/`
- first-class host tools for NixOS workflows
- a local repo proposal workflow for human-reviewed system changes
- a private Matrix-based messaging surface
- a minimal but inspectable operating model based on files, NixOS, and systemd

## 🚀 What Ships Today

Current platform capabilities:

- Bloom directory management and blueprint seeding for `~/Bloom/`
- persona injection, shell guardrails, durable-memory digest injection, and compaction context persistence
- local-only Nix proposal support for checking the seeded repo clone, refreshing `flake.lock`, and validating config before review
- host OS management tools for NixOS updates, local/remote switch, systemd, health, and reboot scheduling
- built-in user services for Bloom Home, Bloom Web Chat, Bloom Files, and code-server
- markdown-native durable memory in `~/Bloom/Objects/`
- append-only episodic memory in `~/Bloom/Episodes/`
- a unified Matrix room daemon with synthesized host-agent fallback and optional multi-agent overlays
- proactive daemon jobs for heartbeat and simple cron-style scheduled turns
- a first-boot flow split between a bash wizard and a Pi-guided persona step

## 🧭 Start Here

Choose the entry point that matches your job:

- Maintainers: [ARCHITECTURE.md](ARCHITECTURE.md), [AGENTS.md](AGENTS.md), and [docs/README.md](docs/README.md)
- Operators: [docs/pibloom-setup.md](docs/pibloom-setup.md), [docs/quick_deploy.md](docs/quick_deploy.md), and [docs/live-testing-checklist.md](docs/live-testing-checklist.md)
- Built-in service behavior: [docs/service-architecture.md](docs/service-architecture.md)

## 💻 Default Install

Installed by default:

- `sshd.service`
- `netbird.service`
- `bloom-matrix.service`
- `pi-daemon.service` after setup once AI auth and defaults are ready
- `bloom-home.service`
- `bloom-fluffychat.service`
- `bloom-dufs.service`
- `bloom-code-server.service`

## 🌿 Repository Layout

| Path | Purpose |
|------|---------|
| `core/` | Bloom core: OS image, daemon, persona, skills, built-in extensions, and shared runtime code |
| `core/pi-extensions/` | Pi-facing Bloom extensions shipped in the default runtime |
| `tests/` | unit, integration, daemon, and extension tests |
| `docs/` | live project documentation |

## 🧩 Capability Model

Bloom extends Pi through two active runtime layers:

| Layer | What it is | Typical use |
|------|-------------|-------------|
| 📜 Skill | markdown instructions in `SKILL.md` | procedures, guidance, checklists |
| 🧩 Extension | in-process TypeScript | Pi-facing tools, hooks, commands |

Built-in service surface is part of the base NixOS system:

- `Bloom Home` on `:8080`
- `Bloom Web Chat` on `:8081`
- `Bloom Files` on `:5000`
- `code-server` on `:8443`

## 📚 Documentation Map

| Topic | Why | How | Reference |
|------|-----|-----|-----------|
| Docs hub | [docs/README.md](docs/README.md) | [docs/README.md](docs/README.md) | [docs/README.md](docs/README.md) |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | [ARCHITECTURE.md](ARCHITECTURE.md) | [AGENTS.md](AGENTS.md) |
| Daemon | [docs/daemon-architecture.md](docs/daemon-architecture.md) | [docs/daemon-architecture.md](docs/daemon-architecture.md) | [AGENTS.md](AGENTS.md) |
| Built-in services | [docs/service-architecture.md](docs/service-architecture.md) | [docs/service-architecture.md](docs/service-architecture.md) | [AGENTS.md](AGENTS.md) |
| Setup / deploy | [docs/pibloom-setup.md](docs/pibloom-setup.md) | [docs/quick_deploy.md](docs/quick_deploy.md) | [docs/live-testing-checklist.md](docs/live-testing-checklist.md) |
| Memory | [docs/memory-model.md](docs/memory-model.md) | [docs/memory-model.md](docs/memory-model.md) | [AGENTS.md](AGENTS.md) |
| Contribution workflow | [docs/fleet-pr-workflow.md](docs/fleet-pr-workflow.md) | [docs/fleet-pr-workflow.md](docs/fleet-pr-workflow.md) | [AGENTS.md](AGENTS.md) |

## 🔗 Related

- [docs/README.md](docs/README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [AGENTS.md](AGENTS.md)
