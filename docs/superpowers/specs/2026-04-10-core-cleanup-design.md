# Core Cleanup Design

**Date:** 2026-04-10
**Status:** Approved

## Context

The `nixos_vps_provisioner/` boundary was extracted from `core/` over several recent commits. That extraction left behind dead code, empty package stubs, stale doc references, and test assertions that check for the absence of features that no longer exist anywhere in the codebase. This spec covers the cleanup pass.

The two provisioning steps are now:

1. **Day-0 — `nixos_vps_provisioner/`**: plain NixOS install via `plain-host-deploy` and the `ovh-vps-base` preset. Completely separate from NixPI.
2. **Day-1+ — `core/`**: NixPI bootstrap and runtime. Starts after the base host exists.

`core/` should contain only Day-1+ NixPI material. This cleanup removes the leftovers.

---

## A. Dead code to delete from `core/`

| Path | Reason |
|------|--------|
| `core/os/modules/install-finalize.nix` | Contains only a NixOS deprecation warning. Not imported by any module set. |
| `core/scripts/nixpi-install-finalize.sh` | Prints an error message and exits 1. No caller. |
| `core/os/pkgs/nixpi-deploy-ovh/` | Empty directory. Package was removed in a prior migration. |
| `core/os/pkgs/nixpi-setup-apply/` | Empty directory. Package was removed in a prior migration. |
| `core/os/pkgs/plain-host-deploy/` | Empty directory. Package moved to `nixos_vps_provisioner/pkgs/plain-host-deploy/`. |

None of these are imported, wired in `flake.nix`, or referenced by any active test or script on `main`.

---

## B. Doc fixes — three stale `nixpi-deploy-ovh` references

| File | Line | Change |
|------|------|--------|
| `docs/operations/live-testing.md` | 16 | Replace `nix run .#nixpi-deploy-ovh -- ...` with `nix run .#plain-host-deploy -- ...` |
| `docs/operations/live-testing.md` | 52 | Replace `The \`nixpi-deploy-ovh\` install completes` with `The \`plain-host-deploy\` install completes` |
| `docs/operations/first-boot-setup.md` | 13 | Replace `a completed plain-base install such as \`nixpi-deploy-ovh\`` with `a completed plain-base install via \`plain-host-deploy\`` |

---

## C. NixOS VM test assertions for removed features

Remove individual `fail` lines that test only that deleted commands or services are absent. These add no ongoing contract value — there is no code that could re-introduce them.

**`tests/nixos/nixpi-e2e.nix`** — remove:
```nix
nixpi.fail("command -v nixpi-setup-apply")
nixpi.fail("systemctl cat nixpi-install-finalize.service >/dev/null")
nixpi.fail("command -v nixpi-bootstrap-ensure-repo-target")
nixpi.fail("command -v nixpi-bootstrap-prepare-repo")
nixpi.fail("command -v nixpi-bootstrap-nixos-rebuild-switch")
```

**`tests/nixos/nixpi-firstboot.nix`** — remove:
```nix
nixpi.fail("command -v nixpi-setup-apply")
nixpi.fail("systemctl cat nixpi-install-finalize.service >/dev/null")
```

**`tests/nixos/nixpi-post-setup-lockdown.nix`** — remove:
```nix
nixpi.fail("command -v nixpi-setup-apply")
```

**`tests/nixos/nixpi-security.nix`** — remove:
```nix
steady.fail("command -v nixpi-setup-apply")
```

**`tests/nixos/nixpi-system-flake.nix`** — remove:
```nix
machine.fail("systemctl cat nixpi-install-finalize.service >/dev/null")
```

**Retain all other `fail` assertions** — `sudo -n true` (passwordless sudo), `/srv/nixpi` path, `/etc/nixos/flake.nix` presence, SSH config assertions, network/firewall assertions, `codex` command absence. These test current architecture invariants, not deleted features.

---

## D. Standards-guard `existsSync(...).toBe(false)` cleanup

Remove the nine file-existence negative assertions for paths that belong to permanently deleted features. Also remove the unused path variable declarations that only serve these assertions.

**Path variables to remove** (declared at top of file):
- `rebuildPullScriptPath` → `core/scripts/nixpi-rebuild-pull.sh`
- `rebuildPullPackagePath` → `core/os/pkgs/nixpi-rebuild-pull/default.nix`
- `reinstallOvhScriptPath` → `core/scripts/nixpi-reinstall-ovh.sh`
- `reinstallOvhPackagePath` → `core/os/pkgs/nixpi-reinstall-ovh/default.nix`
- `ovhBaseHostPath` → `core/os/hosts/ovh-base.nix`
- `ovhVpsHostPath` → `core/os/hosts/ovh-vps.nix`
- `ovhBaseConfigTestPath` → `tests/integration/ovh-base-config.test.ts`
- `reinstallOvhTestPath` → `tests/integration/nixpi-reinstall-ovh.test.ts`
- `ovhVpsConfigTestPath` → `tests/integration/ovh-vps-config.test.ts`

**Assertions to remove** (inside `"keeps only the host-owned bootstrap lane wired into the repo"`):
```ts
expect(existsSync(rebuildPullScriptPath)).toBe(false);
expect(existsSync(rebuildPullPackagePath)).toBe(false);
expect(existsSync(reinstallOvhScriptPath)).toBe(false);
expect(existsSync(reinstallOvhPackagePath)).toBe(false);
expect(existsSync(ovhBaseHostPath)).toBe(false);
expect(existsSync(ovhVpsHostPath)).toBe(false);
expect(existsSync(reinstallOvhTestPath)).toBe(false);
expect(existsSync(ovhVpsConfigTestPath)).toBe(false);
expect(existsSync(ovhBaseConfigTestPath)).toBe(false);
```

**Retain:**
- All `expect(flake).not.toContain(...)` assertions — these guard against re-wiring old Nix artifacts in `flake.nix`
- The `legacyBootstrapTerms` loop — guards doc *content* against old terminology
- All `absent` arrays in `hostOwnedBootstrapDocCases` — guard doc language contract
- All positive `existsSync(...).toBe(true)` assertions — confirm current required files exist

---

## What does NOT change

- `core/lib/`, `core/pi/`, `core/os/broker.ts` — all clean, no dead code
- `core/os/modules/` (minus `install-finalize.nix`) — all active NixPI modules
- `core/os/pkgs/` active packages: `app`, `broker`, `pi`, `nixpi-bootstrap-host`, `nixpi-rebuild`
- `core/os/hosts/vps.nix` — active NixPI host profile
- `core/scripts/nixpi-bootstrap-host.sh`, `nixpi-init-system-flake.sh`, `nixpi-rebuild.sh` — active
- Tests that verify absence of `/srv/nixpi`, old dot files, passwordless sudo, SSH restrictions — these test current invariants

---

## Self-review

**Placeholder scan:** No TBDs or incomplete sections.

**Internal consistency:** The four change categories are independent and can be applied in sequence without conflict.

**Scope check:** Focused on one cleanup pass. No new features. No architectural changes.

**Ambiguity check:** The retention list in Section D makes explicit which standards-guard assertions stay. No ambiguity about what "testing absence of deleted features" means vs "testing current architecture invariants".
