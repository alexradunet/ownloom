/**
 * bloom-TEMPLATE — Entry point
 *
 * This is the main entry point for the TEMPLATE service. It sets up:
 *   1. A health-check HTTP server (configurable via BLOOM_HEALTH_PORT)
 *   2. A channel socket client that connects to bloom-channels via Unix socket
 *   3. Graceful shutdown on SIGTERM/SIGINT
 *
 * Customize this file:
 *   - Replace TEMPLATE with your service name everywhere
 *   - Add service-specific initialization in startService()
 *   - Handle incoming channel messages in handleChannelMessage()
 *   - Call sendToChannels() to forward messages to Pi
 */

import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createConnection, type Socket } from "node:net";
import { connect as connectTransport, sendMessage } from "./transport.js";
import { isChannelMessage } from "./utils.js";

// --- Configuration ---
// Customize these env vars for your service.

const defaultSocketPath = `${process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`}/bloom/channels.sock`;
const CHANNELS_SOCKET = process.env.BLOOM_CHANNELS_SOCKET ?? defaultSocketPath;
const CHANNEL_TOKEN = process.env.BLOOM_CHANNEL_TOKEN ?? "";
const HEALTH_PORT = Number(process.env.BLOOM_HEALTH_PORT ?? "18800");

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

// --- State ---

let channelSocket: Socket | null = null;
let tcpBuffer = "";
let tcpReconnectDelay = RECONNECT_BASE_MS;
let tcpReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let tcpConnecting = false;
let shuttingDown = false;
let serviceConnected = false;

// --- Health check HTTP server ---
// Returns 200 when both the service and channel socket are healthy, 503 otherwise.

const healthServer = createHttpServer((req, res) => {
	if (req.url === "/health") {
		const healthy = serviceConnected && channelSocket?.writable === true;
		res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ service: serviceConnected, channel: channelSocket?.writable === true }));
	} else {
		res.writeHead(404);
		res.end();
	}
});

healthServer.listen(HEALTH_PORT, "0.0.0.0", () => {
	console.log(`[health] listening on :${HEALTH_PORT}`);
});

// --- TCP reconnection helpers ---

function clearTcpReconnectTimer(): void {
	if (tcpReconnectTimer) {
		clearTimeout(tcpReconnectTimer);
		tcpReconnectTimer = null;
	}
}

function resetChannelSocket(): void {
	const sock = channelSocket;
	channelSocket = null;
	tcpConnecting = false;
	if (sock && !sock.destroyed) sock.destroy();
}

function scheduleTcpReconnect(): void {
	if (shuttingDown || tcpReconnectTimer) return;
	const delay = tcpReconnectDelay;
	console.log(`[tcp] disconnected. Reconnecting in ${delay}ms...`);
	tcpReconnectDelay = Math.min(tcpReconnectDelay * 2, RECONNECT_MAX_MS);
	tcpReconnectTimer = setTimeout(() => {
		tcpReconnectTimer = null;
		connectToChannels();
	}, delay);
}

// --- Service initialization ---
// TODO: Replace this with your service-specific startup logic.
// When your service is ready, set serviceConnected = true and call connectToChannels().

async function startService(): Promise<void> {
	if (shuttingDown) return;

	console.log("[TEMPLATE] starting service...");

	// TODO: Initialize your service client/connection here.
	// Example: connect to an external API, start a daemon, etc.
	await connectTransport({
		onMessage: (from: string, text: string) => {
			// Forward incoming messages to the channel bridge
			console.log(`[TEMPLATE] message from ${from}: ${text.slice(0, 80)}`);
			sendToChannels({
				type: "message",
				id: randomUUID(),
				channel: "TEMPLATE",
				from,
				text,
				timestamp: Math.floor(Date.now() / 1000),
			});
		},
	});

	serviceConnected = true;
	tcpReconnectDelay = RECONNECT_BASE_MS;
	clearTcpReconnectTimer();
	resetChannelSocket();
	connectToChannels();
}

// --- Channel socket connection ---
// Connects to bloom-channels Unix socket using JSON-newline protocol.
// Messages are newline-delimited JSON objects.

function connectToChannels(): void {
	if (shuttingDown || !serviceConnected) return;
	if (tcpConnecting) return;
	if (channelSocket?.writable) return;

	clearTcpReconnectTimer();
	tcpConnecting = true;
	tcpBuffer = "";

	console.log(`[tcp] connecting to ${CHANNELS_SOCKET}...`);

	const sock = createConnection({ path: CHANNELS_SOCKET });
	channelSocket = sock;
	sock.setEncoding("utf8");

	sock.on("connect", () => {
		if (channelSocket !== sock) return;
		tcpConnecting = false;
		tcpReconnectDelay = RECONNECT_BASE_MS;
		console.log("[tcp] connected to bloom-channels.");

		// Register this channel with the bridge.
		// The channel name must match the service name.
		const registration: Record<string, string> = { type: "register", channel: "TEMPLATE" };
		if (CHANNEL_TOKEN) registration.token = CHANNEL_TOKEN;
		sock.write(`${JSON.stringify(registration)}\n`);
	});

	sock.on("data", (data: string) => {
		if (channelSocket !== sock) return;

		// Buffer incoming data and split on newlines (JSON-newline protocol).
		tcpBuffer += data;
		const lines = tcpBuffer.split("\n");
		tcpBuffer = lines.pop() ?? "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const msg = JSON.parse(trimmed) as unknown;
				handleChannelMessage(msg);
			} catch (err) {
				console.error("[tcp] parse error:", (err as Error).message, "| raw:", trimmed.slice(0, 120));
			}
		}
	});

	sock.on("error", (err) => {
		if (channelSocket !== sock) return;
		console.error("[tcp] error:", err.message);
	});

	sock.on("close", () => {
		if (channelSocket !== sock) return;
		channelSocket = null;
		tcpConnecting = false;
		if (shuttingDown || !serviceConnected) return;
		scheduleTcpReconnect();
	});
}

/** Send a JSON message to the channel bridge (newline-delimited). */
function sendToChannels(msg: Record<string, unknown>): void {
	if (channelSocket?.writable) {
		channelSocket.write(`${JSON.stringify(msg)}\n`);
	} else {
		console.warn("[tcp] channel socket not writable, dropping message:", msg);
	}
}

// --- Incoming channel messages ---
// Messages from Pi arrive here. Handle "response"/"send" to relay outbound messages.

function handleChannelMessage(raw: unknown): void {
	if (!isChannelMessage(raw)) {
		console.warn("[tcp] unexpected message shape:", raw);
		return;
	}

	const { type, to, text } = raw;

	if (type === "response" || type === "send") {
		if (!to) {
			console.warn(`[tcp] "${type}" message missing "to" field — dropping.`);
			return;
		}
		if (!text) {
			console.warn(`[tcp] "${type}" message missing "text" field — dropping.`);
			return;
		}
		// TODO: Send the message via your service's transport.
		console.log(`[TEMPLATE] sending to ${to}: ${text.slice(0, 80)}`);
		sendMessage(to, text);
		return;
	}

	if (type === "ping") {
		if (channelSocket?.writable) {
			channelSocket.write(`${JSON.stringify({ type: "pong" })}\n`);
		}
		return;
	}

	// Silently ignore known control messages.
	if (type === "registered" || type === "pong" || type === "status") {
		return;
	}

	console.warn("[tcp] unhandled message type:", type);
}

// --- Graceful shutdown ---

function shutdown(signal: string): void {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[bloom-TEMPLATE] received ${signal}, shutting down...`);

	healthServer.close();
	clearTcpReconnectTimer();
	resetChannelSocket();

	// TODO: Clean up your service-specific resources here.
	// Example: close client connections, kill child processes, etc.

	setTimeout(() => process.exit(0), 1_500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Entry point ---

startService().catch((err: unknown) => {
	console.error("[bloom-TEMPLATE] fatal startup error:", (err as Error).message);
	process.exit(1);
});
