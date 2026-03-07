# Service Stack Redesign: Lemonade, dufs, wayvnc, WhatsApp Web

Date: 2026-03-07

## Context

Bloom's service stack currently includes Whisper (speech-to-text), Syncthing (home sync), NetBird (mesh networking), and WhatsApp via Baileys (headless). This redesign simplifies the stack, adds local LLM inference, and makes WhatsApp interaction visible on the desktop.

### Guiding Principles

- **Minimal by default** — fewer moving parts, less configuration surface
- **Quadlet everything** — all services are swappable containers managed by systemd
- **NetBird mesh as the security layer** — services bind to NetBird interface or localhost, never public
- **Role-based** — services fill roles (local-llm, file-server, mesh-networking, messaging), implementations are swappable

## Changes

### 1. Lemonade (replaces Whisper)

**Role**: `local-llm` (also provides speech-to-text via built-in whisper.cpp)

**What**: [Lemonade](https://github.com/lemonade-sdk/lemonade) is an AMD-backed open-source local AI server. It bundles llama.cpp for LLM inference and whisper.cpp for speech-to-text behind an OpenAI-compatible API. One service replaces Whisper and adds LLM capability.

**Container**: `ghcr.io/lemonade-sdk/lemonade-server` (pinned digest at implementation time)

**Quadlet**: `bloom-lemonade.container`
- Port: `127.0.0.1:8000:8000` (OpenAI-compatible API on localhost)
- Volume: `bloom-lemonade-models:/root/.cache/huggingface:Z` (model cache)
- Volume: `/var/lib/bloom/media:/media:ro,Z` (media files for transcription)
- Environment: `LEMONADE_LLAMACPP_BACKEND=cpu` (GPU passthrough is a future enhancement)
- Memory limit: `4g` (LLM inference is heavier than Whisper alone)
- Network: `bloom.network` (isolated bridge, same as current Whisper)
- Health: `curl -sf http://localhost:8000/health || exit 1`

**Swappable with**: Ollama (`ollama/ollama`), LocalAI, vLLM — any service that provides an OpenAI-compatible API on the same port.

**Removes**: `services/whisper/` entirely (Whisper service, quadlet, SKILL.md, catalog entry).

### 2. dufs (replaces Syncthing)

**Role**: `file-server` (WebDAV access to home directory)

**What**: [dufs](https://github.com/sigoden/dufs) is a minimal Rust file server with native WebDAV support. It exposes the user's home directory as a WebDAV endpoint accessible over the NetBird mesh. No sync state, no pairing, no configuration beyond on/off.

**Container**: `sigoden/dufs` (pinned digest at implementation time)

**Quadlet**: `bloom-dufs.container`
- Port: `127.0.0.1:5000:5000` (WebDAV server — localhost only, accessed via NetBird)
- Volume: `%h:/data:Z` (user's home directory)
- Args: `/data -A --auth admin:$BLOOM_WEBDAV_PASSWORD@/:rw` (full access with auth)
- Memory limit: `128m` (dufs is tiny)
- Network: `host` (needs to be reachable over NetBird interface)
- Health: `curl -sf http://127.0.0.1:5000 || exit 1`

**Client access patterns**:
- **Windows**: Map network drive via WebDAV (`\\bloom-device\DavWWWRoot`)
- **Linux**: Mount via `davfs2` or file manager (GNOME/KDE native WebDAV support)
- **Android**: FolderSync, Solid Explorer, or any WebDAV-capable file manager
- **macOS**: Finder > Connect to Server > `http://bloom-device:5000`

**Network binding**: dufs listens on all interfaces but only the NetBird mesh peers can reach it. The NetBird ACL provides access control. Additionally, dufs basic auth provides a second layer.

**Swappable with**: rclone (`rclone serve webdav`), Syncthing (original), any WebDAV server.

**Removes**: `services/syncthing/` entirely.

### 3. wayvnc over NetBird (replaces Remmina requirement)

**Role**: `remote-desktop` (access Bloom's Sway desktop remotely)

**What**: wayvnc is already installed and running in Sway. Currently bound to `127.0.0.1:5901` requiring SSH tunneling. Change: bind to `0.0.0.0:5901` so it's reachable over the NetBird mesh. NetBird provides encryption and access control.

**Changes**:
- `os/sysconfig/sway-config`: change wayvnc bind from `127.0.0.1` to `0.0.0.0`
- No new service needed — wayvnc is already embedded in the image
- Any VNC client on a NetBird peer can connect directly

**No new Quadlet** — this is an OS-layer config change only.

**Remmina**: Dropped. Not needed — Remmina is a VNC/RDP client app; we need the server side, which wayvnc already provides.

### 4. NetBird — cloud management (simplified)

**What stays the same**: NetBird client runs as a Quadlet container (`bloom-netbird.container`), unchanged from current setup.

**What changes**:
- Use NetBird cloud management (`api.netbird.io`) as default — no self-hosted management server
- NetBird is EU-hosted (Berlin), open-source protocol, free tier covers 5 peers
- Self-hosting is left as an advanced exercise for users who need it (not documented/supported by Bloom)
- Update SKILL.md to reflect cloud-only setup
- NetBird catalog entry changes from `optional: true` to `optional: false` (default-enabled, since dufs and wayvnc depend on it for security)

### 5. WhatsApp Web (Baileys -> whatsapp-web.js)

**Role**: `messaging` (WhatsApp bridge with visible browser)

**What**: Replace Baileys (headless reverse-engineered protocol) with [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) (Puppeteer-driven WhatsApp Web). The browser window is visible on the Sway desktop so the user can watch Pi interact with WhatsApp in real time.

**Container**: Custom image (rebuild `services/whatsapp/Containerfile`) with:
- Node.js + whatsapp-web.js + Puppeteer
- Chromium (bundled with Puppeteer or using host's Chromium)

**Quadlet**: `bloom-whatsapp.container` (replaces existing)
- Wayland passthrough: `Volume=/run/user/%U/wayland-1:/run/user/1000/wayland-1:ro`
- Environment: `WAYLAND_DISPLAY=wayland-1`, `XDG_RUNTIME_DIR=/run/user/1000`
- Volume: `bloom-whatsapp-auth:/data/auth:Z` (session persistence)
- Volume: `/var/lib/bloom/media:/media:Z` (media downloads)
- Network: `bloom.network`
- The Chromium window appears as a normal Sway window (tiled, minimizable, movable)

**Transport rewrite** (`services/whatsapp/src/transport.ts`):
- Replace Baileys imports with whatsapp-web.js `Client`
- Launch Puppeteer with `headless: false` and Wayland display
- Keep the same channel protocol (Unix socket JSON-newline to bloom-channels)
- Keep health check HTTP server
- QR code now shown in the browser window itself (WhatsApp Web native flow) instead of terminal

**What stays the same**:
- Channel protocol interface (register, message, send, response)
- Media download and forwarding
- SKILL.md structure (updated instructions)
- `utils.ts` — mostly reusable (isChannelMessage, MEDIA_TYPES, mimeToExt)

**Swappable with**: Baileys (revert to headless), or any messaging bridge that speaks the channel protocol.

## Services After Redesign

| Role | Default Service | Container Image | Swappable With |
|------|----------------|-----------------|----------------|
| mesh-networking | NetBird client | `netbirdio/netbird` | Tailscale, ZeroTier |
| local-llm + stt | Lemonade | `ghcr.io/lemonade-sdk/lemonade-server` | Ollama, LocalAI |
| file-server | dufs | `sigoden/dufs` | rclone, Syncthing |
| messaging | WhatsApp (wwebjs) | custom `bloom-whatsapp` | Baileys, Signal bridge |

wayvnc is not a Quadlet — it's embedded in the Sway config as part of the OS layer.

## Removed

| What | Why |
|------|-----|
| `services/whisper/` | Replaced by Lemonade (has built-in whisper.cpp) |
| `services/syncthing/` | Replaced by dufs (simpler, WebDAV, no sync state) |
| Remmina | Not needed — wayvnc provides remote desktop server |
| Self-hosted NetBird management | Too complex — cloud management is simpler and still EU-hosted |

## catalog.yaml After Redesign

```yaml
version: 1
registry_default: ghcr.io/pibloom
source_repo: https://github.com/pibloom/pi-bloom
services:
  lemonade:
    version: "0.1.0"
    category: ai
    artifact: ghcr.io/pibloom/bloom-svc-lemonade
    image: ghcr.io/lemonade-sdk/lemonade-server  # pin digest at implementation
    optional: false
    preflight:
      commands: [oras, podman, systemctl]
  whatsapp:
    version: "0.2.0"  # bumped — new transport
    category: communication
    artifact: ghcr.io/pibloom/bloom-svc-whatsapp
    image: ghcr.io/pibloom/bloom-whatsapp:0.2.0
    optional: true
    preflight:
      commands: [oras, podman, systemctl]
  netbird:
    version: "0.1.0"
    category: networking
    artifact: ghcr.io/pibloom/bloom-svc-netbird
    image: netbirdio/netbird  # pin digest at implementation
    optional: false
    preflight:
      commands: [oras, podman, systemctl]
  dufs:
    version: "0.1.0"
    category: sync
    artifact: ghcr.io/pibloom/bloom-svc-dufs
    image: sigoden/dufs  # pin digest at implementation
    optional: false
    preflight:
      commands: [oras, podman, systemctl]
```

## Documentation Updates

- `CLAUDE.md`: update services list (whisper/syncthing -> lemonade/dufs)
- `AGENTS.md`: update service tables
- `services/README.md`: update service table, add role concept
- `skills/service-management/SKILL.md`: update for new services
- `skills/first-boot/SKILL.md`: update setup flow (NetBird cloud, dufs, lemonade)
- `docs/service-architecture.md`: update architecture diagrams
- `os/sysconfig/sway-config`: wayvnc bind address change
- `os/sysconfig/bloom-greeting.sh`: update greeting for new service names

## Open Questions (resolve during implementation)

1. **Lemonade container digest**: pin at implementation time from `ghcr.io/lemonade-sdk/lemonade-server`
2. **dufs container digest**: pin at implementation time from `sigoden/dufs` on Docker Hub
3. **dufs auth**: generate password during `service_install` (like channel tokens), or use NetBird ACLs alone?
4. **WhatsApp container Wayland**: test Puppeteer Chromium with Wayland socket passthrough — may need `--ozone-platform=wayland` Chromium flag
5. **Lemonade default model**: which model to auto-download on first start? Gemma-3-4b-it-GGUF is suggested in their docs.
6. **dufs network binding**: `host` network vs `bloom.network` with published port — host is simpler for NetBird reachability
