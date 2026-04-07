# NixPI Bootstrap Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce NixPI bootstrap to the simplest standard post-install NixOS flakes path by keeping `/etc/nixos` host-owned, keeping `/srv/nixpi` as the canonical checkout, and making bootstrap safer and less magical.

**Architecture:** Keep the public `nix run ...#nixpi-bootstrap-vps` entrypoint, but narrow bootstrap to three technical responsibilities: safe `/srv/nixpi` checkout management, minimal `/etc/nixos/flake.nix` generation, and one standard `nixos-rebuild switch --flake /etc/nixos#nixos`. Shift flake enablement away from imperative `/etc/nix/nix.conf` edits and into command-scoped bootstrap execution plus declarative NixOS config.

**Tech Stack:** Nix flakes, NixOS modules, Bash bootstrap scripts, NixOS VM tests, VitePress docs, Vitest/Biome verification.

---

## File structure and responsibilities

| Path | Responsibility |
| --- | --- |
| `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh` | Public bootstrap entrypoint; privilege escalation, `/srv/nixpi` checkout management, and rebuild invocation |
| `core/scripts/nixpi-init-system-flake.sh` | Writes the minimal host-owned `/etc/nixos/flake.nix` glue |
| `core/scripts/nixpi-rebuild.sh` | Stable rebuild wrapper that must stay pointed at `/etc/nixos#nixos` |
| `flake.nix` | Repo-level packages/checks assertions and check-lane registration |
| `tests/nixos/default.nix` | Registration point for NixOS VM tests |
| `tests/nixos/nixpi-system-flake.nix` | Verifies generated `/etc/nixos/flake.nix` content and rewrite behavior |
| `tests/nixos/nixpi-vps-bootstrap.nix` | Verifies the canonical bootstrap-first host runtime still comes up correctly |
| `tests/nixos/nixpi-bootstrap-reentry.nix` | New VM test for safe reruns when `/srv/nixpi` is dirty or diverged |
| `README.md` | Root quick-start and steady-state operator commands |
| `docs/install.md` | Public install path and bootstrap semantics |
| `docs/operations/quick-deploy.md` | Canonical operator flow and rerun warnings |
| `docs/operations/first-boot-setup.md` | Post-bootstrap validation expectations |
| `docs/operations/index.md` | Operations landing page snippets |
| `docs/operations/live-testing.md` | Release validation path for the supported bootstrap flow |
| `docs/architecture/runtime-flows.md` | Architecture description of install/build flow |

---

### Task 1: Lock the new bootstrap contract with failing checks first

**Files:**
- Modify: `flake.nix`
- Modify: `tests/nixos/default.nix`
- Create: `tests/nixos/nixpi-bootstrap-reentry.nix`
- Test: `nix build .#checks.x86_64-linux.bootstrap-script --no-link`
- Test: `nix build .#checks.x86_64-linux.system-flake-bootstrap --no-link`

- [ ] **Step 1: Tighten the repo-level bootstrap assertions in `flake.nix`**

Add these assertions inside the existing `bootstrap-script` and `system-flake-bootstrap` checks so the current implementation fails before any script edits:

```nix
bootstrap-script = pkgs.runCommandLocal "bootstrap-script-check" { } ''
  # ...existing assertions...
  ! grep -F 'HOSTNAME_VALUE=' "${bootstrapScriptSource}" >/dev/null
  ! grep -F 'TIMEZONE_VALUE=' "${bootstrapScriptSource}" >/dev/null
  ! grep -F 'KEYBOARD_VALUE=' "${bootstrapScriptSource}" >/dev/null
  ! grep -F 'getent passwd' "${bootstrapScriptSource}" >/dev/null
  ! grep -F 'logname' "${bootstrapScriptSource}" >/dev/null
  ! grep -F '/etc/nix/nix.conf' "${bootstrapScriptSource}" >/dev/null
  grep -F "NIX_CONFIG='experimental-features = nix-command flakes'" "${bootstrapScriptSource}" >/dev/null
  grep -F 'git -C "$REPO_DIR" status --porcelain' "${bootstrapScriptSource}" >/dev/null
  grep -F 'merge-base --is-ancestor' "${bootstrapScriptSource}" >/dev/null
  touch "$out"
'';

system-flake-bootstrap = pkgs.runCommandLocal "system-flake-bootstrap-check" { } ''
  # ...existing assertions...
  grep -F 'nix.settings.experimental-features = [ "nix-command" "flakes" ];' "$helper" >/dev/null
  grep -F 'nixpi.primaryUser = "${PRIMARY_USER_VALUE}";' "$helper" >/dev/null
  ! grep -F 'networking.hostName =' "$helper" >/dev/null
  ! grep -F 'time.timeZone =' "$helper" >/dev/null
  ! grep -F 'nixpi.timezone =' "$helper" >/dev/null
  ! grep -F 'nixpi.keyboard =' "$helper" >/dev/null
  touch "$out"
'';
```

