# ownloom-gateway-web

Small protocol/v1-only web client skeleton for Ownloom Gateway.

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

The server serves the static UI and proxies `/api/v1/*` plus WebSocket upgrades to `OWNLOOM_GATEWAY_URL`, defaulting to `http://127.0.0.1:8081`.

Current features:

- loopback-only browser pairing into a read/write runtime client
- protocol/v1 WebSocket `connect`
- `health`
- `agent.wait` chat with stable `sessionKey`
- streamed `agent` event display
- REST attachment upload using one-shot attachment refs
- sessions, deliveries, and commands list panels
- Send button disabled while an agent run is active
- confirmations for destructive session, delivery, and runtime-client actions

The gateway client transport is still expected to stay loopback-only until HTTPS/reverse-proxy/pairing is designed.
