# Spring Cleaning — Full Codebase Sweep

**Date:** 2026-03-10
**Scope:** Full sweep — security, architecture, file splits, tests, conventions, dependencies, documentation
**Sources:** latest-version-auditor, bloom-architect, code-clarity-enforcer, codebase explorer

---

## 1. Security (2 tasks)

### S1: Remove `os/bib-config.toml` from git history

The file contains a plaintext password (`Al3xandru@#`). It is in `.gitignore` but was committed before the ignore rule was added. Remove from tracking with `git rm --cached`, rotate the password, and verify it stays untracked.

### S2: Pin upstream image tags in `catalog.yaml` and Quadlet units

`forgejo.ellis.link/continuwuation/continuwuity:latest` and `docker.io/sigoden/dufs:latest` use unpinned tags. Pin to specific versions in both `services/catalog.yaml` and the corresponding Quadlet `.container` files. `localhost/` images are acceptable as `:latest` since they are local builds.

---

## 2. Architecture Violations (6 tasks)

### A1: Move domain logic out of `bloom-topics/index.ts`

~90 lines of `/topic` command handling (new, close, list, switch) live in `index.ts`. Extract to `actions.ts` with `index.ts` calling through as pure wiring.

### A2: Extract I/O from `lib/services-install.ts` to actions layer

`installServicePackage()`, `buildLocalImage()`, and `downloadServiceModels()` perform heavy I/O (writeFileSync, mkdirSync, rmSync, podman calls). Move I/O orchestration to `extensions/bloom-services/actions-install.ts`. Keep pure logic (path resolution, payload construction, validation) in lib/.

### A3: Move container routing out of `bloom-os/index.ts`

The `container` tool's execute handler has `if (action === "status")` branching, guard checking, and error formatting. Move to `actions.ts`.

### A4: Move context assembly out of `bloom-persona/index.ts`

The `before_agent_start` hook builds restored context strings with conditional logic. Move string assembly to `actions.ts`, call from hook.

### A5: Eliminate `lib/services.ts` barrel re-export

The barrel re-exports all 18 symbols from 4 sub-modules, violating convention rule 13. Delete `services.ts` and update all import paths to point to specific sub-modules (`services-catalog.ts`, `services-install.ts`, `services-manifest.ts`, `services-validation.ts`).

### A6: Replace `process.env._BLOOM_DIR_RESOLVED` with explicit passing

`bloom-garden/index.ts` mutates `process.env._BLOOM_DIR_RESOLVED` as a hidden communication channel to `lib/filesystem.ts`. Replace with explicit parameter passing or Pi extension context.

---

## 3. File Splits (7 tasks)

### F1: Split `bloom-channels/actions.ts` (438 lines)

Extract into:
- `pairing.ts` — `getPairingData`, `setPairingData`, `clearPairingData`
- `channel-server.ts` — `createChannelBridge` (socket helpers, heartbeat, rate-limiting)
- `actions.ts` — remaining handlers and re-exports

### F2: Split `bloom-repo/actions.ts` (320 lines)

Extract into:
- `actions-configure.ts` — `handleConfigure` (~80 lines)
- `actions-submit-pr.ts` — `handleSubmitPr` (~130 lines)
- `actions.ts` — remaining handlers

### F3: Split `bloom-services/actions-manifest.ts` (320 lines)

Extract `handleManifestApply` (~160 lines) into `actions-apply.ts`.

### F4: Split `bloom-garden/actions.ts` (288 lines)

Extract blueprint seeding logic (lines 67-154) into `actions-blueprints.ts`.

### F5: Split `bloom-os/actions.ts` (284 lines)

Extract `handleSystemHealth` (~70 lines) into `actions-health.ts`.

### F6: Split `bloom-objects/actions.ts` (238 lines)

Extract `listObjects` and `searchObjects` into `actions-query.ts`.

### F7: Extract `STEP_GUIDANCE` from `bloom-setup/actions.ts` (219 lines)

Move the 27-line guidance constant to a separate data file (`step-guidance.ts` or inline data structure).

---