- [ ] **Step 2: Run the two targeted assertion checks and confirm they fail**

Run:

```bash
nix build .#checks.x86_64-linux.bootstrap-script --no-link 2>&1 | tail -40
nix build .#checks.x86_64-linux.system-flake-bootstrap --no-link 2>&1 | tail -40
```

Expected: both commands fail because the current scripts still set host-owned values, still edit `/etc/nix/nix.conf`, and still use the broader user-resolution heuristics.

- [ ] **Step 3: Register the new rerun-safety test target before implementing it**

Create `tests/nixos/nixpi-bootstrap-reentry.nix` with this initial failing skeleton and register it in `tests/nixos/default.nix` plus the `nixos-full` lane in `flake.nix`:

```nix
{ mkTestFilesystems, ... }:

{
  name = "nixpi-bootstrap-reentry";

  nodes.machine =
    { pkgs, ... }:
    {
      imports = [ mkTestFilesystems ];
      environment.systemPackages = [ pkgs.git pkgs.curl pkgs.jq pkgs.bash ];
      networking.hostName = "bootstrap-reentry";
      system.stateVersion = "25.05";
    };

  testScript = ''
    machine = machines[0]
    machine.start()
    machine.wait_for_unit("multi-user.target", timeout=300)

    # Intentionally failing placeholder assertion for the red phase.
    machine.fail("test -x /srv/nixpi/core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh")
  '';
}
```

And register it like this:

```nix
# tests/nixos/default.nix
nixpi-bootstrap-reentry = runTest ./nixpi-bootstrap-reentry.nix;
```

```nix
# flake.nix nixos-full lane
{
  name = "nixpi-bootstrap-reentry";
  path = nixosTests.nixpi-bootstrap-reentry;
}
```

- [ ] **Step 4: Run the new test target to confirm the red phase**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-bootstrap-reentry --no-link -L
```

Expected: the new test fails immediately on the intentional placeholder assertion, proving the lane is wired before the real test logic is added.

- [ ] **Step 5: Commit the red contract changes**

Run:

```bash
git add flake.nix tests/nixos/default.nix tests/nixos/nixpi-bootstrap-reentry.nix
git commit -F - <<'EOF'
Lock the simplified bootstrap contract before touching scripts

Add failing assertions for the desired post-install host-owned flake model,
and register a dedicated rerun-safety VM test so later implementation work is
forced through concrete checks instead of ad hoc shell edits.

Constraint: Bootstrap semantics are encoded primarily through shell scripts, so repo-level greps and VM tests must go red first
Rejected: Edit the scripts first and retrofit checks later | weakens TDD and makes regressions easier to miss
Confidence: high
Scope-risk: narrow
Reversibility: clean
Directive: Keep bootstrap behavior pinned by checks whenever shell logic changes
Tested: `nix build .#checks.x86_64-linux.bootstrap-script --no-link` (expected fail)
Tested: `nix build .#checks.x86_64-linux.system-flake-bootstrap --no-link` (expected fail)
Tested: `nix build .#checks.x86_64-linux.nixpi-bootstrap-reentry --no-link -L` (expected fail)
Not-tested: Passing behavior; implementation not applied yet
EOF
```

### Task 2: Simplify `nixpi-init-system-flake.sh` and update the flake-content VM test

**Files:**
- Modify: `core/scripts/nixpi-init-system-flake.sh`
- Modify: `tests/nixos/nixpi-system-flake.nix`
- Test: `nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L`
- Test: `nix build .#checks.x86_64-linux.system-flake-bootstrap --no-link`

- [ ] **Step 1: Make the VM test assert the new minimal flake shape first**

Edit `tests/nixos/nixpi-system-flake.nix` so the helper is called with the new argument list and the assertions expect only NixPI-specific inline settings:

