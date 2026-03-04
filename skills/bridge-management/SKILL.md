---
name: bridge-management
description: Install, configure, and manage messaging bridges that connect Bloom to external platforms
---

# Bridge Management Skill

Use this skill when the user wants to set up, configure, or troubleshoot messaging bridges (e.g. WhatsApp).

## Bridge Architecture

Bridges are Podman Quadlet containers that connect Pi to messaging platforms. Each bridge:
- Runs as a systemd-managed container
- Connects to Pi via localhost WebSocket
- Has its own auth state and configuration

## WhatsApp Bridge (Baileys)

The WhatsApp bridge uses Baileys (lightweight, no browser needed):
- Container: `bloom-whatsapp`
- Auth: QR code pairing on first run
- Connection: WebSocket to bloom-channels extension
- Resource usage: ~50MB RAM (vs 500MB+ with Puppeteer-based alternatives)

## Installation Flow

1. Build the bridge container image
2. Deploy the Quadlet unit: `container_deploy bloom-whatsapp`
3. Check logs for QR code: `container_logs bloom-whatsapp`
4. Scan QR code with WhatsApp mobile app
5. Verify connection: `container_status`

## Troubleshooting

- Bridge won't start: `container_logs bloom-whatsapp --lines 100`
- Connection lost: `systemd_control bloom-whatsapp restart`
- Auth expired: Remove auth volume, redeploy, re-scan QR code
