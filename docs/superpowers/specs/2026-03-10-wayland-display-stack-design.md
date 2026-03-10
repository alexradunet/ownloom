# Wayland Display Stack Migration

**Date:** 2026-03-10
**Status:** Approved
**Replaces:** Xvfb headless framebuffer (bloom-display.service)

## Problem

Bloom uses Xvfb as a dumb X11 framebuffer for AI computer use. Three limitations drive this migration:

1. No real composited desktop — no window management, no proper rendering
2. No remote access for users to see/interact with Pi's desktop from a browser
3. X11 is legacy — Wayland tooling is the future, X11 ecosystem is decaying

## Decision

**Sway + wayvnc + noVNC** — a Wayland-native tiling compositor with browser-based remote desktop.

## Requirements

- Minimal tiling WM (Sway) — Pi launches apps, they tile automatically
- Browser-based remote access (noVNC) — user opens a URL, sees Pi's desktop, can take over
- HDMI output on mini-PCs — plug in a monitor and interact directly
- Headless on VPS — `WLR_BACKENDS=headless`, same session, same tools
- Runs on N100 (8GB RAM, no GPU) through VPS instances
- Co-pilot mode — Pi and user share the same session seamlessly

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Bloom OS                    │
│                                              │
│  ┌──────────┐    ┌─────────┐    ┌────────┐  │
│  │   Sway   │───>│ wayvnc  │───>│ noVNC  │──── browser (user)
│  │(compositor)   │ (VNC)   │    │ (HTTP) │  │
│  └────┬─────┘    └─────────┘    └────────┘  │
│       │                                      │
│       ├──> HDMI output (if plugged in)       │
│       │                                      │
│       ├──< wlrctl (click, type, key)         │
│       ├──< swaymsg (window mgmt, focus)      │
│       ├──< grim (screenshots)                │
│       └──< wl-clipboard (copy/paste)         │
│                                              │
│  ┌──────────────────────┐                    │
│  │  bloom-display ext   │  (Pi's interface)  │
│  │  screenshot -> grim  │                    │
│  │  click/type -> wlrctl│                    │
│  │  windows -> swaymsg  │                    │
│  │  ui_tree -> AT-SPI2  │                    │
│  └──────────────────────┘                    │
└─────────────────────────────────────────────┘
```

### Two Runtime Modes

- **Mini-PC with HDMI:** Sway uses real GPU output. Monitor shows the desktop. wayvnc still runs for remote access.
- **VPS / headless:** `WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1`. Virtual framebuffer, no physical output.

**Detection mechanism:** `detect-display.sh` runs as `ExecStartPre` in `bloom-sway.service`. It checks for `/dev/dri` render nodes. Writes `WLR_BACKENDS` and `WLR_LIBINPUT_NO_DEVICES` to `/run/bloom/display-env`. The sway service consumes this via `EnvironmentFile=/run/bloom/display-env`.

### Systemd Services

| Unit | Purpose |
|------|---------|
| `bloom-sway.service` | Sway compositor (Type=simple, User=pi). Runs `detect-display.sh` as ExecStartPre. Reads `/run/bloom/display-env`. |
| `bloom-wayvnc.service` | VNC server (After=bloom-sway, BindsTo=bloom-sway). Binds 127.0.0.1:5900. |
| `bloom-novnc.service` | noVNC websockify proxy (After=bloom-wayvnc). Binds 0.0.0.0:6080. |
| `bloom-display.target` | Groups all three, WantedBy=multi-user.target |

### Environment Plumbing

Sway sets `WAYLAND_DISPLAY` (typically `wayland-1`) and `SWAYSOCK` (under `$XDG_RUNTIME_DIR`) at runtime. These are not hardcoded. The bloom-display extension discovers them:

- `WAYLAND_DISPLAY`: read from Sway's systemd environment via `systemctl --user show-environment` or hardcoded as `wayland-1` with fallback.
- `SWAYSOCK`: read from `$XDG_RUNTIME_DIR/sway-ipc.*.sock` glob, or from Sway's exported environment.
- `XDG_RUNTIME_DIR`: `/run/user/1000` (pi user UID).

The `runDisplay()` helper in `actions.ts` currently injects `DISPLAY: ":99"`. It will be updated to inject `WAYLAND_DISPLAY`, `SWAYSOCK`, and `XDG_RUNTIME_DIR` instead. This affects all actions including `ui_tree` (AT-SPI2 uses D-Bus, which needs `DBUS_SESSION_BUS_ADDRESS` — already set by systemd user session).

The `bloom-bashrc` will replace `export DISPLAY=":99"` with logic to source Sway's environment variables for interactive shells.

## Package Changes

### Removed

| Package | Reason |
|---------|--------|
| `xorg-x11-server-Xvfb` | Replaced by Sway |
| `xdotool` | X11 only, replaced by wlrctl |
| `scrot` | X11 only, replaced by grim |

### Added

| Package | Purpose |
|---------|---------|
| `sway` | Wayland tiling compositor |
| `wayvnc` | VNC server for wlroots |
| `novnc` | HTML5 VNC client |
| `python3-websockify` | WebSocket-to-TCP proxy |
| `wlrctl` | Input injection (click, type, key) |
| `grim` | Screenshots (full screen and region via `-g "X,Y WxH"` syntax) |
| `slurp` | Interactive region selection (used with grim for partial screenshots) |
| `wl-clipboard` | Clipboard access (wl-copy/wl-paste) |
| `foot` | Wayland-native terminal |

### Unchanged

- `at-spi2-core`, `python3-pyatspi` — AT-SPI2 works on Wayland via D-Bus
- `chromium` — runs with `--ozone-platform=wayland`
- `tmux`, `openssh-server` — unrelated

## Tool Migration (bloom-display actions.ts)

| Action | X11 (current) | Wayland (new) | Notes |
|--------|--------------|---------------|-------|
| screenshot | `scrot` | `grim` (full) or `grim -g "X,Y WxH"` (region) | Region uses grim geometry syntax, not slurp (programmatic) |
| click | `xdotool mousemove + click` | `wlrctl pointer move X Y && wlrctl pointer click` | wlrctl supports absolute coords via `pointer move` |
| type | `xdotool type` | `wlrctl keyboard type "text"` | |
| key | `xdotool key` | `wlrctl keyboard key <combo>` | |
| move | `xdotool mousemove` | `wlrctl pointer move X Y` | Absolute positioning |
| scroll | `xdotool` button events | `wlrctl pointer scroll <amount>` | |
| windows | `xdotool search` | `swaymsg -t get_tree` | Returns JSON — richer than xdotool output |
| launch | bash wrapper with `DISPLAY` | Same bash wrapper with `WAYLAND_DISPLAY` + `SWAYSOCK` | |
| focus | `xdotool` activate | `swaymsg '[title="X"]' focus` | |
| ui_tree | AT-SPI2 python script | Same script | Env changes: `WAYLAND_DISPLAY` instead of `DISPLAY`, `DBUS_SESSION_BUS_ADDRESS` needed |

**Note on wlrctl absolute positioning:** `wlrctl pointer move X Y` supports absolute coordinates on wlroots compositors (Sway). Verify the Fedora 42 `wlrctl` package version supports this. If not, fallback is `ydotool` (works on Wayland, supports absolute coords) or direct Sway IPC pointer warping.

## Sway Config

Minimal config at `os/sysconfig/sway-config`:
- 1280x1024@60Hz default output (Wayland handles color depth natively — no 24-bit flag needed, equivalent or better than Xvfb's 24-bit)
- Solid background color (`#1a1a2e`)
- No status bar (invisible mode)
- Tabbed default layout
- No idle timeout
- Auto-float dialogs

## Remote Access

- Port 6080: noVNC (browser access, exposed via firewalld)
- Port 5900: VNC (localhost only, wayvnc to websockify)
- noVNC auto-connects with `?autoconnect=true&resize=scale`
- Works through NetBird tunnel for remote access
- Plain HTTP — TLS via reverse proxy out of scope
- Firewalld service file `bloom-novnc.xml` installed to `/etc/firewalld/services/` via Containerfile COPY

## Files Changed

### Modified
- `os/Containerfile` — swap packages, COPY new service/config files, install firewalld service
- `os/sysconfig/bloom-bashrc` — replace `DISPLAY=:99` with Wayland env sourcing
- `extensions/bloom-display/actions.ts` — rewrite all actions to Wayland tools, update `runDisplay()` env
- `extensions/bloom-display/index.ts` — update JSDoc `@see` link to this spec
- `tests/extensions/bloom-display.test.ts` — update mocks from xdotool/scrot to wlrctl/grim/swaymsg
- `README.md`, `AGENTS.md`, `docs/quick_deploy.md` — update display stack references

### Added
- `os/sysconfig/sway-config` — Sway compositor config
- `os/sysconfig/bloom-sway.service` — Sway systemd unit
- `os/sysconfig/bloom-wayvnc.service` — wayvnc systemd unit
- `os/sysconfig/bloom-novnc.service` — noVNC/websockify systemd unit
- `os/sysconfig/bloom-display.target` — groups display services
- `os/sysconfig/bloom-novnc.xml` — firewalld service definition for port 6080
- `os/scripts/detect-display.sh` — headless vs GPU detection, writes `/run/bloom/display-env`

### Removed
- `os/sysconfig/bloom-display.service` — replaced by bloom-sway.service

### Unchanged
- `os/scripts/ui-tree.py` — AT-SPI2 works on Wayland (env plumbing handled by actions.ts)
- Other extensions, lib/, skills, services — no display dependency

## Verification

After deploying, confirm the stack works:

1. `just build && just qcow2 && just vm` — boot the image
2. `just vm-ssh` then `swaymsg -t get_tree` — confirms Sway is running
3. Open `http://localhost:6080` in browser — confirms noVNC serves the desktop
4. Click/type in browser — confirms wayvnc relays input back to Sway
5. Run `grim /tmp/test.png && file /tmp/test.png` over SSH — confirms screenshots work
6. Run `wlrctl pointer move 100 100 && wlrctl pointer click` — confirms input injection
