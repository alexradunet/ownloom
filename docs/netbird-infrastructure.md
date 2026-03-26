---
name: netbird
version: native
description: Secure mesh networking via NetBird (system service)
---

# NetBird

Mesh networking for secure remote access to your NixPI device. NetBird creates a private WireGuard tunnel so you can reach the device from anywhere.

NetBird is installed as a native system service (not a container) because WireGuard requires kernel-level CAP_NET_ADMIN.

## Setup

NetBird is configured during the first-boot wizard. You can connect via:

- **Web login (OAuth)** — opens a browser to authenticate
- **Setup key** — headless/automated setup; get one from https://app.netbird.io/setup-keys
- **Skip** — configure later with `sudo netbird up`

## Adding Peers

Install NetBird on your other devices (laptop, phone) from https://netbird.io/download and sign in with the same account. Devices on the same account reach each other through the NetBird mesh.

## Operations

- Status: `netbird status`
- Logs: `journalctl -u netbird -n 100`
- Re-connect: `sudo netbird up`
- Stop: `sudo systemctl stop netbird`
- Start: `sudo systemctl start netbird`
