# Service Architecture

> 📖 [Emoji Legend](LEGEND.md)

Audience: maintainers and operators deciding how Bloom exposes user-facing services.

## 🌱 Current Model

Bloom no longer ships a separate packaged-service layer. The user-facing service surface is built directly into the base NixOS system.

## 🧩 Built-In Services

The current built-in service set is:

- `Bloom Home` on `:8080`
- `Bloom Web Chat` on `:8081`
- `Bloom Files` on `:5000`
- `code-server` on `:8443`

These are declared as user systemd services in the OS modules and are expected to exist on every Bloom node.

## 📚 Operational Notes

- Bloom Home is the landing page for the service surface
- FluffyChat is preconfigured for the local Bloom Matrix server
- dufs exposes `~/Public/Bloom`
- code-server is always available as the browser IDE
- use `systemd_control` to inspect and restart these units

## 🔗 Related

- [../README.md](../README.md)
- [../AGENTS.md](../AGENTS.md)
- [pibloom-setup.md](pibloom-setup.md)
