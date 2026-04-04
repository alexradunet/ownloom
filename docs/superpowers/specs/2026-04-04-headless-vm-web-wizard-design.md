# Headless VM, Dev SSH, Web Wizard, and ttyd

**Date:** 2026-04-04  
**Status:** Approved

## Overview

Four interrelated changes that together replace the current desktop-oriented dev VM with a fully headless, agent-testable machine whose first-run experience lives entirely in the browser.

1. Headless VM — strip all graphical packages, simplify justfile
2. Pre-authorized dev SSH key — agent can connect on first boot
3. Web wizard — replaces bash wizard; `/setup` route in chat server
4. ttyd — web terminal at `/terminal`, proxied through the chat server

---

## 1. Headless VM Host

### Goal

The VM build target produces a server-grade NixOS image with no display server, no desktop environment, and no Chromium. The only local interaction surface is SSH. All user-facing UI is served over HTTP.

### NixOS changes

- `core/os/hosts/x86_64-vm.nix`: refactored to a headless-only profile. Removes any imports or options that pull in graphical packages (X11/Wayland, desktop environment, Chromium).
- `core/os/hosts/x86_64.nix`: strip `services.xserver.xkb` and any other display-related options; retain serial console, SSH, and NixOS module imports.
- Any NixOS module under `core/os/modules/` that enables Chromium, a window manager, or a desktop session is removed or gated behind an option that is off by default.

### Justfile changes

Recipes removed: `vm` (gui), `vm-headless`, `vm-run`  
Recipes kept/renamed:
- `vm-daemon` → renamed to `just vm` (default: background daemon)
- `just vm-ssh` — connects using the dev key (see section 2)
- `just vm-logs`, `just vm-stop` — unchanged

`tools/run-qemu.sh` loses the `gui` and `headless` mode branches. Only `daemon` mode remains.

---

## 2. Pre-authorized Dev SSH Key

### Goal

An AI agent (or any developer) can SSH into a freshly booted VM before any wizard has run — no password, no interactive setup.

### Key storage

A committed dev keypair lives at:
- `tools/dev-key` — private key (mode 600, committed to repo)
- `tools/dev-key.pub` — public key

This is intentional: the VM is a local dev environment with no production data. Anyone with the repo can SSH in, which is the point. The keys must never be used outside the dev VM.

### NixOS config

In `core/os/hosts/x86_64-vm.nix`:

```nix
users.users.pi.openssh.authorizedKeys.keyFiles = [ ../../tools/dev-key.pub ];
```

Password authentication remains enabled (existing behaviour) so human devs without the key can still log in via the serial console.

### Justfile

```just
vm-ssh:
    ssh -i tools/dev-key -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null -p 2222 pi@localhost
```

---

## 3. Web Wizard Replaces Bash Wizard

### Goal

The first-run setup experience moves entirely into the browser. The bash wizard and all its helper scripts are deleted. The web wizard collects the same information and drives the same system changes.

### Gate mechanism

The chat server checks `~/.nixpi/wizard-state/system-ready` before handling any request. If the file is absent, every request is redirected to `/setup` — except:
- Paths beginning with `/setup`
- Paths beginning with `/terminal` (ttyd — power users can get a shell before wizard completes)
- Static assets served under `/setup`

### Wizard steps

Served at `/setup` as a multi-page HTML form (built into the frontend):

1. **Identity** — full name, email, username, password
2. **Keys** — Claude API key, Netbird setup key
3. **Confirm** — review and apply

### Backend

`POST /api/setup/apply` — receives the wizard payload as JSON, then:
1. Writes `~/.nixpi/prefill.env` with the submitted values (preserves existing CI/automated-test path)
2. Writes the NixOS host config files (`nixpi-host.nix`) with identity and service options
3. Runs `nixos-rebuild switch` as a child process, streaming stdout/stderr back to the client via SSE
4. On success: writes `~/.nixpi/wizard-state/system-ready` and returns `{ ok: true }`

The frontend polls or streams the apply progress and redirects to `/` on completion.

### Files deleted

- `core/scripts/setup-wizard.sh`
- `core/scripts/wizard-identity.sh`
- `core/scripts/wizard-services.sh`
- `core/scripts/wizard-repo.sh`
- `core/scripts/wizard-promote.sh`
- `core/scripts/setup-lib.sh`

`core/scripts/prefill.env.example` is kept — it remains useful for CI and automated VM tests.

### New files

- `core/chat-server/setup.ts` — setup gate middleware + `/api/setup/apply` handler
- `core/chat-server/frontend/src/setup/` — wizard UI components (multi-step form)

---

## 4. ttyd: Web Terminal at `/terminal`

### Goal

Power users can access a full shell in the browser without SSH. ttyd is the canonical way to do this — it's lightweight, actively maintained, and speaks WebSocket.

### NixOS service

A new systemd service `nixpi-ttyd` runs:

```
ttyd --port 7681 --interface 127.0.0.1 bash
```

It binds only to localhost (never exposed directly). The chat server is the single external entrypoint.

### Proxy

The chat server proxies all requests matching `/terminal` and `/terminal/*` to `http://127.0.0.1:7681`. This is a straightforward HTTP + WebSocket tunnel — no authentication added at this layer (same trust model as the chat server itself).

The setup gate explicitly exempts `/terminal` paths so a shell is available before and during wizard completion.

### Frontend

The chat UI navigation bar includes a "Terminal" link pointing to `/terminal`. It opens in the same window (not a new tab) to keep the experience integrated.

---

## Data flow: first boot

```
VM boots
  └─ nixpi-chat starts (port 8080, proxied at :80)
  └─ nixpi-ttyd starts (port 7681, proxied at /terminal)

Agent SSHes in via dev key (port 2222) — wizard not required
User opens http://nixpi.local in browser
  └─ chat server: system-ready missing → redirect /setup
  └─ wizard: identity → keys → apply
       └─ POST /api/setup/apply streams nixos-rebuild progress
       └─ writes system-ready
  └─ redirect /
  └─ chat UI loads
User clicks "Terminal" → /terminal → ttyd → bash shell in browser
```

---

## What is not changing

- The `nixpi-chat` service binding (`127.0.0.1:8080`, reverse-proxied at `:80/:443`) — unchanged
- The nginx/reverse-proxy configuration — unchanged
- The `prefill.env` mechanism for non-interactive/CI installs — kept
- The installer ISO path (`core/os/hosts/installer-iso.nix`) — unchanged
- RPi hosts (`rpi4.nix`, `rpi5.nix`) — unchanged
