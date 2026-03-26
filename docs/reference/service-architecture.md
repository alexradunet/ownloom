# Service Architecture

> Built-in service surface and web interfaces

## Audience

Maintainers and operators deciding how NixPI exposes user-facing services.

## Current Model

NixPI no longer ships a separate packaged-service layer. The user-facing service surface is built directly into the base NixOS system.

## Built-In Services

The current built-in service set is:

| Service | Port | Purpose |
|---------|------|---------|
| Pi Web Chat | `:8080` | Local web chat service for talking to Pi on the machine itself |

This service is declared as a system service in the OS modules and is expected to exist on every NixPI node.

## Operational Notes

- Pi Web Chat is served through the primary local interface on `:8080`
- Use `systemctl status nixpi-chat.service` or `journalctl -u nixpi-chat.service` for host-level inspection
- Use `systemd_control` to inspect and restart these units

## Related

- [Daemon Architecture](./daemon-architecture)
- [First Boot Setup](../operations/first-boot-setup)
