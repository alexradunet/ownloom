/**
 * Harness-neutral utility helpers for the ownloom wiki module.
 */

import type { ActionResult } from "./core-utils.ts";

export { err, ok, nowIso, type ActionResult } from "./core-utils.ts";

const MAX_TRUNCATE_LINES = 2000;
const MAX_TRUNCATE_BYTES = 50000;

/** Convert an ActionResult to the text/details tool result shape used by adapters. */
export function toToolResult<TDetails extends object>(result: ActionResult<TDetails>) {
	if (result.isErr()) {
		return textToolResult(result.error, {}, true);
	}
	return textToolResult(result.value.text, result.value.details ?? {});
}

export function truncate(text: string): string {
	const lines = text.split("\n").slice(0, MAX_TRUNCATE_LINES).join("\n");
	const bytes = Buffer.byteLength(lines, "utf8");
	if (bytes <= MAX_TRUNCATE_BYTES) return lines;
	return Buffer.from(lines, "utf8").subarray(0, MAX_TRUNCATE_BYTES).toString("utf8");
}

export const EmptyToolParams = { type: "object", properties: {}, additionalProperties: false } as const;

export function textToolResult<TDetails extends object>(
	text: string,
	details: TDetails = {} as TDetails,
	isError?: boolean,
) {
	return {
		content: [{ type: "text" as const, text }],
		details,
		...(isError !== undefined ? { isError } : {}),
	};
}

export function errorResult(message: string) {
	return textToolResult(message, {}, true);
}

