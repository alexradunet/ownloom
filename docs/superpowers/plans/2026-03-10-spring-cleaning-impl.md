# Spring Cleaning Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full codebase spring cleaning — fix security issues, architecture violations, oversized files, convention violations, missing tests, stale docs, and dead code.

**Architecture:** Phased approach. Security first (remove tracked secrets, pin images). Then structural fixes (move logic out of index.ts, purify lib/). Then file splits, convention fixes, tests, deps, docs, dead code. Each task is independent within its phase.

**Tech Stack:** TypeScript (strict, ES2022, NodeNext), Biome, Vitest, Podman/Quadlet, bash, YAML

**Spec:** `docs/superpowers/specs/2026-03-10-spring-cleaning-design.md`

---

## Chunk 1: Security + Dependencies

### Task 1: Remove `os/bib-config.toml` from git tracking (S1)

**Files:**
- Modify: `os/bib-config.toml` (remove from git index, keep on disk)
- Verify: `.gitignore` (already has entry at line 8)

- [ ] **Step 1: Remove from git index**

```bash
git rm --cached os/bib-config.toml
```

- [ ] **Step 2: Verify .gitignore already covers it**

```bash
grep 'bib-config' .gitignore
```

Expected: `os/bib-config.toml`

- [ ] **Step 3: Commit**

```bash
git add os/bib-config.toml  # stages the removal
git commit -m "fix(security): remove bib-config.toml from git tracking

File contains a plaintext password and was committed before
the .gitignore entry was added. Now properly untracked."
```

- [ ] **Step 4: Rotate the password in the local file**

Change the password in `os/bib-config.toml` to a new value. This is a local-only file now.

---

### Task 2: Pin upstream image tags (S2)

**Files:**
- Modify: `services/catalog.yaml:14,29`
- Modify: `services/matrix/quadlet/bloom-matrix.container:7`
- Modify: `services/dufs/quadlet/bloom-dufs.container:7`

- [ ] **Step 1: Look up current pinnable tags**

```bash
# Check what tags are available for continuwuity
podman search forgejo.ellis.link/continuwuation/continuwuity --list-tags --limit 20 2>/dev/null || echo "check manually"
# Check dufs
podman search docker.io/sigoden/dufs --list-tags --limit 20 2>/dev/null || echo "check manually"
```

Pick the latest stable version tag for each. If registry is unreachable, check the running containers or Docker Hub web UI.

- [ ] **Step 2: Update catalog.yaml**

In `services/catalog.yaml`, replace `:latest` with pinned versions for the two upstream images:
- Line 14: `forgejo.ellis.link/continuwuation/continuwuity:latest` → `forgejo.ellis.link/continuwuation/continuwuity:<pinned-version>`
- Line 29: `docker.io/sigoden/dufs:latest` → `docker.io/sigoden/dufs:<pinned-version>`

Leave `localhost/bloom-code-server:latest` (line 33) as-is — local builds are acceptable.

- [ ] **Step 3: Update Quadlet files to match**

In `services/matrix/quadlet/bloom-matrix.container:7`, update the `Image=` line to match the pinned tag from catalog.yaml.

In `services/dufs/quadlet/bloom-dufs.container:7`, update the `Image=` line to match.

- [ ] **Step 4: Commit**

```bash
git add services/catalog.yaml services/matrix/quadlet/bloom-matrix.container services/dufs/quadlet/bloom-dufs.container
git commit -m "fix(services): pin upstream image tags for matrix and dufs

Replaces :latest with specific version tags per service convention."
```

---

### Task 3: Upgrade Pi SDK packages (D1)

**Files:**
- Modify: `package.json:27`
- Modify: `os/Containerfile:69`

- [ ] **Step 1: Update package.json devDependencies**

In `package.json`, change:
- `"@mariozechner/pi-ai": "^0.55.4"` → `"@mariozechner/pi-ai": "^0.57.1"`
- `"@mariozechner/pi-coding-agent": "^0.55.4"` → `"@mariozechner/pi-coding-agent": "^0.57.1"`

- [ ] **Step 2: Update Containerfile ARG**

In `os/Containerfile:69`, change:
- `ARG PI_CODING_AGENT_VERSION=0.55.4` → `ARG PI_CODING_AGENT_VERSION=0.57.1`

- [ ] **Step 3: Install and verify**

```bash
npm install
npm run build
npm run test
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json os/Containerfile
git commit -m "chore(deps): upgrade Pi SDK to 0.57.1"
```

---

## Chunk 2: Architecture Violations

### Task 4: Move domain logic out of `bloom-topics/index.ts` (A1)

**Files:**
- Modify: `extensions/bloom-topics/index.ts` (lines 22-113 → slim wiring)
- Modify: `extensions/bloom-topics/actions.ts` (add handler function)
- Test: `tests/extensions/bloom-topics.test.ts` (create)

This is the most clear-cut violation — 90 lines of command handling logic in index.ts.

- [ ] **Step 1: Write the failing test**

