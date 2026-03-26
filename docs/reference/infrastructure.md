# Infrastructure

> External services and infrastructure

## Local Chat Infrastructure

### Overview

NixPI exposes a local web chat through `nixpi-chat.service`. The operator talks to Pi on the machine itself. No external messaging network is required for the default product surface.

### Setup

The local chat service starts automatically on boot. The operator-facing surface is prepared during first-boot setup:

1. The wizard enables the local chat service
2. Pi finalizes its persona and runtime defaults
3. The operator opens the on-box web chat and starts talking to Pi

### Configuration

| Setting | Value |
|---------|-------|
| Service name | `nixpi-chat.service` |
| Local port | `8080` |
| Canonical local URL | `http://localhost:8080/` |
| Service scope | system service |
| Product scope | on-box web chat for one operator |

### Troubleshooting

```bash
# Logs
journalctl -u nixpi-chat.service -n 100

# Status
systemctl status nixpi-chat.service

# Restart
sudo systemctl restart nixpi-chat.service
```

## Related

- [Security Model](./security-model)
- [First Boot Setup](../operations/first-boot-setup)
