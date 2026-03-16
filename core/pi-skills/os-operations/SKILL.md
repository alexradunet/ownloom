---
name: os-operations
description: Inspect, manage, and remediate the Bloom OS system — NixOS updates, services, containers, and timers
---

# OS Operations Skill

Use this skill when the user asks about Bloom OS health/state, or when an error suggests infrastructure inspection.

## Bloom OS Architecture

Bloom runs on **NixOS** (declarative, flake-based):

- `/run/current-system` — immutable OS content, updated via `nixos-rebuild switch`
- `/etc` — generated host configuration
- `/var` — persistent runtime/user state

Bloom services are **systemd units** managed by `systemd` (system) and `systemd --user` (Pi agent):

- System units: `/etc/systemd/system/`
- Typical control path: `systemctl ...` / `systemctl --user ...`

## Use Tools First (preferred)

Prefer Bloom extension tools over raw shell commands:

- `system_health` — broad health snapshot
- `nixos_update(action)` — status, apply, rollback for NixOS generation
- `container(action)` — status, logs, deploy for bloom-* containers
- `systemd_control` — start/stop/restart/status for Bloom user services
- `manifest_show` / `manifest_sync` / `manifest_set_service` / `manifest_apply` — declarative service state management

## Standard Triage Flow

1. Run `system_health`
2. If OS issue suspected: run `nixos_update(action="status")`
3. If service issue suspected:
   - `container(action="status")`
   - `systemd_control action=status`
   - `container(action="logs")`
4. Apply minimal remediation (restart, redeploy, staged update) only with user approval
5. Re-run `system_health` to confirm recovery

## Health Signals

### Healthy
- `bloom-*` services active/running
- Containers running and not unhealthy
- `nixos_update(action="status")` shows current generation is booted

### Unhealthy
- service failed / inactive unexpectedly
- container exited / unhealthy / restart loop
- update staged but reboot not yet applied

## Safety Rules

- Mutation operations require explicit user confirmation
- Only manage `bloom-*` services/containers
- Prefer user-scope service management (`systemctl --user`)
- Re-check health after every mutation
