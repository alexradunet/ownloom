/** YAML frontmatter parsing and serialization for wiki markdown files. */

/** Result of parsing YAML frontmatter from a markdown string. */
export interface ParsedFrontmatter<T> {
	attributes: T;
	body: string;
	bodyBegin: number;
	frontmatter: string;
}

/** Frontmatter keys that are parsed as comma-separated arrays for legacy compatibility. */
const FRONTMATTER_ARRAY_KEYS = new Set(["tags", "links", "aliases", "hosts", "areas", "source_ids", "integration_targets"]);

function plainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeParsedValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalizeParsedValue);
	if (plainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeParsedValue(entry)]));
	return value;
}

function quoteString(value: string): string {
	if (value === "") return "''";
	if (/^\s|\s$|^[-?:,[\]{}#&*!|>'\"%@`]|:\s|[\n\r]/.test(value)) {
		return `'${value.replace(/'/g, "''")}'`;
	}
	return value;
}

function serializeValue(value: unknown): string {
	if (typeof value === "string") return quoteString(value);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value === null || value === undefined) return "''";
	return quoteString(String(value));
}

function splitInlineArray(value: string): string[] | undefined {
	const items: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	for (let i = 0; i < value.length; i += 1) {
		const char = value[i];
		if (quote) {
			current += char;
			if (char === quote) {
				if (quote === "'" && value[i + 1] === "'") {
					current += value[i + 1];
					i += 1;
				} else {
					quote = undefined;
				}
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}
		if (char === ",") {
			items.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (quote) return undefined;
	items.push(current.trim());
	return items;
}

function unquoteString(value: string): string | undefined {
	if (value.startsWith("'")) {
		if (!value.endsWith("'") || value.length === 1) return undefined;
		return value.slice(1, -1).replace(/''/g, "'");
	}
	if (value.startsWith('"')) {
		if (!value.endsWith('"') || value.length === 1) return undefined;
		try {
			return JSON.parse(value) as string;
		} catch {
			return undefined;
		}
	}
	return value;
}

function parseScalar(value: string): unknown {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	if (trimmed === "[]") return [];
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		const inner = trimmed.slice(1, -1).trim();
		if (!inner) return [];
		const entries = splitInlineArray(inner);
		if (!entries) return undefined;
		const parsedEntries = entries.map((entry) => parseScalar(entry));
		if (parsedEntries.some((entry) => entry === undefined)) return undefined;
		return parsedEntries;
	}
	if (trimmed.startsWith("[") || trimmed.endsWith("]")) return undefined;
	const unquoted = unquoteString(trimmed);
	if (unquoted === undefined) return undefined;
	if (unquoted !== trimmed || trimmed.startsWith("'") || trimmed.startsWith('"')) return unquoted;
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
	return trimmed;
}

function parseKeyValueLine(line: string): [string, string] | undefined {
	const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
	if (!match) return undefined;
	return [match[1], match[2] ?? ""];
}

/** Serialize a data object and markdown body into a frontmatter-delimited string. */
export function stringifyFrontmatter<T extends object>(data: T, content: string): string {
	const keys = Object.keys(data);
	if (keys.length === 0) return `---\n---\n${content}`;
	const yamlStr = Object.entries(data as Record<string, unknown>)
		.map(([key, value]) => {
			if (Array.isArray(value)) {
				if (value.length === 0) return `${key}: []`;
				return `${key}:\n${value.map((entry) => `  - ${serializeValue(entry)}`).join("\n")}`;
			}
			return `${key}: ${serializeValue(value)}`;
		})
		.join("\n");
	return `---\n${yamlStr}\n---\n${content}`;
}

function parseFrontmatterYaml(frontmatter: string): Record<string, unknown> | undefined {
	try {
		const attributes: Record<string, unknown> = {};
		const lines = frontmatter.split(/\r?\n/);
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i];
			if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
			if (/^\s/.test(line)) return undefined;

			const parsedLine = parseKeyValueLine(line);
			if (!parsedLine) return undefined;
			const [key, rawValue] = parsedLine;
			if (!key.trim()) return undefined;

			if (rawValue === "") {
				const list: unknown[] = [];
				let consumedList = false;
				while (i + 1 < lines.length) {
					const next = lines[i + 1];
					if (next.trim() === "") {
						i += 1;
						continue;
					}
					const item = next.match(/^\s+-\s*(.*)$/);
					if (!item) break;
					const parsedItem = parseScalar(item[1]);
					if (parsedItem === undefined) return undefined;
					list.push(parsedItem);
					consumedList = true;
					i += 1;
				}
				attributes[key] = consumedList ? list : null;
				continue;
			}

			const value = parseScalar(rawValue);
			if (value === undefined) return undefined;
			attributes[key] = value;
		}
		return normalizeParsedValue(attributes) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

/** Parse YAML frontmatter from a markdown string. Returns attributes, body, and metadata. */
export function parseFrontmatter<T extends Record<string, unknown> = Record<string, unknown>>(
	str: string,
): ParsedFrontmatter<T> {
	const empty: ParsedFrontmatter<T> = { attributes: {} as T, body: str, bodyBegin: 1, frontmatter: "" };
	const opening = str.match(/^---\r?\n/);
	if (!opening) return empty;

	const frontmatterStart = opening[0].length;
	const closingRegex = /\r?\n---(?:\r?\n|$)/g;
	closingRegex.lastIndex = frontmatterStart;
	const closing = closingRegex.exec(str);
	if (!closing) return empty;

	const frontmatter = str.slice(frontmatterStart, closing.index);
	const body = str.slice(closing.index + closing[0].length);

	const attributes = parseFrontmatterYaml(frontmatter);
	if (!attributes) return empty;

	// Compat layer: split comma-separated strings into arrays for known keys.
	for (const key of FRONTMATTER_ARRAY_KEYS) {
		const val = attributes[key];
		if (typeof val === "string" && val.includes(",")) {
			attributes[key] = val
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		}
	}

	const bodyBegin = frontmatter.split(/\r?\n/).length + 3;
	return {
		attributes: attributes as T,
		body,
		bodyBegin,
		frontmatter,
	};
}