```nix
machine.succeed("/run/current-system/sw/bin/bash ${initSystemFlake} /srv/nixpi pi")
machine.succeed("test -f /etc/nixos/flake.nix")
machine.succeed("grep -q 'nixosConfigurations.nixos' /etc/nixos/flake.nix")
machine.succeed("grep -q 'nix.settings.experimental-features = \\\[ \\\"nix-command\\\" \\\"flakes\\\" \\\];' /etc/nixos/flake.nix")
machine.succeed("grep -q 'nixpi.primaryUser = \\\"pi\\\";' /etc/nixos/flake.nix")
machine.fail("grep -q 'networking.hostName =' /etc/nixos/flake.nix")
machine.fail("grep -q 'time.timeZone =' /etc/nixos/flake.nix")
machine.fail("grep -q 'nixpi.timezone =' /etc/nixos/flake.nix")
machine.fail("grep -q 'nixpi.keyboard =' /etc/nixos/flake.nix")
```

Also update the rewrite cases later in the same file to use the new helper invocation:

```nix
machine.succeed("/run/current-system/sw/bin/bash ${initSystemFlake} /srv/nixpi pi")
machine.succeed("env NIXPI_NIXPKGS_FLAKE_URL='" + nixpkgs_url + "' /run/current-system/sw/bin/bash ${initSystemFlake} /srv/nixpi pi")
```

- [ ] **Step 2: Run the flake-content VM test and confirm it fails**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L 2>&1 | tail -60
```

Expected: it fails because the helper still requires hostname/timezone/keyboard positional arguments and still writes those values into the flake.

- [ ] **Step 3: Replace the helper body with the minimal host-owned flake implementation**

Rewrite `core/scripts/nixpi-init-system-flake.sh` so it only accepts `REPO_DIR`, `PRIMARY_USER_VALUE`, and optional `SYSTEM_VALUE`, and writes this inline module shape:

```bash
REPO_DIR="${1:?repo dir required}"
PRIMARY_USER_VALUE="${2:?primary user required}"
SYSTEM_VALUE="${3:-}"
NIXOS_DIR="/etc/nixos"
FLAKE_FILE="$NIXOS_DIR/flake.nix"
NIXPKGS_FLAKE_URL="${NIXPI_NIXPKGS_FLAKE_URL:-}"
NIXPI_STABLE_NIXOS_RELEASE="${NIXPI_STABLE_NIXOS_RELEASE:-25.11}"

install -d -m 0755 "$NIXOS_DIR"

test -f "$NIXOS_DIR/configuration.nix" || {
  echo "missing $NIXOS_DIR/configuration.nix; bootstrap expects a standard NixOS configuration entrypoint" >&2
  exit 1
}

test -f "$NIXOS_DIR/hardware-configuration.nix" || {
  echo "missing $NIXOS_DIR/hardware-configuration.nix; bootstrap expects standard generated NixOS hardware config" >&2
  exit 1
}

cat > "$FLAKE_FILE" <<EOF_FLAKE
# Generated by NixPI bootstrap
{
  description = "NixPI system flake";

  inputs = {
    nixpkgs.url = "${NIXPKGS_FLAKE_URL}";
    nixpi.url = "path:${REPO_DIR}";
    nixpi.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { nixpkgs, nixpi, ... }:
    let
      system = "${SYSTEM_VALUE}";
    in {
      nixosConfigurations.nixos = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          ./configuration.nix
          nixpi.nixosModules.nixpi
          {
            nixpkgs.hostPlatform = system;
            nix.settings.experimental-features = [ "nix-command" "flakes" ];
            nixpi.primaryUser = "${PRIMARY_USER_VALUE}";
            nixpkgs.config.allowUnfree = true;
          }
        ];
      };
    };
}
EOF_FLAKE
```

Keep the existing `resolve_nixpkgs_flake_url`, `should_write_system_flake`, and architecture detection logic, but remove every reference to hostname, timezone, and keyboard.

- [ ] **Step 4: Rerun the focused checks until they pass**

Run:

```bash
nix build .#checks.x86_64-linux.system-flake-bootstrap --no-link
nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L
```

Expected: both commands exit 0; the helper now writes a smaller flake and the VM test confirms the host-owned settings stay out of generated glue.

- [ ] **Step 5: Commit the helper simplification**

Run:

```bash
git add core/scripts/nixpi-init-system-flake.sh tests/nixos/nixpi-system-flake.nix flake.nix
git commit -F - <<'EOF'
Shrink generated system flake glue to the host-owned NixOS minimum

