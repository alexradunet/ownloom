# Ownloom rebrand plan

This repository is being rebranded from **NixPI** to **Ownloom**.

Current branch: `rebrand-ownloom`.

## Scope decisions

- Project/user-facing brand changes from `NixPI` to `Ownloom`.
- Program/package/service/env names change from `nixpi-*` / `NIXPI_*` to `ownloom-*` / `OWNLOOM_*`.
- Keep the live host identity `nixpi-vps` during the first migration. Rename to `ownloom-vps` only in a later dedicated host migration.
- Keep temporary compatibility wrappers/aliases for old `nixpi-*` CLI names until the rebrand is fully deployed and agent context is updated.
- Preserve existing runtime data. Do not blindly move `/var/lib/nixpi-*` state without explicit fallback/migration.

## Case-aware rename map

| Old | New |
| --- | --- |
| `NixPI` | `Ownloom` |
| `nixpi` | `ownloom` |
| `NIXPI` | `OWNLOOM` |
| `nixpi-wiki` | `ownloom-wiki` |
| `nixpi-context` | `ownloom-context` |
| `nixpi-gateway` | `ownloom-gateway` |
| `nixpi-planner` | `ownloom-planner` |
| `nixpi-config` skill | `ownloom-config` skill |
| `nixpi-audit` skill | `ownloom-audit` skill |
| `nixpi-svc` skill | `ownloom-svc` skill |
| `nixpi-reboot` skill | `ownloom-reboot` skill |
| `nixpi-evolution` skill | `ownloom-evolution` skill |

## Initial inventory

Command:

```sh
rg -l --ignore-case 'nixpi|NixPI|NIXPI' . \
  --glob '!flake.lock' \
  --glob '!.git/**' \
  --glob '!result*'
```

Main affected areas:

- `README.md`, `docs/`
- `flake.nix`
- `hosts/alex.nix`
- `hosts/nixpi-vps/**`
- `os/modules/**`
- `os/pkgs/context/**`
- `os/pkgs/gateway/**`
- `os/pkgs/pi-adapter/**`
- `os/pkgs/planner/**`
- `os/pkgs/wiki/**`
- `os/skills/nixpi-*/*`

## Phase 0 — inventory and safety baseline

- [x] Create migration branch: `rebrand-ownloom`.
- [x] Inventory current references.
- [x] Run current baseline checks before functional edits:

```sh
nix flake check --accept-flake-config
```

## Phase 1 — docs and branding only

Low-risk textual changes that do not rename Nix attributes, CLIs, services, option paths, env vars, or host names.

Targets:

- [x] `README.md`
- [x] `docs/agent-contract.md`
- [x] package READMEs under `os/pkgs/**/README.md` for touched packages
- [x] comments/descriptions that are not part of command/service/option names

Validation:

```sh
nix flake check --accept-flake-config
```

## Phase 2 — flake/package attribute migration

Add Ownloom package/app names while keeping old aliases.

Target end state:

- [x] `ownloom-wiki` package/app exists.
- [x] `ownloom-context` package/app exists.
- [x] `ownloom-gateway` package exists.
- [x] `ownloom-planner` package/app exists.
- [x] Old `nixpi-*` package/app attributes remain as aliases for one transition period.

Likely file:

- `os/modules/packages/flake-module.nix` — done for package/app attributes.
- `os/pkgs/*/default.nix` — derivation `pname` moves to `ownloom-*` in Phase 3 while keeping old command wrappers.

Validation:

```sh
nix build .#ownloom-wiki
nix build .#ownloom-context
nix build .#ownloom-gateway
nix build .#ownloom-planner
nix build .#nixpi-wiki
nix build .#nixpi-context
nix build .#nixpi-gateway
nix build .#nixpi-planner
nix flake check --accept-flake-config
```

## Phase 3 — CLI binary migration

Add new binary names inside package outputs while keeping old wrapper commands.

Target end state:

- [x] `ownloom-context` works; `nixpi-context` remains a wrapper.
- [x] `ownloom-wiki` works; `nixpi-wiki` remains a wrapper.
- [x] `ownloom-planner` works; `nixpi-planner` remains a wrapper.
- [x] `ownloom-gateway` works if exposed as a binary; old names remain compatible.

Compatibility rule:

- New services and docs should call `ownloom-*`.
- Old `nixpi-*` commands may stay temporarily for agent prompts, scripts, and operator muscle memory.

Validation:

```sh
nix run .#ownloom-context -- --format markdown --health
nix run .#ownloom-planner -- list --view upcoming
nix run .#nixpi-context -- --format markdown --health
nix run .#nixpi-planner -- list --view upcoming
```

## Phase 4 — TypeScript/source names

