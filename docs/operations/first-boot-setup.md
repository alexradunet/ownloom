# First Boot Setup

> Bringing up a fresh NixPI host

## Audience

Operators bringing up a fresh NixPI host.

## Prerequisites

Before first-boot setup, you need a system installed from the NixPI installer image:

1. Build or download the NixPI installer ISO
2. Boot the installer and run `sudo -i && nixpi-installer`
3. Choose your target disk and layout, then enter your hostname and primary user in the terminal wizard
4. Reboot into the installed system
5. The installed machine initially boots a minimal NixPI base from `/etc/nixos`
6. During first boot, the setup wizard prepares `/srv/nixpi` as the canonical system repo, keeps `~/nixpi` for Pi's editable workspace data, and writes the host-specific flake at `/etc/nixos`
7. The installed system autologins into the official NixPI XFCE desktop and opens the NixPI terminal there

For VM install-flow testing:

- `just vm-install-iso` runs the installer in the default user-mode NAT network with host forwards
- use this path to validate install flow, XFCE startup, and the local chat/runtime path inside the guest
- host-side forwards are optional debugging aids, not part of the active operator workflow

## Why Setup Is Split In Two

NixPI separates deterministic machine setup from Pi-guided personalization.

That split keeps:

- Host provisioning in a predictable bash flow
- Persona customization in Pi where it belongs
- Interrupted setup resumable without redoing the entire host bootstrap

## How First Boot Works

NixPI's first-boot experience has two phases.

### Phase 1: Bash Wizard

`setup-wizard.sh` handles deterministic machine setup from the XFCE-launched NixPI terminal.

**Current responsibilities**:

1. Password change and WiFi/internet setup, with WiFi preferred over Ethernet when available
2. Prepare `/srv/nixpi` and write the host-specific `/etc/nixos` flake
3. Promote the minimal base into the full appliance with `nixos-rebuild switch`
4. Local web chat bootstrap
5. AI provider defaults for Pi
6. Built-in service provisioning
7. User-facing system update guidance for operating the canonical `/srv/nixpi` repo

**Built-in services provisioned**:

- Pi Web Chat on `:8080` through `nixpi-chat.service`

**Bootstrap security lifecycle**:

- Pi Web Chat is brought up during bootstrap and refreshed as part of setup completion
- The active operator path remains on-box through the local desktop and web chat surface

### Phase 2: Pi Persona Step

After the wizard is complete, `setup` tracks a single Pi-side step:

- `persona`

Pi injects setup guidance until that step is marked complete.

During that Pi-side first conversation, Pi should also orient the user to the platform:

- NixPI keeps durable state in `~/nixpi/` using inspectable files
- `/srv/nixpi` is the canonical git working tree for syncing and rebuilding the system, while `~/nixpi` remains the user-editable workspace for Pi data such as persona, objects, episodes, guardrails, and agent overlays
- NixPI can propose persona or workflow changes through tracked evolutions instead of silently changing itself
- Pi Web Chat is the native interaction surface, served by `nixpi-chat.service` under the primary operator account
- Multi-agent overlays are optional and activate when valid definitions exist in `~/nixpi/Agents/*/AGENTS.md`

## Reference

### Relevant Files

| Path | Purpose |
|------|---------|
| `~/.nixpi/.setup-complete` | Wizard complete sentinel |
| `~/.nixpi/wizard-state/persona-done` | Persona step complete marker |
| `nixpi-chat.service` | Local web chat service exposed on the machine itself |

### Current Behavior

- Before the wizard completes, Pi does not start normal conversation
- After the wizard completes, opening Pi checks only for `persona-done`
- If persona setup is still pending, Pi starts that flow first and defers unrelated conversation
- After `persona-done` exists, Pi resumes normal conversation
- If you need to restart persona setup, remove `~/.nixpi/wizard-state/persona-done` and open Pi again
- XFCE is the only supported automatic first-boot entry path
- The wizard enables `nixpi-chat.service` as part of setup completion
- The wizard refreshes the local chat config so the on-box interaction surface is ready after reboot
- The wizard leaves the machine ready for local web-chat use without requiring any additional access layer

## Related

- [Quick Deploy](./quick-deploy)
- [Live Testing](./live-testing)
