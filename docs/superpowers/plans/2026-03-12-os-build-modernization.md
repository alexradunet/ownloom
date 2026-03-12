# OS Build Modernization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `os/` directory to follow bootc best practices — scratch context stage, fetch/post build scripts, filesystem-mirrored system files, declarative package lists, systemd presets, OCI labels, and CI/CD signing.

**Architecture:** Files move from flat `os/sysconfig/` to `os/system_files/` mirroring real filesystem paths. The monolithic Containerfile is decomposed into numbered build scripts in `os/build_files/` (fetch phases need network, post phases run with `--network=none`). Packages are declared in text files under `os/packages/`. The Containerfile uses a `FROM scratch AS ctx` stage to bind-mount build context without polluting the image.

**Tech Stack:** Podman, Fedora bootc 42, BuildKit cache mounts, systemd presets, cosign, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-12-os-build-modernization-design.md`

---

## Chunk 1: Create New Directory Structure + Package Lists

### Task 1: Create `os/packages/` with declarative package lists

**Files:**
- Create: `os/packages/packages-install.txt`
- Create: `os/packages/packages-remove.txt`
- Create: `os/packages/repos.sh`

- [ ] **Step 1: Create packages-install.txt**

```bash
mkdir -p os/packages
```

Write `os/packages/packages-install.txt` with this exact content:

```
# System essentials
sudo
openssl
curl
wget
unzip
jq

# Development tools
git
git-lfs
ripgrep
fd-find
bat
htop
just
ShellCheck
tmux

# Runtime
nodejs
npm
libatomic

# Container tooling
podman
buildah
skopeo
oras

# VM testing
qemu-system-x86
edk2-ovmf

# Network & remote access
openssh-server
openssh-clients
firewalld
chromium

# VS Code (repo added by repos.sh)
code

# Mesh networking (repo added by repos.sh)
netbird
```

- [ ] **Step 2: Create packages-remove.txt**

Write `os/packages/packages-remove.txt`:

```
# Conflicts with bootc immutability — tries to install packages on immutable OS
PackageKit-command-not-found

# Unnecessary — journalctl provides better logging for servers
rsyslog

# Unnecessary — bootc provides rollback, no rescue initramfs needed
dracut-config-rescue

# Deprecated — firewalld uses nftables directly
iptables-services
iptables-utils
```

- [ ] **Step 3: Create repos.sh**

Write `os/packages/repos.sh`:

```bash
# Third-party repository setup — sourced by 00-base-fetch.sh

# VS Code (Microsoft)
rpm --import https://packages.microsoft.com/keys/microsoft.asc
printf '[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc\n' \
    > /etc/yum.repos.d/vscode.repo

# NetBird mesh networking
printf '[netbird]\nname=netbird\nbaseurl=https://pkgs.netbird.io/yum/\nenabled=1\ngpgcheck=0\nrepo_gpgcheck=1\ngpgkey=https://pkgs.netbird.io/yum/repodata/repomd.xml.key\n' \
    > /etc/yum.repos.d/netbird.repo
```

- [ ] **Step 4: Validate with shellcheck**

Run: `shellcheck os/packages/repos.sh`
Expected: No errors (it's a sourced file, may warn about shebang — that's fine since it's sourced, not executed)

- [ ] **Step 5: Commit**

```bash
git add os/packages/
git commit -m "feat(os): add declarative package lists and repo setup