Create `tests/extensions/bloom-topics.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { handleTopicCommand } from "../../extensions/bloom-topics/actions.js";

describe("handleTopicCommand", () => {
	it("returns usage for empty subcommand", () => {
		const result = handleTopicCommand("", null);
		expect(result).toEqual({ action: "notify", message: expect.stringContaining("Usage"), level: "info" });
	});

	it("returns error for /topic new without name", () => {
		const result = handleTopicCommand("new", null);
		expect(result).toEqual({ action: "notify", message: expect.stringContaining("Usage"), level: "warning" });
	});

	it("returns topic-start for /topic new with name", () => {
		const result = handleTopicCommand("new my-topic", null);
		expect(result).toEqual({
			action: "start",
			name: "my-topic",
			message: expect.stringContaining("my-topic"),
		});
	});

	it("returns error for /topic close with no active topic", () => {
		const result = handleTopicCommand("close", null);
		expect(result).toEqual({ action: "notify", message: expect.stringContaining("No active"), level: "warning" });
	});

	it("returns error for /topic switch without name", () => {
		const result = handleTopicCommand("switch", null);
		expect(result).toEqual({ action: "notify", message: expect.stringContaining("Usage"), level: "warning" });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/extensions/bloom-topics.test.ts
```

Expected: FAIL — `handleTopicCommand` not exported.

- [ ] **Step 3: Add `handleTopicCommand` to actions.ts**

In `extensions/bloom-topics/actions.ts`, add at the end:

```typescript
/** Result from topic command parsing. */
export type TopicCommandResult =
	| { action: "notify"; message: string; level: "info" | "warning" }
	| { action: "start"; name: string; message: string }
	| { action: "close"; name: string; branchPoint: string | undefined; message: string }
	| { action: "list"; topics: TopicInfo[] }
	| { action: "switch"; name: string; branchPoint: string | undefined };

/** Parse and handle /topic subcommands. Returns a result describing what to do. */
export function handleTopicCommand(args: string, ctx: ExtensionContext | null): TopicCommandResult {
	const parts = args.trim().split(/\s+/);
	const sub = parts[0] ?? "";
	const name = parts.slice(1).join(" ");

	switch (sub) {
		case "new": {
			if (!name) {
				return { action: "notify", message: "Usage: /topic new <name>", level: "warning" };
			}
			return {
				action: "start",
				name,
				message: `We are now focusing on a new topic: "${name}". Please keep your responses focused on this topic until it is closed.`,
			};
		}
		case "close": {
			const active = getActiveTopic(ctx);
			if (!active) {
				return { action: "notify", message: "No active topic to close.", level: "warning" };
			}
			return {
				action: "close",
				name: active.name,
				branchPoint: active.branchPoint,
				message: `The topic "${active.name}" is now closed. Please summarize what was discussed and accomplished, then return to the main conversation.`,
			};
		}
		case "list": {
			const topics = getTopics(ctx);
			return { action: "list", topics };
		}
		case "switch": {
			if (!name) {
				return { action: "notify", message: "Usage: /topic switch <name>", level: "warning" };
			}
			const topics = getTopics(ctx);
			const target = topics.find((t) => t.name === name);
			if (!target) {
				return { action: "notify", message: `Topic not found: ${name}`, level: "warning" };
			}
			return { action: "switch", name, branchPoint: target.branchPoint };
		}
		default:
			return { action: "notify", message: "Usage: /topic new <name> | close | list | switch <name>", level: "info" };
	}
}
```

Also export `TopicCommandResult` from `types.ts` if preferred, or keep inline.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/extensions/bloom-topics.test.ts
```

Expected: PASS

- [ ] **Step 5: Slim down index.ts**

Replace `extensions/bloom-topics/index.ts` lines 22-113 (the `registerCommand` block) with:

```typescript
import { buildTopicGuidance, getActiveTopic, getTopics, handleTopicCommand } from "./actions.js";

// ... (existing hooks stay)

pi.registerCommand("topic", {
	description: "Manage conversation topics: /topic new <name> | close | list | switch <name>",
	handler: async (args: string, ctx) => {
		lastCtx = ctx;
		const result = handleTopicCommand(args, lastCtx);

		switch (result.action) {
			case "notify":
				ctx.ui.notify(result.message, result.level);
				break;
			case "start": {
				const leaf = ctx.sessionManager.getLeafEntry();
				pi.appendEntry("bloom-topic", { name: result.name, status: "active", branchPoint: leaf?.id });
				ctx.ui.notify(`Topic started: ${result.name}`, "info");
				pi.sendUserMessage(result.message, { deliverAs: "followUp" });
				break;
			}
			case "close":
				pi.appendEntry("bloom-topic", { name: result.name, status: "closed", branchPoint: result.branchPoint });
				ctx.ui.notify(`Topic closed: ${result.name}`, "info");
				pi.sendUserMessage(result.message, { deliverAs: "followUp" });
				break;
			case "list": {
				if (result.topics.length === 0) {
					ctx.ui.notify("No topics found in this session.", "info");
				} else {
					const lines = result.topics.map((t) => `${t.status === "active" ? "* " : "  "}${t.name} [${t.status}]`);
					ctx.ui.notify(lines.join("\n"), "info");
				}
				break;
			}
			case "switch": {
				if (result.branchPoint) {
					const nav = await ctx.navigateTree(result.branchPoint, { summarize: true, label: `topic: ${result.name}` });
					if (nav.cancelled) {
						ctx.ui.notify(`Switch to topic "${result.name}" was cancelled.`, "warning");
						return;
					}
				}
				pi.appendEntry("bloom-topic", { name: result.name, status: "active", branchPoint: result.branchPoint });
				ctx.ui.notify(`Switched to topic: ${result.name}`, "info");
				break;
			}
		}
	},
});
```

- [ ] **Step 6: Run full test suite**

```bash
npm run test
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add extensions/bloom-topics/ tests/extensions/bloom-topics.test.ts
git commit -m "refactor(topics): move command logic from index.ts to actions.ts

