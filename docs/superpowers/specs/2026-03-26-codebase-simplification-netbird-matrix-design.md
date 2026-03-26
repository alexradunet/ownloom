# Codebase Simplification: NetBird and Matrix

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Remove NetBird cloud provisioning layer; replace self-hosted Continuwuity with external matrix.org homeserver

---

## Overview

Two independent simplifications applied together:

1. **NetBird**: drop the cloud provisioning layer (API provisioner + events watcher). Keep only the NetBird daemon and `wt0` firewall rules. Users manage NetBird groups, policies, and ACLs directly in the NetBird dashboard.

2. **Matrix**: remove the self-hosted Continuwuity homeserver from the OS image. The Pi bot account lives on matrix.org. Credentials are collected during the first-boot wizard. Element Web is reconfigured to point to matrix.org.

---

## NetBird Changes

### What is removed

| File | Reason |
|---|---|
| `core/os/modules/netbird-provisioner.nix` | Cloud API provisioner — not needed |
| `core/os/modules/nixpi-netbird-watcher.nix` | Events-to-Matrix watcher — not needed |
| `tests/nixos/nixpi-netbird-provisioner.nix` | Test for removed module |
| `tests/nixos/nixpi-netbird-watcher.nix` | Test for removed module |
| `docs/superpowers/specs/2026-03-24-netbird-integration-design.md` | Spec for removed feature |
| `docs/superpowers/plans/2026-03-24-netbird-integration.md` | Plan for removed feature |

### What is simplified

**`core/os/modules/collab.nix`**
Remove imports of `./netbird-provisioner.nix` and `./nixpi-netbird-watcher.nix`.

**`core/os/modules/options.nix`**
Strip `nixpi.netbird` down to one option:
```nix
nixpi.netbird.ssh.enable  # controls SSHAllowed on the local NetBird daemon
```
Remove: `apiTokenFile`, `apiEndpoint`, `groups`, `setupKeys`, `policies`, `postureChecks`, `dns.*`, `ssh.userMappings`.

**`core/os/modules/network.nix`**
- Remove `netbirdDnsProxy` script, its systemd service, and its `systemPackages` entry.
- Remove `socat` dependency.
- Remove both `services.resolved` config blocks (were gated on `apiTokenFile != null`).
- The `nixpi.netbird.ssh.enable` block (`SSHAllowed = true`) and `exposedPorts` reference to port `22022` remain.

**`core/scripts/wizard-matrix.sh`**
- Remove `run_netbird_cloud_setup` function.
- Remove the call to `run_netbird_cloud_setup` inside `step_netbird`.

### What stays

- `services.netbird.enable = true`
- `services.netbird.clients.default.config.DisableAutoConnect = lib.mkForce true`
- `wt0` firewall rules (`networking.firewall.interfaces`)
- `nixpi.netbird.ssh.enable` option and the corresponding `SSHAllowed` config
- Wizard connection step (setup key / OAuth / skip)

---

## Matrix Changes

### What is removed

| File | Reason |
|---|---|
| `core/os/modules/matrix.nix` | Continuwuity NixOS service module |
| `tests/nixos/nixpi-matrix.nix` | Test for removed module |
| `tests/nixos/nixpi-matrix-bridge.nix` | Test for removed module |
| `tests/nixos/nixpi-matrix-reply.nix` | Test for removed module |

### What is simplified

**`core/os/modules/collab.nix`**
Remove `./matrix.nix` import.

**`core/os/modules/options.nix`**
- Remove entire `nixpi.matrix` block: `bindAddress`, `port`, `clientBaseUrl`, `enableRegistration`, `keepRegistrationAfterSetup`, `maxUploadSize`, `registrationSharedSecretFile` — all local-server concerns.
- Remove `continuwuity.service` from `nixpi.agent.allowedUnits` default list.

**`core/os/services/nixpi-element-web.nix`**
Update runtime config generation to point Element Web at `https://matrix.org` instead of the local homeserver URL.

**`core/scripts/wizard-matrix.sh`**
Replace the local Matrix setup step (start server, register bot, register user, create DM) with:
1. Prompt user to paste their pre-registered bot account's matrix.org access token and user ID (e.g. `@mypi:matrix.org`).
2. Write to the existing credentials file format at `~/.pi/matrix-credentials.json`:
   ```json
   {
     "homeserver": "https://matrix.org",
     "botUserId": "@mypi:matrix.org",
     "botAccessToken": "<token>"
   }
   ```
3. Print instruction: "DM `@mypi:matrix.org` from any Matrix client to talk to Pi."

No local server startup, no registration token generation, no auto-account creation.

**`docs/matrix-infrastructure.md`**
Update to describe the external homeserver flow.

### What stays unchanged

- `core/lib/matrix.ts` — already reads `homeserver` from the credentials file; no logic changes needed.
- `core/daemon/runtime/matrix-js-sdk-bridge.ts` — connects to whatever homeserver is in credentials; no changes needed.
- `core/lib/matrix-format.ts` — message formatting; no changes needed.
- Element Web service itself (`core/os/services/nixpi-element-web.nix`) — only its runtime config changes.

---

## Dependency Notes

- `pkgs.openssl` was added to `environment.systemPackages` in `matrix.nix` solely for bootstrap. Removing that module removes the dependency.
- `socat` was used only by `netbirdDnsProxy` in `network.nix`. Removing the proxy removes the dependency.
- The `continuwuity.service` systemd unit reference in `nixpi.agent.allowedUnits` must be removed from `options.nix` defaults.

---

## Testing Impact

Four NixOS tests are deleted. No new tests are needed — the remaining behavior (NetBird daemon running, Element Web serving, daemon connecting to matrix.org credentials) is covered by the existing e2e and integration test suite, which does not depend on the provisioner, watcher, or local Matrix server.

---

## Out of Scope

- Switching to a different external Matrix homeserver (e.g. self-hosted Synapse) — the credentials file already supports any homeserver URL; this is a wizard-time choice, not a code change.
- NetBird self-hosted management server.
- Any changes to the agent/daemon conversation logic.