Extracts package management from Containerfile into text files.
packages-install.txt and packages-remove.txt use comments for
categorization. repos.sh handles third-party repo addition."
```

---

### Task 2: Create `os/system_files/` directory with all config files

**Files:**
- Create: `os/system_files/etc/hostname`
- Create: `os/system_files/etc/issue`
- Create: `os/system_files/etc/ssh/sshd_config.d/50-bloom.conf`
- Move: `os/sysconfig/bloom-bashrc` → `os/system_files/etc/skel/.bashrc`
- Move: `os/sysconfig/bloom-bash_profile` → `os/system_files/etc/skel/.bash_profile`
- Move: `os/sysconfig/bloom-sudoers` → `os/system_files/etc/sudoers.d/10-bloom`
- Move: `os/sysconfig/bloom-matrix.toml` → `os/system_files/etc/bloom/matrix.toml`
- Move: `os/sysconfig/bloom-sysctl.conf` → `os/system_files/usr/lib/sysctl.d/60-bloom-console.conf`
- Move: `os/sysconfig/bloom-tmpfiles.conf` → `os/system_files/usr/lib/tmpfiles.d/bloom.conf`
- Move: `os/sysconfig/bloom-matrix.service` → `os/system_files/usr/lib/systemd/system/bloom-matrix.service`
- Move: `os/sysconfig/bloom-update-check.service` → `os/system_files/usr/lib/systemd/system/bloom-update-check.service`
- Move: `os/sysconfig/bloom-update-check.timer` → `os/system_files/usr/lib/systemd/system/bloom-update-check.timer`
- Move: `os/sysconfig/getty-autologin.conf` → `os/system_files/usr/lib/systemd/system/getty@tty1.service.d/autologin.conf` (and serial-getty copy)
- Move: `os/sysconfig/pi-daemon.service` → `os/system_files/usr/lib/systemd/user/pi-daemon.service`
- Move: `os/sysconfig/bloom-greeting.sh` → `os/system_files/usr/local/bin/bloom-greeting.sh`
- Move: `os/sysconfig/bloom-update-check.sh` → `os/system_files/usr/local/bin/bloom-update-check.sh`
- Move: `os/bootc/config.toml` → `os/system_files/usr/lib/bootc/install/config.toml`
- Create: `os/system_files/usr/lib/systemd/system-preset/01-bloom.preset`

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p os/system_files/etc/skel
mkdir -p os/system_files/etc/ssh/sshd_config.d
mkdir -p os/system_files/etc/sudoers.d
mkdir -p os/system_files/etc/bloom
mkdir -p os/system_files/usr/lib/bootc/install
mkdir -p os/system_files/usr/lib/sysctl.d
mkdir -p os/system_files/usr/lib/systemd/system/getty@tty1.service.d
mkdir -p os/system_files/usr/lib/systemd/system/serial-getty@ttyS0.service.d
mkdir -p os/system_files/usr/lib/systemd/system-preset
mkdir -p os/system_files/usr/lib/systemd/user
mkdir -p os/system_files/usr/lib/tmpfiles.d
mkdir -p os/system_files/usr/local/bin
```

- [ ] **Step 2: Create new files**

Write `os/system_files/etc/hostname`:
```
bloom
```

Write `os/system_files/etc/issue`:
```
Bloom OS

```
(Note: two trailing newlines — one blank line after "Bloom OS")

Write `os/system_files/etc/ssh/sshd_config.d/50-bloom.conf`:
```
PasswordAuthentication yes
PubkeyAuthentication no
```

Write `os/system_files/usr/lib/systemd/system-preset/01-bloom.preset`:
```
# Bloom OS service presets
enable sshd.service
enable netbird.service
enable bloom-matrix.service
enable bloom-update-check.timer
```

- [ ] **Step 3: Move existing sysconfig files using git mv**

```bash
git mv os/sysconfig/bloom-bashrc os/system_files/etc/skel/.bashrc
git mv os/sysconfig/bloom-bash_profile os/system_files/etc/skel/.bash_profile
git mv os/sysconfig/bloom-sudoers os/system_files/etc/sudoers.d/10-bloom
git mv os/sysconfig/bloom-matrix.toml os/system_files/etc/bloom/matrix.toml
git mv os/sysconfig/bloom-sysctl.conf os/system_files/usr/lib/sysctl.d/60-bloom-console.conf
git mv os/sysconfig/bloom-tmpfiles.conf os/system_files/usr/lib/tmpfiles.d/bloom.conf
git mv os/sysconfig/bloom-matrix.service os/system_files/usr/lib/systemd/system/bloom-matrix.service
git mv os/sysconfig/bloom-update-check.service os/system_files/usr/lib/systemd/system/bloom-update-check.service
git mv os/sysconfig/bloom-update-check.timer os/system_files/usr/lib/systemd/system/bloom-update-check.timer
git mv os/sysconfig/getty-autologin.conf os/system_files/usr/lib/systemd/system/getty@tty1.service.d/autologin.conf
cp os/system_files/usr/lib/systemd/system/getty@tty1.service.d/autologin.conf os/system_files/usr/lib/systemd/system/serial-getty@ttyS0.service.d/autologin.conf
git mv os/sysconfig/pi-daemon.service os/system_files/usr/lib/systemd/user/pi-daemon.service
git mv os/sysconfig/bloom-greeting.sh os/system_files/usr/local/bin/bloom-greeting.sh
git mv os/sysconfig/bloom-update-check.sh os/system_files/usr/local/bin/bloom-update-check.sh
git mv os/bootc/config.toml os/system_files/usr/lib/bootc/install/config.toml
```

