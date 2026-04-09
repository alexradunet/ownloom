# NixOS VPS Provisioner Guidance

This subtree owns day-0 plain VPS provisioning. It starts after the operator has already switched the provider into rescue mode and obtained the rescue SSH credentials.

Automation begins at first SSH access, not at the web-panel step.

## Required workflow

1. Verify SSH reachability to the rescue host.
2. Inspect disks with `lsblk`, `fdisk -l`, and `/dev/disk/by-id`.
3. Prefer persistent disk IDs over transient `/dev/sdX` names.
4. never auto-select a destructive target disk when multiple plausible disks exist.
5. Stop and ask for confirmation before destructive execution if no explicit target disk was supplied.
6. Run the provisioner command for the selected preset.
7. If kexec or disk remapping fails, fall back to staged `nixos-anywhere` phases.
8. stop and ask for the human to perform OVH panel actions such as switching back from rescue mode to disk boot.

## Inputs

- target IP
- rescue username
- password or SSH key path
- optional hostname
- optional explicit disk ID/path
- optional continue-into-NixPI-bootstrap flag
