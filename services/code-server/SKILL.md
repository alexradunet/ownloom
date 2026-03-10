---
name: code-server
description: Web-based code editor accessible via browser
---

## code-server

Browser-based VS Code instance for editing code on Bloom.

### Access

- URL: `http://<bloom-ip>:8443`
- Accessible via NetBird mesh network

### Management

- Start: `systemctl --user start bloom-code-server`
- Stop: `systemctl --user stop bloom-code-server`
- Logs: `journalctl --user -u bloom-code-server -f`
