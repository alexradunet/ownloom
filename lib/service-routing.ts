/** Orchestration glue: combines NetBird DNS + nginx vhost for service subdomain routing. */

import { ensureBloomZone, ensureServiceRecord, getLocalMeshIp, loadNetBirdToken } from "./netbird.js";
import { generateVhostConfig, reloadNginx, writeVhostConfig } from "./nginx.js";
import { validateServiceName } from "./services-validation.js";
import { createLogger } from "./shared.js";

const log = createLogger("service-routing");

const BLOOM_ZONE_DOMAIN = "bloom.mesh";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutingResult {
	dns: { ok: boolean; skipped?: boolean; error?: string };
	nginx: { ok: boolean; error?: string };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Ensure subdomain routing for a service: create DNS record + nginx vhost.
 *
 * Gracefully degrades: if no NetBird token is available, DNS is skipped
 * but the nginx vhost is still written (usable with manual DNS or /etc/hosts).
 */
export async function ensureServiceRouting(
	serviceName: string,
	port: number,
	options?: { websocket?: boolean; maxBodySize?: string },
	signal?: AbortSignal,
): Promise<RoutingResult> {
	const guard = validateServiceName(serviceName);
	if (guard) {
		return {
			dns: { ok: false, error: guard },
			nginx: { ok: false, error: guard },
		};
	}

	const serverName = `${serviceName}.${BLOOM_ZONE_DOMAIN}`;

	// --- DNS (optional) ---
	let dnsResult: RoutingResult["dns"] = { ok: false, skipped: true };

	const token = loadNetBirdToken();
	if (token) {
		const meshIp = await getLocalMeshIp(signal);
		if (!meshIp) {
			dnsResult = { ok: false, error: "Could not determine local mesh IP from netbird status" };
		} else {
			const zone = await ensureBloomZone(token);
			if (!zone.ok || !zone.zoneId) {
				dnsResult = { ok: false, error: zone.error ?? "Failed to ensure bloom.mesh zone" };
			} else {
				const record = await ensureServiceRecord(token, zone.zoneId, serviceName, meshIp);
				dnsResult = { ok: record.ok, error: record.error };
			}
		}
	} else {
		log.info("no NetBird API token — skipping DNS record creation", { serviceName });
	}

	// --- Nginx vhost (always attempted) ---
	const config = generateVhostConfig({
		serviceName,
		serverName,
		upstreamPort: port,
		websocket: options?.websocket,
		maxBodySize: options?.maxBodySize,
	});

	const writeResult = await writeVhostConfig(serviceName, config, signal);
	let nginxResult: RoutingResult["nginx"];

	if (!writeResult.ok) {
		nginxResult = { ok: false, error: writeResult.error };
	} else {
		const reload = await reloadNginx(signal);
		nginxResult = { ok: reload.ok, error: reload.error };
	}

	return { dns: dnsResult, nginx: nginxResult };
}
