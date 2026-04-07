# Stable Bootstrap CI Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class stable bootstrap validation so the documented `nixos-25.11` bootstrap path fails in CI before users hit it.

**Architecture:** Introduce a second nixpkgs input for the stable release line, define a stable installed-system check directly in `flake.nix`, add a stable variant of the fresh-install VM test, and add a small alignment guard plus workflow wiring. Keep the current unstable-oriented lanes intact and make the new stable lane explicit instead of relying on ad hoc `--override-input` verification.

**Tech Stack:** Nix flakes, NixOS VM tests, GitHub Actions workflow YAML, bash-based bootstrap wiring

---

## File Structure

- Create: `.github/workflows/check.yml` — fast PR workflow that must include the new stable bootstrap build check
- Create: `.github/workflows/nixos-vm.yml` — self-hosted VM workflow for smoke/full/manual-dispatch lanes, including the new stable fresh-install test
- Create: `tests/nixos/nixpi-bootstrap-fresh-install-stable.nix` — stable-default fresh-install bootstrap VM test
- Modify: `flake.nix` — add `nixpkgs-stable` input, stable pkgs helper, new checks, and lane registration
- Modify: `tests/nixos/default.nix` — register the new stable fresh-install test
- Modify: `tests/nixos/README.md` — document the new stable build check and stable VM test lane
- Modify: `docs/operations/live-testing.md` — document stable bootstrap validation as a ship gate
- Test: `tests/nixos/nixpi-bootstrap-fresh-install-stable.nix`

### Task 1: Add the stable nixpkgs flake input and direct stable build check

**Files:**
- Modify: `flake.nix`
- Test: `flake.nix` via `nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L`

- [ ] **Step 1: Write the failing config-stable-bootstrap check expectation into the flake topology**

Add a new stable nixpkgs input and a new check reference in `flake.nix`.

```nix
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-25.11";
  };
```

Add the new output parameter:

```nix
      nixpkgs,
      nixpkgs-stable,
      ...
```

Add a stable pkgs helper alongside the current unstable one:

```nix
      mkStablePkgs = system: import nixpkgs-stable { inherit system; };
```

Add a stable installed-system build check:

```nix
          config-stable-bootstrap =
            (nixpkgs-stable.lib.nixosSystem {
              inherit system;
              modules = [
                self.nixosModules.nixpi
                {
                  nixpkgs.hostPlatform = system;
                  nixpkgs.config.allowUnfree = true;
                  nixpi.primaryUser = "alex";
                  networking.hostName = "nixos";
                  system.stateVersion = "25.05";
                  boot.loader = {
                    systemd-boot.enable = true;
                    efi.canTouchEfiVariables = true;
                  };
                  fileSystems = {
                    "/" = {
                      device = "/dev/vda";
                      fsType = "ext4";
                    };
                    "/boot" = {
                      device = "/dev/vda1";
                      fsType = "vfat";
                    };
                  };
                }
              ];
            }).config.system.build.toplevel;
```

- [ ] **Step 2: Run the new stable build target to verify it fails before the rest of the plan is wired**

Run:

```bash
nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L
```

Expected: this fails initially because the check is not fully wired yet or because downstream guard/test references are still missing.

- [ ] **Step 3: Finish the `flake.nix` wiring so the new check is part of the exported checks set**

Ensure the new check lives inside `checks.${system}` next to `config` and `boot`.

```nix
          # Fast stable-path proof for the documented bootstrap contract.
          config-stable-bootstrap =
            (nixpkgs-stable.lib.nixosSystem {
              inherit system;
              modules = [
                self.nixosModules.nixpi
                {
                  nixpkgs.hostPlatform = system;
                  nixpkgs.config.allowUnfree = true;
                  nixpi.primaryUser = "alex";
                  networking.hostName = "nixos";
                  system.stateVersion = "25.05";
                  boot.loader = {
                    systemd-boot.enable = true;
                    efi.canTouchEfiVariables = true;
                  };
                  fileSystems = {
                    "/" = {
                      device = "/dev/vda";
                      fsType = "ext4";
                    };
                    "/boot" = {
                      device = "/dev/vda1";
                      fsType = "vfat";
                    };
                  };
                }
              ];
            }).config.system.build.toplevel;
```

