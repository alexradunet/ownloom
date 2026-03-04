import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
	if (!raw.startsWith("---\n")) return { data: {}, content: raw };
	const end = raw.indexOf("\n---\n", 4);
	if (end === -1) return { data: {}, content: raw };
	const yaml = raw.slice(4, end);
	const content = raw.slice(end + 5);
	const data: Record<string, unknown> = {};
	let currentKey: string | null = null;
	let currentArray: string[] | null = null;
	for (const line of yaml.split("\n")) {
		if (line.startsWith("  - ") && currentKey && currentArray) {
			currentArray.push(line.slice(4).trim());
			continue;
		}
		if (currentKey && currentArray) {
			data[currentKey] = currentArray;
			currentKey = null;
			currentArray = null;
		}
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		const val = line.slice(colon + 1).trim();
		if (val === "") {
			currentKey = key;
			currentArray = [];
		} else if (val.includes(",")) {
			data[key] = val.split(",").map((s) => s.trim()).filter(Boolean);
		} else {
			data[key] = val;
		}
	}
	if (currentKey && currentArray) data[currentKey] = currentArray;
	return { data, content };
}

function stringifyFrontmatter(data: Record<string, unknown>, content: string): string {
	const lines: string[] = ["---"];
	for (const [key, val] of Object.entries(data)) {
		if (Array.isArray(val)) {
			lines.push(`${key}: ${val.join(", ")}`);
		} else {
			lines.push(`${key}: ${val}`);
		}
	}
	lines.push("---");
	return lines.join("\n") + "\n" + content;
}

function getObjectsDir(): string {
	return process.env.BLOOM_OBJECTS_DIR ?? path.join(os.homedir(), ".bloom", "objects");
}

function objectPath(objectsDir: string, type: string, slug: string): string {
	const resolved = path.join(objectsDir, type, `${slug}.md`);
	if (!resolved.startsWith(objectsDir + path.sep)) {
		throw new Error(`path traversal blocked: ${type}/${slug}`);
	}
	return resolved;
}

