import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TempNixpi {
	nixpiDir: string;
	cleanup: () => void;
}

export function createTempNixpi(): TempNixpi {
	const nixpiDir = mkdtempSync(path.join(os.tmpdir(), "nixpi-test-root-"));
	const origResolved = process.env._NIXPI_DIR_RESOLVED;
	const origNixpiDir = process.env.NIXPI_DIR;

	process.env._NIXPI_DIR_RESOLVED = nixpiDir;
	process.env.NIXPI_DIR = nixpiDir;

	return {
		nixpiDir,
		cleanup() {
			if (origResolved !== undefined) {
				process.env._NIXPI_DIR_RESOLVED = origResolved;
			} else {
				process.env._NIXPI_DIR_RESOLVED = undefined;
			}
			if (origNixpiDir !== undefined) {
				process.env.NIXPI_DIR = origNixpiDir;
			} else {
				process.env.NIXPI_DIR = undefined;
			}
			rmSync(nixpiDir, { recursive: true, force: true });
		},
	};
}
