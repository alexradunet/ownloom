# Drop Xpra, Keep Headless Display — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove Xpra (remote viewer) from the OS image while keeping Xvfb + xdotool for headless AI computer use. User access becomes SSH + tmux only.

**Architecture:** The display stack shrinks from Xvfb+Xpra (viewer+framebuffer) to Xvfb-only (framebuffer). Pi retains full GUI interaction capabilities (screenshots, clicking, typing, accessibility tree, window management) via the existing bloom-display extension — all actions use xdotool/scrot which work with plain Xvfb. The user connects via SSH+tmux instead of a browser-based remote desktop. When the user wants to see what Pi is doing, Pi can take a screenshot and share it via dufs WebDAV.

**Tech Stack:** Xvfb, xdotool, scrot, AT-SPI2, tmux, SSH

---

### Task 1: Slim down Containerfile — remove Xpra, add tmux

**Files:**
- Modify: `os/Containerfile:31-43` (package list)
- Modify: `os/Containerfile:45-51` (xpra-html5 install block)
- Modify: `os/Containerfile:102-109` (display stack + firewall section)

**Step 1: Remove Xpra and alacritty from the package list, add tmux**

In `os/Containerfile`, change the dnf install block. Remove `xpra` and `alacritty` from the package list. Add `tmux` to the package list.

The package list should become:

```dockerfile
RUN dnf install -y \
    sudo \
    git \
    git-lfs \
    ripgrep \
    fd-find \
    jq \
    bat \
    htop \
    just \
    ShellCheck \
    openssl \
    openssh-clients \
    curl \
    wget \
    unzip \
    libatomic \
    podman \
    buildah \
    skopeo \
    oras \
    qemu-system-x86 \
    edk2-ovmf \
    chromium \
    tmux \
    xorg-x11-server-Xvfb \
    xdotool \
    scrot \
    at-spi2-core \
    python3-pyatspi \
    openssh-server \
    firewalld \
    nodejs \
    npm \
    && dnf clean all \
    && rm -rf /var/cache/libdnf5 /var/lib/dnf /var/log/dnf5.log /var/log/dnf.log /var/cache/ldconfig/aux-cache
```

**Step 2: Delete the xpra-html5 install block**

Remove the entire block (lines 45-51):

```dockerfile
# Install xpra-html5 (not packaged in Fedora; install from upstream release)
ARG XPRA_HTML5_VERSION=v19
RUN cd /tmp && \
    curl -sL https://github.com/Xpra-org/xpra-html5/archive/refs/tags/${XPRA_HTML5_VERSION}.tar.gz | tar xz && \
    cd xpra-html5-* && \
    python3 setup.py install /usr/share/xpra/www && \
    rm -rf /tmp/xpra-html5-*
```

**Step 3: Update the display stack section**

Change the comment and remove Xpra-related COPY/enable lines. Replace:

```dockerfile
# Display stack: Xpra + Xvfb (agent-native, headless-first)
COPY os/sysconfig/bloom-display.service /usr/lib/systemd/system/bloom-display.service
RUN systemctl enable bloom-display.service

# Firewalld service for Xpra HTML5 — open port 14500 in default zone so the
# web client is accessible before bloom-setup runs (enables browser-based first boot)
COPY os/sysconfig/bloom-xpra.xml /usr/lib/firewalld/services/bloom-xpra.xml
COPY os/sysconfig/bloom-firewalld-public.xml /usr/lib/firewalld/zones/public.xml
```

With:

```dockerfile
# Display stack: Xvfb headless framebuffer for AI computer use (no remote viewer)
COPY os/sysconfig/bloom-display.service /usr/lib/systemd/system/bloom-display.service
RUN systemctl enable bloom-display.service
```

**Step 4: Verify the Containerfile looks correct**

Run: `head -120 os/Containerfile`

**Step 5: Commit**

```bash
git add os/Containerfile
git commit -m "feat: drop Xpra, add tmux — headless Xvfb only"
```

---

### Task 2: Rewrite bloom-display.service for plain Xvfb

**Files:**
- Modify: `os/sysconfig/bloom-display.service`

**Step 1: Replace the service file contents**

Replace the entire file with:

```ini
[Unit]
Description=Bloom Display (Xvfb headless framebuffer)
After=network.target

[Service]
User=bloom
Environment=DISPLAY=:99
ExecStart=/usr/bin/Xvfb :99 -screen 0 1280x1024x24
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Key changes:
- Xpra start/stop → plain Xvfb with 1280x1024 resolution and 24-bit color
- No TCP binding, no HTML, no daemon flags
- Description updated

**Step 2: Commit**

```bash
git add os/sysconfig/bloom-display.service
git commit -m "feat: bloom-display.service runs plain Xvfb instead of Xpra"
```

---

### Task 3: Delete Xpra firewall config files

**Files:**
- Delete: `os/sysconfig/bloom-xpra.xml`
- Delete: `os/sysconfig/bloom-firewalld-public.xml`

**Step 1: Remove the files**

```bash
git rm os/sysconfig/bloom-xpra.xml
git rm os/sysconfig/bloom-firewalld-public.xml
```

**Step 2: Commit**

```bash
git commit -m "chore: remove Xpra firewall config (bloom-xpra.xml, public zone override)"
```

---

### Task 4: Remove Xpra references from bloom-setup.sh firewall hardening

**Files:**
- Modify: `os/sysconfig/bloom-setup.sh:396-399`

**Step 1: Remove the bloom-xpra firewall rule**

In the `apply_hardening()` function, find and remove this line:

```bash
	firewall-cmd --permanent --zone=bloom --add-service=bloom-xpra >/dev/null 2>&1 || true
