// Stable source-level TypeScript API for in-repo adapters that embed Ownloom Wiki.
// Keep deployment-specific and client-specific policy outside this module.

export {
	buildWikiContext,
	buildWikiContextPrompt,
	callWikiTool,
	type CallToolOptions,
} from "./tools/dispatcher.ts";
export {
	getToolManifestEntry,
	toolManifest,
	type ToolManifestEntry,
	type ToolRisk,
} from "./tools/manifest.ts";

// v2 actions
export { handleDailyAppend, handleDailyGet } from "./wiki/actions-daily.ts";
export { handleDecayPass } from "./wiki/actions-decay.ts";
export { handleIngest, stripSecrets } from "./wiki/actions-ingest.ts";
export { handleWikiLint } from "./wiki/actions-lint.ts";
export {
	buildBacklinks,
	buildRegistry,
	buildWikiDigest,
	handleWikiStatus,
	loadRegistry,
	readEvents,
	rebuildAllMeta,
	scanPages,
	type WikiDigestOptions,
} from "./wiki/actions-meta.ts";
export { handleEnsurePage } from "./wiki/actions-pages.ts";
export { handleWikiSearch, searchRegistry } from "./wiki/actions-search.ts";

export {
	appliesToHost,
	formatAreasSuffix,
	formatDomainSuffix,
	formatHostsSuffix,
	getCurrentHost,
	getWikiRoot,
	getWikiRootForDomain,
	getWikiRoots,
	getWorkspaceProfile,
	isProtectedPath,
	isWikiPagePath,
	normalizeAreas,
	normalizeDomain,
	normalizeHosts,
	normalizeWikiLink,
	todayStamp,
} from "./wiki/paths.ts";
export { atomicWriteFile, ensureDir } from "./wiki/lib/filesystem.ts";
export { parseFrontmatter, stringifyFrontmatter } from "./wiki/lib/frontmatter.ts";
export { err, nowIso, ok, type ActionResult } from "./wiki/lib/core-utils.ts";
export { EmptyToolParams, errorResult, textToolResult, toToolResult, truncate } from "./wiki/lib/utils.ts";
export * from "./wiki/types.ts";
