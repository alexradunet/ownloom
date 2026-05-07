#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWikiContext, callWikiTool } from "./tools/dispatcher.ts";
import { getToolManifestEntry, toolManifest } from "./tools/manifest.ts";
import { rebuildAllMeta } from "./wiki/actions-meta.ts";
import { getWikiRoot, getWorkspaceProfile, normalizeDomain } from "./wiki/paths.ts";
import { runSetupCopilot } from "./setup-copilot.ts";

function usage(exitCode = 0): never {
  const text = `nixpi-wiki — portable plain-Markdown LLM wiki CLI\n\nUsage:\n  nixpi-wiki list [--json]\n  nixpi-wiki describe <tool> [--json]\n  nixpi-wiki call <tool> [json-params | @file | -] [--json] [--yes]\n  nixpi-wiki mutate <tool> [json-params | @file | -] [--json]\n  nixpi-wiki init [--root <path>] [--workspace <name>] [--domain <domain>] [--json]\n  nixpi-wiki context [--format markdown|json]\n  nixpi-wiki setup-copilot [--root <path>] [--workspace <name>] [--domain <domain>]
  nixpi-wiki doctor [--domain <domain>] [--json]\n\nExamples:\n  nixpi-wiki list\n  nixpi-wiki call wiki_status '{"domain":"work"}'\n  echo '{"query":"memory","domain":"work"}' | nixpi-wiki call wiki_search - --json\n  nixpi-wiki mutate wiki_ingest '{"content":"note","channel":"journal"}'\n  nixpi-wiki init --root ~/NixPI/work-wiki --workspace work --domain work
  nixpi-wiki setup-copilot\n  nixpi-wiki context --format markdown\n  nixpi-wiki doctor\n`;
  console.error(text);
  process.exit(exitCode);
}


function subcommandUsage(command: string, exitCode = 0): never {
  const snippets: Record<string, string> = {
    list: `Usage: nixpi-wiki list [--json]

Show the available wiki tools. Human output is grouped by risk; --json returns the stable manifest array.`,
    describe: `Usage: nixpi-wiki describe <tool> [--json]

Show one tool manifest entry, including risk, mutation flags, and parameter metadata.`,
    call: `Usage: nixpi-wiki call <tool> [json-params | @file | -] [--json] [--yes]

Run a read-only or explicitly approved tool. Wiki mutations are refused unless --yes or NIXPI_WIKI_ALLOW_MUTATION=1 is provided. Prefer 'nixpi-wiki mutate <tool> ...' for intentional wiki writes.`,
    mutate: `Usage: nixpi-wiki mutate <tool> [json-params | @file | -] [--json]

Run a tool with wiki/cache mutation policy enabled. Use for intentional writes such as wiki_ingest, wiki_ensure_object, wiki_daily append, wiki_rebuild, or wiki_session_capture.`,
    init: `Usage: nixpi-wiki init [--root <path>] [--workspace <name>] [--domain <domain>] [--json]

Create an idempotent plain-Markdown wiki root from the bundled generic seed, create canonical folders, rebuild generated metadata, and print environment setup hints.`,
    context: `Usage: nixpi-wiki context [--format markdown|json] [--json]

Print the current host/wiki context for reuse by any LLM harness.`,
    doctor: `Usage: nixpi-wiki doctor [--domain <domain>] [--json]

Run a small local health check: wiki status, frontmatter lint, Node runtime, optional Git cleanliness, and optional body-search availability. JSON output includes remediation hints only for failing checks.`,
    "setup-copilot": `Usage: nixpi-wiki setup-copilot [--root <path>] [--workspace <name>] [--domain <domain>]

Initializes a NixPI Wiki root, sets persistent environment variables, and prints harness integration commands (Copilot plugin install, Pi skill auto-load, Agent Skills copy path).`,
  };
  console.error(snippets[command] ?? "Unknown subcommand.");
  process.exit(exitCode);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function commandOk(command: string, args: string[] = []): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
    return { ok: true, output: output.trim() };
  } catch (err: any) {
    return { ok: false, output: String(err?.stderr || err?.message || err) };
  }
}

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  remediation?: string;
}