index.ts now contains only Pi SDK wiring. Domain logic lives in
handleTopicCommand() which is pure and testable."
```

---

### Task 5: Move container routing out of `bloom-os/index.ts` (A3)

**Files:**
- Modify: `extensions/bloom-os/index.ts:53-71`
- Modify: `extensions/bloom-os/actions.ts` (add `handleContainer`)

- [ ] **Step 1: Add `handleContainer` to actions.ts**

At the end of `extensions/bloom-os/actions.ts`, add:

```typescript
/** Route container tool actions to the appropriate handler. */
export async function handleContainer(
	params: { action: string; service?: string; lines?: number },
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
) {
	const { action, service } = params;

	if (action === "status") {
		return handleContainerStatus(signal);
	}

	if (!service) {
		return errorResult(`The "${action}" action requires a service name.`);
	}
	const guard = guardBloom(service);
	if (guard) return errorResult(guard);

	if (action === "logs") {
		return handleContainerLogs(service, params.lines ?? 50, signal);
	}

	return handleContainerDeploy(service, signal, ctx);
}
```

- [ ] **Step 2: Update index.ts to use it**

In `extensions/bloom-os/index.ts`, add `handleContainer` to the imports from `./actions.js`, then replace lines 53-71 with:

```typescript
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
	return handleContainer(params, signal, ctx);
},
```

Remove the now-unused imports of `errorResult` and `guardBloom` from index.ts (they're used in actions.ts).

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/extensions/bloom-os.test.ts
npm run build
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-os/
git commit -m "refactor(os): move container routing from index.ts to actions.ts"
```

---

### Task 6: Move context assembly out of `bloom-persona/index.ts` (A4)

**Files:**
- Modify: `extensions/bloom-persona/index.ts:41-49`
- Modify: `extensions/bloom-persona/actions.ts` (add `buildRestoredContextBlock`)

- [ ] **Step 1: Add helper to actions.ts**

At the end of `extensions/bloom-persona/actions.ts`, add:

```typescript
/** Build the restored-context system prompt block from saved context. */
export function buildRestoredContextBlock(ctx: BloomContext): string {
	const lines = ["\n\n[RESTORED CONTEXT]"];
	if (ctx.activeTopic) lines.push(`Active topic: ${ctx.activeTopic}`);
	if (ctx.pendingChannels > 0) lines.push(`Pending channel responses: ${ctx.pendingChannels}`);
	if (ctx.updateAvailable) lines.push("OS update available — inform user if not already done.");
	lines.push(`Context saved at: ${ctx.savedAt}`);
	return lines.join("\n");
}
```

- [ ] **Step 2: Update index.ts**

In `extensions/bloom-persona/index.ts`, add `buildRestoredContextBlock` to the imports from `./actions.js`. Replace lines 41-49 with:

```typescript
if (restoredContext) {
	const ctx = restoredContext;
	restoredContext = null;
	systemPrompt += buildRestoredContextBlock(ctx);
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/extensions/bloom-persona.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-persona/
git commit -m "refactor(persona): move context block assembly to actions.ts"
```

---

### Task 7: Eliminate `lib/services.ts` barrel re-export (A5)

**Files:**
- Delete: `lib/services.ts`
- Modify: `extensions/bloom-services/actions-install.ts:9-18` (update imports)
- Modify: `extensions/bloom-services/actions-manifest.ts:9-17` (update imports)
- Modify: `extensions/bloom-services/actions-scaffold.ts` (update imports)
- Modify: `extensions/bloom-services/actions-test.ts` (update imports)
- Modify: `tests/lib/service-validation.test.ts` (update imports)
- Modify: `tests/lib/services.test.ts` (update imports)

- [ ] **Step 1: Identify all consumers**

Files importing from `../../lib/services.js` or `../../lib/services.js`:
1. `extensions/bloom-services/actions-install.ts`
2. `extensions/bloom-services/actions-manifest.ts`
3. `extensions/bloom-services/actions-scaffold.ts`
4. `extensions/bloom-services/actions-test.ts`
5. `tests/lib/service-validation.test.ts`
6. `tests/lib/services.test.ts`

- [ ] **Step 2: Update each consumer**

For each file, replace imports from `../../lib/services.js` with direct imports from the specific sub-module:

- Functions from `services-catalog.ts`: `loadServiceCatalog`, `servicePreflightErrors`
- Functions from `services-install.ts`: `buildLocalImage`, `detectRunningServices`, `downloadServiceModels`, `findLocalServicePackage`, `installServicePackage`
- Types/functions from `services-manifest.ts`: `Manifest`, `ManifestService`, `ServiceCatalogEntry`, `loadManifest`, `saveManifest`
- Functions from `services-validation.ts`: `commandCheckArgs`, `commandExists`, `commandMissingError`, `hasSubidRange`, `validatePinnedImage`, `validateServiceName`

Example — in `actions-install.ts`, replace:
```typescript
import { ... } from "../../lib/services.js";
```
with:
```typescript
import { loadServiceCatalog, servicePreflightErrors } from "../../lib/services-catalog.js";
import { buildLocalImage, downloadServiceModels, findLocalServicePackage, installServicePackage } from "../../lib/services-install.js";
import { loadManifest, saveManifest } from "../../lib/services-manifest.js";
import type { ServiceCatalogEntry } from "../../lib/services-manifest.js";
```