- [ ] **Step 4: Remove emptied directories**

```bash
rmdir os/sysconfig os/bootc os/scripts 2>/dev/null || true
# If sysconfig has no remaining files, git will track the removal
```

- [ ] **Step 5: Verify file count matches**

Run: `find os/system_files -type f | wc -l`
Expected: 18 files (14 moved + 4 new: hostname, issue, 50-bloom.conf, 01-bloom.preset)

- [ ] **Step 6: Commit**

```bash
git add os/system_files/ os/sysconfig/ os/bootc/ os/scripts/
git commit -m "refactor(os): move sysconfig to filesystem-mirrored system_files

Files now live at their real filesystem paths under os/system_files/.
cp -avf copies them all at once during build. New files: hostname,
issue, 50-bloom.conf (SSH config), 01-bloom.preset (systemd presets)."
```

---

### Task 3: Create `os/disk_config/` and move BIB configs

**Files:**
- Create: `os/disk_config/disk.toml`
- Create: `os/disk_config/iso.toml`
- Move: `os/bib-config.example.toml` → `os/disk_config/bib-config.example.toml`

- [ ] **Step 1: Create disk_config directory and files**

```bash
mkdir -p os/disk_config
```

Write `os/disk_config/disk.toml`:

```toml
[install.filesystem.root]
type = "btrfs"

[[customizations.filesystem]]
mountpoint = "/"
minsize = "40 GiB"
```

Write `os/disk_config/iso.toml`:

```toml
[customizations.installer.kickstart]
contents = """
%post
bootc switch --mutate-in-place --transport registry ghcr.io/pibloom/bloom-os:latest
%end
"""

[customizations.installer.modules]
enable = [
  "org.fedoraproject.Anaconda.Modules.Storage",
  "org.fedoraproject.Anaconda.Modules.Runtime",
  "org.fedoraproject.Anaconda.Modules.Users"
]
disable = [
  "org.fedoraproject.Anaconda.Modules.Subscription"
]
```

- [ ] **Step 2: Move bib-config example**

```bash
git mv os/bib-config.example.toml os/disk_config/bib-config.example.toml
```

- [ ] **Step 3: Commit**

```bash
git add os/disk_config/
git commit -m "feat(os): add disk_config with BIB configs for ISO and qcow2

disk.toml for qcow2/raw builds, iso.toml with kickstart for
registry-based bootc switch post-install."
```

---

## Chunk 2: Create Build Scripts + New Containerfile

### Task 4: Create `os/build_files/` with all build scripts

**Files:**
- Create: `os/build_files/00-base-pre.sh`
- Create: `os/build_files/00-base-fetch.sh`
- Create: `os/build_files/00-base-post.sh`
- Create: `os/build_files/01-bloom-fetch.sh`
- Create: `os/build_files/01-bloom-post.sh`

- [ ] **Step 1: Create 00-base-pre.sh**

```bash
mkdir -p os/build_files
```

Write `os/build_files/00-base-pre.sh`:

```bash
#!/bin/bash
set -xeuo pipefail

# Remove packages that conflict with bootc immutability or are unnecessary
grep -vE '^\s*(#|$)' /ctx/packages/packages-remove.txt | xargs dnf -y remove || true
dnf -y autoremove || true
```

- [ ] **Step 2: Create 00-base-fetch.sh**

Write `os/build_files/00-base-fetch.sh`:

```bash
#!/bin/bash
set -xeuo pipefail

dnf -y install dnf5-plugins

# Add third-party repositories
source /ctx/packages/repos.sh

# Install all packages from the list
grep -vE '^\s*(#|$)' /ctx/packages/packages-install.txt | xargs dnf -y install --allowerasing
dnf clean all
```

- [ ] **Step 3: Create 00-base-post.sh**

Write `os/build_files/00-base-post.sh`:

