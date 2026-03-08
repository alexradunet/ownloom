# First-Boot Setup Wizard Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

Replace greetd/tuigreet login with a first-boot setup wizard that runs once, collects WiFi, password, and NetBird configuration, applies security hardening, then reboots into auto-login with Pi.

## Boot Flow

### First Boot (no `/.bloom-setup-done`)

1. `bloom-setup.service` (systemd oneshot, `Before=getty@tty1.service`) runs `/usr/local/bin/bloom-setup.sh` as root on VT1
2. Wizard collects: WiFi → password → NetBird
3. If NetBird configured, applies security hardening
4. Creates `/.bloom-setup-done` marker
5. Installs getty autologin drop-in for bloom user
6. Reboots

### Subsequent Boots (marker exists)

1. `bloom-setup.service` sees marker, exits immediately
2. `getty@tty1` auto-logs in `bloom` via drop-in override
3. `.bash_profile` runs `bloom-greeting.sh` then `exec pi`
4. `bloom-display.service` starts Xpra + i3 on `:99`

## User Creation

BIB creates `bloom` user at image install time with:
- `password = "!"` (locked — cannot login)
- `groups = ["wheel"]`
- No SSH key

User exists from boot (home dir, skel files, systemd user services all work), but login is blocked until wizard sets the password.

## Wizard Steps

### Step 1 — WiFi (if hardware detected)

- Always shown if WiFi adapter present, even if ethernet connected
- `nmcli dev wifi rescan` + `nmcli -t -f SSID,SIGNAL dev wifi list`
- Numbered list sorted by signal, deduplicated
- User picks number, enters password
- `nmcli dev wifi connect "<SSID>" password "<pass>"`
- Retry on failure, skip always available

### Step 2 — Password

- `read -sp` for hidden input, prompted twice
- Minimum 8 characters enforced
- `echo "bloom:<pass>" | chpasswd`

### Step 3 — NetBird (requires network)

- Educational explanation of what NetBird does
- Instructions to get a setup key from app.netbird.io
- `netbird up --setup-key "<key>"`
- Wait for connection confirmation
- If successful, apply security hardening automatically
- Skip available

## Security Hardening

Applied automatically only when NetBird connects successfully. No user input.

### Firewall (firewalld)

- Create `bloom` zone as default
- Allow SSH (port 22) from:
  - `wt0` interface (NetBird mesh)
  - Local RFC1918 subnets (auto-detected from active interfaces)
- Allow all outbound (default)
- Drop all other inbound
- `--permanent` for persistence

### SSH (`/etc/ssh/sshd_config.d/bloom.conf`)

- `PasswordAuthentication yes`
- `AllowUsers bloom`
- `PermitRootLogin no`
- `MaxAuthTries 3`
- `LoginGraceTime 30`

### Not implemented (intentional)

- No fail2ban — NetBird mesh is trusted, local subnet is low risk
- No key-only auth — user wants password simplicity
- No port knocking or custom SSH port

## Wizard UX

### Visual style

- Box-drawing characters for frames (`╭─╮│╰─╯`)
- Unicode symbols: `✓` success, `✗` failure, `→` progress, `●` bullets
- ANSI color: green success, yellow prompts, red errors, cyan info
- Clear screen between steps
- ASCII art bloom logo at welcome

### Educational approach

Each step includes:
1. **What** — one-line description
2. **Why** — one-line explanation of why it matters
3. Friendly error messages with retry/skip options

### Error handling

- WiFi fail: "Couldn't connect. Check the password and try again, or press s to skip."
- NetBird fail: "Couldn't reach NetBird. Check your internet connection and the setup key."
- Always offer retry or skip

## greetd Removal

### Rationale

greetd + tuigreet added complexity (PAM config, graphical VT issues) for minimal benefit on an appliance OS that auto-logs in. getty autologin is the standard approach for headless/appliance Linux.

### What replaces it

- getty autologin via systemd drop-in:
  ```ini
  [Service]
  ExecStart=
  ExecStart=-/sbin/agetty --autologin bloom --noclear %I $TERM
  ```
- Manual login after logout: standard `login:` prompt with password

## File Changes

### New files

- `os/sysconfig/bloom-setup.sh` — wizard script
- `os/sysconfig/bloom-setup.service` — systemd oneshot
- `os/sysconfig/getty-autologin.conf` — getty drop-in (installed by wizard)

### Modified files

- `os/bib-config.toml` — locked password (`!`), no SSH key
- `os/Containerfile` — remove greetd/tuigreet, add bloom-setup.service
- `skills/first-boot/SKILL.md` — remove NetBird step (now in wizard)

### Removed files

- `os/sysconfig/greetd.toml`

### Unchanged

- `os/sysconfig/bloom-display.service` — still `User=bloom`
- `os/sysconfig/bloom-greeting.sh` — still handles Pi settings + welcome
- `os/sysconfig/bloom-bash_profile` — still runs greeting + `exec pi`
- `os/sysconfig/i3-config` — unchanged
