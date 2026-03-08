# WhatsApp Baileys Containerization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the native whatsapp-web.js service (Puppeteer + Chromium) with a containerized Baileys-based WhatsApp service (pure WebSocket, no browser).

**Architecture:** Baileys connects directly to WhatsApp's WebSocket servers — no browser needed. The container runs a slim Node.js Alpine image with just Baileys. Auth state persists in a named Podman volume. QR code is printed to journald logs (no display passthrough). The same channel protocol (Unix socket JSON-newline to bloom-channels) is preserved. A Quadlet `.container` file follows the lemonade/dufs pattern.

**Tech Stack:** Node.js 22 Alpine, @whiskeysockets/baileys, Podman Quadlet, systemd

---

## Task 1: Rewrite transport.ts for Baileys

**Files:**
- Rewrite: `services/whatsapp/src/transport.ts`
- Modify: `services/whatsapp/package.json` (swap whatsapp-web.js for baileys)

**Step 1: Update package.json dependencies**

Replace `whatsapp-web.js` with `@whiskeysockets/baileys` and add `pino` (required by Baileys) and `@hapi/boom` (for disconnect reason checking):

```json
{
  "name": "bloom-whatsapp-transport",
  "version": "0.3.0",
  "description": "WhatsApp transport for Bloom via Baileys",
  "type": "module",
  "main": "dist/transport.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "start": "node dist/transport.js"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.16",
    "@hapi/boom": "^10.0.1",
    "pino": "^9.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^4.0.18",
    "typescript": "^5.7.0",
    "vitest": "^4.0.18"
  }
}
```

**Step 2: Rewrite transport.ts**

Replace the entire file. Key changes:
- `makeWASocket` + `useMultiFileAuthState` instead of `Client` + `LocalAuth`
- `printQRInTerminal: true` — QR appears in journald logs
- `connection.update` event instead of `client.on("ready"/"disconnected")`
- `messages.upsert` event instead of `client.on("message")`
- `downloadContentFromMessage` + `getContentType` for media
- `sock.sendMessage(jid, { text })` instead of `waClient.sendMessage(jid, text)`
- `DisconnectReason.loggedOut` check for reconnect logic
- Remove all Puppeteer/Chromium/Wayland references

```typescript
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createConnection, type Socket } from "node:net";
import makeWASocket, {
	DisconnectReason,
	downloadContentFromMessage,
	getContentType,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { isChannelMessage, mimeToExt } from "./utils.js";

const AUTH_DIR = process.env.BLOOM_AUTH_DIR ?? "/data/auth";
const defaultSocketPath = `${process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`}/bloom/channels.sock`;
const CHANNELS_SOCKET = process.env.BLOOM_CHANNELS_SOCKET ?? defaultSocketPath;
const MEDIA_DIR = process.env.BLOOM_MEDIA_DIR ?? "/media/bloom";
const CHANNEL_TOKEN = process.env.BLOOM_CHANNEL_TOKEN ?? "";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

// TCP state
let channelSocket: Socket | null = null;
let tcpBuffer = "";
let tcpReconnectDelay = RECONNECT_BASE_MS;
let tcpReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let tcpConnecting = false;
let shuttingDown = false;
let waConnected = false;

// Track WhatsApp socket
let waSock: ReturnType<typeof makeWASocket> | null = null;

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

// --- Health check HTTP server ---

const HEALTH_PORT = Number(process.env.BLOOM_HEALTH_PORT ?? "18801");

const healthServer = createHttpServer((req, res) => {
	if (req.url === "/health") {
		const healthy = waConnected && channelSocket?.writable === true;
		res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ wa: waConnected, channel: channelSocket?.writable === true }));
	} else {
		res.writeHead(404);
		res.end();
	}
});

healthServer.listen(HEALTH_PORT, "0.0.0.0", () => {
	console.log(`[health] listening on :${HEALTH_PORT}`);
});

// --- WhatsApp via Baileys ---