```bash
#!/bin/bash
set -xeuo pipefail

# Copy all system files to their filesystem locations
# (includes systemd units, presets, skel, ssh config, sudoers, etc.)
cp -avf /ctx/files/. /

# Apply only Bloom's preset entries (not all system presets)
systemctl preset \
    sshd.service \
    netbird.service \
    bloom-matrix.service \
    bloom-update-check.timer

# Mask upstream auto-update timer (we have our own)
systemctl mask bootc-fetch-apply-updates.timer

# Mask unused NFS services
systemctl mask rpcbind.service rpcbind.socket rpc-statd.service

# OS branding
sed -i 's|^PRETTY_NAME=.*|PRETTY_NAME="Bloom OS"|' /usr/lib/os-release

# Remove empty NetBird state files (prevents JSON parse crash on boot)
rm -f /var/lib/netbird/active_profile.json /var/lib/netbird/default.json

# Firewall: trust NetBird tunnel interface
firewall-offline-cmd --zone=trusted --add-interface=wt0

# Set boot target
systemctl set-default multi-user.target
```

- [ ] **Step 4: Create 01-bloom-fetch.sh**

Write `os/build_files/01-bloom-fetch.sh`:

```bash
#!/bin/bash
set -xeuo pipefail

# Global CLI tools (pinned versions)
HOME=/tmp npm install -g --cache /tmp/npm-cache \
    "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    "@mariozechner/pi-coding-agent@${PI_CODING_AGENT_VERSION}" \
    "@biomejs/biome@${BIOME_VERSION}" \
    "typescript@${TYPESCRIPT_VERSION}"

# Bloom package dependencies (cached — only re-runs when package.json changes)
cd /usr/local/share/bloom
HOME=/tmp npm install --cache /tmp/npm-cache

rm -rf /tmp/npm-cache /var/roothome/.npm /root/.npm
```

- [ ] **Step 5: Create 01-bloom-post.sh**

Write `os/build_files/01-bloom-post.sh`:

```bash
#!/bin/bash
set -xeuo pipefail

cd /usr/local/share/bloom

# Build TypeScript and prune dev deps
npm run build
npm prune --omit=dev

# Symlink globally-installed Pi SDK into Bloom's node_modules
ln -sf /usr/local/lib/node_modules/@mariozechner /usr/local/share/bloom/node_modules/@mariozechner

# Configure Pi settings defaults (immutable layer)
mkdir -p /usr/local/share/bloom/.pi/agent
echo '{"packages": ["/usr/local/share/bloom"]}' > /usr/local/share/bloom/.pi/agent/settings.json

# Persona directory
mkdir -p /usr/local/share/bloom/persona

# Continuwuity binary
chmod +x /usr/local/bin/continuwuity

# Appservices directory
mkdir -p /etc/bloom/appservices
```

- [ ] **Step 6: Make all scripts executable**

```bash
chmod +x os/build_files/*.sh
```

- [ ] **Step 7: Run shellcheck on all scripts**

Run: `shellcheck os/build_files/*.sh`
Expected: Clean (no errors). Warnings about `source` in `00-base-fetch.sh` are acceptable.

- [ ] **Step 8: Commit**

```bash
git add os/build_files/
git commit -m "feat(os): add phased build scripts for Containerfile

00-base-pre (package removal), 00-base-fetch (dnf install from lists),
00-base-post (copy system_files, presets, branding), 01-bloom-fetch
(npm global tools + bloom deps), 01-bloom-post (TypeScript build, Pi config)."
```

---

### Task 5: Replace the Containerfile

**Files:**
- Modify: `os/Containerfile`

- [ ] **Step 1: Write the new Containerfile**

Replace `os/Containerfile` entirely with:

