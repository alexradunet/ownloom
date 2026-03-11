import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCachedZoneId, loadNetBirdToken, parseMeshIp, saveCachedZoneId } from "../../lib/netbird.js";

// ---------------------------------------------------------------------------
// loadNetBirdToken
// ---------------------------------------------------------------------------
describe("loadNetBirdToken", () => {
	let tempDir: string;
	const originalHome = process.env.HOME;

	beforeEach(() => {
		tempDir = mkdtempSync(join("/tmp", "netbird-test-"));
		process.env.HOME = tempDir;
	});

	afterEach(() => {
		process.env.HOME = originalHome;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns null when env file does not exist", () => {
		expect(loadNetBirdToken()).toBeNull();
	});

	it("returns token from valid env file", () => {
		const envDir = join(tempDir, ".config", "bloom");
		mkdirSync(envDir, { recursive: true });
		writeFileSync(join(envDir, "netbird.env"), "NETBIRD_API_TOKEN=nbp_abc123\n");
		expect(loadNetBirdToken()).toBe("nbp_abc123");
	});

	it("returns null when file has no token line", () => {
		const envDir = join(tempDir, ".config", "bloom");
		mkdirSync(envDir, { recursive: true });
		writeFileSync(join(envDir, "netbird.env"), "# some comment\nOTHER_VAR=foo\n");
		expect(loadNetBirdToken()).toBeNull();
	});

	it("trims whitespace from token value", () => {
		const envDir = join(tempDir, ".config", "bloom");
		mkdirSync(envDir, { recursive: true });
		writeFileSync(join(envDir, "netbird.env"), "NETBIRD_API_TOKEN=  nbp_trimmed  \n");
		expect(loadNetBirdToken()).toBe("nbp_trimmed");
	});
});

// ---------------------------------------------------------------------------
// parseMeshIp
// ---------------------------------------------------------------------------
describe("parseMeshIp", () => {
	it("extracts IP from typical netbird status output", () => {
		const output = [
			"Daemon version: 0.28.0",
			"CLI version: 0.28.0",
			"Management: Connected",
			"Signal: Connected",
			"Relays: 2/2 Available",
			"Nameservers: 1/1 Available",
			"FQDN: bloom-device.netbird.cloud",
			"NetBird IP: 100.119.45.12/16",
			"Interface type: Kernel",
			"Quantum resistance: false",
			"Routes: -",
			"Peers count: 3/3 Connected",
		].join("\n");
		expect(parseMeshIp(output)).toBe("100.119.45.12");
	});

	it("returns null when no IP line is present", () => {
		expect(parseMeshIp("Daemon version: 0.28.0\nCLI version: 0.28.0")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseMeshIp("")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Zone ID caching
// ---------------------------------------------------------------------------
describe("zone ID caching", () => {
	let tempDir: string;
	const originalHome = process.env.HOME;

	beforeEach(() => {
		tempDir = mkdtempSync(join("/tmp", "zone-cache-test-"));
		process.env.HOME = tempDir;
	});

	afterEach(() => {
		process.env.HOME = originalHome;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns null when cache does not exist", () => {
		expect(loadCachedZoneId()).toBeNull();
	});

	it("saves and loads zone ID", () => {
		saveCachedZoneId("zone-123-abc");
		expect(loadCachedZoneId()).toBe("zone-123-abc");
	});

	it("returns null for invalid JSON cache", () => {
		const cacheDir = join(tempDir, ".config", "bloom");
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(join(cacheDir, "netbird-zone.json"), "not json");
		expect(loadCachedZoneId()).toBeNull();
	});

	it("returns null when cache has wrong shape", () => {
		const cacheDir = join(tempDir, ".config", "bloom");
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(join(cacheDir, "netbird-zone.json"), '{"zoneId": 42}');
		expect(loadCachedZoneId()).toBeNull();
	});
});
