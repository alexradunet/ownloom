import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dependencies before importing the module under test
vi.mock("../../lib/netbird.js", () => ({
	loadNetBirdToken: vi.fn(),
	getLocalMeshIp: vi.fn(),
	ensureBloomZone: vi.fn(),
	ensureServiceRecord: vi.fn(),
}));

vi.mock("../../lib/nginx.js", () => ({
	generateVhostConfig: vi.fn(() => "server { }"),
	writeVhostConfig: vi.fn(),
	reloadNginx: vi.fn(),
}));

import { ensureBloomZone, ensureServiceRecord, getLocalMeshIp, loadNetBirdToken } from "../../lib/netbird.js";
import { generateVhostConfig, reloadNginx, writeVhostConfig } from "../../lib/nginx.js";
import { ensureServiceRouting } from "../../lib/service-routing.js";

describe("ensureServiceRouting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects invalid service names", async () => {
		const result = await ensureServiceRouting("INVALID NAME!", 8080);
		expect(result.dns.ok).toBe(false);
		expect(result.nginx.ok).toBe(false);
	});

	it("skips DNS when no token is available", async () => {
		vi.mocked(loadNetBirdToken).mockReturnValue(null);
		vi.mocked(writeVhostConfig).mockResolvedValue({ ok: true });
		vi.mocked(reloadNginx).mockResolvedValue({ ok: true });

		const result = await ensureServiceRouting("cinny", 18810);
		expect(result.dns.skipped).toBe(true);
		expect(result.nginx.ok).toBe(true);
		expect(getLocalMeshIp).not.toHaveBeenCalled();
	});

	it("creates DNS record and nginx vhost when token is available", async () => {
		vi.mocked(loadNetBirdToken).mockReturnValue("nbp_test");
		vi.mocked(getLocalMeshIp).mockResolvedValue("100.119.45.12");
		vi.mocked(ensureBloomZone).mockResolvedValue({ ok: true, zoneId: "zone-1" });
		vi.mocked(ensureServiceRecord).mockResolvedValue({ ok: true, recordId: "rec-1" });
		vi.mocked(writeVhostConfig).mockResolvedValue({ ok: true });
		vi.mocked(reloadNginx).mockResolvedValue({ ok: true });

		const result = await ensureServiceRouting("dufs", 5000, { websocket: true });
		expect(result.dns.ok).toBe(true);
		expect(result.nginx.ok).toBe(true);
		expect(ensureBloomZone).toHaveBeenCalledWith("nbp_test");
		expect(ensureServiceRecord).toHaveBeenCalledWith("nbp_test", "zone-1", "dufs", "100.119.45.12");
		expect(generateVhostConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				serviceName: "dufs",
				serverName: "dufs.bloom.mesh",
				upstreamPort: 5000,
				websocket: true,
			}),
		);
	});

	it("handles mesh IP failure gracefully", async () => {
		vi.mocked(loadNetBirdToken).mockReturnValue("nbp_test");
		vi.mocked(getLocalMeshIp).mockResolvedValue(null);
		vi.mocked(writeVhostConfig).mockResolvedValue({ ok: true });
		vi.mocked(reloadNginx).mockResolvedValue({ ok: true });

		const result = await ensureServiceRouting("cinny", 18810);
		expect(result.dns.ok).toBe(false);
		expect(result.dns.error).toContain("mesh IP");
		expect(result.nginx.ok).toBe(true);
	});

	it("handles zone creation failure gracefully", async () => {
		vi.mocked(loadNetBirdToken).mockReturnValue("nbp_test");
		vi.mocked(getLocalMeshIp).mockResolvedValue("100.119.45.12");
		vi.mocked(ensureBloomZone).mockResolvedValue({ ok: false, error: "API error" });
		vi.mocked(writeVhostConfig).mockResolvedValue({ ok: true });
		vi.mocked(reloadNginx).mockResolvedValue({ ok: true });

		const result = await ensureServiceRouting("cinny", 18810);
		expect(result.dns.ok).toBe(false);
		expect(result.nginx.ok).toBe(true);
	});

	it("reports nginx write failure", async () => {
		vi.mocked(loadNetBirdToken).mockReturnValue(null);
		vi.mocked(writeVhostConfig).mockResolvedValue({ ok: false, error: "permission denied" });

		const result = await ensureServiceRouting("cinny", 18810);
		expect(result.nginx.ok).toBe(false);
		expect(result.nginx.error).toContain("permission denied");
	});

	it("reports nginx reload failure", async () => {
		vi.mocked(loadNetBirdToken).mockReturnValue(null);
		vi.mocked(writeVhostConfig).mockResolvedValue({ ok: true });
		vi.mocked(reloadNginx).mockResolvedValue({ ok: false, error: "nginx not running" });

		const result = await ensureServiceRouting("cinny", 18810);
		expect(result.nginx.ok).toBe(false);
		expect(result.nginx.error).toContain("nginx not running");
	});
});
