# Infrastructure

> External services and infrastructure

## Matrix Infrastructure

### Overview

NixPI runs its own Matrix homeserver through `continuwuity.service`. Users register with any Matrix client and message Pi directly. No data leaves the device. No federation - fully private.

### Setup

The Matrix server starts automatically on boot. User accounts are created during the first-boot setup:

1. Pi creates a bot account (`@pi:nixpi`) automatically
2. Pi guides the user to register with their preferred Matrix client
3. User creates a DM with `@pi:nixpi`

### Configuration

| Setting | Value |
|---------|-------|
| Server name | `nixpi` |
| Internal port | `6167` |
| Canonical client URL | `https://<netbird-host>` |
| Registration | token-required |
| Federation | disabled |
| Data directory | `/var/lib/continuwuity/` |
| Registration token | `/var/lib/continuwuity/registration_token` |

### Bridges

External messaging platforms (WhatsApp, Telegram, Signal) connect via mautrix bridge containers. Bridge packaging still exists in the repo catalog, but bridge lifecycle helpers are no longer part of the default NixPI runtime and should be treated as maintainer-only setup.

### Troubleshooting

```bash
# Logs
journalctl -u continuwuity -n 100

# Status
systemctl status continuwuity

# Restart
sudo systemctl restart continuwuity

# Restart after config changes
sudo systemctl restart continuwuity
```

---

## NetBird Infrastructure

### Overview

EU-hosted mesh networking for secure remote access to your NixPI device. Uses NetBird cloud management (free tier, up to 5 peers).

NetBird provides the security layer for SSH remote access and the built-in NixPI web surface.

Normal operator access uses one canonical NetBird host over HTTPS:

- `https://<netbird-host>/`
- `https://<netbird-host>/element/`
- `https://<netbird-host>`

`http://localhost/` remains available only as an on-box recovery path.

NetBird is installed as a native system service (not a container) because WireGuard requires real kernel-level CAP_NET_ADMIN.

### Setup

NetBird authentication is handled during NixPI's first-boot wizard using a setup key. If you need to re-authenticate:

1. Get a new setup key from https://app.netbird.io -> Setup Keys
2. Run: `sudo netbird up --setup-key <KEY>`
3. Verify: `sudo netbird status`

### Adding Peers

Install NetBird on your other devices (laptop, phone) from https://netbird.io/download and sign in with the same account. All devices on the same account can reach each other.

### Operations

```bash
# Status
sudo netbird status

# Logs
sudo journalctl -u netbird -n 100

# Stop
sudo systemctl stop netbird

# Start
sudo systemctl start netbird
```

### TLS Note

NixPI only needs HTTPS with a certificate matching the NetBird host or IP to satisfy browser secure-context requirements for mesh access. A publicly trusted certificate is optional; a self-signed or private-CA certificate may be sufficient if the client device trusts it.

## Related

- [Security Model](./security-model)
- [First Boot Setup](../operations/first-boot-setup)