Remove host-owned settings from the generated `/etc/nixos/flake.nix` glue and
keep only the NixPI-specific defaults that bootstrap truly owns. This makes the
resulting flake match the standard NixOS post-install model more closely.

Constraint: The generated flake must still be self-sufficient for `nixos-rebuild switch --flake /etc/nixos#nixos`
Rejected: Keep hostname, timezone, and keyboard in generated glue | duplicates host-owned NixOS configuration
Confidence: high
Scope-risk: moderate
Reversibility: clean
Directive: Do not add new host-owned machine settings to generated flake glue without an explicit design decision
Tested: `nix build .#checks.x86_64-linux.system-flake-bootstrap --no-link`
Tested: `nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L`
Not-tested: Full end-to-end bootstrap path; covered later in the plan
EOF
```

### Task 3: Simplify bootstrap runtime behavior and stop editing `/etc/nix/nix.conf`

**Files:**
- Modify: `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`
- Modify: `tests/nixos/nixpi-vps-bootstrap.nix`
- Test: `nix build .#checks.x86_64-linux.bootstrap-script --no-link`
- Test: `nix build .#checks.x86_64-linux.nixpi-vps-bootstrap --no-link -L`

- [ ] **Step 1: Make the bootstrap VM test assert the new steady-state expectations first**

Update `tests/nixos/nixpi-vps-bootstrap.nix` to assert the declarative flake settings and the absence of imperative host mutation:

```nix
nixpi.succeed("test -f /etc/nixos/flake.nix")
nixpi.succeed("grep -q 'nix.settings.experimental-features = \\\[ \\\"nix-command\\\" \\\"flakes\\\" \\\];' /etc/nixos/flake.nix")
nixpi.fail("grep -q 'networking.hostName =' /etc/nixos/flake.nix")
nixpi.fail("grep -q 'nixpi.keyboard =' /etc/nixos/flake.nix")
nixpi.fail("grep -q 'experimental-features = nix-command flakes' /etc/nix/nix.conf")
```

- [ ] **Step 2: Run the VM bootstrap test and confirm it fails**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-vps-bootstrap --no-link -L 2>&1 | tail -60
```

Expected: it fails because the current bootstrap script still edits `/etc/nix/nix.conf` and still writes host-owned fields through the helper.

- [ ] **Step 3: Replace the bootstrap script’s host-magic with a narrower runtime contract**

Refactor `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh` to:

1. remove `HOSTNAME_VALUE`, `TIMEZONE_VALUE`, and `KEYBOARD_VALUE`
2. tighten `resolve_primary_user()` to `NIXPI_PRIMARY_USER` → `SUDO_USER` → `id -un` → fail
3. add a helper that runs commands with flake support without editing `/etc/nix/nix.conf`

Use this exact helper pattern:

```bash
run_with_flakes() {
  env NIX_CONFIG='experimental-features = nix-command flakes' "$@"
}

resolve_primary_user() {
  if [ -n "${NIXPI_PRIMARY_USER:-}" ]; then
    printf '%s\n' "$NIXPI_PRIMARY_USER"
    return 0
  fi

  if [ -n "${SUDO_USER:-}" ]; then
    printf '%s\n' "$SUDO_USER"
    return 0
  fi

  if [ "$(id -u)" -ne 0 ]; then
    id -un
    return 0
  fi

  log "Could not infer the primary non-root user."
  log "Run bootstrap as your normal user or set NIXPI_PRIMARY_USER explicitly."
  return 1
}
```

Then switch the helper and rebuild calls to:

```bash
run_as_root run_with_flakes bash "$REPO_DIR/core/scripts/nixpi-init-system-flake.sh" \
  "$REPO_DIR" \
  "$PRIMARY_USER_VALUE"

