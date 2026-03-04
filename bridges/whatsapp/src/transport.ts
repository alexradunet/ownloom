import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "baileys";
import { createConnection, type Socket } from "node:net";
import { Boom } from "@hapi/boom";

const AUTH_DIR = process.env.BLOOM_AUTH_DIR ?? "/data/auth";
const CHANNELS_HOST = process.env.BLOOM_CHANNELS_HOST ?? "127.0.0.1";
const CHANNELS_PORT = Number(process.env.BLOOM_CHANNELS_PORT ?? "18800");

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

// TCP state
let channelSocket: Socket | null = null;
let tcpBuffer = "";
let tcpReconnectDelay = RECONNECT_BASE_MS;
let shuttingDown = false;

// Track last WhatsApp socket so TCP layer can forward responses
let currentWaSock: ReturnType<typeof makeWASocket> | null = null;

// --- WhatsApp ---

async function startWhatsApp(): Promise<void> {
	if (shuttingDown) return;

	console.log("[wa] connecting...");
	const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
	const { version, isLatest } = await fetchLatestBaileysVersion();
	console.log(`[wa] Baileys version ${version.join(".")}${isLatest ? " (latest)" : " (outdated)"}`);

	const sock = makeWASocket({
		version,
		auth: state,
		printQRInTerminal: true,
		// suppress noisy default logger
		logger: makeLogger(),
	});

	currentWaSock = sock;

	sock.ev.on("creds.update", saveCreds);

	sock.ev.on("connection.update", (update) => {
		const { connection, lastDisconnect, qr } = update;

		if (qr) {
			console.log("[wa] Scan the QR code above to pair.");
		}

		if (connection === "open") {
			console.log("[wa] connected.");
			// Reset TCP reconnect delay on fresh WA connection
			tcpReconnectDelay = RECONNECT_BASE_MS;
			connectToChannels(sock);
		}

		if (connection === "close") {
			const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
			const reason = statusCode ?? "unknown";
			console.log(`[wa] connection closed (reason: ${reason})`);

			if (statusCode === DisconnectReason.loggedOut) {
				console.log("[wa] logged out — delete auth state and restart to re-pair.");
				return;
			}

			if (!shuttingDown) {
				console.log("[wa] reconnecting in 5s...");
				setTimeout(startWhatsApp, 5_000);
			}
		}
	});

	sock.ev.on("messages.upsert", ({ messages, type }) => {
		if (type !== "notify") return;

		for (const msg of messages) {
			// Skip own messages
			if (msg.key.fromMe) continue;

			const text =
				msg.message?.conversation ??
				msg.message?.extendedTextMessage?.text;

			if (!text) continue;

			const from = msg.key.remoteJid;
			if (!from) continue;

			const timestamp =
				typeof msg.messageTimestamp === "number"
					? msg.messageTimestamp
					: Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000));

			console.log(`[wa] message from ${from}: ${text.slice(0, 80)}`);

			sendToChannels({
				type: "message",
				channel: "whatsapp",
				from,
				text,
				timestamp,
			});
		}
	});
}

// --- Minimal pino-compatible logger to suppress Baileys noise ---

function makeLogger() {
	const noop = () => {};
	return {
		level: "silent",
		trace: noop,
		debug: noop,
		info: noop,
		warn: (obj: unknown, msg?: string) => console.warn("[wa:warn]", msg ?? obj),
		error: (obj: unknown, msg?: string) => console.error("[wa:error]", msg ?? obj),
		fatal: (obj: unknown, msg?: string) => console.error("[wa:fatal]", msg ?? obj),
		child: () => makeLogger(),
	};
}

// --- TCP channel connection ---

function connectToChannels(waSock: ReturnType<typeof makeWASocket>): void {
	if (shuttingDown) return;

	console.log(`[tcp] connecting to ${CHANNELS_HOST}:${CHANNELS_PORT}...`);

	const sock = createConnection({ host: CHANNELS_HOST, port: CHANNELS_PORT }, () => {
		console.log("[tcp] connected to bloom-channels.");
		tcpReconnectDelay = RECONNECT_BASE_MS;

		const registration = JSON.stringify({ type: "register", channel: "whatsapp" });
		sock.write(`${registration}\n`);
	});

	sock.setEncoding("utf8");

	sock.on("data", (data: string) => {
		tcpBuffer += data;
		const lines = tcpBuffer.split("\n");
		// Keep any incomplete trailing fragment
		tcpBuffer = lines.pop() ?? "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const msg = JSON.parse(trimmed) as unknown;
				handleChannelMessage(waSock, msg);
			} catch (err) {
				console.error("[tcp] parse error:", (err as Error).message, "| raw:", trimmed.slice(0, 120));
			}
		}
	});

	sock.on("error", (err) => {
		console.error("[tcp] error:", err.message);
	});

	sock.on("close", () => {
		channelSocket = null;
		if (shuttingDown) return;

		console.log(`[tcp] disconnected. Reconnecting in ${tcpReconnectDelay}ms...`);
		const delay = tcpReconnectDelay;
		// Exponential backoff capped at 30s
		tcpReconnectDelay = Math.min(tcpReconnectDelay * 2, RECONNECT_MAX_MS);
		setTimeout(() => connectToChannels(waSock), delay);
	});

	channelSocket = sock;
}

function sendToChannels(msg: Record<string, unknown>): void {
	if (channelSocket?.writable) {
		channelSocket.write(`${JSON.stringify(msg)}\n`);
	} else {
		console.warn("[tcp] channel socket not writable, dropping message:", msg);
	}
}

// --- Incoming channel messages -> WhatsApp ---

interface ChannelMessage {
	type: string;
	to?: string;
	text?: string;
}

function isChannelMessage(val: unknown): val is ChannelMessage {
	return (
		typeof val === "object" &&
		val !== null &&
		"type" in val &&
		typeof (val as Record<string, unknown>).type === "string"
	);
}

function handleChannelMessage(
	waSock: ReturnType<typeof makeWASocket>,
	raw: unknown,
): void {
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
		console.log(`[wa] sending to ${to}: ${text.slice(0, 80)}`);
		waSock.sendMessage(to, { text }).catch((err: unknown) => {
			console.error("[wa] sendMessage error:", (err as Error).message);
		});
		return;
	}

	// Acknowledge known control messages silently
	if (type === "registered" || type === "ping" || type === "pong") {
		return;
	}

	console.warn("[tcp] unhandled message type:", type);
}

// --- Graceful shutdown ---

function shutdown(signal: string): void {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[bloom-whatsapp] received ${signal}, shutting down...`);

	if (channelSocket) {
		channelSocket.destroy();
		channelSocket = null;
	}

	if (currentWaSock) {
		currentWaSock.end();
		currentWaSock = null;
	}

	// Give in-flight ops a moment then exit
	setTimeout(() => process.exit(0), 1_500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Entry point ---

startWhatsApp().catch((err: unknown) => {
	console.error("[bloom-whatsapp] fatal startup error:", (err as Error).message);
	process.exit(1);
});
