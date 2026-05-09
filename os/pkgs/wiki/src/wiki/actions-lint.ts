/**
 * wiki_lint — 4 strict structural modes only.
 *
 * Modes:
 *   links            — broken [[wikilinks]]
 *   frontmatter      — missing required fields per type
 *   duplicates       — objects with same slug or same title+type
 *   supersedes-cycles — circular supersession chains
 *   strict (default) — all 4 above
 */
import path from "node:path";
import { err, ok } from "./lib/core-utils.ts";
import { buildBacklinks, buildRegistry, scanPages } from "./actions-meta.ts";
import { normalizeWikiLink } from "./paths.ts";
import { REQUIRED_FRONTMATTER_FIELDS } from "./rules.ts";
import type { ActionResult, LintDetails, LintIssue, RegistryData } from "./types.ts";
import type { LintMode } from "./rules.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

function issue(pagePath: string, message: string): LintIssue {
  return { kind: "structural", severity: "error", path: pagePath, message };
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v) return [v];
  return [];
}

const VALID_LINT_MODES = new Set<LintMode>(["links", "frontmatter", "duplicates", "supersedes-cycles", "strict"]);

// ── 1. links ─────────────────────────────────────────────────────────────────

function lintLinks(pages: ReturnType<typeof scanPages>, registry: RegistryData): LintIssue[] {
  const knownPaths = new Set(registry.pages.map((p) => p.path));
  const issues: LintIssue[] = [];

  for (const page of pages) {
    for (const raw of page.rawLinks) {
      const resolved = normalizeWikiLink(raw);
      if (!resolved) continue;
      if (!knownPaths.has(resolved)) {
        issues.push(issue(page.relativePath, `Broken wikilink: [[${raw}]] → ${resolved} not found`));
      }
    }
  }
  return issues;
}

// ── 2. frontmatter ───────────────────────────────────────────────────────────

function lintFrontmatter(pages: ReturnType<typeof scanPages>): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const page of pages) {
    const fm = page.frontmatter as Record<string, unknown>;
    const type = asString(fm.type);
    if (!type) {
      issues.push(issue(page.relativePath, "Missing required field: type"));
      continue;
    }

    const required = (REQUIRED_FRONTMATTER_FIELDS as Record<string, readonly string[]>)[type];
    if (!required) continue; // unknown type — no schema to validate against

    for (const field of required) {
      const val = fm[field];
      if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
        issues.push(issue(page.relativePath, `Missing required field: ${field}`));
      }
    }
  }
  return issues;
}

// ── 3. duplicates ─────────────────────────────────────────────────────────────

function lintDuplicates(registry: RegistryData): LintIssue[] {
  const issues: LintIssue[] = [];

  // Duplicate slugs within the same folder. Cross-folder date slugs are valid
  // in v2 (for example daily/YYYY-MM-DD.md and sources/web/YYYY-MM-DD.md).
  const slugMap = new Map<string, string[]>();
  for (const p of registry.pages) {
    const slug = path.basename(p.path, ".md").toLowerCase();
    const key = `${p.folder}:${slug}`;
    const arr = slugMap.get(key) ?? [];
    arr.push(p.path);
    slugMap.set(key, arr);
  }
  for (const [key, paths] of slugMap) {
    if (paths.length > 1) {
      const slug = key.slice(key.indexOf(":") + 1);
      issues.push(issue(paths[0], `Duplicate slug "${slug}" across: ${paths.join(", ")}`));
    }
  }

  // Duplicate title+type combinations
  const titleTypeMap = new Map<string, string[]>();
  for (const p of registry.pages) {
    if (!p.title || !p.type) continue;
    const key = `${p.type}:${p.title.toLowerCase().trim()}`;
    const arr = titleTypeMap.get(key) ?? [];
    arr.push(p.path);
    titleTypeMap.set(key, arr);
  }
  for (const [key, paths] of titleTypeMap) {
    if (paths.length > 1) {
      issues.push(issue(paths[0], `Duplicate title+type "${key}" across: ${paths.join(", ")}`));
    }
  }

  return issues;
}

// ── 4. supersedes-cycles ─────────────────────────────────────────────────────

function lintSupersedesCycles(registry: RegistryData): LintIssue[] {
  const issues: LintIssue[] = [];
  const idToPath = new Map(registry.pages.map((p) => [p.id, p.path]));

  for (const page of registry.pages) {
    const supersedes = (page as unknown as Record<string, unknown>).supersedes as string | undefined;
    if (!supersedes) continue;

    // Walk the chain and detect cycles
    const visited = new Set<string>([page.id ?? page.path]);
    let current = supersedes;
    let depth = 0;
    while (current && depth < 20) {
      if (visited.has(current)) {
        issues.push(issue(page.path, `Supersession cycle detected involving: ${current}`));
        break;
      }
      visited.add(current);
      const nextPath = idToPath.get(current);
      if (!nextPath) break;
      const nextPage = registry.pages.find((p) => p.path === nextPath);
      current = (nextPage as unknown as Record<string, unknown>)?.supersedes as string ?? "";
      depth++;
    }
  }
  return issues;
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export function handleWikiLint(wikiRoot: string, mode?: LintMode | string): ActionResult<LintDetails> {
  const pages = scanPages(wikiRoot);
  const registry = buildRegistry(pages);

  const m = mode ?? "strict";
  if (!VALID_LINT_MODES.has(m as LintMode)) {
    return err(`Unknown lint mode: ${m}. Expected one of: ${[...VALID_LINT_MODES].join(", ")}.`);
  }

  let linkIssues: LintIssue[] = [];
  let fmIssues: LintIssue[] = [];
  let dupIssues: LintIssue[] = [];
  let cycleIssues: LintIssue[] = [];

  const runLinks = m === "strict" || m === "links";
  const runFm = m === "strict" || m === "frontmatter";
  const runDup = m === "strict" || m === "duplicates";
  const runCycles = m === "strict" || m === "supersedes-cycles";

  if (runLinks) linkIssues = lintLinks(pages, registry);
  if (runFm) fmIssues = lintFrontmatter(pages);
  if (runDup) dupIssues = lintDuplicates(registry);
  if (runCycles) cycleIssues = lintSupersedesCycles(registry);

  const all = [...linkIssues, ...fmIssues, ...dupIssues, ...cycleIssues];

  const text = [
    `Lint: ${all.length} issues`,
    `  links=${linkIssues.length}`,
    `  frontmatter=${fmIssues.length}`,
    `  duplicates=${dupIssues.length}`,
    `  supersedes-cycles=${cycleIssues.length}`,
    ...(all.length > 0 ? ["", "Issues:"] : []),
    ...all.slice(0, 40).map((i) => `  ${i.path}: ${i.message}`),
    ...(all.length > 40 ? [`  ... and ${all.length - 40} more`] : []),
  ].join("\n");

  return (ok({
    text,
    details: {
      counts: {
        total: all.length,
        brokenLinks: linkIssues.length,
        orphans: 0,
        frontmatter: fmIssues.length,
        duplicates: dupIssues.length,
        coverage: 0,
        staleness: 0,
        staleReviews: 0,
        emptySummary: 0,
        duplicateIds: 0,
        unresolvedIds: 0,
        thinContent: 0,
        crossrefGaps: 0,
        contradictionReview: 0,
        missingConcepts: 0,
      },
      issues: all,
    },
  }) as unknown) as ActionResult<LintDetails>;
}
