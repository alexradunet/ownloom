# NetBird Deep Integration Design

**Date:** 2026-03-24
**Status:** Draft
**Scope:** Cloud-hosted NetBird + Bloom OS (NixOS) + Matrix (Continuwuity)

---

## Overview

Bloom OS currently uses NetBird as a passive mesh networking layer — services are firewalled to `wt0`, and the mesh is activated via setup key during first-boot. This design makes the integration active and declarative across four dimensions:

1. **Network awareness** — NetBird events streamed into Matrix as bot messages
2. **Simpler access** — hostname-based DNS, identity-aware SSH with OIDC (no key management)
3. **Harder security** — auto-group enrollment, granular ACL policies, posture checks
4. **Resilience** — declarative cloud state convergence on every activation

Cloud-hosted NetBird is retained (no self-hosted management server). Google/GitHub OAuth is the IdP for identity-aware SSH and JWT group sync.

---

## Architecture

### Two-Layer Model

**Layer 1 — NetBird cloud state** (groups, policies, posture checks, DNS, setup keys)

A new `nixpi-netbird-provisioner` NixOS module drives a systemd oneshot service that calls the NetBird management API on activation to converge cloud state to desired state. Config is declared in NixOS options (`nixpi.netbird.*`) and applied idempotently — creates what's missing, updates what's changed, ignores what already matches.

**Layer 2 — Local NixOS config** (SSH daemon, DNS resolver, events bot)

Changes to `network.nix` and new service files configure how the Pi participates in the mesh locally.

### Peer Topology

```
[admin laptop]  ──NetBird mesh──  [Pi / bloom.local]
[phone]         ──NetBird mesh──     ├── Matrix      :6167  (TCP, admins group only)
[other device]  ──NetBird mesh──     ├── Element Web :8081  (TCP, bloom-devices group)
                                     ├── SSH         :22022 (NetBird SSH, admins group)
                                     └── RDP         :3389  (TCP, admins group)
```

No new open ports. All API calls are outbound from the Pi. Services remain gated to `wt0`.

### Data Flow — Events Bot

```
NetBird cloud API (/api/events)
    → poll every 60s (systemd timer)
    → nixpi-netbird-watcher service
    → filter by last-seen event ID (persisted to state file)
    → Continuwuity client API
    → #network-activity:<hostname> Matrix room
```

---

## NixOS Options (`nixpi.netbird.*`)

New options added to `options.nix`:

```nix
nixpi.netbird = {
  # Path to file containing NetBird management API personal access token
  apiTokenFile = mkOption { type = types.path; };

  # Base URL for NetBird API (overridable for tests)
  apiEndpoint = mkOption {
    type = types.str;
    default = "https://api.netbird.io";
  };

  # Groups to ensure exist in NetBird cloud
  groups = mkOption {
    type = types.listOf types.str;
    default = [ "bloom-devices" "admins" ];
  };

  # Setup keys with auto-group assignment
  setupKeys = mkOption {
    type = types.listOf (types.submodule {
      options = {
        name        = mkOption { type = types.str; };
        autoGroups  = mkOption { type = types.listOf types.str; };
        ephemeral   = mkOption { type = types.bool; default = false; };
        usageLimit  = mkOption { type = types.int; default = 0; }; # 0 = unlimited
      };
    });
    default = [
      { name = "bloom-device"; autoGroups = [ "bloom-devices" ]; ephemeral = false; usageLimit = 0; }
      { name = "admin-device"; autoGroups = [ "bloom-devices" "admins" ]; ephemeral = false; usageLimit = 0; }
    ];
  };

  # ACL policies
  policies = mkOption {
    type = types.listOf (types.submodule {
      options = {
        name        = mkOption { type = types.str; };
        sourceGroup = mkOption { type = types.str; };
        destGroup   = mkOption { type = types.str; };
        protocol    = mkOption { type = types.enum [ "tcp" "udp" "icmp" "all" ]; default = "tcp"; };
        ports       = mkOption { type = types.listOf types.str; default = []; };
        postureChecks = mkOption { type = types.listOf types.str; default = []; };
      };
    });
    default = [
      { name = "matrix-access";      sourceGroup = "admins";        destGroup = "All"; protocol = "tcp"; ports = [ "6167" ]; }
      { name = "element-web-access"; sourceGroup = "bloom-devices"; destGroup = "All"; protocol = "tcp"; ports = [ "8081" ]; }
      { name = "rdp-access";         sourceGroup = "admins";        destGroup = "All"; protocol = "tcp"; ports = [ "3389" ]; }
      { name = "ssh-access";         sourceGroup = "admins";        destGroup = "All"; protocol = "tcp"; ports = [ "22022" ]; }
    ];
  };

  # Posture checks
  postureChecks = mkOption {
    type = types.listOf (types.submodule {
      options = {
        name       = mkOption { type = types.str; };
        minVersion = mkOption { type = types.str; };
      };
    });
    default = [ { name = "min-client-version"; minVersion = "0.61.0"; } ];
  };

  # DNS
  dns = {
    domain = mkOption { type = types.str; default = "bloom.local"; };
    targetGroups = mkOption { type = types.listOf types.str; default = [ "bloom-devices" ]; };
  };

  # Identity-aware SSH
  ssh = {
    enable = mkOption { type = types.bool; default = true; };
    userMappings = mkOption {
      type = types.listOf (types.submodule {
        options = {
          netbirdGroup = mkOption { type = types.str; };
          localUser    = mkOption { type = types.str; };
        };
      });
      default = [ { netbirdGroup = "admins"; localUser = "alex"; } ];
    };
  };
};
```

