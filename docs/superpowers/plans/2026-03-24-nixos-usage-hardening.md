# NixOS Usage Hardening & Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lib.optionalAttrs (options ? systemd)` portability guards to all five `_class = "service"` module files and simplify a type alias in `options.nix`.

**Architecture:** Pure refactor — no behaviour changes. Each service file gets `options` added to its module argument list and its `systemd.service` block moved outside the base `config` attrset into a `lib.optionalAttrs (options ? systemd)` merge. `options.nix` swaps one `pathWith` expression for the named alias `lib.types.externalPath`.

**Tech Stack:** Nix, NixOS module system (`lib.evalModules`), `system.services` portable service layer (NixOS 25.11)

---

## File Map

| File | Change |
|---|---|
| `core/os/modules/options.nix` | Swap `pathWith { absolute = true; inStore = false; }` → `lib.types.externalPath` |
| `core/os/services/nixpi-broker.nix` | Add `options` arg; move `systemd.service` into `optionalAttrs` guard |
| `core/os/services/nixpi-daemon.nix` | Add `options` arg (inner fn); move `systemd.service` into `optionalAttrs` guard |
| `core/os/services/nixpi-home.nix` | Add `options` arg (inner fn); move `systemd.service` into `optionalAttrs` guard; keep `configData` in base |
| `core/os/services/nixpi-element-web.nix` | Add `options` arg (inner fn); move `systemd.service` into `optionalAttrs` guard; keep `configData` in base |
| `core/os/services/nixpi-update.nix` | Add `options` arg; move `systemd.service` into `optionalAttrs` guard |

---

### Task 1: Simplify `lib.types.externalPath` alias in `options.nix`

**Files:**
- Modify: `core/os/modules/options.nix`

- [ ] **Step 1: Make the edit**

In `core/os/modules/options.nix`, find the `let` block at the top. Replace:

```nix
  externalAbsolutePath = lib.types.pathWith {
    absolute = true;
    inStore = false;
  };
```

with:

```nix
  # Absolute path that must not be a Nix store path (user-managed external state).
  externalAbsolutePath = lib.types.externalPath;
```

Leave `absolutePath = lib.types.pathWith { absolute = true; };` unchanged — no named alias exists for it.

- [ ] **Step 2: Verify evaluation**

```bash
nix flake check .#config 2>&1 | tail -5
```

Expected: exits 0 (or the same build output as before — the `config` check builds the full NixOS closure).

- [ ] **Step 3: Commit**

```bash
git add core/os/modules/options.nix
git commit -m "refactor(options): use lib.types.externalPath alias"
```

---

### Task 2: Portability guard — `nixpi-broker.nix`

**Files:**
- Modify: `core/os/services/nixpi-broker.nix`

- [ ] **Step 1: Add `options` to the module argument list**

`nixpi-broker.nix` is a plain module (no outer curry). Change the top-level function signature from:

```nix
{ config, lib, ... }:
```

to:

```nix
{ config, lib, options, ... }:
```

- [ ] **Step 2: Apply the portability guard**

Find the `config = { ... };` block. It currently reads:

```nix
  config = {
    process.argv = [
      config.nixpi-broker.command
      "server"
    ];

    systemd.service = {
      description = "NixPI privileged operations broker";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        User = "root";
        Group = "root";
        RuntimeDirectory = "nixpi-broker";
        RuntimeDirectoryMode = "0770";
        UMask = "0007";
        Environment = [ "NIXPI_BROKER_CONFIG=${config.nixpi-broker.brokerConfig}" ];
      };
    };
  };
```

Replace it with:

```nix
  config = {
    process.argv = [
      config.nixpi-broker.command
      "server"
    ];
    # `system.services` portability: guard systemd-specific config so this module
    # can be consumed by non-systemd init systems if NixOS ever supports them.
    # See nixpkgs nixos/README-modular-services.md.
  } // lib.optionalAttrs (options ? systemd) {
    systemd.service = {
      description = "NixPI privileged operations broker";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        User = "root";
        Group = "root";
        RuntimeDirectory = "nixpi-broker";
        RuntimeDirectoryMode = "0770";
        UMask = "0007";
        Environment = [ "NIXPI_BROKER_CONFIG=${config.nixpi-broker.brokerConfig}" ];
      };
    };
  };
```