async function startWhatsApp(): Promise<void> {
	if (shuttingDown) return;

	console.log("[wa] starting Baileys client...");

	const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

	const sock = makeWASocket({
		auth: state,
		printQRInTerminal: true,
		logger,
	});

	waSock = sock;

	sock.ev.on("creds.update", saveCreds);

	sock.ev.on("connection.update", (update) => {
		const { connection, lastDisconnect } = update;

		if (connection === "close") {
			waConnected = false;
			clearTcpReconnectTimer();
			resetChannelSocket();

			const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
			const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

			console.log(`[wa] disconnected (code=${statusCode}). Reconnecting: ${shouldReconnect}`);

			if (shouldReconnect && !shuttingDown) {
				setTimeout(startWhatsApp, 5_000);
			} else if (!shouldReconnect) {
				console.log("[wa] logged out. Remove auth volume and re-pair to reconnect.");
			}
		} else if (connection === "open") {
			console.log("[wa] connected.");
			waConnected = true;
			tcpReconnectDelay = RECONNECT_BASE_MS;
			clearTcpReconnectTimer();
			resetChannelSocket();
			connectToChannels();
		}
	});

	sock.ev.on("messages.upsert", async ({ messages, type }) => {
		if (type !== "notify") return;

		for (const msg of messages) {
			if (msg.key.fromMe) continue;
			if (!msg.message) continue;

			const from = msg.key.remoteJid ?? "";
			const timestamp = msg.messageTimestamp as number;

			const messageType = getContentType(msg.message);

			if (messageType && isMediaType(messageType)) {
				try {
					const mediaMsg = msg.message[messageType];
					if (mediaMsg && "url" in mediaMsg) {
						const stream = await downloadContentFromMessage(mediaMsg, mediaCategory(messageType));
						const chunks: Buffer[] = [];
						for await (const chunk of stream) {
							chunks.push(chunk as Buffer);
						}
						const buffer = Buffer.concat(chunks);
						const mimetype = (mediaMsg as { mimetype?: string }).mimetype ?? "application/octet-stream";
						const caption = (mediaMsg as { caption?: string }).caption;
						await handleMediaMessage(from, timestamp, buffer, mimetype, caption);
						continue;
					}
				} catch (err) {
					console.error("[wa] media download error:", (err as Error).message);
				}
			}

			const text = msg.message.conversation
				?? msg.message.extendedTextMessage?.text
				?? "";

			if (text) {
				console.log(`[wa] message from ${from}: ${text.slice(0, 80)}`);
				sendToChannels({
					type: "message",
					id: randomUUID(),
					channel: "whatsapp",
					from,
					text,
					timestamp,
				});
			}
		}
	});
}

function isMediaType(type: string): boolean {
	return ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage"].includes(type);
}

function mediaCategory(type: string): "image" | "video" | "audio" | "document" | "sticker" {
	const map: Record<string, "image" | "video" | "audio" | "document" | "sticker"> = {
		imageMessage: "image",
		videoMessage: "video",
		audioMessage: "audio",
		documentMessage: "document",
		stickerMessage: "sticker",
	};
	return map[type] ?? "document";
}

async function handleMediaMessage(
	from: string,
	timestamp: number,
	buffer: Buffer,
	mimetype: string,
	caption?: string,
): Promise<void> {
	const ext = mimeToExt(mimetype);
	const id = randomBytes(6).toString("hex");
	const filename = `${timestamp}-${id}.${ext}`;
	const filepath = `${MEDIA_DIR}/${filename}`;

	await mkdir(MEDIA_DIR, { recursive: true });
	await writeFile(filepath, buffer);
	const size = buffer.length;
	console.log(`[wa] saved media from ${from}: ${filepath} (${size} bytes)`);

	let kind = "unknown";
	if (mimetype.startsWith("audio/")) kind = "audio";
	else if (mimetype.startsWith("image/")) kind = "image";
	else if (mimetype.startsWith("video/")) kind = "video";
	else if (mimetype.startsWith("application/")) kind = "document";

	sendToChannels({
		type: "message",
		id: randomUUID(),
		channel: "whatsapp",
		from,
		timestamp,
		media: {
			kind,
			mimetype,
			filepath,
			size,
			caption: caption || undefined,
		},
	});
}

// --- TCP channel connection ---

function connectToChannels(): void {
	if (shuttingDown || !waConnected) return;
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

		const registration: Record<string, string> = { type: "register", channel: "whatsapp" };
		if (CHANNEL_TOKEN) registration.token = CHANNEL_TOKEN;
		sock.write(`${JSON.stringify(registration)}\n`);
	});

	sock.on("data", (data: string) => {
		if (channelSocket !== sock) return;

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
		if (shuttingDown || !waConnected) return;
		scheduleTcpReconnect();
	});
}

function sendToChannels(msg: Record<string, unknown>): void {
	if (channelSocket?.writable) {
		channelSocket.write(`${JSON.stringify(msg)}\n`);
	} else {
		console.warn("[tcp] channel socket not writable, dropping message:", msg);
	}
}

