import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { rebuildAllMeta } from "./wiki/actions-meta.ts";

type InitStats = {
  root: string;
  workspace: string;
  domain: string;
  seedDir: string;
  copiedFiles: number;
  skippedFiles: number;
  createdDirs: number;
  pages: number;
};

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
    if (existsSync(dest)) { stats.skippedFiles += 1; continue; }
    ensureDirectory(path.dirname(dest));
    copyFileSync(src, dest);
    stats.copiedFiles += 1;
  }
}

function writeFileIfMissing(filePath: string, content: string, stats: InitStats): void {
  if (existsSync(filePath)) { stats.skippedFiles += 1; return; }
  ensureDirectory(path.dirname(filePath));
  writeFileSync(filePath, content, "utf8");
  stats.copiedFiles += 1;
}

function canonicalWikiDirs(root: string): string[] {
  return [
    "pages/home", "pages/planner/tasks", "pages/planner/calendar",
    "pages/planner/reminders", "pages/planner/reviews", "pages/projects",
    "pages/areas", "pages/resources/knowledge", "pages/resources/people",
    "pages/resources/technical", "pages/sources", "pages/journal/daily",
    "pages/journal/weekly", "pages/journal/monthly", "pages/archives",
    "meta", "raw",
  ].map((p) => path.join(root, p));
}

function findSeedDir(): string {
  const scriptPath = process.argv[1];
  let packageRoot: string | undefined;
  if (scriptPath) {
    try {
      const realScriptPath = realpathSync(scriptPath);
      const scriptDir = path.dirname(realScriptPath);
      const basename = path.basename(scriptDir);
      if (basename === "dist" || basename === "src") packageRoot = path.dirname(scriptDir);
      else packageRoot = scriptDir;
    } catch { /* ignore */ }
  }
  const candidates = [
    packageRoot ? path.join(packageRoot, "seed") : undefined,
    path.resolve(process.cwd(), "seed"),
  ].filter((e): e is string => Boolean(e));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "WIKI_SCHEMA.md")) && existsSync(path.join(candidate, "templates", "markdown"))) {
      return candidate;
    }
  }
  throw new Error(`Could not locate bundled NixPI wiki seed. Checked: ${candidates.join(", ")}`);
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function absolutePath(value: string): string {
  return path.resolve(expandHome(value));
}

function commandOk(command: string, args: string[] = []): { ok: boolean; output: string } {
  try {
    const { execFileSync } = require("node:child_process");
    const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
    return { ok: true, output: output.trim() };
  } catch (err: any) {
    return { ok: false, output: String(err?.stderr || err?.message || err) };
  }
}

