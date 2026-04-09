---
title: Install NixPI
description: Install NixPI onto a fresh OVH VPS by provisioning a plain base system first, then bootstrapping on-host.
---

# Install NixPI

## Supported target

- headless x86_64 VPS
- provider rescue-mode access
- SSH or console access to the installed machine
- outbound internet access during installation and bootstrap

## Canonical install path

NixPI supports one host-owned install story:

1. install a plain NixOS base for the machine
2. reconnect to the installed machine
3. run `nixpi-bootstrap-host` on the machine
4. rebuild only through `/etc/nixos#nixos`

Use the dedicated [OVH Rescue Deploy](./operations/ovh-rescue-deploy) runbook for the base install.

`nixos-anywhere` is used only for plain base-system provisioning. It does not install the final NixPI host directly.

Bootstrap writes narrow `/etc/nixos` helper files. On a classic `/etc/nixos` tree it can generate a minimal host flake automatically; on an existing flake host it prints the exact manual integration steps instead.

## Bootstrap NixPI on the machine

Run this on the installed host after the plain base system boots:

```bash
nix run github:alexradunet/nixpi#nixpi-bootstrap-host -- \
  --primary-user alex \
  --ssh-allowed-cidr YOUR_ADMIN_IP/32 \
  --authorized-key-file /root/.ssh/authorized_keys \
  --timezone Europe/Bucharest \
  --keyboard us
```

If you do not provide `--hostname`, NixPI keeps the host at the default `nixos` hostname.
If you provide `--authorized-key-file` or `--authorized-key`, bootstrap also seeds SSH access for the primary user.

If `/etc/nixos/flake.nix` already exists, follow the printed instructions and rebuild manually:

```bash
sudo nixos-rebuild switch --flake /etc/nixos#nixos --impure
```

## After bootstrap

Validate the installed host:

```bash
systemctl status nixpi-app-setup.service
systemctl status sshd.service
systemctl status nixpi-update.timer
sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowtcpforwarding|allowagentforwarding'
sudo nft list ruleset | grep 'dport 22'
```

If the SSH allowlist is wrong, recover through OVH console or rescue mode.

Routine rebuilds should use the installed `/etc/nixos#nixos` host flake:

```bash
sudo nixpi-rebuild
```

The installed `/etc/nixos` flake remains the source of truth for the running host.

Rollback if needed:

```bash
sudo nixos-rebuild switch --rollback
```

## Next steps

- [Operations](./operations/)
- [OVH Rescue Deploy](./operations/ovh-rescue-deploy)
- [First Boot Setup](./operations/first-boot-setup)
- [Reference](./reference/)