interface InitStats {
  root: string;
  workspace: string;
  domain: string;
  seedDir: string;
  copiedFiles: number;
  skippedFiles: number;
  createdDirs: number;
  pages: number;
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function absolutePath(value: string): string {
  return path.resolve(expandHome(value));
}

function packageRootCandidate(): string | undefined {
  const scriptPath = process.argv[1];
  if (!scriptPath) return undefined;
  try {
    const realScriptPath = realpathSync(scriptPath);
    const scriptDir = path.dirname(realScriptPath);
    const basename = path.basename(scriptDir);
    if (basename === "dist" || basename === "src") return path.dirname(scriptDir);
    return scriptDir;
  } catch {
    return undefined;
  }
}

function findSeedDir(): string {
  const packageRoot = packageRootCandidate();
  const candidates = [
    packageRoot ? path.join(packageRoot, "seed") : undefined,
    path.resolve(process.cwd(), "seed"),
  ].filter((entry): entry is string => Boolean(entry));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "WIKI_SCHEMA.md")) && existsSync(path.join(candidate, "templates", "markdown"))) {
      return candidate;
    }
  }

  throw new Error(`Could not locate bundled NixPI wiki seed. Checked: ${candidates.join(", ")}`);
}

function ensureDirectory(dir: string): boolean {
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) throw new Error(`Path exists but is not a directory: ${dir}`);
    return false;
  }
  mkdirSync(dir, { recursive: true });
  return true;
}

function copySeedMissing(srcDir: string, destDir: string, stats: InitStats): void {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (ensureDirectory(dest)) stats.createdDirs += 1;
      copySeedMissing(src, dest, stats);
      continue;
    }
    if (!entry.isFile()) continue;
    if (existsSync(dest)) {
      stats.skippedFiles += 1;
      continue;
    }
    ensureDirectory(path.dirname(dest));
    copyFileSync(src, dest);
    stats.copiedFiles += 1;
  }
}

function writeFileIfMissing(filePath: string, content: string, stats: InitStats): void {
  if (existsSync(filePath)) {
    stats.skippedFiles += 1;
    return;
  }
  ensureDirectory(path.dirname(filePath));
  writeFileSync(filePath, content, "utf8");
  stats.copiedFiles += 1;
}

function canonicalWikiDirs(root: string): string[] {
  return [
    "pages/home",
    "pages/planner/tasks",
    "pages/planner/calendar",
    "pages/planner/reminders",
    "pages/planner/reviews",
    "pages/projects",
    "pages/areas",
    "pages/resources/knowledge",
    "pages/resources/people",
    "pages/resources/technical",
    "pages/sources",
    "pages/journal/daily",
    "pages/journal/weekly",
    "pages/journal/monthly",
    "pages/archives",
    "meta",
    "raw",
  ].map((relativePath) => path.join(root, relativePath));
}

function renderInitText(stats: InitStats): string {
  return [
    `Initialized NixPI wiki root: ${stats.root}`,
    `Seed: ${stats.seedDir}`,
    `Workspace hint: ${stats.workspace}`,
    `Default domain hint: ${stats.domain}`,
    `Files copied: ${stats.copiedFiles}; existing files kept: ${stats.skippedFiles}; directories created: ${stats.createdDirs}`,
    `Pages indexed: ${stats.pages}`,
    "",
    "Next shell setup:",
    `  export NIXPI_WIKI_ROOT=${JSON.stringify(stats.root)}`,
    `  export NIXPI_WIKI_WORKSPACE=${JSON.stringify(stats.workspace)}`,
    `  export NIXPI_WIKI_DEFAULT_DOMAIN=${JSON.stringify(stats.domain)}`,
    "",
    "Next checks:",
    "  nixpi-wiki context --format markdown",
    "  nixpi-wiki doctor --json",
  ].join("\n");
}

function runInit(args: string[]): void {
  const root = absolutePath(flagValue(args, "--root") ?? getWikiRoot());
  const workspace = flagValue(args, "--workspace") ?? process.env.NIXPI_WIKI_WORKSPACE ?? "nixpi";
  const domain = flagValue(args, "--domain") ?? process.env.NIXPI_WIKI_DEFAULT_DOMAIN ?? "technical";
  const seedDir = findSeedDir();

  const stats: InitStats = { root, workspace, domain, seedDir, copiedFiles: 0, skippedFiles: 0, createdDirs: 0, pages: 0 };
  if (ensureDirectory(root)) stats.createdDirs += 1;
  copySeedMissing(seedDir, root, stats);
  for (const dir of canonicalWikiDirs(root)) {
    if (ensureDirectory(dir)) stats.createdDirs += 1;
  }
  writeFileIfMissing(path.join(root, ".gitignore"), [
    "# NixPI Wiki generated metadata",
    "meta/registry.json",
    "meta/backlinks.json",
    "meta/index.md",
    "meta/log.md",
    "meta/fts.db",
    "",
  ].join("\n"), stats);

  const artifacts = rebuildAllMeta(root);
  stats.pages = artifacts.registry.pages.length;

  if (hasFlag(args, "--json")) console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
  else console.log(renderInitText(stats));
}

