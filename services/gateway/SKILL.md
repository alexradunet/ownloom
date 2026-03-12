---
name: gateway
version: 0.1.0
description: Bloom Gateway — unified web proxy for Cinny, Matrix API, and WebDAV
image: localhost/bloom-gateway:latest
---

# Bloom Gateway

Unified reverse proxy serving all Bloom web services on a single port.

## Overview

The gateway runs Caddy with baked-in Cinny static files and a dynamic Caddyfile. It routes registered services by path prefix:

- `/_matrix/*` → Continuwuity Matrix homeserver (localhost:6167)
- `/webdav/*` → dufs file server (localhost:5000)
- `/*` → Cinny web client (default)

All services are accessible from a single address: `http://<host>:18810`.

## Dynamic Route Registration

When services are installed, they register a route in `~/.config/bloom/gateway-routes.json`. The Caddyfile is regenerated and the gateway restarted. New services only need a `gateway_path` and `port` to be accessible.

## Setup

Installed via the first-boot wizard or service tools:

- `service_install(name="gateway")`

The gateway image must be built locally before first use (the wizard handles this).

## Usage

1. Open `http://<host>:18810` in a browser
2. Log in with your Matrix credentials (username and password from setup)
3. Session persists in browser — no need to log in again

WebDAV: `http://<host>:18810/webdav/`

## Troubleshooting

- Logs: `journalctl --user -u bloom-gateway -n 50`
- Status: `systemctl --user status bloom-gateway`
- Restart: `systemctl --user restart bloom-gateway`
- Route registry: `cat ~/.config/bloom/gateway-routes.json`
- Generated Caddyfile: `cat ~/.config/bloom/Caddyfile`
- Rebuild image: `podman build -t localhost/bloom-gateway:latest -f Containerfile .` (from services/gateway/)