- [ ] **Step 4: Run the stable build check to verify it passes**

Run:

```bash
nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flake.nix
git commit -m "Expose the stable bootstrap build path as a first-class check"
```

### Task 2: Add a stable fresh-install VM test

**Files:**
- Create: `tests/nixos/nixpi-bootstrap-fresh-install-stable.nix`
- Modify: `tests/nixos/default.nix`
- Modify: `flake.nix`
- Test: `tests/nixos/nixpi-bootstrap-fresh-install-stable.nix`

- [ ] **Step 1: Write the new failing stable fresh-install VM test file**

Create `tests/nixos/nixpi-bootstrap-fresh-install-stable.nix` by copying the existing fresh-install harness shape but removing the `NIXPI_NIXPKGS_FLAKE_URL=path:${pkgs.path}` override so the guest uses the bootstrap default stable line.

Use this file content:

```nix
{
  pkgs,
  bootstrapPackage,
  mkTestFilesystems,
  ...
}:

let
  rawSource = builtins.path {
    path = ../..;
    name = "source";
  };

  bootstrapSource = pkgs.runCommandLocal "nixpi-bootstrap-test-repo-stable.git" { nativeBuildInputs = [ pkgs.git ]; } ''
    cp -R ${rawSource}/. source
    chmod -R u+w source
    rm -rf source/.git

    git -C source init --initial-branch=main
    git -C source config user.name "NixPI Test"
    git -C source config user.email "nixpi-tests@example.com"
    git -C source add .
    git -C source add -f package-lock.json
    git -C source add -f core/os/pkgs/pi/package-lock.json
    git -C source commit -m "bootstrap fixture"

    git clone --bare source "$out"
  '';

  nixosRebuildShim = pkgs.writeShellScript "nixos-rebuild" ''
    set -euo pipefail

    printf '%s\n' "$@" > /tmp/nixos-rebuild.args
    if [ "$#" -ne 4 ] || [ "$1" != "switch" ] || [ "$2" != "--flake" ] || [ "$3" != "/etc/nixos#nixos" ] || [ "$4" != "--impure" ]; then
      echo "unexpected nixos-rebuild invocation: $*" >&2
      exit 1
    fi

    printf 'invoked\n' > /tmp/nixos-rebuild.invoked
  '';
in
{
  name = "nixpi-bootstrap-fresh-install-stable";

  nodes.nixos = _: {
    imports = [ mkTestFilesystems ];

    networking.hostName = "bootstrap-fresh-stable";
    environment.etc."nixos/configuration.nix".text = ''
      { ... }:
      {
        networking.hostName = "bootstrap-fresh-stable";
        system.stateVersion = "25.05";
        boot.loader.systemd-boot.enable = true;
        boot.loader.efi.canTouchEfiVariables = true;
      }
    '';
    environment.etc."nixos/hardware-configuration.nix".text = ''
      { ... }:
      {
        fileSystems."/" = {
          device = "/dev/vda";
          fsType = "ext4";
        };

        fileSystems."/boot" = {
          device = "/dev/vda1";
          fsType = "vfat";
        };
      }
    '';

    users.users.pi = {
      isNormalUser = true;
      group = "pi";
      extraGroups = [ "wheel" "networkmanager" ];
      home = "/home/pi";
      shell = pkgs.bash;
    };
    users.groups.pi = { };
  };

  testScript = ''
    machine = machines[0]
    bootstrap = "${bootstrapPackage}/bin/nixpi-bootstrap-vps"
    repo_url = "${bootstrapSource}"
    rebuild_shim = "${nixosRebuildShim}"

    machine.start()
    machine.wait_for_unit("multi-user.target", timeout=300)
    machine.copy_from_host(rebuild_shim, "/tmp/tools/nixos-rebuild")
    machine.succeed("chmod +x /tmp/tools/nixos-rebuild")

    machine.succeed(
        "env "
        + "PATH=/tmp/tools:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:$PATH "
        + "NIXPI_REPO_URL=" + repo_url + " "
        + "NIXPI_REPO_BRANCH=main "
        + "NIXPI_PRIMARY_USER=pi "
        + "NIXPI_HOSTNAME=bootstrap-fresh-stable "
        + bootstrap
        + " | tee /tmp/bootstrap.out"
    )

    machine.succeed("test -f /tmp/nixos-rebuild.invoked")
    machine.succeed("test \"$(paste -sd ' ' /tmp/nixos-rebuild.args)\" = 'switch --flake /etc/nixos#nixos --impure'")
    machine.succeed("grep -q 'github:NixOS/nixpkgs/nixos-25.11' /etc/nixos/flake.nix")
    machine.succeed("grep -q 'nixosConfigurations.nixos' /etc/nixos/flake.nix")
    machine.succeed("grep -q \"Bootstrap complete. Use 'nixpi-rebuild'\" /tmp/bootstrap.out")

    print(\"nixpi-bootstrap-fresh-install-stable test passed!\")
  '';
}
```

