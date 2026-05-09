/** Minimal filesystem helpers for the ownloom wiki module. */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Ensure a directory exists. */
export function ensureDir(dir: string, mode?: number): void {
	if (existsSync(dir)) return;
	mkdirSync(dir, { recursive: true, ...(mode ? { mode } : {}) });
}

/** Write a file atomically via temporary sibling + rename. */
export function atomicWriteFile(filePath: string, content: string, _mode?: number): void {
	ensureDir(path.dirname(filePath));
	const tmpPath = `${filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
	writeFileSync(tmpPath, content, "utf-8");
	renameSync(tmpPath, filePath);
}
