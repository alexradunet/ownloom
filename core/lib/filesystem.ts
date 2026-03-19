/** Safe filesystem operations: path traversal protection, temp dirs, and home resolution. */
import os from "node:os";
import path from "node:path";
import { safePathWithin } from "./fs-utils.js";

/**
 * Resolve path segments under a root directory, blocking path traversal.
 * Throws if the resolved path escapes the root.
 */
export function safePath(root: string, ...segments: string[]): string {
	return safePathWithin(root, ...segments);
}

/** Resolve the configured app data directory. Checks `NIXPI_DIR`, then falls back to `~/nixPI`. */
export function getNixpiDir(): string {
	return process.env.NIXPI_DIR ?? path.join(os.homedir(), "nixPI");
}

/** Path to the user's Quadlet unit directory for rootless containers. */
export function getQuadletDir(): string {
	return path.join(os.homedir(), ".config", "containers", "systemd");
}

/** Path to the OS update status file written by the update-check timer. */
export function getUpdateStatusPath(): string {
	return path.join(os.homedir(), ".nixpi", "update-status.json");
}

/** Path to the local repo clone used for local-only proposal workflows. */
export function getNixpiRepoDir(): string {
	return process.env.NIXPI_REPO_DIR ?? path.join(os.homedir(), ".nixpi", "pi-nixpi");
}
