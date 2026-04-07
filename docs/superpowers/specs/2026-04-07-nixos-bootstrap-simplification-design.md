# NixPI Bootstrap Simplification on NixOS — Design Spec

## Goal

Simplify the initial NixPI bootstrap flow on already-installed NixOS hosts so it follows the most standard NixOS flake model:

- `/etc/nixos` remains the host-owned system configuration
- `/srv/nixpi` remains the canonical NixPI checkout
- bootstrap only adds the smallest possible flake glue between them
- rebuilds always flow through `nixos-rebuild switch --flake /etc/nixos#nixos`

## Context

NixPI currently supports a post-install bootstrap flow, not an installer-first workflow. The public bootstrap entrypoint is:

```bash
nix --extra-experimental-features 'nix-command flakes' run github:alexradunet/nixpi#nixpi-bootstrap-vps
```

The current implementation is centered in:

- `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`
- `core/scripts/nixpi-init-system-flake.sh`
- `core/scripts/nixpi-rebuild.sh`

The current docs already describe a host-owned `/etc/nixos` layered with NixPI, but the implementation still contains extra bootstrap-owned behavior that is more custom than necessary.

## Relevant NixOS Manual Guidance

The stable NixOS manual describes the standard ownership model clearly:

- `/etc/nixos/configuration.nix` is the machine’s current NixOS configuration
- hardware settings are generated into `hardware-configuration.nix`
- post-install system changes should use `nixos-rebuild switch`
- flake installs still use the same system model, just via `--flake`

Relevant manual references:

- NixOS manual, “Changing the Configuration”: <https://nixos.org/manual/nixos/stable/#sec-changing-config>
- NixOS manual, installation section showing `nixos-install --flake ...#nixos`: <https://nixos.org/manual/nixos/stable/>

The manual’s implied standard is: keep `/etc/nixos` as the host’s truth, then rebuild through the normal NixOS tools.

## Current Problems

### 1. Bootstrap owns too many host settings

`core/scripts/nixpi-init-system-flake.sh` currently writes bootstrap-owned values into the generated flake for:

- hostname
- primary user
- timezone
- keyboard

Only the NixPI-specific user binding actually needs to be injected by bootstrap. The others belong in host-owned NixOS config.

### 2. Bootstrap mutates `/etc/nix/nix.conf` imperatively

`core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh` appends experimental feature settings directly into `/etc/nix/nix.conf`.

That works, but it is less standard than declaring the setting in NixOS itself.

### 3. Repo refresh is too destructive

If `/srv/nixpi` already exists, bootstrap fetches, checks out the selected branch, and hard-resets to `origin/<branch>`.

That is risky on reruns and makes bootstrap less operator-friendly.

### 4. Bootstrap heuristics are broader than needed

The script currently tries several strategies to infer the primary user. Some fallback heuristics are convenient, but they also make the flow less predictable than necessary.

### 5. Docs and architecture story are not fully aligned

Public install docs describe a simple host-owned flake model, but some architecture docs still reflect older setup and bootstrap assumptions.

## Design Principles

1. **Prefer standard NixOS ownership** over NixPI-owned machine config.
2. **Generate less** and reuse more of the normal `/etc/nixos` layout.
3. **Keep bootstrap reversible and rerunnable** without silently destroying local work.
4. **Use flakes in the standard NixOS way**, not as a custom deployment substrate.
5. **Keep one rebuild root**: `/etc/nixos#nixos`.

## Approved Design

### Part 1 — Keep the public bootstrap command, but narrow its responsibilities

The public entrypoint remains:

```bash
nix --extra-experimental-features 'nix-command flakes' run github:alexradunet/nixpi#nixpi-bootstrap-vps
```

Bootstrap should only do five things:

1. verify this is a NixOS host with a standard `/etc/nixos/configuration.nix`
2. ensure `/srv/nixpi` exists and points at the requested repo/branch
3. generate or refresh a minimal `/etc/nixos/flake.nix`
4. run `nixos-rebuild switch --flake /etc/nixos#nixos`
5. print the correct steady-state rebuild guidance (`sudo nixpi-rebuild`)

Bootstrap should not attempt to become a general host provisioning framework.

### Part 2 — Treat `/etc/nixos` as fully host-owned except for minimal NixPI glue

The generated `/etc/nixos/flake.nix` should be minimal and standard. It should:

- pin a stable `nixpkgs` input
- reference `nixpi.url = "path:/srv/nixpi"`
- set `nixpi.inputs.nixpkgs.follows = "nixpkgs"`
- expose one configuration: `nixosConfigurations.nixos`
- import:
  - `./configuration.nix`
  - `nixpi.nixosModules.nixpi`
  - one tiny inline module for bootstrap-owned NixPI defaults

The generated flake should stop embedding host-owned settings such as:

- `networking.hostName`
- `time.timeZone`
- keyboard/input defaults

Those should remain in the host’s normal `/etc/nixos/configuration.nix` and `hardware-configuration.nix` flow.

### Part 3 — Stop editing `/etc/nix/nix.conf`; use command-scoped flake enablement plus declarative steady-state config

Bootstrap should stop appending to `/etc/nix/nix.conf`.

For the bootstrap-time commands that still need flake support before the first rebuild, the script should use command-scoped enablement, for example via `NIX_CONFIG='experimental-features = nix-command flakes'`.

In the generated inline module in `/etc/nixos/flake.nix`, bootstrap should also declare:

