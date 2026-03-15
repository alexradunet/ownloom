import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runMock } = vi.hoisted(() => ({
	runMock: vi.fn(),
}));

vi.mock("../../core/lib/exec.js", () => ({
	run: runMock,
}));

import { installServicePackage } from "../../core/pi-extensions/bloom-services/service-io.js";

describe("installServicePackage", () => {
	let tempHome: string;
	let tempRepo: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		tempHome = mkdtempSync(join(os.tmpdir(), "bloom-service-io-home-"));
		tempRepo = mkdtempSync(join(os.tmpdir(), "bloom-service-io-repo-"));
		originalHome = process.env.HOME;
		process.env.HOME = tempHome;
		runMock.mockReset();
		runMock.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
	});

	afterEach(() => {
		if (originalHome === undefined) {
			process.env.HOME = undefined;
		} else {
			process.env.HOME = originalHome;
		}
		rmSync(tempHome, { recursive: true, force: true });
		rmSync(tempRepo, { recursive: true, force: true });
	});

	it("creates the dedicated Bloom share directory when installing dufs", async () => {
		const serviceDir = join(tempRepo, "services", "dufs");
		const quadletDir = join(serviceDir, "quadlet");
		mkdirSync(quadletDir, { recursive: true });
		writeFileSync(join(serviceDir, "SKILL.md"), "# dufs\n");
		writeFileSync(join(quadletDir, "bloom-dufs.container"), "[Container]\nImage=test\n");

		const result = await installServicePackage("dufs", join(tempHome, "Bloom"), tempRepo);

		expect(result.ok).toBe(true);
		expect(existsSync(join(tempHome, "Public", "Bloom"))).toBe(true);
	});

	it("writes FluffyChat runtime config preconfigured for the Bloom Matrix server", async () => {
		runMock.mockResolvedValue({
			exitCode: 0,
			stdout: JSON.stringify({
				fqdn: "bloom-164-14.netbird.cloud",
				netbirdIp: "100.109.164.14/16",
			}),
			stderr: "",
		});

		const serviceDir = join(tempRepo, "services", "fluffychat");
		const quadletDir = join(serviceDir, "quadlet");
		mkdirSync(quadletDir, { recursive: true });
		writeFileSync(join(serviceDir, "SKILL.md"), "# fluffychat\n");
		writeFileSync(join(quadletDir, "bloom-fluffychat.container"), "[Container]\nImage=test\n");

		const result = await installServicePackage("fluffychat", join(tempHome, "Bloom"), tempRepo);

		expect(result.ok).toBe(true);
		const fluffychatConfig = JSON.parse(
			readFileSync(join(tempHome, ".config", "bloom", "fluffychat", "config.json"), "utf-8"),
		) as {
			applicationName: string;
			defaultHomeserver: string;
		};
		expect(fluffychatConfig.applicationName).toBe("Bloom Web Chat");
		expect(fluffychatConfig.defaultHomeserver).toBe("http://bloom-164-14.netbird.cloud:6167");
	});
});
