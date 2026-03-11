# Matrix as Core OS Infrastructure

**Date:** 2026-03-11
**Status:** Approved
**Approach:** Big Bang (single migration, no transitional code)

## Summary

Promote Matrix (Continuwuity homeserver), Cinny (web client), and the Pi-Matrix bot connection from containerized services to native OS infrastructure baked into the bootc image. Retire the Unix socket channel architecture entirely. Matrix rooms become the universal communication layer. External bridges (WhatsApp, Telegram, Signal) remain Podman containers managed by Pi on user request.

## Architecture Exception: OS-Level Infrastructure Tier

ARCHITECTURE.md establishes a "containers first" philosophy. This design deliberately creates an exception: an **OS-level infrastructure tier** for services that are foundational to the system's identity and cannot be optional. Matrix (communication backbone) and NetBird (mesh networking) qualify because every other feature depends on them. This is analogous to how systemd, nginx, and podman are baked into the image rather than containerized.

ARCHITECTURE.md must be updated to document this tier as part of the implementation.

## Rollback Strategy

Since this is a bootc system, the previous image is always available via `bootc rollback`. If Continuwuity fails to start or the Matrix bot cannot connect, the user still has SSH access (NetBird + SSH are independent). The previous containerized Matrix stack can be restored by rolling back to the prior image. This is acceptable for a "big bang" migration on an immutable OS.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Matrix server | Native binary in OS image | Core infrastructure, not optional |
| Pi-Matrix connection | In-process via `matrix-bot-sdk` | No intermediary, clean architecture |
| Web client | Cinny (static files via nginx) | Lightweight, clean UI, no extra runtime |
| External bridges | Podman containers (mautrix-*) | Optional, third-party, user-initiated |
| Bridge auth flow | Pi guides conversationally, Cinny for visual steps | Single interface (Pi), visual when needed |
| Server name | `bloom`, federation off | Isolated per-device homeserver |
| Unix socket / channels.sock | Retired entirely | Matrix rooms replace all IPC |
| Migration strategy | Big Bang | Clean result, no transitional code |

## Section 1: OS Image Changes

### Continuwuity (Matrix homeserver)

- Extract the Continuwuity binary from the existing container image (`forgejo.ellis.link/continuwuation/continuwuity:0.5.0-rc.6`) using a multi-stage Containerfile (`COPY --from=continuwuity-image /usr/local/bin/continuwuity /usr/local/bin/continuwuity`). No Rust compilation needed -- the container image already has the binary built.
- Systemd unit: `bloom-matrix.service` (system-level, auto-enabled on boot)
- Data directory: `/var/lib/continuwuity/` (SQLite DB, persisted across boots)
- Config: `/etc/bloom/matrix.toml`
  - `server_name = "bloom"`
  - Federation disabled
  - Registration requires token
  - Max request size: 20MB
  - Port: 6167

### Cinny (web client)

- Download Cinny release tarball in the Containerfile, extract to `/usr/share/cinny/`
- Nginx serves Cinny (reverse proxy already in the image)
- `config.json` points homeserver to relative path (proxied by nginx, see below)

### Nginx configuration

Nginx (already in the image) needs two additions:

- `location /cinny` -- serve static files from `/usr/share/cinny/`
- `location /_matrix/` -- reverse proxy to `http://localhost:6167` so Cinny (accessed remotely over NetBird) can reach the homeserver. Without this, the browser cannot reach `localhost:6167` on the remote machine.

Cinny's `config.json` should use the relative homeserver URL (e.g., the device's hostname or IP) rather than `localhost`, since users access Cinny remotely over NetBird.

### NetBird

No changes. Already a native system RPM.

### Removed from image

- `bloom-matrix.container` Quadlet file
- `bloom-element.container` Quadlet file
- Element bridge service and image build

## Section 2: Pi as Matrix Bot

### bloom-channels extension rewrite

Replace the Unix socket server (`channel-server.ts`) with a Matrix client using `matrix-bot-sdk`. Pi logs in as `@pi:bloom` directly.

**Startup:** `MatrixClient` syncs, auto-joins rooms, listens for messages.
**Shutdown:** Graceful client stop.

### Message flow

**Inbound:** User sends message in Matrix room -> `matrix-bot-sdk` sync -> bloom-channels delivers to Pi as user message.

**Outbound:** Pi responds -> bloom-channels sends to Matrix room via `MatrixClient.sendMessage()`.

### Media handling

- **Inbound:** Download media from Matrix to temp dir, pass file path to Pi.
- **Outbound:** Upload to Matrix via `MatrixClient.uploadContent()`.

### Bot identity

- User: `@pi:bloom`, registered on first boot
- Credentials: `~/.pi/matrix-credentials.json`
- E2EE: Not required. Federation is off, all traffic is localhost between Pi and Continuwuity. This avoids the `matrix-sdk-crypto-nodejs` native Rust addon and its glibc compatibility issues (see commit a610f75). If E2EE is needed later, it can be added as a separate concern.

### Removed

- `channel-server.ts` (socket server)
- `services/element/` (entire directory)
- Socket protocol (JSON-newline, heartbeats, rate limiting)
- `channels.sock` runtime file
- All socket-related types and utilities

## Section 3: Bridge Management

### Flow

When the user says "connect my WhatsApp," Pi:

