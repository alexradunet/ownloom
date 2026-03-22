---
name: matrix
version: 0.1.0
description: Continuwuity Matrix homeserver (native OS service, no federation)
---

# Matrix Homeserver

Native Continuwuity Matrix server baked into the NixPI image.

## Overview

NixPI runs its own Matrix homeserver through `continuwuity.service`. Users register with any Matrix client and message Pi directly. No data leaves the device. No federation - fully private.

## Setup

The Matrix server starts automatically on boot. User accounts are created during the first-boot setup:

1. Pi creates a bot account (`@pi:nixpi`) automatically
2. Pi guides the user to register with their preferred Matrix client
3. User creates a DM with `@pi:nixpi`

## Configuration

- Server name: `nixpi`
- Port: `6167`
- Registration: enabled during bootstrap, disabled after setup by default
- Federation: disabled
- Data: `/var/lib/continuwuity/`

## Bridges

External messaging platforms (WhatsApp, Telegram, Signal) connect via mautrix bridge containers. Bridge packaging still exists in the repo catalog, but bridge lifecycle helpers are no longer part of the default NixPI runtime and should be treated as maintainer-only setup.

## Troubleshooting

- Logs: `journalctl -u continuwuity -n 100`
- Status: `systemctl status continuwuity`
- Restart: `sudo systemctl restart continuwuity`
- Reload (after config changes): `sudo systemctl restart continuwuity`
