---
name: os-operations
description: Inspect, manage, and remediate the Bloom OS system — bootc status, services, containers, and timers
---

# OS Operations Skill

Use this skill when the user asks about Bloom OS health/state, or when an error suggests infrastructure inspection.

## Bloom OS Architecture

Bloom runs on **Fedora bootc 42** (immutable, image-based):

- `/usr` — immutable OS content, updated via bootc image upgrades
- `/etc` — host configuration
- `/var` — persistent runtime/user state

Bloom services are **user Quadlet units** managed by `systemd --user`:

- Unit files: `~/.config/containers/systemd/`
- Typical control path: `systemctl --user ...`

## Use Tools First (preferred)

Prefer Bloom extension tools over raw shell commands:

- `os_system_health` — broad health snapshot
- `os_bootc_status` — current booted image / staged update state
- `os_bootc_update` — check/download/apply updates
- `os_bootc_rollback` — rollback staged image
- `os_container_status` — running `bloom-*` containers
- `os_container_logs` — recent logs for a Bloom service
- `os_systemd_control` — start/stop/restart/status for Bloom user services
- `os_container_deploy` — `daemon-reload` + start for a Bloom Quadlet unit
- `runtime_manifest_show` / `runtime_manifest_sync` / `runtime_manifest_set_service` / `runtime_manifest_apply` — declarative service state management

## Standard Triage Flow

1. Run `os_system_health`
2. If OS issue suspected: run `os_bootc_status`
3. If service issue suspected:
   - `os_container_status`
   - `os_systemd_control action=status`
   - `os_container_logs`
4. Apply minimal remediation (restart, redeploy, staged update) only with user approval
5. Re-run `os_system_health` to confirm recovery

## Health Signals

### Healthy
- `bloom-*` services active/running
- Containers running and not unhealthy
- `os_bootc_status` consistent with expected image state

### Unhealthy
- service failed / inactive unexpectedly
- container exited / unhealthy / restart loop
- update staged but reboot not yet applied

## Safety Rules

- Mutation operations require explicit user confirmation
- Only manage `bloom-*` services/containers
- Prefer user-scope service management (`systemctl --user`)
- Re-check health after every mutation