```dockerfile
# Bloom OS — Fedora bootc 42 with Pi coding agent
# Build: podman build -f os/Containerfile -t bloom-os:latest .
# Install: sudo bootc install to-disk /dev/sdX --source-imgref containers-storage:bloom-os:latest
ARG CONTINUWUITY_IMAGE=forgejo.ellis.link/continuwuation/continuwuity:0.5.0-rc.6
ARG PI_CODING_AGENT_VERSION=0.57.1
ARG BIOME_VERSION=2.4.6
ARG TYPESCRIPT_VERSION=5.9.3
ARG CLAUDE_CODE_VERSION=2.1.73

FROM ${CONTINUWUITY_IMAGE} AS continuwuity-src

FROM scratch AS ctx
COPY os/build_files /build
COPY os/system_files /files
COPY os/packages /packages

FROM quay.io/fedora/fedora-bootc:42

# Phase 1: Remove unwanted packages
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    /ctx/build/00-base-pre.sh

# Phase 2: Install system packages (network)
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=cache,dst=/var/cache/libdnf5 \
    --mount=type=tmpfs,dst=/tmp \
    /ctx/build/00-base-fetch.sh

# Phase 3: Copy system files, apply presets, branding (offline)
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    --network=none \
    /ctx/build/00-base-post.sh

# Phase 4: Install Node.js CLI tools + Bloom npm deps (network)
ARG PI_CODING_AGENT_VERSION
ARG BIOME_VERSION
ARG TYPESCRIPT_VERSION
ARG CLAUDE_CODE_VERSION
COPY package.json package-lock.json /usr/local/share/bloom/
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    PI_CODING_AGENT_VERSION=${PI_CODING_AGENT_VERSION} \
    BIOME_VERSION=${BIOME_VERSION} \
    TYPESCRIPT_VERSION=${TYPESCRIPT_VERSION} \
    CLAUDE_CODE_VERSION=${CLAUDE_CODE_VERSION} \
    /ctx/build/01-bloom-fetch.sh

# Phase 5: Build Bloom TypeScript, configure Pi (offline)
COPY . /usr/local/share/bloom/
COPY --from=continuwuity-src /sbin/conduwuit /usr/local/bin/continuwuity
RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=tmpfs,dst=/tmp \
    --network=none \
    /ctx/build/01-bloom-post.sh

# Optional: pre-configure WiFi for headless first-boot
ARG WIFI_SSID=""
ARG WIFI_PSK=""
RUN if [ -n "$WIFI_SSID" ]; then \
    printf '[connection]\nid=%s\ntype=wifi\nautoconnect=true\n\n[wifi]\nmode=infrastructure\nssid=%s\n\n[wifi-security]\nkey-mgmt=wpa-psk\npsk=%s\n\n[ipv4]\nmethod=auto\n\n[ipv6]\nmethod=auto\n' \
        "$WIFI_SSID" "$WIFI_SSID" "$WIFI_PSK" \
        > /etc/NetworkManager/system-connections/wifi.nmconnection && \
    chmod 600 /etc/NetworkManager/system-connections/wifi.nmconnection; \
fi

# Symlink /opt to /var/opt for day-2 package installs
RUN rm -rf /opt && ln -s /var/opt /opt

# Final cleanup + validation
RUN rm -rf /var/* && mkdir -p /var/tmp /var/opt && bootc container lint

# Login branding
RUN printf '' > /etc/motd

LABEL containers.bootc="1"
LABEL org.opencontainers.image.title="Bloom OS"
LABEL org.opencontainers.image.description="Pi-native AI companion OS on Fedora bootc"
LABEL org.opencontainers.image.source="https://github.com/pibloom/pi-bloom"
LABEL org.opencontainers.image.version="0.1.0"
```

- [ ] **Step 2: Commit**

```bash
git add os/Containerfile
git commit -m "refactor(os): rewrite Containerfile with scratch context and phased builds

Uses FROM scratch AS ctx for build context isolation, BuildKit cache
mounts for dnf, fetch/post script split with --network=none on offline
phases, declarative package lists, systemd presets, and full OCI labels."
```

---

## Chunk 3: Update Justfile + CI/CD + Cleanup

### Task 6: Update the Justfile

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Read the current justfile for exact content**

Run: `cat justfile` (to verify current state before editing)

- [ ] **Step 2: Update BIB config variables and add lint-os**

Replace the `bib_config` variable and `_require-bib-config` guard. Change:
- `bib_config := "os/bib-config.toml"` → remove this line
- Add `bib_config_disk := "os/disk_config/bib-config.example.toml"` (user copies to `bib-config.toml`)
- Update `qcow2` recipe: change `-v ./{{ bib_config }}:/config.toml:ro` to `-v ./os/disk_config/bib-config.toml:/config.toml:ro`
- Update `iso` recipe: same change
- Update `iso-production` recipe: same change
- Update `_require-bib-config` to check `os/disk_config/bib-config.toml` and reference `os/disk_config/bib-config.example.toml` in the error message

Add at the end:

```just
# Lint OS build scripts with shellcheck
lint-os:
	shellcheck os/build_files/*.sh os/packages/repos.sh
```

- [ ] **Step 3: Verify justfile syntax**

Run: `just --list`
Expected: All recipes listed without errors

- [ ] **Step 4: Commit**

```bash
git add justfile
git commit -m "refactor(os): update justfile for disk_config paths and add lint-os"
```

---

### Task 7: Update CI/CD workflow with cosign signing