async function runDoctor(args: string[], json: boolean): Promise<void> {
  const checks: DoctorCheck[] = [];
  const domain = normalizeDomain(flagValue(args, "--domain")) ?? getWorkspaceProfile().defaultDomain;
  const repo = process.env.NIXPI_WIKI_REPO_ROOT ?? process.cwd();
  checks.push({ name: "runtime", ok: true, detail: `node ${process.version}` });
  checks.push({ name: "repo-root", ok: existsSync(repo), detail: repo, remediation: "Run from an existing workspace directory or set NIXPI_WIKI_REPO_ROOT." });

  const git = commandOk("git", ["-C", repo, "status", "--short"]);
  if (git.ok) {
    checks.push({ name: "git", ok: git.output.length === 0, detail: git.output || "clean", remediation: "Review, commit, stash, or revert local changes before expecting a clean doctor result." });
  } else {
    checks.push({ name: "git", ok: true, detail: "git unavailable or not a repository; skipped" });
  }

  const wikiStatus = await callWikiTool("wiki_status", { domain });
  checks.push({ name: "wiki-status", ok: !wikiStatus.isError, detail: wikiStatus.content[0]?.text.split("\n")[0] ?? "no output", remediation: `Run nixpi-wiki mutate wiki_rebuild '{"domain":"${domain}"}' and inspect NIXPI_WIKI_ROOT.` });
  const frontmatter = await callWikiTool("wiki_lint", { mode: "frontmatter", domain });
  checks.push({ name: "wiki-frontmatter", ok: !frontmatter.isError && /Lint: 0 issues/.test(frontmatter.content[0]?.text ?? ""), detail: frontmatter.content[0]?.text ?? "no output", remediation: `Run nixpi-wiki call wiki_lint '{"mode":"frontmatter","domain":"${domain}"}' --json and fix listed pages.` });

  const bodySearchBin = process.env.NIXPI_WIKI_BODY_SEARCH_BIN;
  if (bodySearchBin) {
    const bodySearch = commandOk(bodySearchBin, ["--version"]);
    checks.push({ name: "body-search", ok: bodySearch.ok, detail: bodySearch.ok ? bodySearch.output.split("\n")[0] || bodySearchBin : bodySearch.output, remediation: `Install or correct NIXPI_WIKI_BODY_SEARCH_BIN (${bodySearchBin}).` });
  } else {
    checks.push({ name: "body-search", ok: true, detail: "not configured; curation lint will fall back to local heuristics" });
  }

  const ok = checks.every((check) => check.ok);
  if (json) {
    const jsonChecks = checks.map((check) => check.ok ? { name: check.name, ok: check.ok, detail: check.detail } : check);
    console.log(JSON.stringify({ ok, checks: jsonChecks }, null, 2));
  } else {
    console.log(`NixPI wiki doctor: ${ok ? "ok" : "review"}`);
    for (const check of checks) {
      console.log(`- ${check.ok ? "ok" : "review"} ${check.name}: ${check.detail}`);
      if (!check.ok && check.remediation) console.log(`  remediation: ${check.remediation}`);
    }
  }
  if (!ok) process.exitCode = 2;
}