- [ ] **Step 2: Register the new test in `tests/nixos/default.nix` and the flake full lane**

Add the new test export in `tests/nixos/default.nix`:

```nix
    nixpi-bootstrap-fresh-install-stable = runTest ./nixpi-bootstrap-fresh-install-stable.nix;
```

Add it to `nixos-full` in `flake.nix` immediately after the existing fresh-install test:

```nix
            {
              name = "nixpi-bootstrap-fresh-install-stable";
              path = nixosTests.nixpi-bootstrap-fresh-install-stable;
            }
```

- [ ] **Step 3: Run the new stable VM test to verify it fails for the expected reason before any follow-up fixes**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-bootstrap-fresh-install-stable --no-link -L
```

Expected: FAIL if registration or assertions are incomplete; otherwise continue directly.

- [ ] **Step 4: Fix registration/assertion mistakes and rerun until the new stable VM test passes**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-bootstrap-fresh-install-stable --no-link -L
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/nixos/nixpi-bootstrap-fresh-install-stable.nix tests/nixos/default.nix flake.nix
git commit -m "Add VM coverage for the stable bootstrap default"
```

### Task 3: Add a stable-alignment guard

**Files:**
- Modify: `flake.nix`
- Test: `flake.nix` via `nix build .#checks.x86_64-linux.bootstrap-stable-alignment --no-link -L`

- [ ] **Step 1: Add a failing guard check that ties bootstrap defaults to the stable CI lane**

Add a new `runCommandLocal` check in `flake.nix`:

```nix
          bootstrap-stable-alignment = pkgs.runCommandLocal "bootstrap-stable-alignment-check" { } ''
            grep -F 'NIXPI_STABLE_NIXOS_RELEASE="${NIXPI_STABLE_NIXOS_RELEASE:-25.11}"' ${./core/scripts/nixpi-init-system-flake.sh} >/dev/null
            grep -F 'nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-25.11";' ${./flake.nix} >/dev/null
            grep -F 'config-stable-bootstrap' ${./flake.nix} >/dev/null
            test -f ${./tests/nixos/nixpi-bootstrap-fresh-install-stable.nix}
            touch "$out"
          '';
```

- [ ] **Step 2: Run the guard to verify it passes**

Run:

```bash
nix build .#checks.x86_64-linux.bootstrap-stable-alignment --no-link -L
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add flake.nix
git commit -m "Guard the stable bootstrap contract against drift"
```

### Task 4: Wire the stable lane into CI

**Files:**
- Create: `.github/workflows/check.yml`
- Create: `.github/workflows/nixos-vm.yml`
- Test: workflow YAML syntax by inspection and repository docs consistency

- [ ] **Step 1: Create the fast PR workflow**

Create `.github/workflows/check.yml` with this content:

```yaml
name: check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  quick-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cachix/install-nix-action@v31
      - name: Build unstable config check
        run: nix build .#checks.x86_64-linux.config --no-link -L
      - name: Build stable bootstrap config check
        run: nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L
      - name: Build stable alignment guard
        run: nix build .#checks.x86_64-linux.bootstrap-stable-alignment --no-link -L
```