**Files:**
- Modify: `.github/workflows/build-os.yml`

- [ ] **Step 1: Update build-os.yml**

Update `.github/workflows/build-os.yml` to add:
- `id-token: write` permission (needed for cosign)
- Date-stamped tags (`latest.YYYYMMDD`)
- Cosign install and sign steps (conditional on `SIGNING_SECRET` existing)
- `shellcheck` lint step for build scripts

The updated workflow should look like:

```yaml
name: Build Bloom OS

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * SUN'
  workflow_dispatch:

permissions:
  contents: read
  packages: write
  id-token: write

env:
  IMAGE_NAME: bloom-os
  REGISTRY: ghcr.io/${{ github.repository_owner }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install JS dependencies
        run: npm ci

      - name: TypeScript build
        run: npm run build

      - name: Biome check
        run: npm run check

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Lint OS build scripts
        run: shellcheck os/build_files/*.sh os/packages/repos.sh

      - name: Get current date
        id: date
        run: echo "date=$(date +%Y%m%d)" >> "$GITHUB_OUTPUT"

      - name: Build OS image
        run: |
          podman build -f os/Containerfile \
            --cap-add SYS_ADMIN \
            -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest \
            -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest.${{ steps.date.outputs.date }} \
            .

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Push to GHCR
        run: |
          podman push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          podman push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          podman push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest.${{ steps.date.outputs.date }}

      - name: Install Cosign
        if: env.HAS_SIGNING_SECRET == 'true'
        uses: sigstore/cosign-installer@v4.0.0
        env:
          HAS_SIGNING_SECRET: ${{ secrets.SIGNING_SECRET != '' }}

      - name: Sign container image
        if: env.HAS_SIGNING_SECRET == 'true'
        env:
          HAS_SIGNING_SECRET: ${{ secrets.SIGNING_SECRET != '' }}
          COSIGN_PRIVATE_KEY: ${{ secrets.SIGNING_SECRET }}
        run: |
          cosign sign -y --key env://COSIGN_PRIVATE_KEY \
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-os.yml
git commit -m "feat(ci): add cosign signing, date tags, and shellcheck lint to OS build"
```

---

### Task 8: Clean up old files

**Files:**
- Delete: `build-iso.sh`
- Delete: `os/sysconfig/` (if any files remain)
- Delete: `os/bootc/` (if directory remains)
- Delete: `os/scripts/` (if directory remains)

- [ ] **Step 1: Remove build-iso.sh**

```bash
git rm build-iso.sh
```

- [ ] **Step 2: Remove any remaining old directories**

```bash
git rm -r os/sysconfig 2>/dev/null || true
git rm -r os/bootc 2>/dev/null || true
git rm -r os/scripts 2>/dev/null || true
```

- [ ] **Step 3: Update .gitignore for cosign.key**

Add to `.gitignore`:
```
cosign.key
```

Also verify `os/output/` and `os/disk_config/bib-config.toml` are gitignored (check existing `.gitignore`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(os): remove old sysconfig, bootc, scripts dirs and build-iso.sh

These are replaced by system_files/, build_files/, packages/, and
disk_config/ respectively. Justfile recipes cover ISO building."
```

---

### Task 9: Final validation

- [ ] **Step 1: Verify directory structure matches spec**

Run:
```bash
find os/ -type f -not -path 'os/output/*' | sort
```

Expected output should match the spec's "After" directory tree.

- [ ] **Step 2: Verify no broken references**

Run:
```bash
# Check nothing references old sysconfig paths
grep -r 'sysconfig' os/ justfile .github/ 2>/dev/null || echo "Clean"
# Check nothing references old os/bootc path
grep -r 'os/bootc/' os/ justfile .github/ 2>/dev/null || echo "Clean"
# Check nothing references old bib-config.toml path at root
grep -r 'bib-config.toml' justfile .github/ 2>/dev/null | grep -v disk_config || echo "Clean"
```

Expected: "Clean" for all three checks

- [ ] **Step 3: Run shellcheck on all build scripts**

Run: `shellcheck os/build_files/*.sh os/packages/repos.sh`
Expected: No errors

- [ ] **Step 4: Run existing tests to verify nothing broke**

Run: `npm run build && npm run check && npm run test`
Expected: All pass (this migration doesn't change TypeScript source)

- [ ] **Step 5: Verify justfile still works**

Run: `just --list`
Expected: All recipes listed, no syntax errors