Rename internal source identifiers, config names, docs, package metadata, and tests.

Targets:

- [x] `os/pkgs/gateway/**`
- [x] `os/pkgs/planner/**`
- [x] `os/pkgs/wiki/**`
- [x] `os/pkgs/pi-adapter/**`

Compatibility rules:

- Read `OWNLOOM_*` env vars first — implemented for planner/wiki/context/gateway touched envs.
- Fall back to `NIXPI_*` env vars during transition — implemented for touched envs.
- Avoid destructive runtime state moves — no state moves done.

Validation:

```sh
nix flake check --accept-flake-config
```

## Phase 5 — NixOS option/module migration

Move from NixPI option namespaces to Ownloom namespaces while preserving deprecation aliases where feasible.

Target examples:

- [x] `config.nixpi.*` → `config.ownloom.*`
- [x] `services.nixpi-gateway` → `services.ownloom-gateway`
- [x] `services.nixpi-planner` → `services.ownloom-planner`

Use `lib.mkRenamedOptionModule` when practical.

Targets:

- [x] `os/modules/features/nixos/**`
- [x] `hosts/alex.nix`
- [x] `hosts/nixpi-vps/default.nix`
- [x] check/eval modules under `os/modules/checks/**`

Validation:

```sh
nix flake check --accept-flake-config
nix build .#nixosConfigurations.nixpi-vps.config.system.build.toplevel --accept-flake-config
```

Do not apply without explicit confirmation.

## Phase 6 — systemd units and runtime env

Rename generated services/timers and emitted environment variables.

Target examples:

- [x] `nixpi-planner-server.service` → `ownloom-planner-server.service`
- [x] `nixpi-gateway.service` → `ownloom-gateway.service`
- [x] `NIXPI_PLANNER_*` → `OWNLOOM_PLANNER_*` with old aliases still emitted for transition
- [x] `NIXPI_GATEWAY_*` → `OWNLOOM_GATEWAY_*` where applicable

Compatibility rules:

- Runtime scripts should accept old `NIXPI_*` during transition.
- Services should emit new `OWNLOOM_*`.
- After apply, check and clean old units intentionally.

Post-apply checks:

```sh
systemctl --failed
systemctl list-units '*ownloom*'
systemctl list-units '*nixpi*'
```

## Phase 7 — skill rename

Rename skill directories and content.

Target examples:

- `os/skills/nixpi-config` → `os/skills/ownloom-config`
- `os/skills/nixpi-audit` → `os/skills/ownloom-audit`
- `os/skills/nixpi-svc` → `os/skills/ownloom-svc`

Compatibility decision:

- If Pi skill discovery depends directly on directory names, keep old skill directories briefly as stub migration docs or aliases if supported.

Validation:

- Start Pi and confirm skill discovery does not regress.
- Run config validation through the new skill instructions.

## Phase 8 — repo path and operator context

After code and deployed services work:

- [ ] Optionally rename checkout path `/home/alex/NixPI` → `/home/alex/Ownloom` or `/home/alex/ownloom`.
- [ ] Update agent memory and wiki pages from NixPI to Ownloom.
- [ ] Update future prompt/context output to say Ownloom.
- [ ] Keep historical notes as-is unless they affect current operations.

## Phase 9 — optional host rename, separate migration

Deferred. Rename `nixpi-vps` only after Ownloom packages/services/options are stable.

Potential target:

- `nixpi-vps` → `ownloom-vps`

Touch points:

- `flake.nixosConfigurations`
- `hosts/nixpi-vps/` directory
- `networking.hostName`
- SSH config and known hosts
- sops paths/context
- host-scoped wiki context
- deployment docs

Validation:

```sh
nix build .#nixosConfigurations.ownloom-vps.config.system.build.toplevel --accept-flake-config
```

## Global validation checklist

Before each commit:

```sh
git diff --check
nix flake check --accept-flake-config
```

Before any live apply:

```sh
nix build .#nixosConfigurations.nixpi-vps.config.system.build.toplevel --accept-flake-config
```

Then ask Alex for explicit confirmation before switching the system.

## Suggested commit sequence

1. `docs: add Ownloom rebrand plan`
2. `docs: rebrand user-facing NixPI text to Ownloom`
3. `nix: add ownloom package and app aliases`
4. `cli: expose ownloom command names with nixpi compatibility wrappers`
5. `gateway: migrate branding and env names to Ownloom`
6. `planner: migrate branding and env names to Ownloom`
7. `nixos: add Ownloom service and option names`
8. `skills: rename NixPI skills to Ownloom`
9. `docs: update operational workflow for Ownloom`
10. Optional later: `hosts: rename nixpi-vps to ownloom-vps`