run_as_root run_with_flakes nixos-rebuild switch --flake /etc/nixos#nixos
```

- [ ] **Step 4: Rerun the focused bootstrap checks until they pass**

Run:

```bash
nix build .#checks.x86_64-linux.bootstrap-script --no-link
nix build .#checks.x86_64-linux.nixpi-vps-bootstrap --no-link -L
```

Expected: both commands exit 0; bootstrap no longer mutates `/etc/nix/nix.conf`, and the VM confirms the generated flake carries the flakes setting declaratively.

- [ ] **Step 5: Commit the bootstrap simplification**

Run:

```bash
git add core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh tests/nixos/nixpi-vps-bootstrap.nix flake.nix
git commit -F - <<'EOF'
Remove imperative host mutation from bootstrap and narrow user inference

Switch bootstrap to command-scoped flake enablement, keep the host’s declarative
flakes setting in generated NixOS config, and reduce primary-user inference to
predictable, operator-visible paths.

Constraint: Bootstrap still has to work before the first declarative rebuild has taken effect
Rejected: Keep appending to `/etc/nix/nix.conf` | imperative host mutation is less standard and harder to reason about
Confidence: high
Scope-risk: moderate
Reversibility: clean
Directive: If bootstrap needs temporary flake support, prefer command-scoped environment over persistent file edits
Tested: `nix build .#checks.x86_64-linux.bootstrap-script --no-link`
Tested: `nix build .#checks.x86_64-linux.nixpi-vps-bootstrap --no-link -L`
Not-tested: Dirty repo rerun behavior; covered in the next task
EOF
```

### Task 4: Make reruns safe when `/srv/nixpi` is dirty or diverged

**Files:**
- Modify: `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`
- Modify: `tests/nixos/nixpi-bootstrap-reentry.nix`
- Modify: `tests/nixos/default.nix`
- Modify: `flake.nix`
- Test: `nix build .#checks.x86_64-linux.nixpi-bootstrap-reentry --no-link -L`

- [ ] **Step 1: Replace the placeholder VM test with a real dirty-rerun scenario**

Rewrite `tests/nixos/nixpi-bootstrap-reentry.nix` so it seeds a local Git origin, bootstraps once, dirties the checkout, reruns bootstrap, and expects a clear failure:

```nix
{ mkTestFilesystems, ... }:

{
  name = "nixpi-bootstrap-reentry";

  nodes.machine =
    { pkgs, ... }:
    {
      imports = [ mkTestFilesystems ];
      environment.systemPackages = [ pkgs.git pkgs.bash pkgs.curl pkgs.jq ];
      networking.hostName = "bootstrap-reentry";
      system.stateVersion = "25.05";

      environment.etc."nixos/configuration.nix".text = ''
        { ... }:
        {
          networking.hostName = "bootstrap-reentry";
        }
      '';

      environment.etc."nixos/hardware-configuration.nix".text = ''
        { ... }:
        {}
      '';
    };

  testScript = ''
    machine = machines[0]
    bootstrap = "/run/current-system/sw/bin/bash /srv/nixpi/core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh"

    machine.start()
    machine.wait_for_unit("multi-user.target", timeout=300)

    machine.succeed("rm -rf /tmp/nixpi-origin && mkdir -p /tmp/nixpi-origin")
    machine.succeed("git init --bare /tmp/nixpi-origin")
    machine.succeed("git clone /tmp/nixpi-origin /tmp/nixpi-work")
    machine.succeed("cp -R /srv/nixpi/. /tmp/nixpi-work/")
    machine.succeed("git -C /tmp/nixpi-work add .")
    machine.succeed("git -C /tmp/nixpi-work -c user.name=test -c user.email=test@example.com commit -m initial")
    machine.succeed("git -C /tmp/nixpi-work branch -M main")
    machine.succeed("git -C /tmp/nixpi-work push origin main")
    machine.succeed("rm -rf /srv/nixpi")

    machine.succeed("env NIXPI_REPO_URL=/tmp/nixpi-origin NIXPI_PRIMARY_USER=root " + bootstrap)
    machine.succeed("echo '# dirty change' >> /srv/nixpi/README.md")
    output = machine.fail("env NIXPI_REPO_URL=/tmp/nixpi-origin NIXPI_PRIMARY_USER=root " + bootstrap)
    assert "contains uncommitted changes" in output or "Clean, commit, or reclone" in output, output
  '';
}
```

