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
| HTTPS gateway | `:443` | Canonical host for Home, Element Web, and Matrix |
| Local recovery | `:80` | `localhost` recovery entry point |
| Home backend | `:8080` | Internal Home service |
| Element Web backend | `:8081` | Internal Element Web service |
| Matrix backend | `:6167` | Internal Continuwuity homeserver |

These are declared as user systemd services in the OS modules and are expected to exist on every NixPI node.

## Operational Notes

- Home is served at `/` on the canonical HTTPS host
- Element Web is served at `/element/` on the canonical HTTPS host
- Matrix is exposed on the same host through the standard `/_matrix/*` paths
- Use `systemd_control` to inspect and restart these units

## Related

- [Daemon Architecture](./daemon-architecture)
- [First Boot Setup](../operations/first-boot-setup)
