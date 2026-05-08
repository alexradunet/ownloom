# ownloom-gateway-web

Small protocol/v1-only Ownloom cockpit for local operator use.

It is intentionally static HTML/CSS/JS: no bundled legacy gateway UI, no framework, no build step.

## Use

On `ownloom-vps`, the NixOS service serves the UI loopback-only:

```text
http://127.0.0.1:8090
```

From another machine, use an SSH tunnel:

```bash
ssh -L 8090:127.0.0.1:8090 ownloom-vps
```

Then open <http://127.0.0.1:8090> and click **Pair this browser**. The browser receives a loopback-only runtime token, stores it in local storage, and connects automatically.

You can still paste a named client token manually and click **Connect** if needed.

For ad-hoc local use without the NixOS service:

```bash
nix run .#ownloom-gateway-web
```

The server serves the static UI and proxies `/api/v1/*` plus WebSocket upgrades to `OWNLOOM_GATEWAY_URL`, defaulting to `http://127.0.0.1:8081`. When `OWNLOOM_TERMINAL_URL` is set, `/terminal/` is proxied to the loopback Zellij web client for the cockpit Terminal tab.

The terminal tab opens the shared `ownloom` Zellij session at `/terminal/ownloom`. Zellij web requires its own login token. The NixOS service creates one on first start and stores it at `/var/lib/ownloom-terminal/login-token`. The cockpit can copy that token from the loopback-only **Copy Zellij token** button; after login, Zellij stores a browser session cookie.

Current features:

- cockpit tab shell for Chat, Organizer, Config, Terminal, and Log
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