- [ ] **Step 2: Create the self-hosted VM workflow**

Create `.github/workflows/nixos-vm.yml` with this content:

```yaml
name: nixos-vm

on:
  workflow_dispatch:
    inputs:
      lane:
        description: VM lane to run
        required: true
        default: nixos-full
        type: choice
        options:
          - nixos-smoke
          - nixos-full
          - nixos-destructive
          - nixpi-bootstrap-fresh-install-stable
  schedule:
    - cron: "0 3 * * *"

jobs:
  vm-tests:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: cachix/install-nix-action@v31
      - name: Run selected VM lane
        run: |
          lane="${{ github.event.inputs.lane || 'nixos-full' }}"
          nix build ".#checks.x86_64-linux.${lane}" --no-link -L
```

- [ ] **Step 3: Verify the workflow references match repo reality**

Run:

```bash
rg -n "config-stable-bootstrap|bootstrap-stable-alignment|nixpi-bootstrap-fresh-install-stable" .github/workflows flake.nix tests/nixos/default.nix -S
```

Expected: all three names appear in the workflow files and in the flake/test registration points.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/check.yml .github/workflows/nixos-vm.yml
git commit -m "Run stable bootstrap validation in CI"
```

### Task 5: Update operator and test docs

**Files:**
- Modify: `tests/nixos/README.md`
- Modify: `docs/operations/live-testing.md`

- [ ] **Step 1: Update `tests/nixos/README.md` with the new stable lane**

Add these lines to the “Test Lanes” and “Run fast local checks / specific test” sections:

```md
- `config-stable-bootstrap`: fast non-VM closure build for the documented stable bootstrap target
```

```bash
nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L
nix build .#checks.x86_64-linux.nixpi-bootstrap-fresh-install-stable --no-link -L
```

Add the new file to the test structure list:

```md
├── nixpi-bootstrap-fresh-install-stable.nix # stable-default bootstrap contract on a pristine VM
```

- [ ] **Step 2: Update `docs/operations/live-testing.md` to make stable-path validation explicit**

Add a short subsection under “Fresh Bootstrap”:

```md
### Stable Bootstrap Regression Gate

Before shipping bootstrap-related changes from a local checkout, verify both:

```bash
nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L
nix build .#checks.x86_64-linux.nixpi-bootstrap-fresh-install-stable --no-link -L
```

These commands validate the same stable `nixos-25.11` bootstrap line that the generated `/etc/nixos/flake.nix` uses by default.
```

- [ ] **Step 3: Run a focused doc sanity check**

Run:

```bash
rg -n "config-stable-bootstrap|nixpi-bootstrap-fresh-install-stable|nixos-25.11" docs/operations/live-testing.md tests/nixos/README.md -S
```

Expected: all new names and the stable release line are documented.

- [ ] **Step 4: Commit**

```bash
git add tests/nixos/README.md docs/operations/live-testing.md
git commit -m "Document the stable bootstrap validation lane"
```

### Task 6: Final verification of the stable bootstrap CI slice

**Files:**
- Modify: none
- Test: all touched flake/test/doc/workflow files

- [ ] **Step 1: Run the stable build proof**

Run:

```bash
nix build .#checks.x86_64-linux.config-stable-bootstrap --no-link -L
```

Expected: PASS

- [ ] **Step 2: Run the stable fresh-install VM test**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-bootstrap-fresh-install-stable --no-link -L
```

Expected: PASS

- [ ] **Step 3: Run an unchanged regression lane**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-firstboot --no-link -L
```

Expected: PASS

- [ ] **Step 4: Review final diff**

Run:

```bash
git diff --stat HEAD~5..HEAD
```

Expected: only flake/test/workflow/doc files for the stable bootstrap lane are included.

- [ ] **Step 5: Commit**

```bash
git add flake.nix tests/nixos/default.nix tests/nixos/nixpi-bootstrap-fresh-install-stable.nix tests/nixos/README.md docs/operations/live-testing.md .github/workflows/check.yml .github/workflows/nixos-vm.yml
git commit -m "Finish stable bootstrap CI coverage"
```
