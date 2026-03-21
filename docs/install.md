---
title: Install NixPI
description: Build the installer, boot into NixPI, and finish the first-boot flow.
---

<SectionHeading
  label="Install path"
  title="The shortest path from repository to running machine"
  lede="NixPI currently assumes a technical operator. The install flow is direct: build the installer image, boot it, run the installer, then finish the first-boot setup inside the new system."
/>

<PresentationBand
  eyebrow="Quick path"
  title="From source tree to live system"
  lede="This is the fastest public-facing install narrative. The full operational detail remains in the docs section."
>

<TerminalFrame title="Quick Install">
```bash
nix build .#installerIso

# write the generated ISO to a USB stick and boot it
sudo -i
nixpi-installer

# after reboot
setup-wizard.sh
```
</TerminalFrame>

</PresentationBand>

## What happens during setup

<div class="quick-grid">
  <div class="quick-card">
    <strong>1. Build the installer</strong>
    The repository produces a NixPI installer ISO through the flake output.
  </div>
  <div class="quick-card">
    <strong>2. Boot the live environment</strong>
    Use the generated image on a USB stick or test it inside a VM first.
  </div>
  <div class="quick-card">
    <strong>3. Run the installer</strong>
    The installer prepares the target system and seeds the NixPI layout.
  </div>
  <div class="quick-card">
    <strong>4. Finish first boot</strong>
    The wizard and Pi-guided persona flow complete the initial operating setup.
  </div>
</div>

The installed system now boots into the official NixPI Openbox desktop automatically. That desktop is intentionally minimal and agent-friendly; the primary operator flows still live in the setup wizard, Pi, Matrix, and the local shell.

<PresentationBand
  eyebrow="After install"
  title="Operate the machine from the local checkout"
  lede="Once the system is live, NixPI is managed as a local flake-backed checkout. Changes stay reviewable and use normal NixOS workflows."
>

<TerminalFrame title="Post-install workflow">
```bash
cd ~/nixpi
sudo nixos-rebuild switch --flake .

git fetch upstream
git rebase upstream/main
sudo nixos-rebuild switch --flake .
```
</TerminalFrame>

</PresentationBand>

## Need more detail?

- [Operations: Quick Deploy](./operations/quick-deploy)
- [Operations: First Boot Setup](./operations/first-boot-setup)
- [Operations](./operations/)