// --- Incoming channel messages -> WhatsApp ---

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
		if (!waSock) {
			console.warn("[tcp] WhatsApp client not ready — dropping message.");
			return;
		}
		console.log(`[wa] sending to ${to}: ${text.slice(0, 80)}`);
		waSock.sendMessage(to, { text }).catch((err: unknown) => {
			console.error("[wa] sendMessage error:", (err as Error).message);
		});
		return;
	}

	if (type === "ping") {
		if (channelSocket?.writable) {
			channelSocket.write(`${JSON.stringify({ type: "pong" })}\n`);
		}
		return;
	}

	if (type === "registered" || type === "pong" || type === "status") {
		return;
	}

	console.warn("[tcp] unhandled message type:", type);
}

// --- Graceful shutdown ---

function shutdown(signal: string): void {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[bloom-whatsapp] received ${signal}, shutting down...`);

	healthServer.close();
	clearTcpReconnectTimer();
	resetChannelSocket();

	if (waSock) {
		waSock.end(undefined);
		waSock = null;
	}

	setTimeout(() => process.exit(0), 1_500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Entry point ---

startWhatsApp().catch((err: unknown) => {
	console.error("[bloom-whatsapp] fatal startup error:", (err as Error).message);
	process.exit(1);
});
```

**Step 3: Run `npm install` in services/whatsapp to update lock file**

Run: `cd services/whatsapp && rm -rf node_modules package-lock.json && npm install`

**Step 4: Build and verify compilation**

Run: `cd services/whatsapp && npm run build`
Expected: Clean compile, no errors

**Step 5: Run existing tests (utils.test.ts should still pass)**

Run: `cd services/whatsapp && npm test`
Expected: All utils tests pass (utils.ts unchanged)

**Step 6: Commit**

```bash
git add services/whatsapp/src/transport.ts services/whatsapp/package.json services/whatsapp/package-lock.json
git commit -m "feat: replace whatsapp-web.js with Baileys

Baileys connects via WebSocket — no Chromium/Puppeteer needed.
QR code prints to terminal/logs for pairing.
Same channel protocol preserved (Unix socket JSON-newline)."
```

---

## Task 2: Create WhatsApp container image

**Files:**
- Create: `services/whatsapp/Containerfile`

**Step 1: Create the Containerfile**

```dockerfile
FROM docker.io/library/node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ dist/

ENV NODE_ENV=production
ENV BLOOM_AUTH_DIR=/data/auth
ENV BLOOM_MEDIA_DIR=/media/bloom
ENV BLOOM_HEALTH_PORT=18801

EXPOSE 18801

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:18801/health || exit 1

USER node

CMD ["node", "dist/transport.js"]
```

**Step 2: Commit**

```bash
git add services/whatsapp/Containerfile
git commit -m "feat: add Containerfile for WhatsApp Baileys service

Slim Node.js 22 Alpine image. No Chromium dependency.
Health check on :18801, auth persisted in /data/auth volume."
```

---

## Task 3: Create Quadlet container unit + volume

**Files:**
- Create: `services/whatsapp/quadlet/bloom-whatsapp.container`
- Create: `services/whatsapp/quadlet/bloom-whatsapp-auth.volume`

**Step 1: Create the volume unit**

```ini
[Volume]
```

**Step 2: Create the container unit**

The container needs:
- `bloom.network` for isolation
- Named volume for auth persistence
- Bind mount for media files at `/var/lib/bloom/media`
- Bind mount for channels Unix socket (read from `$XDG_RUNTIME_DIR/bloom/`)
- Channel token from env file
- Health check port published on localhost

```ini
[Unit]
Description=Bloom WhatsApp Bridge (Baileys)
After=network-online.target
Wants=network-online.target

[Container]
Image=localhost/bloom-whatsapp:latest
ContainerName=bloom-whatsapp

# Bridge network for isolation
Network=bloom.network

# Health check endpoint on localhost
PublishPort=127.0.0.1:18801:18801

# Auth state persists across restarts
Volume=bloom-whatsapp-auth:/data/auth

# Media files shared with host (lemonade reads these)
Volume=/var/lib/bloom/media:/media/bloom

# Channel bridge Unix socket
Volume=%t/bloom:/run/bloom

Environment=BLOOM_CHANNELS_SOCKET=/run/bloom/channels.sock
Environment=NODE_ENV=production

# Auth credentials (generated by service_install)
EnvironmentFile=%h/.config/bloom/channel-tokens/whatsapp.env

PodmanArgs=--memory=256m
PodmanArgs=--security-opt label=disable
HealthCmd=wget -qO- http://localhost:18801/health || exit 1
HealthInterval=30s
HealthRetries=3
HealthTimeout=10s
HealthStartPeriod=60s
NoNewPrivileges=true
LogDriver=journald

[Service]
Restart=on-failure
RestartSec=10
TimeoutStartSec=300
TimeoutStopSec=30

[Install]
WantedBy=default.target
```

**Step 3: Commit**

```bash
git add services/whatsapp/quadlet/
git commit -m "feat: add Quadlet container + volume units for WhatsApp

bloom-whatsapp.container follows lemonade/dufs pattern:
- bloom.network isolation
- Named volume for auth persistence
- Bind mount for media + channels socket
- Health check on :18801
- 256m memory limit"
```

---

## Task 4: Update catalog.yaml

**Files:**
- Modify: `services/catalog.yaml`

**Step 1: Remove `native: true`, add `image` and `podman` preflight**

```yaml
  whatsapp:
    version: "0.3.0"
    category: communication
    image: localhost/bloom-whatsapp:latest
    optional: true
    preflight:
      commands: [podman, systemctl]
```

**Step 2: Commit**

```bash
git add services/catalog.yaml
git commit -m "refactor: whatsapp catalog entry — container, not native

Remove native:true, add image reference, require podman preflight.
Version bumped to 0.3.0 for Baileys migration."
```

---

## Task 5: Clean up OS Containerfile

**Files:**
- Modify: `os/Containerfile`
- Delete: `os/sysconfig/bloom-whatsapp.service`

**Step 1: Remove the native WhatsApp build step (lines 84-89)**

Remove:
```dockerfile
# Build WhatsApp transport (native service — no container image needed)
RUN cd /usr/local/share/bloom/services/whatsapp && \
    HOME=/tmp npm install --cache /tmp/npm-cache && \
    npm run build && \
    npm prune --omit=dev && \
    rm -rf /tmp/npm-cache /var/roothome/.npm /root/.npm
```

**Step 2: Remove the native systemd unit COPY (lines 116-117)**

Remove:
```dockerfile
# WhatsApp bridge runs natively (Node.js + Chromium already in image)
COPY os/sysconfig/bloom-whatsapp.service /usr/lib/systemd/user/bloom-whatsapp.service
```

**Step 3: Remove `chromium` from the system packages list (line 30)**

Remove `chromium \` from the `dnf install` block. Chromium is no longer needed — WhatsApp was its only consumer. Sway, VS Code, and other desktop tools don't require it.

**Step 4: Delete the native systemd unit file**

```bash
git rm os/sysconfig/bloom-whatsapp.service
```

**Step 5: Commit**

```bash
git add os/Containerfile
git commit -m "refactor: remove native WhatsApp from OS image

WhatsApp is now a container service — no Chromium or native
build step needed. Removes ~400MB from OS image (chromium package)."
```

---

## Task 6: Remove native service token pre-creation from greeting script

**Files:**
- Modify: `os/sysconfig/bloom-greeting.sh` (lines 52-61)

**Step 1: Remove the whatsapp token loop**

Remove the entire block:
```bash
# --- Pre-create channel tokens for native services ---
TOKEN_DIR="$HOME/.config/bloom/channel-tokens"
mkdir -p "$TOKEN_DIR"
for svc in whatsapp; do
    if [ ! -f "$TOKEN_DIR/$svc.env" ]; then
        token=$(openssl rand -hex 32)
        echo "$token" > "$TOKEN_DIR/$svc"
        echo "BLOOM_CHANNEL_TOKEN=$token" > "$TOKEN_DIR/$svc.env"
    fi
done
```

Token generation now happens via `service_install` (same as lemonade/dufs) — see `lib/manifest.ts:installServicePackage`.

**Step 2: Commit**

```bash
git add os/sysconfig/bloom-greeting.sh
git commit -m "refactor: remove native whatsapp token pre-creation from greeting

Token generation now handled by service_install, same as all
other container services."
```

---

## Task 7: Update SKILL.md for new container-based service

**Files:**
- Modify: `services/whatsapp/SKILL.md`

**Step 1: Rewrite SKILL.md**

```markdown
---
name: whatsapp
version: 0.3.0
description: WhatsApp messaging bridge via Baileys (containerized)
image: localhost/bloom-whatsapp:latest
---

# WhatsApp Bridge

Connects WhatsApp to Bloom via the channel protocol (Unix socket at `$XDG_RUNTIME_DIR/bloom/channels.sock`). Uses Baileys to connect directly to WhatsApp's WebSocket servers — no browser needed.

## Setup

1. Install the service package: `service_install(name="whatsapp")`
2. Watch logs for QR code: `journalctl --user -u bloom-whatsapp -f`
3. Scan the QR code with WhatsApp mobile app (Settings > Linked Devices > Link a Device)
4. Verify: `systemctl --user status bloom-whatsapp`

## Pairing

On first start, a QR code is printed to the service logs. View it with:

```bash
journalctl --user -u bloom-whatsapp -f
```

Scan the QR code with your WhatsApp mobile app to pair. Auth state persists in the `bloom-whatsapp-auth` volume — you only need to pair once.

## Sending Messages

Use the `/wa` command in Pi to send outbound WhatsApp messages.

## Troubleshooting

- **Won't start**: Check logs: `journalctl --user -u bloom-whatsapp -n 100`
- **Connection lost**: Restart: `systemctl --user restart bloom-whatsapp`
- **Auth expired**: Remove auth volume and re-scan QR:
  ```bash
  systemctl --user stop bloom-whatsapp
  podman volume rm bloom-whatsapp-auth
  systemctl --user start bloom-whatsapp
  ```

## Media Support

The bridge downloads audio, image, and video messages to `/var/lib/bloom/media/` (bind-mounted into the container at `/media/bloom`).
Media metadata is forwarded to Pi via the channel protocol with file paths.
Pi can use installed services (e.g., Lemonade) to process media files.
```

**Step 2: Commit**

```bash
git add services/whatsapp/SKILL.md
git commit -m "docs: update whatsapp SKILL.md for Baileys container service"
```

---

## Task 8: Update first-boot skill

**Files:**
- Modify: `skills/first-boot/SKILL.md` (lines 68-79)

**Step 1: Replace the WhatsApp section**

Replace the WhatsApp Bridge section (lines 68-79) with:

```markdown
#### WhatsApp Bridge

- Install service package: `service_install(name="whatsapp")`
- Watch logs for QR code: `journalctl --user -u bloom-whatsapp -f`
- Scan QR with WhatsApp mobile app (Settings > Linked Devices)
- Verify: `service_test(name="whatsapp")`

The WhatsApp bridge needs the bloom-channels socket for IPC. If bloom-channels is not running, WhatsApp will reconnect automatically when it becomes available.
```

**Step 2: Commit**

```bash
git add skills/first-boot/SKILL.md
git commit -m "docs: update first-boot skill for containerized WhatsApp"
```

---

## Task 9: Update project docs referencing native WhatsApp

**Files:**
- Modify: `CLAUDE.md` (line 16 and 73)
- Modify: `README.md` (lines 27, 75, and whatsapp table row)
- Modify: `AGENTS.md` (lines 17, 194, and whatsapp table row)
- Modify: `services/README.md` (line 3)
- Modify: `docs/service-architecture.md` (lines 87, 93, 97, 99, 112)
- Modify: `docs/pibloom-setup.md` (lines 90-94)
- Modify: `skills/service-management/SKILL.md` (line 8)
- Modify: `skills/self-evolution/SKILL.md` (line 18)

**Step 1: Update all references from "native" to "container"**

In each file, change references like:
- "containerized (lemonade, dufs) and native (whatsapp)" → "containerized (lemonade, dufs, whatsapp)"
- "Container or native systemd unit" → "Container (Podman Quadlet)" (remove native option since NetBird is a system RPM, not a service we manage)
- "containers or native systemd services" → "containers"
- WhatsApp table rows: change Type from "Native" to "Container"
- "native systemd units" → remove (no native services remain in catalog)

**Step 2: Commit**

```bash
git add CLAUDE.md README.md AGENTS.md services/README.md docs/service-architecture.md docs/pibloom-setup.md skills/service-management/SKILL.md skills/self-evolution/SKILL.md
git commit -m "docs: remove all native service references

WhatsApp is now containerized. NetBird is a system RPM (not in
service catalog). No native services remain in the catalog."
```

---

## Task 10: Build and test the container image locally

**Step 1: Build the WhatsApp transport**

Run: `cd services/whatsapp && npm run build`

**Step 2: Build the container image**

Run: `cd services/whatsapp && podman build -t bloom-whatsapp:latest .`

**Step 3: Verify the container starts and health check responds**

Run: `podman run --rm -d --name bloom-whatsapp-test -p 18801:18801 bloom-whatsapp:latest`
Run: `sleep 5 && curl -sf http://localhost:18801/health`
Expected: `{"wa":false,"channel":false}` (no WhatsApp paired yet, but health endpoint works)

Run: `podman stop bloom-whatsapp-test`

**Step 4: Run biome check on the whole project**

Run: `npm run check`
Expected: No new errors

**Step 5: Run all project tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify WhatsApp container build and tests pass"
```