- [ ] **Step 3: Verify evaluation**

```bash
nix flake check .#config 2>&1 | tail -5
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add core/os/services/nixpi-broker.nix
git commit -m "refactor(broker): add systemd portability guard"
```

---

### Task 3: Portability guard — `nixpi-daemon.nix`

**Files:**
- Modify: `core/os/services/nixpi-daemon.nix`

`nixpi-daemon.nix` uses the `importApply` outer-curry pattern: `{ pkgs }: { config, lib, ... }:`. The `options` arg goes on the **inner** function.

- [ ] **Step 1: Add `options` to the inner module function**

Change:

```nix
{ pkgs }:

{ config, lib, ... }:
```

to:

```nix
{ pkgs }:

{ config, lib, options, ... }:
```

- [ ] **Step 2: Apply the portability guard**

Find the `config = { ... };` block. It currently has `process.argv` and `systemd.service` as siblings. Restructure to:

```nix
  config = {
    process.argv = [
      "${pkgs.nodejs}/bin/node"
      "/usr/local/share/nixpi/dist/core/daemon/index.js"
    ];
    # `system.services` portability: guard systemd-specific config so this module
    # can be consumed by non-systemd init systems if NixOS ever supports them.
    # See nixpkgs nixos/README-modular-services.md.
  } // lib.optionalAttrs (options ? systemd) {
    systemd.service = {
      description = "NixPI Pi Daemon (Matrix room agent)";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];
      unitConfig.ConditionPathExists = systemReadyFile;
      serviceConfig = {
        User = config.nixpi-daemon.primaryUser;
        Group = config.nixpi-daemon.primaryUser;
        UMask = "0007";
        WorkingDirectory = "${primaryHome}/nixpi";
        Environment = [
          "HOME=${primaryHome}"
          "NIXPI_DIR=${primaryHome}/nixpi"
          "NIXPI_STATE_DIR=${config.nixpi-daemon.stateDir}"
          "NIXPI_PI_DIR=${config.nixpi-daemon.agentStateDir}"
          "PI_CODING_AGENT_DIR=${config.nixpi-daemon.agentStateDir}"
          "NIXPI_DAEMON_STATE_DIR=${config.nixpi-daemon.stateDir}/nixpi-daemon"
          "NIXPI_PRIMARY_USER=${config.nixpi-daemon.primaryUser}"
          "PATH=${lib.makeBinPath config.nixpi-daemon.path}:/run/current-system/sw/bin"
        ];
        Restart = "on-failure";
        RestartSec = "15";
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = false;
        ReadWritePaths = [
          config.nixpi-daemon.stateDir
          "${primaryHome}/nixpi"
        ];
      };
    };
  };
```

- [ ] **Step 3: Verify evaluation**

```bash
nix flake check .#config 2>&1 | tail -5
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add core/os/services/nixpi-daemon.nix
git commit -m "refactor(daemon): add systemd portability guard"
```

---

### Task 4: Portability guard — `nixpi-home.nix`

**Files:**
- Modify: `core/os/services/nixpi-home.nix`

`nixpi-home.nix` uses the outer-curry pattern. It has `process.argv`, `configData`, and `systemd.service` in `config`. Only `systemd.service` moves into the guard; `configData` stays in the base block.

- [ ] **Step 1: Add `options` to the inner module function**

Change:

```nix
{ pkgs }:

{ config, lib, ... }:
```

to:

```nix
{ pkgs }:

{ config, lib, options, ... }:
```

- [ ] **Step 2: Apply the portability guard**

The `config` block currently ends with `systemd.service = { ... };`. Restructure so that `process.argv` and `configData` remain in the base attrset, and only `systemd.service` is in the guard:

```nix
  config = {
    process.argv = [
      "${pkgs.static-web-server}/bin/static-web-server"
      "--host"
      config.nixpi-home.bindAddress
      "--port"
      (toString config.nixpi-home.port)
      "--root"
      webroot
      "--health"
    ];

    configData = {
      "webroot/index.html".text = ''
        ... (unchanged content)
      '';
    };
    # `system.services` portability: guard systemd-specific config so this module
    # can be consumed by non-systemd init systems if NixOS ever supports them.
    # See nixpkgs nixos/README-modular-services.md.
  } // lib.optionalAttrs (options ? systemd) {
    systemd.service = {
      description = "NixPI Home landing page";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        User = config.nixpi-home.primaryUser;
        Group = config.nixpi-home.primaryUser;
        UMask = "0007";
        Restart = "on-failure";
        RestartSec = "10";
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = false;
      };
    };
  };
```