Do the same for each consumer, importing only what it uses from the specific sub-module.

- [ ] **Step 3: Delete barrel**

```bash
rm lib/services.ts
```

- [ ] **Step 4: Run build and tests**

```bash
npm run build
npm run test
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services.ts extensions/bloom-services/ tests/lib/
git commit -m "refactor(lib): remove services.ts barrel, import from sub-modules directly

Eliminates convention rule 13 violation (no barrel re-exports)."
```

---

### Task 8: Replace `process.env._BLOOM_DIR_RESOLVED` with explicit passing (A6)

**Files:**
- Modify: `extensions/bloom-garden/index.ts:32`
- Modify: `lib/filesystem.ts:19-21`

- [ ] **Step 1: Remove env mutation from bloom-garden**

In `extensions/bloom-garden/index.ts:32`, remove the line:
```typescript
process.env._BLOOM_DIR_RESOLVED = bloomDir;
```

- [ ] **Step 2: Simplify `getBloomDir()` in lib/filesystem.ts**

Replace lines 18-21 with:

```typescript
/** Resolve the Bloom directory. Checks `BLOOM_DIR` env var, then falls back to `~/Bloom`. */
export function getBloomDir(): string {
	return process.env.BLOOM_DIR ?? path.join(os.homedir(), "Bloom");
}
```

- [ ] **Step 3: Run tests**

```bash
npm run build
npm run test
```

Expected: All pass. Every caller of `getBloomDir()` already works without `_BLOOM_DIR_RESOLVED` since the fallback chain `BLOOM_DIR → ~/Bloom` is the standard path.

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-garden/index.ts lib/filesystem.ts
git commit -m "refactor(garden): remove process.env._BLOOM_DIR_RESOLVED mutation

getBloomDir() now uses only BLOOM_DIR env var or ~/Bloom fallback.
No hidden global state between extensions."
```

---

### Task 9: Extract I/O from `lib/services-install.ts` (A2)

**Files:**
- Modify: `lib/services-install.ts` (keep pure logic, remove I/O)
- Modify: `extensions/bloom-services/actions-install.ts` (absorb I/O orchestration)

Note: This is the most complex architecture task. The functions `installServicePackage`, `buildLocalImage`, and `downloadServiceModels` mix pure logic with I/O. The pure parts (path resolution, validation, payload construction) stay in lib/. The I/O parts (fs writes, podman calls) move to actions.

- [ ] **Step 1: Analyze what's pure vs I/O in each function**

In `lib/services-install.ts`:
- `findLocalServicePackage()` — reads fs → I/O, but it's a simple lookup. Keep in lib/ or move.
- `installServicePackage()` — heavy I/O (mkdirSync, writeFileSync, rmSync, run("npm"), run("cp")). Move I/O to actions.
- `buildLocalImage()` — runs `podman build`. Move to actions.
- `downloadServiceModels()` — runs `podman exec`. Move to actions.
- `detectRunningServices()` — runs `podman ps`. Move to actions.

- [ ] **Step 2: Move I/O functions to actions-install.ts**

Move `installServicePackage`, `buildLocalImage`, `downloadServiceModels`, and `detectRunningServices` from `lib/services-install.ts` to `extensions/bloom-services/actions-install.ts`. Keep `findLocalServicePackage` in lib/ (it's a simple lookup used by the install handler).

Update all imports accordingly. After this change, `lib/services-install.ts` should contain only `findLocalServicePackage`.

- [ ] **Step 3: Run build and tests**

```bash
npm run build
npm run test
```

- [ ] **Step 4: Commit**

```bash
git add lib/services-install.ts extensions/bloom-services/actions-install.ts
git commit -m "refactor(services): move I/O orchestration from lib/ to actions layer

lib/services-install.ts now contains only pure lookup logic.
Heavy I/O (fs writes, podman calls) lives in actions-install.ts."
```

---

## Chunk 3: File Splits

### Task 10: Split `bloom-channels/actions.ts` (F1)

**Files:**
- Create: `extensions/bloom-channels/pairing.ts`
- Create: `extensions/bloom-channels/channel-server.ts`
- Modify: `extensions/bloom-channels/actions.ts` (slim down)
- Modify: `extensions/bloom-channels/index.ts` (update imports)

- [ ] **Step 1: Extract pairing state**

Create `extensions/bloom-channels/pairing.ts` with the pairing functions (current lines 36-50):

```typescript
/** Pairing state management for channel authentication. */

const pairingState = new Map<string, string>();

export function getPairingData(channel: string): string | null {
	return pairingState.get(channel) ?? null;
}

export function setPairingData(channel: string, data: string): void {
	pairingState.set(channel, data);
}

export function clearPairingData(channel: string): void {
	pairingState.delete(channel);
}
```

- [ ] **Step 2: Extract channel server**

Create `extensions/bloom-channels/channel-server.ts` with `createChannelBridge` and its helper functions (current lines 19-438). Move all the constants, socket helpers, and the main `createChannelBridge` function. Import `getPairingData`, `setPairingData`, `clearPairingData` from `./pairing.js`.

- [ ] **Step 3: Slim down actions.ts**

`actions.ts` becomes a re-export file:
```typescript
export { clearPairingData, getPairingData, setPairingData } from "./pairing.js";
export { createChannelBridge, extractResponseText } from "./channel-server.js";
```

- [ ] **Step 4: Update index.ts imports if needed**

If index.ts imports directly from `./actions.js`, no change needed since actions.ts re-exports.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/extensions/bloom-channels.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add extensions/bloom-channels/
git commit -m "refactor(channels): split actions.ts into pairing.ts and channel-server.ts"
```

