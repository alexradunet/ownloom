# Service Architecture

Audience: maintainers and operators deciding how NixPI exposes user-facing services.

## Current Model

NixPI no longer ships a separate packaged-service layer. The user-facing service surface is built directly into the base NixOS system.

## Built-In Services

The current built-in service set is:

- Canonical HTTPS gateway on `:443`
- Local recovery entry on `:80` for `localhost`
- Internal Home backend on `:8080`
- Internal Element Web backend on `:8081`
- Internal Matrix backend on `:6167`

These are declared as user systemd services in the OS modules and are expected to exist on every NixPI node.

## Operational Notes

- Home is the landing page at `/` on the canonical HTTPS host
- Element Web is served at `/element/` on the canonical HTTPS host
- Matrix client access is served through the same host at `/_matrix/*`
- use `systemd_control` to inspect and restart these units

## Related

- [../README.md](../README.md)
- [../AGENTS.md](../AGENTS.md)
- [operations/first-boot-setup.md](operations/first-boot-setup.md)
