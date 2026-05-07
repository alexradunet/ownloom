import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";

export type SavedContext = { savedAt: string; host?: string; cwd?: string };

function firstEnv(...names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name];
		if (value?.trim()) return value.trim();
	}
	return undefined;
}

function homeDir(): string {
	return firstEnv("NIXPI_HOME", "HOME", "USERPROFILE") ?? os.homedir();
}

function agentDir(): string {
	return firstEnv("NIXPI_AGENT_DIR") ?? join(homeDir(), ".pi", "agent");
}

function contextPath(): string {
	return join(agentDir(), "context.json");
}

export function readText(filePath: string): string | null {
	return existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
}

function readJson<T>(filePath: string): T | null {
	try {
		const raw = readText(filePath);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeJson(filePath: string, value: unknown): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function saveContext(data: SavedContext): void {
	writeJson(contextPath(), data);
}

export function loadContext(): SavedContext | null {
	return readJson<SavedContext>(contextPath());
}

export function restoredContextBlock(data: SavedContext): string {
	const lines = ["\n\n[RESTORED CONTEXT]"];
	lines.push(`Saved at: ${data.savedAt}`);
	if (data.host) lines.push(`Previous host: ${data.host}`);
	if (data.cwd) lines.push(`Previous cwd: ${data.cwd}`);
	return lines.join("\n");
}

export function buildCompactionContext(cwd: string): SavedContext {
	return {
		savedAt: new Date().toISOString(),
		host: process.env.HOSTNAME || undefined,
		cwd,
	};
}
