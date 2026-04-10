# Runtime Refactor — Design Spec

**Date:** 2026-04-10
**Goal:** Final cleanup pass before VPS deploy and Pi self-management. Make the codebase smaller, clearer, more declarative, and more reliable — with no backwards compatibility shims.

---

## Motivation

The codebase is architecturally sound but has accumulated inconsistencies that make it harder to reason about:

- Four module-set variants in `module-sets.nix` that differ only by which modules are included — an imperative lookup table where declarative enable options should be
- `flake.nix` at 477 LOC with packages, checks, and host configs all in one file
- CIDR validation logic embedded inline in `network.nix` instead of in a library
- The `isError` flag pattern coexists with throw-based and raw content-return error handling across all extension actions — three patterns, no rule
- `safePath` is a one-line alias for `safePathWithin` with no added semantics
- `nixpi-bootstrap-host.sh` at 342 LOC does user setup, SSH, timezone, and flake init in one monolithic script
- Test files overlap (persona + guardrail tests), and some assertions test absence of already-removed features
- `nixpi.shell.enable` is not modeled as an option — shell inclusion is implicit in module-set choice

This pass rethinks all of these without preserving backwards compatibility. Pi will be self-managing after this; the codebase it inherits should be as readable and predictable as possible.

---

## Scope

**In scope:** `core/`, `tests/`, `flake.nix`, root config files, stale docs references.

**Out of scope:** `nixos_vps_provisioner/` (separate boundary), `docs/` VitePress site structure (stale reference cleanup only).

---

## Section 1: Nix Layer

### 1a. Delete `module-sets.nix` — replace with `mkEnableOption` per component

Each component module (`app.nix`, `broker.nix`, `shell.nix`, `tooling.nix`) gains a self-contained enable option:

```nix
# app.nix
{ lib, config, pkgs, ... }:
let cfg = config.nixpi.app; in
{
  options.nixpi.app.enable = lib.mkEnableOption "Pi agent app service";
  config = lib.mkIf cfg.enable { ... };
}
```

Defaults:
- `nixpi.app.enable` — default `true`
- `nixpi.broker.enable` — default `true`
- `nixpi.tooling.enable` — default `true`
- `nixpi.shell.enable` — default **`true`** (required for OVH KVM console access — operator must have a working login shell even when SSH is down)

`module-sets.nix` is deleted. No `mkRenamedOptionModule` shims.

Host configs set enable flags explicitly where they deviate from defaults.

### 1b. Flatten `options/` sub-files

The four files under `core/os/modules/options/` (`core.nix`, `security.nix`, `bootstrap.nix`, `agent.nix`, ~258 LOC total) are handled as follows:

- **Single-owner options** (used by exactly one module) move into that module's `options` block. `agent.nix` options → `app.nix`. `bootstrap.nix` options → `app.nix` (bootstrap is an app-layer concern).
- **Cross-cutting options** (`core.nix`: primaryUser, stateDir; `security.nix`: SSH allowlist, keys) are consolidated into a single `core/os/modules/options.nix` — one flat file, no sub-directory.

The `options/` directory is removed. The indirection layer (`options.nix` importing four sub-files) is replaced by a single flat `options.nix` (~130 LOC) covering only the cross-cutting options that multiple modules share.

### 1c. Decompose `flake.nix` with plain `import`

Per NixOS maintainer guidance (not the module system — use plain Nix constructs):

```
nix/
  pkgs.nix     # mkPackages function → returns package attrset
  checks.nix   # smoke / full / destructive check sets
  hosts.nix    # nixosConfigurations
flake.nix      # pure composition: inputs + calls into nix/*
```

`flake.nix` becomes ~50 LOC of input declarations and output wiring. Each extracted file is a function that takes the relevant inputs (self, nixpkgs, pkgs, etc.) and returns its output attrset.

### 1d. Extract CIDR validation to `core/os/lib/network.nix`

The 67 lines of inline `isValidIPv4CIDR` / `isValidIPv6CIDR` / `isValidSourceCIDR` logic move to:

```
core/os/lib/network.nix   # { lib }: { isValidSourceCIDR = ...; }
```

`network.nix` imports this and uses `netLib.isValidSourceCIDR`. The module itself contains only firewall rules, SSH config, and fail2ban — no embedded validators.

### 1e. No backwards compatibility

Deleted files stay deleted. Moved options stay moved. No aliasing, no shims, no `mkRemovedOptionModule` entries.

---

## Section 2: TypeScript Layer

### 2a. Adopt `neverthrow` for all extension boundaries

Add `neverthrow` as a dependency. All extension action functions return `Result<SuccessPayload, string>` using `ok(...)` and `err(...)`. The `isError` flag pattern is fully replaced.

```ts
import { ok, err, type Result } from "neverthrow";

export function createObject(params: ...): Result<ObjectPayload, string> {
  if (!isValid(params)) return err("invalid params: ...");
  return ok({ id, path });
}
```

Add `eslint-plugin-neverthrow` to enforce that no `Result` is silently dropped at call sites.

The mixed pattern (isError objects + throwing + raw content returns) is eliminated. One pattern, enforced by tooling.