---

### Task 11: Split `bloom-repo/actions.ts` (F2)

**Files:**
- Create: `extensions/bloom-repo/actions-configure.ts`
- Create: `extensions/bloom-repo/actions-submit-pr.ts`
- Modify: `extensions/bloom-repo/actions.ts` (keep handleStatus, handleSync, getRepoDir)

- [ ] **Step 1: Extract handleConfigure**

Move `handleConfigure` (lines 23-121) to `actions-configure.ts` with its imports.

- [ ] **Step 2: Extract handleSubmitPr**

Move `handleSubmitPr` (lines 191-320) to `actions-submit-pr.ts` with its imports.

- [ ] **Step 3: Update index.ts imports**

Update `extensions/bloom-repo/index.ts` to import from the new files.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/extensions/bloom-repo.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add extensions/bloom-repo/
git commit -m "refactor(repo): split actions.ts into focused action files"
```

---

### Task 12: Split `bloom-services/actions-manifest.ts` (F3)

**Files:**
- Create: `extensions/bloom-services/actions-apply.ts`
- Modify: `extensions/bloom-services/actions-manifest.ts` (remove handleManifestApply)

- [ ] **Step 1: Extract handleManifestApply**

Move `handleManifestApply` (lines 162-320) to `actions-apply.ts` with its imports.

- [ ] **Step 2: Update index.ts**

Update the bloom-services index.ts to import `handleManifestApply` from `./actions-apply.js`.

- [ ] **Step 3: Run tests**

```bash
npm run build && npm run test
```

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-services/
git commit -m "refactor(services): extract handleManifestApply to actions-apply.ts"
```

---

### Task 13: Split `bloom-garden/actions.ts` (F4)

**Files:**
- Create: `extensions/bloom-garden/actions-blueprints.ts`
- Modify: `extensions/bloom-garden/actions.ts`

- [ ] **Step 1: Extract blueprint functions**

Move these functions to `actions-blueprints.ts`:
- `readBlueprintVersions` (lines 34-47)
- `writeBlueprintVersions` (lines 49-51)
- `hashContent` (lines 63-65)
- `blueprintDestPath` (lines 69-80)
- `seedFile` (lines 82-119)
- `seedBlueprints` (lines 121-154)
- `handleUpdateBlueprints` (lines 176-194)

Keep in `actions.ts`: `getPackageDir`, `getPackageVersion`, `ensureBloom`, `handleGardenStatus`, `handleSkillCreate`, `handleSkillList`, `handlePersonaEvolve`, `discoverSkillPaths`.

- [ ] **Step 2: Update imports in index.ts**

Import blueprint functions from `./actions-blueprints.js` instead of `./actions.js`.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/integration/garden-seeding.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-garden/
git commit -m "refactor(garden): extract blueprint logic to actions-blueprints.ts"
```

---

### Task 14: Split `bloom-os/actions.ts` (F5)

**Files:**
- Create: `extensions/bloom-os/actions-health.ts`
- Modify: `extensions/bloom-os/actions.ts`

- [ ] **Step 1: Extract handleSystemHealth**

Move `handleSystemHealth` (lines 189-261) to `actions-health.ts` with its imports.

- [ ] **Step 2: Update index.ts**

Import `handleSystemHealth` from `./actions-health.js`.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/extensions/bloom-os.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-os/
git commit -m "refactor(os): extract handleSystemHealth to actions-health.ts"
```

---

### Task 15: Split `bloom-objects/actions.ts` (F6)

**Files:**
- Create: `extensions/bloom-objects/actions-query.ts`
- Modify: `extensions/bloom-objects/actions.ts`

- [ ] **Step 1: Extract query functions**

Move `listObjects` (lines 181-238) and `searchObjects` (lines 113-142) to `actions-query.ts`.

- [ ] **Step 2: Update index.ts**

Import `listObjects` and `searchObjects` from `./actions-query.js`.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/extensions/bloom-objects.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-objects/
git commit -m "refactor(objects): extract query actions to actions-query.ts"
```

---

### Task 16: Extract STEP_GUIDANCE from `bloom-setup/actions.ts` (F7)

**Files:**
- Create: `extensions/bloom-setup/step-guidance.ts`
- Modify: `extensions/bloom-setup/actions.ts`

- [ ] **Step 1: Extract constant**

Move the `STEP_GUIDANCE` constant (lines 25-52) and the `StepName` type import to `step-guidance.ts`:

```typescript
import type { StepName } from "../../lib/setup.js";

/** Guidance text shown for each setup step. */
export const STEP_GUIDANCE: Record<StepName, string> = {
	// ... (existing content)
};
```

- [ ] **Step 2: Update actions.ts import**

```typescript
import { STEP_GUIDANCE } from "./step-guidance.js";
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/extensions/bloom-setup.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add extensions/bloom-setup/
git commit -m "refactor(setup): extract STEP_GUIDANCE to step-guidance.ts"
```

---

## Chunk 4: Convention Fixes

### Task 17: Fix shell shebangs (C1)

**Files:**
- Modify: `os/scripts/detect-display.sh:1`
- Modify: `os/scripts/start-sway.sh:1`

- [ ] **Step 1: Fix shebangs**

In both files, change line 1 from `#!/bin/bash` to `#!/usr/bin/env bash`.