- [ ] **Step 3: Verify evaluation**

```bash
nix flake check .#config 2>&1 | tail -5
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add core/os/services/nixpi-home.nix
git commit -m "refactor(home): add systemd portability guard"
```

---

### Task 5: Portability guard — `nixpi-element-web.nix`

**Files:**
- Modify: `core/os/services/nixpi-element-web.nix`

Same pattern as `nixpi-home.nix` — outer-curry, has `configData` that must stay in base.

- [ ] **Step 1: Add `options` to the inner module function**

Change:

```nix
{ pkgs }:

{ config, lib, ... }:
```

to:

```nix
{ pkgs }:

{ config, lib, options, ... }:
```

- [ ] **Step 2: Apply the portability guard**

`process.argv` and `configData` stay in the base `config` block. Move only `systemd.service` into the guard:

```nix
  config = {
    process.argv = [
      "${pkgs.static-web-server}/bin/static-web-server"
      "--host"
      config.nixpi-element-web.bindAddress
      "--port"
      (toString config.nixpi-element-web.port)
      "--root"
      webroot
      "--page-fallback"
      "${webroot}/index.html"
      "--health"
    ];

    configData = {
      "config.json".text = configJsonText;
    };
    # `system.services` portability: guard systemd-specific config so this module
    # can be consumed by non-systemd init systems if NixOS ever supports them.
    # See nixpkgs nixos/README-modular-services.md.
  } // lib.optionalAttrs (options ? systemd) {
    systemd.service = {
      description = "NixPI Element Web client";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        User = config.nixpi-element-web.primaryUser;
        Group = config.nixpi-element-web.primaryUser;
        UMask = "0007";
        Restart = "on-failure";
        RestartSec = "10";
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = false;
      };
    };
  };
```

- [ ] **Step 3: Verify evaluation**

```bash
nix flake check .#config 2>&1 | tail -5
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add core/os/services/nixpi-element-web.nix
git commit -m "refactor(element-web): add systemd portability guard"
```

---

### Task 6: Portability guard — `nixpi-update.nix`

**Files:**
- Modify: `core/os/services/nixpi-update.nix`

`nixpi-update.nix` is a plain module (no outer curry). Only `process.argv` and `systemd.service` in `config` — no `configData`.

- [ ] **Step 1: Add `options` to the module argument list**

Change:

```nix
{ config, lib, ... }:
```

to:

```nix
{ config, lib, options, ... }:
```

- [ ] **Step 2: Apply the portability guard**

```nix
  config = {
    process.argv = [ config.nixpi-update.command ];
    # `system.services` portability: guard systemd-specific config so this module
    # can be consumed by non-systemd init systems if NixOS ever supports them.
    # See nixpkgs nixos/README-modular-services.md.
  } // lib.optionalAttrs (options ? systemd) {
    systemd.service = {
      description = "NixPI NixOS update";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      unitConfig = {
        ConditionPathExists = "${config.nixpi-update.flakeDir}/flake.nix";
      };
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = false;
        Restart = "no";
        Environment = [
          "PATH=${config.nixpi-update.path}"
          "NIXPI_PRIMARY_USER=${config.nixpi-update.primaryUser}"
          "NIXPI_SYSTEM_FLAKE_DIR=${config.nixpi-update.flakeDir}"
        ];
      };
    };
  };
```

- [ ] **Step 3: Final verification — run full smoke check**

```bash
nix flake check .#config 2>&1 | tail -5
```

Expected: exits 0.

Also run the modular-services NixOS test if you have time and resources:

```bash
nix build .#checks.x86_64-linux.nixos-smoke -L 2>&1 | tail -20
```

Expected: all smoke tests pass.

- [ ] **Step 4: Commit**

```bash
git add core/os/services/nixpi-update.nix
git commit -m "refactor(update): add systemd portability guard"
```
