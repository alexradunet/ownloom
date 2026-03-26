# Service Architecture

Audience: maintainers and operators deciding how NixPI exposes user-facing services.

## Current Model

NixPI no longer ships a separate packaged-service layer. The user-facing service surface is built directly into the base NixOS system.

## Built-In Services

The current built-in service set is:

- Pi Web Chat on `:8080`

This service is declared as a system service in the OS modules and is expected to exist on every NixPI node.

## Operational Notes

- Pi Web Chat is the primary operator interface on `:8080`
- Use `systemctl status nixpi-chat.service` or `journalctl -u nixpi-chat.service` for host-level inspection
- use `systemd_control` to inspect and restart these units

## Related

- [../README.md](../README.md)
- [../AGENTS.md](../AGENTS.md)
- [operations/first-boot-setup.md](operations/first-boot-setup.md)
