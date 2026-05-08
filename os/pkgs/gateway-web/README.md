# ownloom-gateway-web

Small protocol/v1-only Ownloom cockpit for local operator use.

It is intentionally static HTML/CSS/JS: no bundled legacy gateway UI, no framework, no build step. The browser app uses native ES modules plus a pragmatic Atomic Design layout.

Design direction and guardrails live in [`DESIGN.md`](./DESIGN.md): **calm sovereign cockpit** — local-first, accessible, low-noise, inspectable, and subtly based on the Ownloom idea of owned context and woven continuity.

## Use

On `ownloom-vps`, the NixOS service serves the UI loopback-only:

```text
http://127.0.0.1:8090
```

From another machine, use an SSH tunnel:

```bash
ssh -L 8090:127.0.0.1:8090 ownloom-vps
```

Then open <http://127.0.0.1:8090> and click **Pair this browser**. The browser receives a loopback-only runtime token, stores it in local storage only when **Remember locally** is enabled, and connects automatically.

You can still paste a named client token manually and click **Connect** if needed.

For ad-hoc local use without the NixOS service:

```bash
nix run .#ownloom-gateway-web
```

The server serves the static UI and proxies `/api/v1/*` plus WebSocket upgrades to `OWNLOOM_GATEWAY_URL`, defaulting to `http://127.0.0.1:8081`. When `OWNLOOM_TERMINAL_URL` is set, `/terminal/` is proxied to the loopback Zellij web client for the cockpit Terminal tab.

The terminal tab opens the shared `ownloom` Zellij session at `/terminal/ownloom`. Zellij web requires its own login token. The NixOS service creates one on first start and stores it at `/var/lib/ownloom-terminal/login-token`. The cockpit can copy that token from the loopback-only **Copy Zellij token** button; after login, Zellij stores a browser session cookie.

## Static architecture

The UI is organized as native ES modules:

```text
public/
  app.js                  # tiny compatibility bootstrap
  js/
    app.js                # app composition/root controller
    constants.js          # storage keys, protocol constants
    state.js              # app state and chat/session helpers
    storage.js            # localStorage helpers
    dom.js                # safe DOM helpers
    gateway-client.js     # protocol/v1 WebSocket + REST wrappers
    pwa.js                # service worker registration/status
    a11y.js               # ARIA tab controller
    components/
      atoms.js
      molecules.js
      organisms/*.js
    controllers/*.js
  styles/
    tokens.css
    base.css
    layout.css
    components.css
    utilities.css
    responsive.css
  manifest.webmanifest
  sw.js
  icons/icon.svg
```

Atomic Design is used as file organization, not framework ceremony:

- **atoms**: buttons, chips, pills, small text primitives
- **molecules**: message bubbles, action rows, list item shells
- **organisms**: chat/session/client/delivery/command/terminal/settings renderers
- **controllers**: event wiring and flows for chat, config, terminal, organizer, and log

Dynamic UI is rendered with DOM APIs and `textContent`; avoid `innerHTML`, `outerHTML`, and `insertAdjacentHTML`.

CSS is split through `public/style.css` with cascade layers and tokenized colors/spacing/focus treatment. Keep it no-build: add new CSS files explicitly and include them in the service worker allowlist/smoke check when needed.

## PWA and cache boundaries

The cockpit has a minimal PWA shell:

- `manifest.webmanifest` for install metadata/shortcuts
- `sw.js` for an offline static shell only
- `icons/icon.svg` as the local app icon

The service worker is intentionally strict:

- caches only the static app shell allowlist
- bypasses non-GET requests
- bypasses cross-origin requests
- bypasses `/api/*`, `/api/v1/terminal-token`, and `/terminal/*`
- bypasses requests with `Authorization`
- bypasses requests using `cache: "no-store"`

Never cache API, planner, terminal, token, WebSocket, or operator-data responses. Offline mode is only a shell; protocol/API/terminal actions should fail normally while offline instead of returning stale data.

## Security headers

`server.mjs` serves static files with conservative local-cockpit headers:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: SAMEORIGIN`

It also rejects non-loopback `Host`/`Origin` headers to reduce DNS-rebinding exposure, and forces `Cache-Control: no-store, max-age=0` on proxied `/api/v1/*` and `/terminal/*` HTTP responses, including proxy errors. Do not add HSTS while the supported deployment is loopback HTTP/SSH tunnel.

## Current features

- warm sidebar tab shell for Chat, Organizer, Config, Terminal, and Log
- accessible ARIA tab navigation with keyboard support
- PWA manifest/service-worker static shell
- loopback-only browser pairing into a full-operator runtime client
- protocol/v1 WebSocket `connect`
- `health`
- `agent.wait` chat with stable `sessionKey`
- current conversation display, New chat, web session switching, and local attach to existing WhatsApp sessions from the Sessions panel; conversation changes are blocked while an agent run is active
- streamed `agent` event display
- REST attachment upload using one-shot attachment refs
- sessions, clients, deliveries, and commands list panels
- current client de-duplication and clear labels for paired/config-managed clients
- operator action buttons with confirmation prompts
- Send button disabled while an agent run is active
- confirmations for destructive session, delivery, and runtime-client actions
- Terminal tab that embeds `/terminal/ownloom` when the loopback Zellij web service is enabled
- loopback-only helper button to copy the generated Zellij web login token

The gateway client transport is still expected to stay loopback-only until HTTPS/reverse-proxy/pairing is designed.

## Validation

```bash
find os/pkgs/gateway-web/public -name '*.js' -print0 | xargs -0 -n1 node --check
node --check os/pkgs/gateway-web/server.mjs
nix build .#ownloom-gateway-web --no-link
nix build .#checks.x86_64-linux.ownloom-gateway-web-smoke --no-link
```

For local header/token smoke testing, run the package on a temporary port with a temporary terminal token file, then verify `/`, `/manifest.webmanifest`, `/sw.js`, `/api/v1/terminal-token`, and a proxy error path with `curl -D-`.

## Rollback

Prefer reverting the modernization commit(s). If a bad service worker is ever shipped, either clear it from browser DevTools during local testing or ship a temporary `sw.js` that deletes `ownloom-gateway-web-*` caches and unregisters itself during activation.