### 2b. Remove `safePath` alias

`safePath` in `core/lib/filesystem.ts` is a one-line wrapper around `safePathWithin` with identical semantics. Delete `safePath`. Update all call sites to use `safePathWithin` directly.

### 2c. Standardize the actions split rule

**Rule:** Split an extension's actions into multiple files when a domain concern is independently testable and distinct in responsibility. Document the split reason with a single-line comment at the top of each file.

Current compliant example: `os/actions-health.ts` (health checks), `os/actions-proposal.ts` (nix config proposals), `os/actions.ts` (lifecycle operations).

Non-compliant extensions are updated to match: either consolidate into one file (if no meaningful split exists) or split by domain (if concerns are distinct).

Document this rule in `AGENTS.md` under the TypeScript section.

### 2d. `broker.ts` — no changes

The `BrokerRuntime` injection pattern is correct. The 426 LOC is appropriate. Leave it.

---

## Section 3: Shell Scripts

### `nixpi-bootstrap-host.sh` refactor

Split the 342 LOC monolith into sourced library phases:

```
core/scripts/
  nixpi-bootstrap-host.sh    # orchestrator only (~40 LOC)
  lib/
    bootstrap-user.sh        # primary user creation, sudo config
    bootstrap-ssh.sh         # SSH key injection, sshd hardening
    bootstrap-locale.sh      # timezone (UTC default), locale (en_US.UTF-8), no interactive prompt
    bootstrap-flake.sh       # /etc/nixos flake stub init
```

Each lib file:
- `set -euo pipefail` at top
- Only `local` variables inside functions
- Returns exit codes, no side-effect globals
- Single responsibility

The orchestrator sources all lib files and calls phase functions in sequence. Interactive keyboard/locale prompts are replaced with VPS-safe defaults (UTC, en_US.UTF-8) — no TTY assumption.

Existing `tests/integration/nixpi-bootstrap-host.test.ts` is updated to test phases individually.

---

## Section 4: Tests

### 4a. Consolidate overlapping test files

- Merge persona and standalone guardrail test files into `tests/extensions/persona.test.ts`, organized by hook: `session_start`, `before_agent_start`, `tool_call`, `session_before_compact`
- One test file per extension module, one per lib module — no exceptions

### 4b. Remove stale assertions

- Remove assertions that test the **absence** of already-removed features (NetBird, nixpi-deploy-ovh, install-finalize stubs)
- Remove redundant "returns content array" happy-path assertions that are now guaranteed by the `neverthrow` type system at the boundary

### 4c. Add `neverthrow` boundary tests

Each extension action that now returns `Result<T, string>` gets at least one `isErr()` test covering its primary failure path. This replaces the ad-hoc `isError` property checks.

---

## Section 5: Strip (no shims)

### Nix
- Delete `module-sets.nix`
- Delete `core/os/modules/options/` directory
- Remove commented-out dead config (e.g. `flake.nix` line 48 guardrail comment)

### TypeScript
- Delete `safePath` function and all references
- Remove any TTY/interactive detection fallback paths not reachable from a headless agent loop

### Shell
- Remove interactive keyboard/locale prompts from bootstrap script
- Replace with hardcoded VPS defaults

### Docs
- Grep for and remove stale references: NetBird, nixpi-deploy-ovh, install-finalize, nixpiBaseNoShell, nixpiBase
- Update any doc that references `module-sets.nix` or the old option structure

---

## Architecture After Refactor

```
core/os/
  lib/
    network.nix              # CIDR validation library
  modules/
    app.nix                  # nixpi.app.enable (default true)
    broker.nix               # nixpi.broker.enable (default true)
    shell.nix                # nixpi.shell.enable (default true, KVM-safe)
    tooling.nix              # nixpi.tooling.enable (default true)
    network.nix              # firewall + SSH config
    update.nix               # update timer
    options.nix              # flat cross-cutting options (primaryUser, stateDir, SSH allowlist)
    # options/ sub-directory gone
    # module-sets.nix gone

nix/
  pkgs.nix
  checks.nix
  hosts.nix
flake.nix                    # ~50 LOC composition

core/scripts/
  nixpi-bootstrap-host.sh    # ~40 LOC orchestrator
  lib/
    bootstrap-user.sh
    bootstrap-ssh.sh
    bootstrap-locale.sh
    bootstrap-flake.sh

core/lib/
  # safePath removed
  # neverthrow Result<T,E> at all extension boundaries
```

---

## Key Constraints

- **No backwards compatibility.** Moved options stay moved. Deleted files stay deleted.
- **OVH KVM access guaranteed.** `nixpi.shell.enable` defaults true. Bootstrap locale is non-interactive with VPS defaults.
- **One error pattern.** `neverthrow` everywhere in TypeScript extensions. Enforced by `eslint-plugin-neverthrow`.
- **Plain Nix for flake decomposition.** No module system wrapping the flake outputs.
- **Objects and episodes stay separate.** The append-only log → promotion flow is a meaningful distinction. Do not merge.
- **broker.ts untouched.** Already correct.
