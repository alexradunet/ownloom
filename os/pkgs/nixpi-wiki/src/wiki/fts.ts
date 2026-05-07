/**
 * SQLite FTS5 full-text index for page body content.
 *
 * Uses `node:sqlite` (built-in, Node 22+) — no external dependency.
 * Index file: `meta/fts.db`. Built/rebuilt by `rebuildAllMeta`.
 * Queried by `searchRegistry` to augment metadata-only registry results
 * with body-content hits.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const FTS_DB_FILE = "fts.db";

export interface FtsPage {
	path: string;
	title: string;
	body: string;
}

export interface FtsMatch {
	path: string;
	title: string;
	snippet: string;
}

function ftsDbPath(wikiRoot: string): string {
	return path.join(wikiRoot, "meta", FTS_DB_FILE);
}

/** Strip FTS5 special characters from a query string. */
function sanitizeFtsQuery(query: string): string {
	return query
		.replace(/[^\w\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Build or rebuild the FTS5 body-content index at `meta/fts.db`.
 * Replaces all rows on each call (full rebuild).
 * Non-fatal: caller should wrap in try/catch.
 */
export function buildFtsIndex(wikiRoot: string, pages: FtsPage[]): void {
	mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
	const db = new DatabaseSync(ftsDbPath(wikiRoot));
	try {
		db.exec(
			"CREATE VIRTUAL TABLE IF NOT EXISTS pages USING fts5(path UNINDEXED, title, body);\n" +
			"DELETE FROM pages;",
		);
		const insert = db.prepare("INSERT INTO pages(path, title, body) VALUES (?, ?, ?)");
		for (const page of pages) {
			insert.run(page.path, page.title, page.body);
		}
	} finally {
		db.close();
	}
}

/**
 * Query the FTS5 index.
 * Returns `[]` if the index does not exist, the query is empty, or any error occurs.
 */
export function queryFts(wikiRoot: string, query: string, limit = 10): FtsMatch[] {
	const sanitized = sanitizeFtsQuery(query);
	if (!sanitized) return [];

	let db: DatabaseSync;
	try {
		db = new DatabaseSync(ftsDbPath(wikiRoot), { readOnly: true });
	} catch {
		return []; // index does not exist yet
	}

	try {
		const stmt = db.prepare(
			"SELECT path, title, snippet(pages, 2, '', '', '…', 15) AS snippet " +
			"FROM pages WHERE pages MATCH ? ORDER BY rank LIMIT ?",
		);
		const rows = stmt.all(sanitized, limit) as Array<{ path: string; title: string; snippet: string }>;
		return rows.map((row) => ({ path: row.path, title: row.title, snippet: row.snippet }));
	} catch {
		return [];
	} finally {
		db.close();
	}
}