1. Pulls the mautrix bridge image
2. Generates a Quadlet `.container` file (`bloom-bridge-{name}.container`)
3. Creates config pointing bridge at `http://host.containers.internal:6167` (host-accessible address from inside Podman containers)
4. Registers the bridge's appservice with Continuwuity by writing a YAML registration file to `/etc/bloom/appservices/` and reloading Continuwuity (`systemctl reload bloom-matrix` or SIGHUP). Pi needs passwordless sudo for `systemctl reload bloom-matrix` (added via sudoers drop-in during image build).
5. Starts the bridge via systemd
6. Guides user through auth ("Open Cinny and scan the QR code in the bridge room")

### Bridge container conventions

- Named `bloom-bridge-{name}` (e.g., `bloom-bridge-whatsapp`)
- Use `--network=slirp4netns` or `host.containers.internal` to reach the host's Continuwuity on port 6167. Not on `bloom.network` (that network is for container-to-container communication; Continuwuity is now a native service on the host).
- Health checks required
- Managed by systemd (Quadlet)

### Pi tools

- `bridge_create(protocol)` -- pull image, generate config/Quadlet, register appservice, start
- `bridge_remove(protocol)` -- stop, remove Quadlet, unregister appservice
- `bridge_status()` -- list active bridges with connection status

### Bridge catalog

New `bridges` section in `services/catalog.yaml` (reuses existing catalog loading in `lib/services-catalog.ts`):

```yaml
bridges:
  whatsapp:
    image: dock.mau.dev/mautrix/whatsapp:latest
    auth_method: qr_code
    description: Bridge WhatsApp conversations to Matrix
  telegram:
    image: dock.mau.dev/mautrix/telegram:latest
    auth_method: phone_code
    description: Bridge Telegram conversations to Matrix
  signal:
    image: dock.mau.dev/mautrix/signal:latest
    auth_method: qr_code
    description: Bridge Signal conversations to Matrix
```

## Section 4: Service Catalog & Extension Changes

### Service catalog (`services/catalog.yaml`)

- Remove `matrix` and `element` entries (now OS infrastructure)
- `dufs` and `code-server` remain as services

### Extension changes

| Extension | Change |
|-----------|--------|
| `bloom-channels` | Full rewrite: socket server -> Matrix client via `matrix-bot-sdk` |
| `bloom-services` | Remove `matrix-register.ts`, remove Element install logic. Add `bridge_create`, `bridge_remove`, `bridge_status` tools. |
| `bloom-setup` | Update first-boot: verify Continuwuity running, create `@pi:bloom`, create initial room. No service installs for Matrix/Element. |

### Skills updates

- `services/matrix/SKILL.md` -> migrates to `skills/` as core OS knowledge
- `services/element/SKILL.md` -> retired
- New `skills/bridges.md` -- how Pi manages Matrix bridges
- `services/netbird/SKILL.md` -> stays (already system-level)

### lib/ changes

- Remove socket-related utilities
- Add `lib/matrix.ts` -- pure functions for Matrix operations (room creation, appservice registration, bridge config generation)
- `matrix-bot-sdk` dependency moves from `services/element/` to root `package.json`

## Section 5: First Boot Flow

### First boot sequence

1. **Continuwuity starts** -- systemd auto-starts `bloom-matrix.service`
2. **NetBird starts** -- already works this way
3. **Nginx starts** -- serves Cinny
4. **Pi starts** -- user logs in, Pi launches
5. **Pi first-boot setup:**
   - Generates registration token if not present
   - Registers `@pi:bloom` bot account
   - Stores credentials in `~/.pi/matrix-credentials.json`
   - Creates `#general:bloom` room
   - Registers `@user:bloom` account for the human user
   - Connects to Matrix, joins `#general:bloom`
6. **Pi greets the user:**
   - "Your Matrix homeserver is running. Open Cinny at `http://<hostname>/cinny` to chat."
   - Login: `@user:bloom` with generated password (displayed once in terminal, stored in `~/.pi/matrix-credentials.json` alongside bot creds; user can ask Pi to reset it later)
   - "Want me to connect your WhatsApp, Telegram, or Signal?"

### Subsequent boots

- Continuwuity, NetBird, nginx auto-start via systemd
- Pi reads stored credentials, reconnects to Matrix immediately
- No setup steps needed

## Section 6: What Gets Deleted

### Services removed

- `services/element/` -- entire directory (Containerfile, transport.ts, package.json, Quadlet, SKILL.md)
- `services/matrix/` -- Quadlet files; SKILL.md content migrates to `skills/`

### Extension code removed

- `extensions/bloom-channels/channel-server.ts` (socket server)
- `extensions/bloom-channels/pairing.ts` (socket pairing state)
- All socket protocol types (message, response, send, ping, heartbeat)
- Socket-related rate limiting, reconnection, queue logic

**Note:** The `extractResponseText` utility from `channel-server.ts` (converts Pi agent responses to plain text) must migrate to the new Matrix client code or to `lib/`, as the Matrix bot needs the same functionality.

### Service management code removed

- `extensions/bloom-services/matrix-register.ts`
- Element-specific install/pairing logic

### Runtime artifacts removed

- `$XDG_RUNTIME_DIR/bloom/channels.sock`
- `bloom-element-data` Podman volume
- `bloom-matrix` Podman volume (data moves to `/var/lib/continuwuity/`)

### Catalog entries removed

- `matrix` and `element` from `services/catalog.yaml`

### Dependencies removed

- Socket protocol utilities in `lib/`
- Element bridge npm dependencies (but `matrix-bot-sdk` stays -- Pi uses it directly)