function parseRef(ref: string): { type: string; slug: string } {
	const slash = ref.indexOf("/");
	if (slash === -1) throw new Error(`invalid reference format: '${ref}' (expected type/slug)`);
	return { type: ref.slice(0, slash), slug: ref.slice(slash + 1) };
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "memory_create",
		label: "Memory Create",
		description: "Create a new markdown object in the flat-file store",
		promptSnippet: "Create a new tracked object (task, note, project, etc.)",
		promptGuidelines: [
			"Use memory_create when the user mentions something new to track. Always set a title. Suggest PARA fields (project, area) when relevant.",
		],
		parameters: Type.Object({
			type: Type.String({ description: "Object type (e.g. task, note, project)" }),
			slug: Type.String({ description: "URL-friendly identifier (e.g. fix-bike-tire)" }),
			fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Additional frontmatter fields" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const objectsDir = getObjectsDir();
			const filepath = objectPath(objectsDir, params.type, params.slug);
			fs.mkdirSync(path.dirname(filepath), { recursive: true });

			const now = nowIso();
			const fields = params.fields ?? {};
			const priorityKeys = ["type", "slug", "title", "status", "priority", "project", "area"];
			const data: Record<string, unknown> = { type: params.type, slug: params.slug };

			for (const k of priorityKeys.slice(2)) {
				if (k in fields) data[k] = fields[k];
			}
			for (const k of Object.keys(fields).filter((k) => !priorityKeys.includes(k)).sort()) {
				const val = fields[k];
				if (k === "tags" || k === "links") {
					data[k] = val.split(",").map((s) => s.trim()).filter(Boolean);
				} else {
					data[k] = val;
				}
			}
			data.created = now;
			data.modified = now;

			const title = data.title as string | undefined;
			const body = title ? `# ${title}\n` : "";

			try {
				fs.writeFileSync(filepath, stringifyFrontmatter(data, body), { flag: "wx" });
			} catch (err: unknown) {
				if ((err as NodeJS.ErrnoException).code === "EEXIST") {
					throw new Error(`object already exists: ${params.type}/${params.slug}`);
				}
				throw err;
			}

			return { content: [{ type: "text" as const, text: `created ${params.type}/${params.slug}` }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_read",
		label: "Memory Read",
		description: "Read a markdown object from the flat-file store",
		promptSnippet: "Read a specific object by type and slug",
		promptGuidelines: ["Use memory_read to retrieve a specific object by type and slug."],
		parameters: Type.Object({
			type: Type.String({ description: "Object type" }),
			slug: Type.String({ description: "Object slug" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const objectsDir = getObjectsDir();
			const filepath = objectPath(objectsDir, params.type, params.slug);
			let raw: string;
			try {
				raw = fs.readFileSync(filepath, "utf-8");
			} catch (err: unknown) {
				if ((err as NodeJS.ErrnoException).code === "ENOENT") {
					throw new Error(`object not found: ${params.type}/${params.slug}`);
				}
				throw err;
			}
			return { content: [{ type: "text" as const, text: raw }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description: "Search all objects for a pattern (simple string match)",
		promptSnippet: "Search objects by content pattern",
		promptGuidelines: ["Use memory_search when the user remembers content but not the exact object name."],
		parameters: Type.Object({
			pattern: Type.String({ description: "Text pattern to search for" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const objectsDir = getObjectsDir();
			if (!fs.existsSync(objectsDir)) {
				return { content: [{ type: "text" as const, text: "No objects found (store is empty)" }], details: {} };
			}
			const matches: string[] = [];
			for (const entry of fs.readdirSync(objectsDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const typeDir = path.join(objectsDir, entry.name);
				for (const file of fs.readdirSync(typeDir)) {
					if (!file.endsWith(".md")) continue;
					const raw = fs.readFileSync(path.join(typeDir, file), "utf-8");
					if (!raw.includes(params.pattern)) continue;
					const { data } = parseFrontmatter(raw);
					const ref = `${data.type ?? entry.name}/${data.slug ?? file.replace(/\.md$/, "")}`;
					const title = data.title ? ` — ${data.title}` : "";
					matches.push(`${ref}${title}`);
				}
			}
			const text = matches.length > 0 ? matches.join("\n") : "No matches found";
			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_link",
		label: "Memory Link",
		description: "Add bidirectional links between two objects",
		promptSnippet: "Link two objects bidirectionally",
		promptGuidelines: ["Use memory_link when two objects are related. Links are bidirectional."],
		parameters: Type.Object({
			ref_a: Type.String({ description: "First object reference (type/slug)" }),
			ref_b: Type.String({ description: "Second object reference (type/slug)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const objectsDir = getObjectsDir();
			const a = parseRef(params.ref_a);
			const b = parseRef(params.ref_b);
			const pathA = objectPath(objectsDir, a.type, a.slug);
			const pathB = objectPath(objectsDir, b.type, b.slug);

			function readOrThrow(fp: string, ref: string): string {
				try {
					return fs.readFileSync(fp, "utf-8");
				} catch (err: unknown) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`object not found: ${ref}`);
					throw err;
				}
			}

			function addLink(fp: string, raw: string, linkRef: string): void {
				const { data, content } = parseFrontmatter(raw);
				const links: string[] = Array.isArray(data.links) ? [...(data.links as string[])] : [];
				if (!links.includes(linkRef)) {
					links.push(linkRef);
					data.links = links;
					fs.writeFileSync(fp, stringifyFrontmatter(data, content));
				}
			}

			addLink(pathA, readOrThrow(pathA, params.ref_a), params.ref_b);
			addLink(pathB, readOrThrow(pathB, params.ref_b), params.ref_a);

			return { content: [{ type: "text" as const, text: `linked ${params.ref_a} <-> ${params.ref_b}` }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_list",
		label: "Memory List",
		description: "List objects, optionally filtered by type and/or frontmatter fields",
		promptSnippet: "List objects by type or filter",
		promptGuidelines: ["Use memory_list to show all objects of a type, or filter by status, area, etc."],
		parameters: Type.Object({
			type: Type.Optional(Type.String({ description: "Object type to filter by" })),
			filters: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Frontmatter field filters" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const objectsDir = getObjectsDir();
			const filters = params.filters ?? {};
			const searchDirs: Array<{ dir: string; typeName: string }> = [];

			if (!params.type) {
				if (!fs.existsSync(objectsDir)) {
					return { content: [{ type: "text" as const, text: "No objects found (store is empty)" }], details: {} };
				}
				for (const entry of fs.readdirSync(objectsDir, { withFileTypes: true })) {
					if (entry.isDirectory()) searchDirs.push({ dir: path.join(objectsDir, entry.name), typeName: entry.name });
				}
			} else {
				const dir = path.join(objectsDir, params.type);
				if (fs.existsSync(dir)) searchDirs.push({ dir, typeName: params.type });
			}

			const results: string[] = [];
			for (const { dir, typeName } of searchDirs) {
				for (const file of fs.readdirSync(dir)) {
					if (!file.endsWith(".md")) continue;
					const { data } = parseFrontmatter(fs.readFileSync(path.join(dir, file), "utf-8"));
					let match = true;
					for (const [key, val] of Object.entries(filters)) {
						if (key === "tag") {
							const tags = Array.isArray(data.tags) ? data.tags : [];
							if (!(tags as string[]).includes(val)) { match = false; break; }
						} else {
							if (String(data[key] ?? "") !== val) { match = false; break; }
						}
					}
					if (match) {
						const slug = String(data.slug ?? file.replace(/\.md$/, ""));
						const title = data.title ? ` — ${data.title}` : "";
						results.push(`${typeName}/${slug}${title}`);
					}
				}
			}

			const text = results.length > 0 ? results.join("\n") : "No objects found";
			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}
