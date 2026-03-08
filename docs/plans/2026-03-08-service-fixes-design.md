# Service Fixes: STT Port, WhatsApp 405, Signal Pairing

Date: 2026-03-08

## Context

VM testing of the first-boot wizard revealed three service-level bugs that need codebase fixes (not just runtime patches):

1. **STT**: whisper.cpp container ignores our Exec args due to `ENTRYPOINT ["bash", "-c"]`
2. **WhatsApp**: Baileys 6.7.x hardcodes a stale WA protocol version, causing instant 405 disconnects
3. **Signal**: Transport starts daemon with `-a ACCOUNT` which requires an already-linked account; pairing is impossible

## Fix 1: STT Entrypoint/Port

**Root cause:** The upstream `ghcr.io/ggml-org/whisper.cpp:main` image uses `ENTRYPOINT ["bash", "-c"]`. Quadlet's `Exec=` sets the CMD, which bash receives as a `-c` script string — the arguments after the binary path become positional params that get silently lost. Server starts on default port 8080 with default model path.

**Fix in `services/stt/quadlet/bloom-stt.container`:**
- `PodmanArgs=--entrypoint /app/build/bin/whisper-server` — override bash entrypoint
- `Exec=--host 0.0.0.0 --port 8080 --model /models/ggml-base.en.bin --threads 4` — bare args
- `PublishPort=127.0.0.1:8081:8080` — 8080 inside, 8081 outside (external API unchanged)
- `HealthCmd=curl -sf http://localhost:8080/health || exit 1` — check inside port

## Fix 2: WhatsApp 405 Disconnect

**Root cause:** Baileys hardcodes WA protocol version `[2, 3000, 1027934701]` in `lib/Defaults/index.js`. WhatsApp servers reject this stale version with HTTP 405 on the WebSocket upgrade. Affects all published versions (6.7.x and 7.0.0-rc).

**Fix in `services/whatsapp/src/transport.ts`:**
- Import `Browsers` and `fetchLatestWaWebVersion` from Baileys
- Before `makeWASocket()`, call `fetchLatestWaWebVersion()` with try/catch
- Fallback to known-good version `[2, 3000, 1034074495]` if fetch fails
- Pass `version`, `browser: Browsers.macOS("Desktop")`, `syncFullHistory: false` to socket config

The fallback version will go stale eventually, but the dynamic fetch is self-healing. This is the approach the Baileys community converged on.

## Fix 3: Signal Multi-Account Daemon + JSON-RPC Linking

**Root cause:** Transport starts `signal-cli -a +NUMBER daemon` which requires the account to already be linked. On first install, there's no linked account, so signal-cli exits with "User not registered."

**Fix: Rewrite daemon startup and add JSON-RPC pairing in `services/signal/src/transport.ts`:**

### Startup
- Remove `SIGNAL_ACCOUNT` hard requirement (no `process.exit(1)`)
- Start daemon without `-a`: `signal-cli --config DIR --output=json daemon --receive-mode=on-connection`
- Daemon starts and listens even with no accounts linked

### JSON-RPC tracking
- Add pending RPC map: `Map<number, { resolve, reject }>` keyed by request id
- `sendRpc(method, params): Promise<unknown>` writes to daemon stdin, returns Promise
- On stdout, check for `jsonrpc` field — if present, resolve/reject; otherwise handle as Signal envelope

### Pairing flow (channel bridge `type: "pair"` message)
1. `sendRpc("startLink", {})` → `{ deviceLinkUri: "sgnl://..." }`
2. Broadcast `{ type: "pairing", channel: "signal", data: deviceLinkUri }` to channel bridge
3. `sendRpc("finishLink", { deviceLinkUri, deviceName: "Bloom" })` → blocks until phone confirms → `{ accountNumber: "+1234..." }`
4. Store account number for sending

### Stdout multiplexing
```
if ("jsonrpc" in parsed) → handleRpcResponse(parsed)
else → handleSignalMessage(parsed)
```

### Sending messages
- Keep existing JSON-RPC `send` method
- Add `account` field to params when stored account is known

### Health check
- Unchanged. Unlinked daemon is still "connected" — just has no accounts yet.

## Files Changed

| File | Change |
|------|--------|
| `services/stt/quadlet/bloom-stt.container` | Override entrypoint, fix port mapping |
| `services/whatsapp/src/transport.ts` | Dynamic version fetch + browser config |
| `services/signal/src/transport.ts` | Multi-account daemon + JSON-RPC linking |

## Not Changed

- No dependency additions or version bumps
- No Quadlet changes for WhatsApp or Signal
- `SIGNAL_ACCOUNT` env var becomes optional (backward compatible)
- External API ports unchanged (STT on 8081, WhatsApp health on 18801, Signal health on 18802)
