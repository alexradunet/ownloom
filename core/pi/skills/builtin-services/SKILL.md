---
name: builtin-services
description: Reference for NixPI's built-in user-facing services that are always available on every node
---

# Built-In Services

NixPI ships these services as part of the base NixOS system. They are not optional packages and they do not need to be installed from the repo.

## Always Available

- `NixPI Home` behind the canonical HTTPS gateway at `/`
- `Element Web` behind the canonical HTTPS gateway at `/element/`
- `Matrix` behind the canonical HTTPS gateway at `/_matrix/*`

## Operational Notes

- These services are managed as declarative user systemd units
- Use `systemd_control` for status, restart, and stop/start operations
- They should be treated as stable base OS capabilities, not as optional service packages

## Expected Unit Names

- `nixpi-home`
- `nixpi-element-web`

## URLs

Preferred access is over NetBird:

- `https://<netbird-host>/`
- `https://<netbird-host>/element/`
- `https://<netbird-host>`

Localhost is recovery-only on the machine:

- `http://localhost/`