- [ ] **Step 2: Run the rerun-safety test and confirm it fails for the right reason**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-bootstrap-reentry --no-link -L 2>&1 | tail -80
```

Expected: it fails because the current bootstrap script still hard-resets the checkout instead of refusing to overwrite dirty work.

- [ ] **Step 3: Add explicit clean-tree and ancestry checks to the bootstrap script**

Add a helper like this to `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`:

```bash
ensure_clean_repo_checkout() {
  if [ ! -d "$REPO_DIR/.git" ]; then
    log "Cloning $REPO_URL#$BRANCH into $REPO_DIR"
    run_as_root install -d -m 0755 /srv
    run_as_root git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
    return 0
  fi

  log "Refreshing existing checkout at $REPO_DIR"

  if [ -n "$(run_as_root git -C "$REPO_DIR" status --porcelain)" ]; then
    log "Existing checkout at $REPO_DIR contains uncommitted changes."
    log "Clean, commit, or reclone it before rerunning bootstrap."
    return 1
  fi

  current_branch="$(run_as_root git -C "$REPO_DIR" branch --show-current)"
  if [ "$current_branch" != "$BRANCH" ]; then
    log "Existing checkout at $REPO_DIR is on '$current_branch', expected '$BRANCH'."
    log "Switch branches manually before rerunning bootstrap."
    return 1
  fi

  run_as_root git -C "$REPO_DIR" fetch origin "$BRANCH"
  local_head="$(run_as_root git -C "$REPO_DIR" rev-parse HEAD)"
  remote_head="$(run_as_root git -C "$REPO_DIR" rev-parse "origin/$BRANCH")"

  if [ "$local_head" = "$remote_head" ]; then
    return 0
  fi

  if run_as_root git -C "$REPO_DIR" merge-base --is-ancestor "$local_head" "$remote_head"; then
    run_as_root git -C "$REPO_DIR" reset --hard "$remote_head"
    return 0
  fi

  log "Existing checkout at $REPO_DIR contains local commits or diverges from origin/$BRANCH."
  log "Rebase or reclone it before rerunning bootstrap."
  return 1
}
```

Then replace the current clone/fetch/reset block with:

```bash
ensure_clean_repo_checkout
```

- [ ] **Step 4: Rerun the dedicated VM test until it passes**

Run:

```bash
nix build .#checks.x86_64-linux.nixpi-bootstrap-reentry --no-link -L
```

Expected: exits 0; the second bootstrap run now fails deliberately with the guidance asserted by the test.

- [ ] **Step 5: Commit the rerun-safety change**

Run:

```bash
git add core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh tests/nixos/nixpi-bootstrap-reentry.nix tests/nixos/default.nix flake.nix
git commit -F - <<'EOF'
Prevent bootstrap reruns from destroying operator work in /srv/nixpi

Teach bootstrap to refuse dirty or diverged `/srv/nixpi` checkouts instead of
blindly hard-resetting them. This keeps reruns safe while still allowing clean
fast-forward refreshes from origin.

Constraint: `/srv/nixpi` is both the canonical checkout and the operator’s live working tree after bootstrap
Rejected: Keep unconditional hard reset | can silently delete uncommitted or divergent work
Confidence: high
Scope-risk: moderate
Reversibility: clean
Directive: Treat `/srv/nixpi` as operator-owned state once bootstrap has completed the first time
Tested: `nix build .#checks.x86_64-linux.nixpi-bootstrap-reentry --no-link -L`
Not-tested: Non-main branch bootstrap via explicit `NIXPI_REPO_BRANCH`; existing branch checks should still guard it
EOF
```

### Task 5: Align docs and operator guidance with the simplified host-owned model

**Files:**
- Modify: `README.md`
- Modify: `docs/install.md`
- Modify: `docs/operations/quick-deploy.md`
- Modify: `docs/operations/first-boot-setup.md`
- Modify: `docs/operations/index.md`
- Modify: `docs/operations/live-testing.md`
- Modify: `docs/architecture/runtime-flows.md`
- Test: `npm run docs:build`

- [ ] **Step 1: Update the root quick-start and install docs with the exact supported command**

Normalize `README.md` and `docs/install.md` to the same public bootstrap command and the same ownership language.

Use this exact command block:

```bash
nix --extra-experimental-features 'nix-command flakes' run github:alexradunet/nixpi#nixpi-bootstrap-vps
```

And describe bootstrap with wording equivalent to:

> Bootstrap keeps `/etc/nixos` as the host-owned system configuration, writes a minimal `/etc/nixos/flake.nix` that imports NixPI from `/srv/nixpi`, and applies the system with `sudo nixos-rebuild switch --flake /etc/nixos#nixos`.