- [ ] **Step 2: Commit**

```bash
git add os/scripts/detect-display.sh os/scripts/start-sway.sh
git commit -m "fix(shell): use portable shebangs in display scripts"
```

---

### Task 18: Fix `[ ]` to `[[ ]]` (C2)

**Files:**
- Modify: `os/sysconfig/bloom-update-check.sh:22,25`
- Modify: `os/scripts/detect-display.sh:11`

- [ ] **Step 1: Fix conditionals**

In `bloom-update-check.sh`:
- Line 22: `if [ -f "$STATUS_FILE" ]` → `if [[ -f "$STATUS_FILE" ]]`
- Line 25: `if [ "$AVAILABLE" = "true" ]` → `if [[ "$AVAILABLE" = "true" ]]`

In `detect-display.sh`:
- Line 11: `if [ -d /dev/dri ]` → `if [[ -d /dev/dri ]]`

- [ ] **Step 2: Commit**

```bash
git add os/sysconfig/bloom-update-check.sh os/scripts/detect-display.sh
git commit -m "fix(shell): use [[ ]] instead of [ ] for bash conditionals"
```

---

### Task 19: Add health check to bloom-dufs (C3)

**Files:**
- Modify: `services/dufs/quadlet/bloom-dufs.container`

- [ ] **Step 1: Add health check directives**

Add after the `LogDriver=journald` line:

```ini
HealthCmd=wget -qO- http://localhost:5000/ || exit 1
HealthInterval=30s
HealthRetries=3
HealthStartPeriod=10s
HealthTimeout=5s
```

- [ ] **Step 2: Commit**

```bash
git add services/dufs/quadlet/bloom-dufs.container
git commit -m "fix(dufs): add missing health check to Quadlet unit"
```

---

### Task 20: Add HealthTimeout to bloom-code-server (C4)

**Files:**
- Modify: `services/code-server/quadlet/bloom-code-server.container`

- [ ] **Step 1: Add HealthTimeout**

After `HealthStartPeriod=10s` (line 21), add:

```ini
HealthTimeout=5s
```

- [ ] **Step 2: Commit**

```bash
git add services/code-server/quadlet/bloom-code-server.container
git commit -m "fix(code-server): add missing HealthTimeout to Quadlet unit"
```

---

### Task 21: Create missing `types.ts` files (C5)

**Files:**
- Create: `extensions/bloom-display/types.ts`
- Modify: `extensions/bloom-display/actions.ts:181-188` (remove inline interface)
- Create: `extensions/bloom-objects/types.ts` (empty/minimal)
- Create: `extensions/bloom-repo/types.ts` (empty/minimal)
- Create: `extensions/bloom-services/types.ts` (empty/minimal)
- Create: `extensions/bloom-setup/types.ts` (empty/minimal)

- [ ] **Step 1: Create bloom-display/types.ts**

```typescript
/** Sway window tree node from `swaymsg -t get_tree`. */
export interface SwayNode {
	id: number;
	name: string | null;
	type: string;
	focused: boolean;
	nodes?: SwayNode[];
	floating_nodes?: SwayNode[];
}
```

- [ ] **Step 2: Update bloom-display/actions.ts**

Remove the inline `SwayNode` interface (lines 181-188). Add import:
```typescript
import type { SwayNode } from "./types.js";
```

- [ ] **Step 3: Create minimal types.ts for other extensions**

For `bloom-objects`, `bloom-repo`, `bloom-services`, `bloom-setup` — create a minimal file:

```typescript
/** Extension-specific types for bloom-{name}. */
// Types will be added here as the extension grows.
export {};
```

- [ ] **Step 4: Run tests**

```bash
npm run build && npm run test
```

- [ ] **Step 5: Commit**

```bash
git add extensions/bloom-display/ extensions/bloom-objects/types.ts extensions/bloom-repo/types.ts extensions/bloom-services/types.ts extensions/bloom-setup/types.ts
git commit -m "fix(extensions): add missing types.ts files per convention"
```

---

### Task 22: Remove decorative emojis from `docs/quick_deploy.md` (C6)

**Files:**
- Modify: `docs/quick_deploy.md`

- [ ] **Step 1: Remove emoji from headings**

Replace emoji-decorated headings with plain text:
- `## 💻 Option A` → `## Option A`
- `### 🚀 1) Install` → `### 1) Install`
- etc.

Keep the emoji legend reference at the top and the mermaid diagram as-is (the diagram uses emoji as functional markers).

- [ ] **Step 2: Commit**

```bash
git add docs/quick_deploy.md
git commit -m "fix(docs): remove decorative emojis from quick deploy headings"
```

---

### Task 23: Fix hardcoded path in bloom-display (C7)

**Files:**
- Modify: `extensions/bloom-display/actions.ts:164-165`

- [ ] **Step 1: Replace hardcoded path**

Replace:
```typescript
const scriptPath = join("/usr/local/share/bloom/os/scripts", "ui-tree.py");
```

With a path resolved relative to the package directory, following the same pattern as `bloom-garden/actions.ts`:

```typescript
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Navigate from extensions/bloom-display/ to os/scripts/
const scriptPath = join(__dirname, "../../os/scripts/ui-tree.py");
```

Note: If the script is installed to `/usr/local/share/bloom/os/scripts` in the OS image (via Containerfile), the runtime path IS the hardcoded one. In that case, use an environment variable with fallback:

