import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TempWorkspace {
	workspaceDir: string;
	cleanup: () => void;
}

export function createTempWorkspace(): TempWorkspace {
	const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "nixpi-test-root-"));
	const origResolved = process.env._NIXPI_DIR_RESOLVED;
	const origWorkspaceDir = process.env.NIXPI_DIR;

	process.env._NIXPI_DIR_RESOLVED = workspaceDir;
	process.env.NIXPI_DIR = workspaceDir;

	return {
		workspaceDir,
		cleanup() {
			if (origResolved !== undefined) {
				process.env._NIXPI_DIR_RESOLVED = origResolved;
			} else {
				process.env._NIXPI_DIR_RESOLVED = undefined;
			}
			if (origWorkspaceDir !== undefined) {
				process.env.NIXPI_DIR = origWorkspaceDir;
			} else {
				process.env.NIXPI_DIR = undefined;
			}
			rmSync(workspaceDir, { recursive: true, force: true });
		},
	};
}