- [ ] **Step 2: Rewrite the rerun warning and steady-state operation flow in `docs/operations/quick-deploy.md`**

Replace the existing destructive warning with guidance that matches the new safety behavior:

```md
> Warning: rerunning bootstrap on a host with a dirty or diverged `/srv/nixpi` checkout now stops with guidance instead of resetting that checkout automatically. Clean, commit, rebase, or reclone intentionally before rerunning bootstrap.
```

Also update the command block at the top of the page to include `--extra-experimental-features 'nix-command flakes'` so it matches the public install page exactly.

- [ ] **Step 3: Update first-boot, operations index, live testing, and architecture docs**

Ensure each page uses the same three ideas:

```md
- `/etc/nixos` is the host-owned rebuild root
- `/srv/nixpi` is the canonical NixPI checkout
- `sudo nixpi-rebuild` is the standard steady-state rebuild command
```

For `docs/architecture/runtime-flows.md`, revise the install/build flow section to say bootstrap is a small post-install bridge, not a provisioning framework.

- [ ] **Step 4: Build the docs site and confirm it passes**

Run:

```bash
npm run docs:build
```

Expected: exits 0 and writes the VitePress site without markdown or config errors.

- [ ] **Step 5: Commit the docs alignment**

Run:

```bash
git add README.md docs/install.md docs/operations/quick-deploy.md docs/operations/first-boot-setup.md docs/operations/index.md docs/operations/live-testing.md docs/architecture/runtime-flows.md
git commit -F - <<'EOF'
Align operator docs with the simplified host-owned NixOS bootstrap model

Update public install, operations, and architecture docs so they all describe the
same supported flow: bootstrap an already-installed NixOS host, keep `/etc/nixos`
host-owned, keep `/srv/nixpi` canonical, and use `nixpi-rebuild` for steady-state
updates.

Constraint: Public docs must match the actual supported bootstrap contract exactly or operators will use the wrong rebuild path
Rejected: Leave older architecture wording in place | creates split-brain documentation about bootstrap ownership
Confidence: high
Scope-risk: narrow
Reversibility: clean
Directive: Keep all public bootstrap docs synchronized when the operator contract changes
Tested: `npm run docs:build`
Not-tested: Manual rendering review in a browser
EOF
```

### Task 6: Run the full verification bundle and only then declare completion

**Files:**
- Verify: `flake.nix`
- Verify: `core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh`
- Verify: `core/scripts/nixpi-init-system-flake.sh`
- Verify: `tests/nixos/default.nix`
- Verify: `tests/nixos/nixpi-system-flake.nix`
- Verify: `tests/nixos/nixpi-vps-bootstrap.nix`
- Verify: `tests/nixos/nixpi-bootstrap-reentry.nix`
- Verify: `README.md`
- Verify: `docs/install.md`
- Verify: `docs/operations/quick-deploy.md`

- [ ] **Step 1: Run lint/static checks**

Run:

```bash
npm run check
bash -n core/os/pkgs/bootstrap/nixpi-bootstrap-vps.sh
bash -n core/scripts/nixpi-init-system-flake.sh
```

Expected: all commands exit 0.

- [ ] **Step 2: Run JS/unit coverage that guards operator-facing tooling**

Run:

```bash
npm run test:unit
```

Expected: exits 0; no extension or chat-server regressions.

- [ ] **Step 3: Run the focused Nix checks and VM tests**

Run:

```bash
nix build .#checks.x86_64-linux.bootstrap-script --no-link
nix build .#checks.x86_64-linux.system-flake-bootstrap --no-link
nix build .#checks.x86_64-linux.nixpi-system-flake --no-link -L
nix build .#checks.x86_64-linux.nixpi-vps-bootstrap --no-link -L
nix build .#checks.x86_64-linux.nixpi-bootstrap-reentry --no-link -L
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the repo’s full NixOS validation lane**

Run:

```bash
nix build .#checks.x86_64-linux.nixos-full --no-link -L
```

Expected: exits 0; the broader system test suite still passes after the bootstrap simplification.

- [ ] **Step 5: Inspect the final tree state before handoff**

Run:

```bash
git status --short
git log --oneline -n 6
```

Expected: only intended tracked changes remain; recent commits correspond to the tasks above.