---

## New Files

### `core/os/modules/netbird-provisioner.nix`

Systemd oneshot service that converges NetBird cloud state on every `nixos-rebuild switch` or boot.

**Behaviour:**
- Runs after `network-online.target`
- Reads API token from `cfg.netbird.apiTokenFile`
- For each resource type (groups → setup keys → posture checks → policies → DNS):
  - GET existing resources
  - Compare against desired state
  - POST/PUT only what differs
- Logs each mutation with structured fields to journald
- `Restart=on-failure`, `RestartSec=30s`, max 3 attempts
- All API calls use the overridable `cfg.netbird.apiEndpoint` (enables test mocking)

**Security:**
- Runs as `nixpi` user (no root)
- API token passed via file path, never logged
- No secrets in Nix store

### `core/os/services/nixpi-netbird-watcher.nix`

Systemd timer + oneshot service that polls NetBird events and posts to Matrix.

**Timer:** `OnBootSec=2min`, `OnUnitActiveSec=60s`

**Service behaviour:**
- GET `/api/events?limit=100` from NetBird cloud API
- Load last-seen event ID from `/var/lib/nixpi/netbird-watcher/last-event-id`
  - First run (no state file): process only the last 10 events (no flood)
- For each new event, POST message to `#network-activity:<hostname>` via Continuwuity client API
- Write new last-seen ID to state file
- If NetBird API unreachable: skip cycle silently
- If Matrix unreachable: buffer up to 50 events in memory, retry next cycle; beyond 50, log and drop
- `StateDirectory = "nixpi/netbird-watcher"`
- Runs as `nixpi` user

**Event → Message mapping:**

| NetBird event type | Matrix message |
|---|---|
| `peer.add` | `🟢 New peer joined: <name> (<IP>)` |
| `peer.delete` | `🔴 Peer removed: <name>` |
| `user.login` | `🔑 User logged in: <email>` |
| `policy.update` | `🔧 Policy updated: <name> by <user>` |
| `setup_key.used` | `🔐 Setup key used: <name> — new peer enrolled` |

---

## Changes to Existing Files

### `core/os/modules/network.nix`

- Enable NetBird SSH daemon: `services.netbird.clients.default.config.SSHAllowed = true`
- Configure systemd-resolved to forward `<cfg.netbird.dns.domain>` to NetBird's local DNS forwarder (port 22054)
- Post-setup SSH: `nixpi.bootstrap.keepSshAfterSetup` remains the guard; NetBird SSH becomes the primary access method after wizard

### `core/os/modules/collab.nix` (or `firstboot.nix`)

- During first-boot wizard: create `#network-activity:<hostname>` Matrix room and invite bot account
- Add `nixpi.netbird.apiTokenFile` as a wizard prompt (operator pastes NetBird API token)

---

## Error Handling & Resilience

### Provisioner

| Failure | Behaviour |
|---|---|
| API token missing | Fail with clear log message; other services unaffected |
| NetBird API unreachable | Retry 3× with 30s backoff; log warning; existing mesh config unchanged |
| Resource already matches desired state | No API call made (silent) |
| Partial failure (one resource fails) | Log and continue; next boot re-attempts |

### Watcher

| Failure | Behaviour |
|---|---|
| NetBird API unreachable | Skip cycle; try next tick |
| Matrix unreachable | Buffer up to 50 events; retry next cycle; drop beyond 50 |
| State file missing (first run) | Fetch last 10 events only |
| Continuwuity rejects message | Log, continue; no retry |

### SSH

Fail-closed by design. If NetBird SSH daemon or OIDC auth fails, the connection is refused. Bootstrap SSH (port 22) remains available when `nixpi.bootstrap.keepSshAfterSetup = true`.

### DNS

Fail-open. If NetBird DNS forwarder is down, systemd-resolved falls back to upstream. `bloom.local` stops resolving; internet access unaffected. Services remain reachable by NetBird IP.

---

## Testing

### New NixOS Tests

**`nixpi-netbird-provisioner` test:**
- Mock NetBird API with local HTTP server (overriding `nixpi.netbird.apiEndpoint`)
- Verify correct API calls in correct order (groups before policies, posture checks before policies)
- Verify idempotency: second activation with identical config makes zero API calls
- Verify graceful failure on 401 and 503

**`nixpi-netbird-watcher` test:**
- Mock NetBird events API and Matrix client API
- Verify correct message format per event type
- Verify `last-event-id` state file is written and read correctly
- Verify first-run behaviour (no state file → only last 10 events processed)
- Verify no Matrix calls when no new events
- Verify skip-cycle behaviour when NetBird API returns 503

### Extensions to Existing Tests

**`nixpi-e2e.nix`:**
- Verify `nixpi-netbird-provisioner.service` reaches `active (exited)`
- Verify `nixpi-netbird-watcher.timer` is active
- Verify `#network-activity` room exists in Matrix after first boot

**SSH test:**
- Verify `/etc/ssh/ssh_config.d/99-netbird.conf` is present when `nixpi.netbird.ssh.enable = true`
- OIDC flow: manual verification only (can't exercise real OIDC in NixOS VM tests)

---

## Out of Scope

- NetBird self-hosted management server
- NetBird reverse proxy / Matrix federation exposure (federation disabled by design in Bloom OS)
- Real-time event webhooks (cloud-only feature; polling is the self-hosted workaround)
- Multi-Pi routing peer configuration