```typescript
const BLOOM_SCRIPTS_DIR = process.env.BLOOM_SCRIPTS_DIR ?? "/usr/local/share/bloom/os/scripts";
const scriptPath = join(BLOOM_SCRIPTS_DIR, "ui-tree.py");
```

Choose whichever approach matches how the extension is deployed.

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/extensions/bloom-display.test.ts
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add extensions/bloom-display/actions.ts
git commit -m "fix(display): use configurable path instead of hardcoded script location"
```

---

## Chunk 5: Missing Tests

### Task 24: Add `bloom-garden.test.ts` (T1)

**Files:**
- Create: `tests/extensions/bloom-garden.test.ts`

- [ ] **Step 1: Write tests**

Test the pure action functions from `extensions/bloom-garden/actions.ts`:

```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ensureBloom,
	getPackageDir,
	handleGardenStatus,
	handleSkillCreate,
	handleSkillList,
} from "../../extensions/bloom-garden/actions.js";

describe("bloom-garden actions", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(os.tmpdir(), "bloom-garden-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("ensureBloom creates directory structure", () => {
		ensureBloom(tmpDir);
		expect(() => handleGardenStatus(tmpDir)).not.toThrow();
	});

	it("getPackageDir returns a valid path", () => {
		const dir = getPackageDir();
		expect(dir).toBeTruthy();
	});

	it("handleGardenStatus returns content", () => {
		ensureBloom(tmpDir);
		const result = handleGardenStatus(tmpDir);
		expect(result.content).toBeDefined();
		expect(result.content[0].text).toContain(tmpDir);
	});

	it("handleSkillCreate creates a skill file", () => {
		ensureBloom(tmpDir);
		const result = handleSkillCreate(tmpDir, {
			name: "test-skill",
			description: "A test skill",
			content: "Do the thing.",
		});
		expect(result.content[0].text).toContain("test-skill");
	});

	it("handleSkillList returns empty for fresh garden", () => {
		ensureBloom(tmpDir);
		mkdirSync(join(tmpDir, "Skills"), { recursive: true });
		const result = handleSkillList(tmpDir);
		expect(result.content).toBeDefined();
	});
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/extensions/bloom-garden.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/extensions/bloom-garden.test.ts
git commit -m "test(garden): add unit tests for garden actions"
```

---

### Task 25: Add `bloom-services.test.ts` (T2)

**Files:**
- Create: `tests/extensions/bloom-services.test.ts`

- [ ] **Step 1: Write tests**

Test the pure parts of bloom-services actions (e.g., `extractSkillMetadata` from `actions-install.ts`):

```typescript
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractSkillMetadata } from "../../extensions/bloom-services/actions-install.js";

describe("bloom-services actions", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(os.tmpdir(), "bloom-services-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("extractSkillMetadata returns empty for missing file", () => {
		const result = extractSkillMetadata(join(tmpDir, "nonexistent.md"));
		expect(result).toEqual({});
	});

	it("extractSkillMetadata extracts image and version", () => {
		const skillPath = join(tmpDir, "SKILL.md");
		writeFileSync(
			skillPath,
			`---
name: test-service
description: A test
image: docker.io/test/image:1.0
version: 1.0.0
---
Instructions here.`,
		);
		const result = extractSkillMetadata(skillPath);
		expect(result.image).toBe("docker.io/test/image:1.0");
		expect(result.version).toBe("1.0.0");
	});
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/extensions/bloom-services.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/extensions/bloom-services.test.ts
git commit -m "test(services): add unit tests for service extension actions"
```

---

### Task 26: Add `bloom-topics.test.ts` (T3)

Already created as part of Task 4. Verify it exists and passes.

- [ ] **Step 1: Verify**

```bash
npx vitest run tests/extensions/bloom-topics.test.ts
```

Expected: PASS (created in Task 4)

---

### Task 27: Add `bloom-audit.test.ts` (T4)

**Files:**
- Create: `tests/extensions/bloom-audit.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatEntries, handleAuditReview, readEntries } from "../../extensions/bloom-audit/actions.js";
import type { AuditEntry } from "../../extensions/bloom-audit/types.js";

