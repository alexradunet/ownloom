/** Service package lookup — pure filesystem checks with no side effects. */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Find a bundled service package on disk (repo, system share, or cwd). Returns paths or null. */
export function findLocalServicePackage(
	name: string,
	repoDir: string,
): { serviceDir: string; quadletDir: string; skillPath: string } | null {
	const candidates = [
		join(repoDir, "services", name),
		`/usr/local/share/bloom/services/${name}`,
		join(process.cwd(), "services", name),
	];
	for (const serviceDir of candidates) {
		const quadletDir = join(serviceDir, "quadlet");
		const skillPath = join(serviceDir, "SKILL.md");
		if (existsSync(quadletDir) && existsSync(skillPath)) {
			return { serviceDir, quadletDir, skillPath };
		}
	}
	return null;
}