function prompt(question: string, defaultVal: string): Promise<string> {
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [${defaultVal}]: `, (answer: string) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pluginInstallCommand(): string {
  // Try to detect package location for local install fallback
  const scriptPath = process.argv[1];
  if (scriptPath) {
    try {
      const realScriptPath = realpathSync(scriptPath);
      const packageRoot = path.dirname(path.dirname(realScriptPath)); // dist/ -> package root
      if (existsSync(path.join(packageRoot, "plugin.json"))) {
        return `copilot plugin install ${packageRoot}`;
      }
    } catch { /* ignore */ }
  }
  return "copilot plugin install alexradunet/NixPI:os/pkgs/nixpi-wiki";
}

export async function runSetupCopilot(flags: { root?: string; workspace?: string; domain?: string; host?: string }): Promise<void> {
  const isWin = process.platform === "win32";
  const homeDir = os.homedir();
  const defaultRoot = path.join(homeDir, "NixPI", "work-wiki");

  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   NixPI Wiki — Setup                            ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log("This wizard will:");
  console.log("  1. Initialize the wiki root with seed files");
  console.log("  2. Set persistent environment variables");
  console.log("  3. Print harness integration commands");
  console.log("");

  const root = absolutePath(flags.root ?? await prompt("Wiki root path", defaultRoot));
  const workspace = flags.workspace ?? await prompt("Workspace name", "work");
  const domain = flags.domain ?? await prompt("Default domain", "work");
  const host = flags.host ?? await prompt("Host identity", isWin ? "windows-workstation" : os.hostname());

  // Step 1: Init wiki root
  console.log("");
  console.log("── Step 1: Initialize wiki root ──");
  const seedDir = findSeedDir();
  const initStats: InitStats = { root, workspace, domain, seedDir, copiedFiles: 0, skippedFiles: 0, createdDirs: 0, pages: 0 };
  if (ensureDirectory(root)) initStats.createdDirs += 1;
  copySeedMissing(seedDir, root, initStats);
  for (const dir of canonicalWikiDirs(root)) {
    if (ensureDirectory(dir)) initStats.createdDirs += 1;
  }
  writeFileIfMissing(path.join(root, ".gitignore"), [
    "# NixPI Wiki generated metadata",
    "meta/registry.json", "meta/backlinks.json", "meta/index.md", "meta/log.md", "",
  ].join("\n"), initStats);

  if (initStats.copiedFiles > 0 || initStats.createdDirs > 0) {
    const artifacts = rebuildAllMeta(root);
    initStats.pages = artifacts.registry.pages.length;
    console.log(`Initialized: ${initStats.copiedFiles} files copied, ${initStats.pages} pages indexed.`);
  } else {
    console.log(`Wiki root already initialized at ${root}`);
  }

  // Step 2: Set environment variables
  console.log("");
  console.log("── Step 2: Set environment variables ──");
  const envVars: Record<string, string> = {
    NIXPI_WIKI_ROOT: root,
    NIXPI_WIKI_WORKSPACE: workspace,
    NIXPI_WIKI_DEFAULT_DOMAIN: domain,
    NIXPI_WIKI_HOST: host,
  };

  if (isWin) {
    for (const [key, value] of Object.entries(envVars)) {
      const result = commandOk("setx", [key, value]);
      if (result.ok) console.log(`  Set ${key}=${value}`);
      else console.log(`  Failed to set ${key}: ${result.output}`);
    }
    console.log("");
    console.log("  Restart your shell for new env vars to take effect.");
  } else {
    const shellRcFiles = [".bashrc", ".zshrc", ".bash_profile", ".profile"];
    let written = false;
    const blockHeader = "# >>> nixpi-wiki >>>";
    const blockFooter = "# <<< nixpi-wiki <<<";
    const blockLines = Object.entries(envVars).map(([k, v]) => `export ${k}="${v}"`).join("\n");
    const block = `${blockHeader}\n${blockLines}\n${blockFooter}`;

    for (const rcFile of shellRcFiles) {
      const rcPath = path.join(homeDir, rcFile);
      if (!existsSync(rcPath)) continue;
      const content = readFileSync(rcPath, "utf8");
      const pattern = new RegExp(`${escapeRegex(blockHeader)}[\\s\\S]*?${escapeRegex(blockFooter)}`, "g");
      const updated = pattern.test(content)
        ? content.replace(pattern, block)
        : content.trimEnd() + "\n\n" + block + "\n";
      writeFileSync(rcPath, updated, "utf8");
      console.log(`  Updated ~/${rcFile}`);
      written = true;
      break;
    }
    if (!written) {
      console.log("  Could not find a shell rc file. Add these manually:");
      for (const [k, v] of Object.entries(envVars)) console.log(`    export ${k}="${v}"`);
    } else {
      console.log("  Run: source ~/<rcfile> or open a new shell.");
    }
  }

  // Step 3: Harness integration
  const pluginCmd = pluginInstallCommand();
  console.log("");
  console.log("── Step 3: Install wiki skill ──");
  console.log("");
  console.log("  GitHub Copilot CLI:");
  console.log(`    ${pluginCmd}`);
  console.log("");
  console.log("  Pi:         auto-loads via pi.skills in package.json");
  console.log("  Claude Code: copy skill/wiki/ → .claude/skills/wiki/");
  console.log("  Any Agent Skills harness:");
  console.log("               copy skill/wiki/ → .agents/skills/wiki/");
  console.log("");
  console.log("  Verify: /skills list  (should show 'wiki')");
  console.log("");
  console.log("── Done! ──");
  console.log("");
  console.log(`  Wiki root: ${root}`);
  console.log(`  Run: nixpi-wiki context --format markdown`);
  console.log("");
}