## 4. Missing Tests (7 tasks)

### T1: Add `bloom-garden.test.ts`
Unit tests for garden actions (currently only integration test `garden-seeding.test.ts`).

### T2: Add `bloom-services.test.ts`
Unit tests for service extension actions.

### T3: Add `bloom-topics.test.ts`
Unit tests for topic actions (especially after A1 moves logic to actions.ts).

### T4: Add `bloom-audit.test.ts`
Unit tests for audit extension actions (currently only integration test `audit-rotation.test.ts`).

### T5: Add `lib/filesystem.test.ts`
Unit tests for `bloomDir()`, `safePath()`, and related utilities.

### T6: Add `lib/frontmatter.test.ts`
Unit tests for frontmatter parsing (currently only integration test `frontmatter-roundtrip.test.ts`).

### T7: Add `lib/git.test.ts`
Unit tests for `parseGithubSlug()` and related functions (currently tested indirectly via `bloom-repo.test.ts`).

---

## 5. Convention Fixes (7 tasks)

### C1: Fix shell shebangs

Change `#!/bin/bash` to `#!/usr/bin/env bash` in:
- `os/scripts/detect-display.sh`
- `os/scripts/start-sway.sh`

### C2: Fix `[ ]` to `[[ ]]` in `bloom-update-check.sh`

Lines 22, 25, and in `detect-display.sh` line 11.

### C3: Add health check to `bloom-dufs` Quadlet

Add `HealthCmd` directive to `services/dufs/quadlet/bloom-dufs.container`.

### C4: Add `HealthTimeout` to `bloom-code-server` Quadlet

Missing from `services/code-server/quadlet/bloom-code-server.container`.

### C5: Create missing `types.ts` files

Create `types.ts` for extensions that have inline type definitions:
- `bloom-display` — move `SwayNode` interface from `actions.ts:181-188`
- `bloom-objects`, `bloom-repo`, `bloom-services`, `bloom-setup` — create minimal files or document exemption

### C6: Remove decorative emojis from `docs/quick_deploy.md`

Remove emoji from headings. Keep only functional emoji defined in LEGEND.md where they serve as severity/status indicators.

### C7: Fix hardcoded path in `bloom-display/actions.ts:165`

Replace `/usr/local/share/bloom/os/scripts` with a path resolved relative to the package or via an environment variable.

---

## 6. Dependencies (1 task)

### D1: Upgrade Pi SDK packages

Update `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent` from `^0.55.4` to `^0.57.1` in `package.json` devDependencies. Also update the pinned version in `os/Containerfile` ARG `PI_CODING_AGENT_VERSION`.

---

## 7. Documentation (4 tasks)

### Doc1: Update `ARCHITECTURE.md` lib/ layout

Document the `services-*.ts` sub-module pattern and barrel re-export removal.

### Doc2: Document split actions convention

Add a note in ARCHITECTURE.md that extensions with 8+ tools may split into `actions-*.ts` files.

### Doc3: Add `SKILL.md` for code-server service

Every other service has one; code-server is missing it.

### Doc4: Add `transport.test.ts` for element service

Template prescribes both `transport.test.ts` and `utils.test.ts`; element only has the latter.

---

## 8. Dead Code (1 task)

### DC1: Simplify `commandCheckArgs()` in `lib/services-validation.ts`

The function always returns `["--version"]` regardless of input. Simplify to a constant or inline.

---

## Execution Order

**Phase 1 — Security (S1, S2)** — do first, no dependencies
**Phase 2 — Architecture (A1-A6)** — structural fixes before splits
**Phase 3 — File Splits (F1-F7)** — depends on A1-A5 being done
**Phase 4 — Convention Fixes (C1-C7)** — independent, parallelizable
**Phase 5 — Tests (T1-T7)** — depends on splits being done (test the new structure)
**Phase 6 — Dependencies (D1)** — independent
**Phase 7 — Documentation (Doc1-Doc4)** — depends on A5, splits
**Phase 8 — Dead Code (DC1)** — independent

Total: **35 tasks** across 8 phases.