function parseJsonParams(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const source = value === "-"
    ? readFileSync(0, "utf8")
    : value.startsWith("@")
      ? readFileSync(value.slice(1), "utf8")
      : value;
  const trimmed = source.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool parameters must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help" || command === "-h") usage(0);

  if (command === "list") {
    if (hasFlag(args, "--help") || hasFlag(args, "-h")) subcommandUsage("list", 0);
    if (hasFlag(args, "--json")) {
      console.log(JSON.stringify(toolManifest, null, 2));
      return;
    }
    const groups = [
      { label: "Read tools", tools: toolManifest.filter((tool) => tool.risk === "read" && !tool.mutatesWiki && !tool.mutatesCache) },
      { label: "Wiki-write tools", tools: toolManifest.filter((tool) => tool.risk === "wiki-write" || tool.mutatesWiki) },
      { label: "Other write/high-impact tools", tools: toolManifest.filter((tool) => tool.risk !== "read" && tool.risk !== "wiki-write" && !tool.mutatesWiki) },
    ].filter((group) => group.tools.length > 0);
    for (const group of groups) {
      console.log(`${group.label}:`);
      for (const tool of group.tools) {
        const risk = tool.requiresConfirmation ? `${tool.risk}, confirm` : tool.risk;
        console.log(`  ${tool.name}\t${risk}\t${tool.description}`);
      }
    }
    return;
  }

  if (["describe", "call", "mutate", "init", "context", "doctor", "setup-copilot"].includes(command) && (hasFlag(args, "--help") || hasFlag(args, "-h"))) {
    subcommandUsage(command, 0);
  }

  if (command === "describe") {
    const name = args[1];
    if (!name) usage(1);
    const entry = getToolManifestEntry(name);
    if (!entry) throw new Error(`Unknown wiki tool: ${name}`);
    if (hasFlag(args, "--json")) console.log(JSON.stringify(entry, null, 2));
    else {
      console.log(`# ${entry.name}`);
      console.log(`Label: ${entry.label}`);
      console.log(`Risk: ${entry.risk}`);
      console.log(`Mutates wiki: ${entry.mutatesWiki ? "yes" : "no"}`);
      console.log(`Mutates cache: ${entry.mutatesCache ? "yes" : "no"}`);
      console.log(`Requires confirmation: ${entry.requiresConfirmation ? "yes" : "no"}`);
      console.log(`\n${entry.description}`);
      console.log(`\nParameters:\n${JSON.stringify(entry.parameters, null, 2)}`);
    }
    return;
  }

  if (command === "call" || command === "mutate") {
    const name = args[1];
    if (!name) usage(1);
    const entry = getToolManifestEntry(name);
    if (!entry) throw new Error(`Unknown wiki tool: ${name}`);
    const paramsArg = args.find((arg, index) => index >= 2 && !arg.startsWith("--"));
    const params = parseJsonParams(paramsArg);
    const wikiWrite = Boolean(entry.mutatesWiki);
    const envAllowsMutation = process.env.NIXPI_WIKI_ALLOW_MUTATION === "1";
    const envAllowsCacheMutation = process.env.NIXPI_WIKI_ALLOW_CACHE_MUTATION === "1" || envAllowsMutation;
    const allowMutation = command === "mutate" || hasFlag(args, "--yes") || envAllowsMutation;
    const allowCacheMutation = command === "mutate" || hasFlag(args, "--yes") || envAllowsCacheMutation;
    if ((wikiWrite || entry.requiresConfirmation || entry.risk === "system-write" || entry.risk === "high-impact") && !allowMutation) {
      throw new Error(`Refusing ${entry.risk} tool ${name} without mutation approval. Safe next step: use 'nixpi-wiki mutate ${name} ...' for intentional writes, or add --yes/NIXPI_WIKI_ALLOW_MUTATION=1 in a reviewed automation path.`);
    }
    if (entry.mutatesCache && !allowCacheMutation) {
      throw new Error(`Refusing cache-write tool ${name} without cache mutation approval. Safe next step: use 'nixpi-wiki mutate ${name} ...' or NIXPI_WIKI_ALLOW_CACHE_MUTATION=1.`);
    }
    const result = await callWikiTool(name, params, {
      policy: {
        allowMutation,
        allowCacheMutation,
        allowHighImpact: allowMutation,
      },
    });
    if (hasFlag(args, "--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.content.map((item) => item.text).join("\n"));
    }
    if (result.isError) process.exitCode = 2;
    return;
  }

  if (command === "init") {
    runInit(args);
    return;
  }

  if (command === "context") {
    const format = (flagValue(args, "--format") ?? (hasFlag(args, "--json") ? "json" : "markdown")) as "markdown" | "json";
    if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json");
    console.log(buildWikiContext(format));
    return;
  }

  if (command === "doctor") {
    await runDoctor(args, hasFlag(args, "--json"));
    return;
  }

  if (command === "setup-copilot") {
    await runSetupCopilot({
      root: flagValue(args, "--root"),
      workspace: flagValue(args, "--workspace"),
      domain: flagValue(args, "--domain"),
      host: flagValue(args, "--host"),
    });
    return;
  }

  usage(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