```nix
nix.settings.experimental-features = [ "nix-command" "flakes" ];
```

This keeps first-run bootstrap working while moving the steady-state host configuration into normal declarative NixOS state.

Constraint: the initial public `nix run ...#nixpi-bootstrap-vps` command should continue using `--extra-experimental-features 'nix-command flakes'`, because flake support is required before the bootstrap code is even fetched and executed.

### Part 4 — Keep only one bootstrap-owned host parameter: `nixpi.primaryUser`

Bootstrap should continue to provide:

```nix
nixpi.primaryUser = "<user>";
```

That is the one host-specific value NixPI must know to wire the user-facing runtime correctly.

Primary user resolution should become stricter and more predictable:

1. use `NIXPI_PRIMARY_USER` if set
2. else use `SUDO_USER` when present
3. else, if invoked as a normal user, use `id -un`
4. else fail with a clear message instead of guessing deeper

This removes the more magical fallbacks while keeping the common paths smooth.

### Part 5 — Make `/srv/nixpi` reruns safer

Bootstrap should stop hard-resetting existing checkouts by default.

Desired behavior:

- if `/srv/nixpi` is absent: clone it
- if `/srv/nixpi` exists and is clean: fetch and fast-forward or reset only when explicitly safe
- if `/srv/nixpi` has local modifications or commits that would be overwritten: stop and print guidance

The key property is: **bootstrap reruns must not silently destroy operator work**.

A simple acceptable policy is:

- require a clean working tree for automatic refresh
- otherwise fail and tell the operator to clean, commit, or reclone intentionally

### Part 6 — Keep the steady-state rebuild path fixed and obvious

After bootstrap, the supported operator flow remains:

```bash
cd /srv/nixpi
git fetch origin
git rebase origin/main
sudo nixpi-rebuild
```

And `nixpi-rebuild` remains a thin wrapper around:

```bash
nixos-rebuild switch --flake /etc/nixos#nixos
```

This preserves the correct boundary:

- `/etc/nixos` = host rebuild root
- `/srv/nixpi` = canonical source checkout

### Part 7 — Align docs and tests to the simpler ownership model

Update docs so they consistently describe:

- post-install-first bootstrap on NixOS
- host-owned `/etc/nixos`
- minimal generated flake glue
- `/srv/nixpi` as the canonical checkout
- `sudo nixpi-rebuild` as the standard steady-state rebuild path

Update tests so they assert the simplified flake contents and safer bootstrap behavior.

## Expected Resulting `/etc/nixos/flake.nix` Shape

Illustrative target shape:

```nix
{
  description = "NixPI system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixpi.url = "path:/srv/nixpi";
    nixpi.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { nixpkgs, nixpi, ... }: {
    nixosConfigurations.nixos = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ./configuration.nix
        nixpi.nixosModules.nixpi
        {
          nix.settings.experimental-features = [ "nix-command" "flakes" ];
          nixpi.primaryUser = "pi";
          nixpkgs.config.allowUnfree = true;
        }
      ];
    };
  };
}
```

This intentionally keeps the generated file small. Host details stay in the host config.

## File-Level Impact

### Modify
- `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`
- `core/scripts/nixpi-init-system-flake.sh`
- `README.md`
- `docs/install.md`
- `docs/operations/quick-deploy.md`
- `docs/operations/first-boot-setup.md`
- `docs/architecture/runtime-flows.md`
- `flake.nix`
- `tests/nixos/nixpi-system-flake.nix`
- `tests/nixos/nixpi-firstboot.nix`
- `tests/nixos/nixpi-e2e.nix`
- `tests/nixos/nixpi-vps-bootstrap.nix`
- `docs/operations/index.md`
- `docs/operations/live-testing.md`
- any bootstrap script assertion checks in `flake.nix`

### Keep unchanged in behavior
- `core/scripts/nixpi-rebuild.sh`
- broker default flake target `/etc/nixos#nixos`

## Tradeoffs Considered

### Option A — Keep current flow and only polish messages
Rejected because it preserves unnecessary bootstrap-owned config and imperative host mutation.

### Option B — Make `/srv/nixpi` the system flake root again
Rejected because it weakens the standard NixOS ownership model and makes host/app boundaries less clear.

### Option C — Recommended minimal host-owned flake glue
Chosen because it is the simplest model that matches standard NixOS flakes while preserving NixPI’s runtime needs.

## Verification Strategy

1. unit/assertion checks in `flake.nix` should confirm:
   - bootstrap no longer appends to `/etc/nix/nix.conf`
   - bootstrap uses command-scoped flake enablement for first-run commands
   - generated flake still references `/srv/nixpi`
   - generated flake sets `nix.settings.experimental-features`
   - generated flake no longer embeds hostname/timezone/keyboard
2. NixOS VM tests should confirm:
   - `/etc/nixos/flake.nix` is generated successfully
   - host-owned `/etc/nixos/configuration.nix` remains the entrypoint
   - rebuild path remains `/etc/nixos#nixos`
   - rerun safety behavior is correct when `/srv/nixpi` is dirty
3. docs should consistently describe the same flow everywhere

## Non-Goals

- switching the primary public workflow to installer-time `nixos-install --flake`
- turning bootstrap into a full machine provisioning framework
- moving the rebuild root away from `/etc/nixos`
- reworking the NixPI runtime architecture beyond what the simpler bootstrap boundary requires
