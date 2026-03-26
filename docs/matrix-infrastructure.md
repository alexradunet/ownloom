---
name: matrix
version: 0.2.0
description: Matrix messaging via external matrix.org homeserver
---

# Matrix Messaging

NixPI uses a bot account on [matrix.org](https://matrix.org) to send you messages and accept commands.

## Setup

During the first-boot wizard, you will be prompted to provide:

1. A bot account user ID (e.g. `@mypi:matrix.org`) — register one at [app.element.io](https://app.element.io)
2. An access token for that account

These are written to `~/.pi/matrix-credentials.json`. Element Web is pre-configured to connect to matrix.org.

## Credentials file

Located at `~/.pi/matrix-credentials.json`:

```json
{
  "homeserver": "https://matrix.org",
  "botUserId": "@mypi:matrix.org",
  "botAccessToken": "<token>"
}
```

## Troubleshooting

- Logs: `journalctl -u nixpi-daemon -n 100`
- The bot connects to matrix.org on daemon startup; check daemon logs if messages are not arriving.
