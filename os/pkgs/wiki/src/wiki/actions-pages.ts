import { mkdirSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "./lib/filesystem.ts";
import { stringifyFrontmatter } from "./lib/frontmatter.ts";
import { nowIso, ok } from "./lib/core-utils.ts";
import { appendEvent, loadRegistry } from "./actions-meta.ts";
import {
	buildPagePath,
	dedupeSlug,
	inferDomainFromFolder,
	normalizeAreas,
	normalizeDomain,
	normalizeHosts,
	normalizePageFolder,
	slugifyTitle,
	todayStamp,
} from "./paths.ts";
import type { ActionResult, CanonicalPageFrontmatter, CanonicalPageType, EnsurePageDetails } from "./types.ts";

// Decay defaults per type (used in handleEnsurePage). Kept inline for KISS.

interface EnsurePageParams {
	type: CanonicalPageType;
	title: string;
	aliases?: string[];
	tags?: string[];
	hosts?: string[];
	domain?: string;
	areas?: string[];
	folder?: string;
	summary?: string;
	body?: string;
	confidence?: string;
}

export function handleEnsurePage(wikiRoot: string, params: EnsurePageParams): ActionResult<EnsurePageDetails> {
	const registry = loadRegistry(wikiRoot);
	const normalizedTitle = params.title.trim().toLowerCase();
	const normalizedAliases = new Set((params.aliases ?? []).map((alias) => alias.trim().toLowerCase()));
	const normalizedDomain = normalizeDomain(params.domain);

	const normalizedFolder =
		normalizePageFolder(params.folder) ??
		(params.type === "daily-note" ? "daily" : "objects");
	const effectiveDomain = normalizedDomain ?? inferDomainFromFolder(normalizedFolder);

		const matches = registry.pages.filter((page) => {
			if (page.type !== params.type) return false;
			if (effectiveDomain && page.domain !== effectiveDomain) return false;
			if (normalizedFolder && page.folder !== normalizedFolder) return false;
			const names = [page.title, ...page.aliases].map((value) => value.trim().toLowerCase());
			return names.includes(normalizedTitle) || [...normalizedAliases].some((alias) => names.includes(alias));
	});

	if (matches.length > 1) {
		return ok({
			text: `Conflict: ${matches.length} pages matched "${params.title}". Candidates: ${matches.map((page) => page.path).join(", ")}`,
			details: {
				resolved: false,
				created: false,
				conflict: true,
				candidates: matches.map((page) => ({ path: page.path, title: page.title })),
			},
		});
	}

	if (matches.length === 1 && matches[0]) {
		const page = matches[0];
		return ok({
			text: `Resolved existing page: ${page.path}`,
			details: { resolved: true, created: false, conflict: false, path: page.path, title: page.title, type: page.type },
		});
	}

	const existingSlugs = registry.pages
		.filter((page) => page.type === params.type)
		.map((page) => path.basename(page.path, ".md"));
	const today = todayStamp();
	const slug = dedupeSlug(slugifyTitle(params.title), existingSlugs);
	const idPrefix = params.type;
	const id = `${idPrefix}/${slug}`;

	// v2 default folder: objects/ for all types except daily-note -> daily/
	const defaultFolder = params.type === "daily-note" ? "daily" : "objects";
	const folder = params.folder ?? normalizedFolder ?? defaultFolder;
	const relPath = folder === "objects" || folder === "daily"
		? `${folder}/${slug}.md`
		: buildPagePath(slug, folder);
	const absPath = path.join(wikiRoot, relPath);

	// v2 decay defaults
	const DECAY_DEFAULTS: Record<string, string> = {
		"daily-note": "fast", concept: "slow", source: "normal", person: "slow",
		project: "normal", area: "slow", decision: "slow", evolution: "normal",
		host: "slow", service: "slow", account: "normal", "financial-goal": "normal",
		"income-source": "normal", snapshot: "fast", dashboard: "slow",
		task: "fast", event: "fast", reminder: "fast", identity: "slow",
	};

	const fm: CanonicalPageFrontmatter = {
		id,
		type: params.type,
		title: params.title,
		...(params.tags?.length ? { tags: params.tags } : {}),
		...(params.hosts?.length ? { hosts: normalizeHosts(params.hosts) } : {}),
		...(effectiveDomain ? { domain: effectiveDomain } : {}),
		areas: normalizeAreas(params.areas),
		confidence: params.confidence ?? "medium",
		last_confirmed: today,
		decay: DECAY_DEFAULTS[params.type] ?? "normal",
		created: today,
		updated: today,
		summary: params.summary ?? `${params.title}.`,
	} as unknown as CanonicalPageFrontmatter;

	const skeleton = [
		`# ${params.title}`, "",
		"## Summary", "",
		"## Notes", "",
		"## Related", "",
	].join("\n");
	const body = params.body?.trim() ?? skeleton;

	mkdirSync(path.dirname(absPath), { recursive: true });
	atomicWriteFile(absPath, stringifyFrontmatter(fm, body));

	appendEvent(wikiRoot, {
		ts: nowIso(),
		kind: "page-create",
		title: `Created ${params.type}: ${params.title}`,
		pagePaths: [relPath],
	});

	return ok({
		text: `Created page: ${relPath}`,
		details: { resolved: true, created: true, conflict: false, path: relPath, title: params.title, type: params.type },
	});
}
