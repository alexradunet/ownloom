import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml: { load: (str: string) => unknown; dump: (obj: unknown) => string } = require("js-yaml");

export interface ManifestService {
	image: string;
	version?: string;
	enabled: boolean;
}

export interface Manifest {
	device?: string;
	os_image?: string;
	services: Record<string, ManifestService>;
}

export interface ServiceCatalogEntry {
	version?: string;
	category?: string;
	artifact?: string;
	image?: string;
	optional?: boolean;
	preflight?: {
		commands?: string[];
		rootless_subids?: boolean;
	};
}

export function loadManifest(path: string, onError?: (error: string) => void): Manifest {
	if (!existsSync(path)) return { services: {} };
	try {
		const raw = readFileSync(path, "utf-8");
		const doc = yaml.load(raw) as Manifest | null;
		return doc ?? { services: {} };
	} catch (err) {
		onError?.((err as Error).message);
		return { services: {} };
	}
}

export function saveManifest(path: string, manifest: Manifest): void {
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash !== -1) {
		mkdirSync(path.slice(0, lastSlash), { recursive: true });
	}
	writeFileSync(path, yaml.dump(manifest));
}

export function loadServiceCatalog(candidates: string[]): Record<string, ServiceCatalogEntry> {
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		try {
			const raw = readFileSync(candidate, "utf-8");
			const doc = (yaml.load(raw) as { services?: Record<string, ServiceCatalogEntry> } | null) ?? {};
			if (doc.services && typeof doc.services === "object") return doc.services;
		} catch {
			// ignore and continue
		}
	}
	return {};
}