```

Also update the comment above it. Change:

```bash
	# Default zone allows SSH and Xpra HTML5
	firewall-cmd --permanent --zone=bloom --add-service=ssh >/dev/null 2>&1 || true
	firewall-cmd --permanent --zone=bloom --add-service=bloom-xpra >/dev/null 2>&1 || true
```

To:

```bash
	# Default zone allows SSH only
	firewall-cmd --permanent --zone=bloom --add-service=ssh >/dev/null 2>&1 || true
```

**Step 2: Commit**

```bash
git add os/sysconfig/bloom-setup.sh
git commit -m "fix: remove Xpra firewall rule from setup wizard hardening"
```

---

### Task 5: Remove port 14500 from justfile QEMU recipes

**Files:**
- Modify: `justfile:55` (vm recipe)
- Modify: `justfile:70` (vm-serial recipe)

**Step 1: Remove port 14500 forwarding from both recipes**

In both the `vm` and `vm-serial` recipes, change the `-netdev` line from:

```
-netdev user,id=net0,hostfwd=tcp::2222-:22,hostfwd=tcp::5000-:5000,hostfwd=tcp::8080-:8080,hostfwd=tcp::8081-:8081,hostfwd=tcp::14500-:14500 \
```

To:

```
-netdev user,id=net0,hostfwd=tcp::2222-:22,hostfwd=tcp::5000-:5000,hostfwd=tcp::8080-:8080,hostfwd=tcp::8081-:8081 \
```

**Step 2: Commit**

```bash
git add justfile
git commit -m "chore: remove port 14500 forwarding from QEMU recipes"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `AGENTS.md:149-153`
- Modify: `docs/quick_deploy.md:113-127`
- Modify: `extensions/bloom-display/index.ts:1-6` (JSDoc header)

**Step 1: Update AGENTS.md bloom-display description**

Change line 149-151 from:

```markdown
### 🖥️ bloom-display

AI agent computer use: screenshots, input injection, accessibility tree, and window management on the Xvfb+Xpra display.
```

To:

```markdown
### 🖥️ bloom-display

AI agent computer use: screenshots, input injection, accessibility tree, and window management on the headless Xvfb display.
```

**Step 2: Replace the remote desktop section in quick_deploy.md**

Replace the "Remote desktop (Xpra HTML5)" section (lines 113-127) with:

```markdown
## Remote access (SSH + tmux)

Bloom OS is accessed via SSH. tmux is pre-installed for persistent terminal sessions.

```bash
# SSH into your Bloom (replace with your NetBird IP or hostname)
ssh bloom@<netbird-ip>

# Start or attach to a persistent tmux session
tmux new-session -A -s main
```

Pi runs in the terminal. The headless Xvfb display (:99) is available for AI computer use
(screenshots, browser automation, GUI apps) — no remote viewer is needed.
```

**Step 3: Update the bloom-display extension JSDoc**

In `extensions/bloom-display/index.ts`, change the header from:

```typescript
/**
 * bloom-display -- AI agent computer use: screenshots, input injection, accessibility tree, window management.
 *
 * @tools display
 * @see {@link ../../docs/plans/2026-03-08-xvfb-xpra-display-stack-design.md} Design doc
 */
```

To:

```typescript
/**
 * bloom-display -- AI agent computer use: screenshots, input injection, accessibility tree, window management.
 *
 * @tools display
 * @see {@link ../../docs/plans/2026-03-08-drop-xpra-headless-display.md} Design doc
 */
```

**Step 4: Commit**

```bash
git add AGENTS.md docs/quick_deploy.md extensions/bloom-display/index.ts
git commit -m "docs: update display stack references — Xvfb headless, SSH+tmux access"
```

---

### Task 7: Run tests and verify

**Step 1: Run the full test suite**

```bash
npm run test
```

Expected: All 255 tests pass. The bloom-display tests only check registration and tool structure — they don't depend on Xpra.

**Step 2: Run lint/format check**

```bash
npm run check
```

Expected: Pass (no code logic changed in TypeScript files, only a JSDoc comment).

**Step 3: Verify no stale references remain**

```bash
grep -r "xpra\|14500" --include='*.ts' --include='*.md' --include='*.sh' --include='*.xml' --include='*.service' --include='justfile' . | grep -v node_modules | grep -v docs/plans/
```

Expected: No matches (all Xpra references removed from active code/config).

**Step 4: Commit any fixes if needed**

---

### Summary of what's removed

| Removed | Why |
|---------|-----|
| `xpra` package | No remote viewer needed |
| `alacritty` package | Terminal emulator for Xpra sessions — not needed without viewer |
| xpra-html5 v19 (GitHub download) | HTML5 client for Xpra — not needed |
| `bloom-xpra.xml` firewall service | Port 14500 no longer exposed |
| `bloom-firewalld-public.xml` zone override | Only existed to open port 14500 |
| Port 14500 QEMU forwarding | No remote viewer port |
| Xpra firewall rule in setup wizard | No bloom-xpra service to allow |

### Summary of what's kept

| Kept | Why |
|------|-----|
| `xorg-x11-server-Xvfb` | Virtual framebuffer for headless GUI |
| `xdotool` | Input injection (click, type, key, move, scroll) |
| `scrot` | Screenshots |
| `at-spi2-core` + `python3-pyatspi` | Accessibility tree (ui_tree action) |
| `chromium` | Browser for web tasks |
| `code` (VS Code) | IDE for GUI-based editing |
| bloom-display extension (unchanged) | All 10 actions work on plain Xvfb |
| `ui-tree.py` script | Walks AT-SPI2 tree |

### Summary of what's added

| Added | Why |
|-------|-----|
| `tmux` package | Persistent terminal sessions over SSH |
