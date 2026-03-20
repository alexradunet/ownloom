# Codebase Minimization Design

**Date:** 2026-03-20
**Status:** Approved

## Overview

Two independent changes that reduce file count and simplify the install flow:

1. Consolidate small TypeScript lib files by merging single-consumer modules into their callers or natural parent modules.
2. Replace the tar-based repo download in install docs with a proper `git clone` using a temporary `nix run`-provided git binary.

---

## Part 1: TypeScript lib consolidation

### Goal

Reduce `core/lib/` from 12 files to 8 by eliminating files that exist solely as thin wrappers with one consumer, or files small enough to inline without loss of clarity.

No behavior changes. All exported symbols remain identical — only file boundaries change.

### Changes

#### Delete `core/lib/room-alias.ts` (4 lines, 1 consumer)

Move `sanitizeRoomAlias` verbatim into `core/daemon/agent-supervisor.ts`. Remove the import.

#### Delete `core/lib/git.ts` (20 lines, 1 consumer)

Move `parseGithubSlugFromUrl` and `slugifyBranchPart` verbatim into `core/pi/extensions/os/actions-proposal.ts`. Remove the import.

#### Delete `core/lib/fs-utils.ts` → merge into `core/lib/filesystem.ts`

`filesystem.ts` already imports `safePathWithin` from `fs-utils.ts` internally. The remaining exports (`ensureDir`, `atomicWriteFile`) are added to `filesystem.ts`.

`core/pi/extensions/setup/actions.ts` updates its import from `../../../lib/fs-utils.js` → `../../../lib/filesystem.js`.

#### Delete `core/lib/interactions.ts` → merge into `core/lib/shared.ts`

`interactions.ts` (299 lines) has exactly one importer: `shared.ts`. The entire module body is appended to `shared.ts`. The `import { requestInteraction } from "./interactions.js"` line in `shared.ts` is removed.

### Remaining lib files (8)

| File | Role |
|------|------|
| `exec.ts` | Shell command execution |
| `extension-tools.ts` | Tool registration helpers (5 consumers — kept) |
| `filesystem.ts` | Path helpers, env-based dirs, atomic write |
| `frontmatter.ts` | YAML frontmatter parse/serialize |
| `interactions.ts` | _(deleted — merged into shared.ts)_ |
| `matrix-format.ts` | Matrix HTML rendering |
| `matrix.ts` | Matrix API operations |
| `room-alias.ts` | _(deleted — inlined)_ |
| `setup.ts` | Setup wizard state helpers |
| `shared.ts` | Logger, truncate, confirmation, interactions |

---

## Part 2: Install flow — git clone

### Goal

Replace the tar-based repo download with a proper `git clone` so the working directory retains an upstream remote reference, enabling `git pull` for later updates.

### Change

**File:** `docs/quick_deploy.md`, Step 2

**Before:**
```bash
curl -L https://github.com/alexradunet/nixpi/archive/refs/heads/main.tar.gz | tar xz -C ~
mv ~/nixpi-main ~/nixpi
cd ~/nixpi
```

**After:**
```bash
nix run nixpkgs#git -- clone https://github.com/alexradunet/nixpi.git ~/nixpi
cd ~/nixpi
```

`nix run nixpkgs#git` provides a temporary git binary from nixpkgs without permanent installation. The resulting `~/nixpi` clone has `origin` set to upstream, so `git pull` and `git log` work normally after the initial setup.

No changes to NixOS modules, services, or scripts.

---

## Testing

- All existing TypeScript unit and integration tests cover the same logic — no new tests required since no behavior changes.
- Manually verify: `nix run nixpkgs#git -- clone ...` works on a fresh NixOS install before updating docs.
- After Part 1: `npm run build` and `npm test` must pass without modification.
