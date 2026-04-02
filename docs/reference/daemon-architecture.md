# Daemon Architecture

> Detailed documentation of the NixPI local chat runtime

## Why The Runtime Exists

NixPI includes a local runtime layer that handles web-chat sessions on the machine itself.

It exists to:

- Bridge local web-chat conversations into Pi sessions
- Preserve Pi session continuity within a browser session
- Serve the chat frontend and stream Pi responses as NDJSON events
- Manage idle session eviction and session lifecycle

## How The Runtime Works

The runtime lives in `core/chat-server/` and runs as the `nixpi-chat.service` systemd unit.

Session management is always one Pi session per active browser session ID.

### Startup

At startup:

1. The HTTP server reads environment config (`NIXPI_CHAT_PORT`, `NIXPI_SHARE_DIR`, `PI_DIR`)
2. A single `ChatSessionManager` instance is created
3. The server begins accepting `POST /chat` requests and serves the built frontend on `GET /`

### Runtime Path

**Primary files**:

| File | Purpose |
|------|---------|
| `core/chat-server/index.ts` | HTTP entry point, route wiring, static asset serving |
| `core/chat-server/session.ts` | Session creation, reuse, idle eviction, Pi agent integration |
| `core/chat-server/frontend/app.ts` | Browser-side chat client (NDJSON event consumer) |
| `core/os/services/nixpi-chat.nix` | systemd service wrapper |

**Current behavior**:

- One browser `sessionId` maps to one local Pi session directory under `~/.pi/chat-sessions/<sessionId>`
- Sessions are created lazily on first use
- The oldest session is evicted when `maxSessions` is exceeded
- Idle sessions are disposed after `idleTimeoutMs`
- Agent events are translated into NDJSON events streamed to the browser

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NIXPI_CHAT_PORT` | `8080` | Backend listening port |
| `NIXPI_SHARE_DIR` | `/usr/local/share/nixpi` | Packaged share directory |
| `PI_DIR` | `~/.pi` | Pi runtime directory |
| `NIXPI_CHAT_IDLE_TIMEOUT` | — | Idle session eviction window (seconds) |
| `NIXPI_CHAT_MAX_SESSIONS` | — | Maximum concurrent in-memory sessions |

## Reference

### Important Current Failure Behavior

- Startup is single-shot; systemd restart policy handles crashes
- Session eviction is LRU-based (oldest evicted when limit is exceeded)
- Idle eviction runs on a timer and disposes sessions that have been inactive

## Related

- [Codebase: Daemon](../codebase/daemon)
- [Service Architecture](./service-architecture)
