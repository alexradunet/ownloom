import { describe, expect, it } from "vitest";
import { isChannelMessage, isSenderAllowed, parseAllowedSenders } from "../src/utils.js";

// ---------------------------------------------------------------------------
// isChannelMessage
// ---------------------------------------------------------------------------
describe("isChannelMessage", () => {
	it("returns true for valid object with type string", () => {
		expect(isChannelMessage({ type: "response", to: "id", text: "hi" })).toBe(true);
	});

	it("returns true for minimal valid object", () => {
		expect(isChannelMessage({ type: "ping" })).toBe(true);
	});

	it("returns false for null", () => {
		expect(isChannelMessage(null)).toBe(false);
	});

	it("returns false for non-object", () => {
		expect(isChannelMessage("string")).toBe(false);
		expect(isChannelMessage(42)).toBe(false);
	});

	it("returns false for missing type", () => {
		expect(isChannelMessage({ to: "id" })).toBe(false);
	});

	it("returns false for non-string type", () => {
		expect(isChannelMessage({ type: 123 })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// parseAllowedSenders
// ---------------------------------------------------------------------------
describe("parseAllowedSenders", () => {
	it("returns empty set for empty string", () => {
		expect(parseAllowedSenders("").size).toBe(0);
	});

	it("parses comma-separated entries", () => {
		const set = parseAllowedSenders("sender-a,sender-b");
		expect(set.size).toBe(2);
		expect(set.has("sender-a")).toBe(true);
		expect(set.has("sender-b")).toBe(true);
	});

	it("trims whitespace", () => {
		const set = parseAllowedSenders(" sender-a , sender-b ");
		expect(set.has("sender-a")).toBe(true);
		expect(set.has("sender-b")).toBe(true);
	});

	it("ignores empty entries from trailing commas", () => {
		const set = parseAllowedSenders("sender-a,,sender-b,");
		expect(set.size).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// isSenderAllowed
// ---------------------------------------------------------------------------
describe("isSenderAllowed", () => {
	it("allows all when allowlist is empty", () => {
		expect(isSenderAllowed("any-sender", new Set())).toBe(true);
	});

	it("allows when sender is in allowlist", () => {
		const allowed = new Set(["sender-a"]);
		expect(isSenderAllowed("sender-a", allowed)).toBe(true);
	});

	it("rejects when sender is not in allowlist", () => {
		const allowed = new Set(["sender-a"]);
		expect(isSenderAllowed("sender-b", allowed)).toBe(false);
	});
});