describe("bloom-audit actions", () => {
	it("formatEntries formats tool_call entries", () => {
		const entries: AuditEntry[] = [
			{ ts: "2026-03-10T00:00:00Z", event: "tool_call", tool: "bash", input: { command: "ls" } } as AuditEntry,
		];
		const result = formatEntries(entries, true);
		expect(result).toContain("bash");
		expect(result).toContain("call");
	});

	it("formatEntries hides input when includeInputs is false", () => {
		const entries: AuditEntry[] = [
			{ ts: "2026-03-10T00:00:00Z", event: "tool_call", tool: "bash", input: { command: "secret" } } as AuditEntry,
		];
		const result = formatEntries(entries, false);
		expect(result).not.toContain("secret");
	});

	it("handleAuditReview returns empty message for no entries", () => {
		// Will return "No audit entries" since there's no real audit dir in test env
		const result = handleAuditReview({ days: 1 });
		expect(result.details.count).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/extensions/bloom-audit.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/extensions/bloom-audit.test.ts
git commit -m "test(audit): add unit tests for audit extension actions"
```

---

### Task 28: Add `lib/filesystem.test.ts` (T5)

**Files:**
- Create: `tests/lib/filesystem.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getBloomDir, safePath } from "../../lib/filesystem.js";

describe("safePath", () => {
	it("resolves valid subpath", () => {
		const result = safePath("/root", "sub", "file.txt");
		expect(result).toBe(path.resolve("/root/sub/file.txt"));
	});

	it("blocks path traversal", () => {
		expect(() => safePath("/root", "../etc/passwd")).toThrow("Path traversal blocked");
	});

	it("allows path equal to root", () => {
		expect(() => safePath("/root")).not.toThrow();
	});
});

describe("getBloomDir", () => {
	const original = process.env.BLOOM_DIR;

	afterEach(() => {
		if (original !== undefined) {
			process.env.BLOOM_DIR = original;
		} else {
			delete process.env.BLOOM_DIR;
		}
	});

	it("returns BLOOM_DIR when set", () => {
		process.env.BLOOM_DIR = "/custom/bloom";
		expect(getBloomDir()).toBe("/custom/bloom");
	});

	it("falls back to ~/Bloom", () => {
		delete process.env.BLOOM_DIR;
		expect(getBloomDir()).toBe(path.join(os.homedir(), "Bloom"));
	});
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/lib/filesystem.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/lib/filesystem.test.ts
git commit -m "test(lib): add unit tests for filesystem utilities"
```

---

## Chunk 6: Documentation + Dead Code

### Task 29: Update `ARCHITECTURE.md` lib/ layout (Doc1)

**Files:**
- Modify: `ARCHITECTURE.md:56`

- [ ] **Step 1: Update lib/ listing**

Replace the `services.ts` line (around line 56) with the actual sub-modules:

```markdown
  services-catalog.ts  # loadServiceCatalog, servicePreflightErrors
  services-install.ts  # findLocalServicePackage (pure lookup)
  services-manifest.ts # Manifest types, loadManifest, saveManifest
  services-validation.ts # validateServiceName, validatePinnedImage, commandExists
```

- [ ] **Step 2: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs(arch): update lib/ layout to reflect services sub-modules"
```

---

### Task 30: Document split actions convention (Doc2)

**Files:**
- Modify: `ARCHITECTURE.md` (Extension Structure > Rules section)

- [ ] **Step 1: Add note about split actions**

After rule 2 in the Extension Structure Rules section, add:

```markdown
   For extensions with 8+ tools, `actions.ts` may be split into focused files: `actions-{concern}.ts` (e.g., `actions-install.ts`, `actions-manifest.ts`). Each file handles a related group of tool actions. The `index.ts` imports from whichever action file defines the handler.
```

- [ ] **Step 2: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs(arch): document split actions-*.ts convention for large extensions"
```

---

### Task 31: Add SKILL.md for code-server service (Doc3)

**Files:**
- Create: `services/code-server/SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Follow the pattern from other services:

```markdown
---
name: code-server
description: Web-based code editor accessible via browser
---

## code-server

Browser-based VS Code instance for editing code on Bloom.

### Access

- URL: `http://<bloom-ip>:8443`
- Accessible via NetBird mesh network

### Management

- Start: `systemctl --user start bloom-code-server`
- Stop: `systemctl --user stop bloom-code-server`
- Logs: `journalctl --user -u bloom-code-server -f`
```

- [ ] **Step 2: Commit**

```bash
git add services/code-server/SKILL.md
git commit -m "docs(code-server): add missing SKILL.md"
```

---

### Task 32: Add transport.test.ts for element service (Doc4)

**Files:**
- Create: `services/element/tests/transport.test.ts`

- [ ] **Step 1: Create test file from template**

Follow the pattern from `services/_template/tests/transport.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("element transport", () => {
	it.todo("triggers onMessage when a message arrives from the transport");
	it.todo("sends a message via the transport");
});
```

- [ ] **Step 2: Commit**

```bash
git add services/element/tests/transport.test.ts
git commit -m "test(element): add transport.test.ts stub per template convention"
```

---

### Task 33: Simplify `commandCheckArgs` (DC1)

**Files:**
- Modify: `lib/services-validation.ts:54-63`

- [ ] **Step 1: Simplify the function**

Replace lines 54-63:

```typescript
/** Arguments used to verify a command exists. */
const COMMAND_CHECK_ARGS = ["--version"];

/** Return the arguments used to verify a command exists. */
export function commandCheckArgs(_cmd: string): string[] {
	return COMMAND_CHECK_ARGS;
}
```

Or even simpler — inline it in `commandExists`:

```typescript
export async function commandExists(cmd: string, signal?: AbortSignal): Promise<boolean> {
	if (!/^[a-zA-Z0-9._+-]+$/.test(cmd)) return false;
	const check = await run(cmd, ["--version"], signal);
	if (check.exitCode === 0) return true;
	return !commandMissingError(check.stderr || check.stdout);
}
```

If `commandCheckArgs` is exported and used elsewhere, keep the function but simplify the body. If only used by `commandExists`, inline it and remove the export.

- [ ] **Step 2: Check for other callers**

```bash
grep -r "commandCheckArgs" --include="*.ts" .
```

If only `commandExists` and tests use it, consider removing the export.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/lib/service-validation.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add lib/services-validation.ts
git commit -m "refactor(lib): simplify commandCheckArgs to constant"
```

---

## Final Verification

After all tasks are complete:

- [ ] **Full build**

```bash
npm run build
```

- [ ] **Full test suite**

```bash
npm run test
```

- [ ] **Biome check**

```bash
npm run check
```

- [ ] **Coverage check**

```bash
npm run test:coverage
```

All should pass with no regressions.
