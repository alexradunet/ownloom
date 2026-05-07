import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function agentDir() {
  return join(process.env.HOME || "/tmp", ".pi", "agent");
}

export function currentHostName() {
  if (process.env.NIXPI_WIKI_HOST?.trim()) return process.env.NIXPI_WIKI_HOST.trim();
  try {
    const hostname = readFileSync("/etc/hostname", "utf-8").trim();
    if (hostname) return hostname;
  } catch {
    // Fall through to environment/default below.
  }
  if (process.env.HOSTNAME?.trim()) return process.env.HOSTNAME.trim();
  return "nixos";
}

export function nixpiRoot() {
  return process.env.NIXPI_ROOT ?? join(process.env.HOME || "/tmp", "NixPI");
}

export function nixpiFleetHosts() {
  const hostsDir = join(nixpiRoot(), "hosts");
  try {
    return readdirSync(hostsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(hostsDir, name, "default.nix")))
      .sort();
  } catch {
    return [];
  }
}

export function fleetHostContext() {
  const current = currentHostName();
  const hosts = nixpiFleetHosts();
  return {
    current,
    hosts,
    isFleetHost: hosts.includes(current),
  };
}

export function formatFleetHostStatus() {
  const context = fleetHostContext();
  const membership = context.isFleetHost ? "fleet" : "external";
  return `host: ${context.current} (${membership})`;
}

export function atomicWriteText(filePath: string, content: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}
