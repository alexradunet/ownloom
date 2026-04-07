# Manual QEMU Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Nix-first manual QEMU lab that supports both interactive installer ISO testing and faster preinstalled stable NixOS bootstrap/reboot testing.

**Architecture:** Introduce repo-local QEMU tooling under `tools/qemu/` with a shared runtime wrapper, one installer-ISO launcher, one preinstalled-stable launcher, and one base-image preparation path. Keep all guest install/bootstrap actions manual while standardizing host-side disks, firmware, ports, logging, and repo sharing.

**Tech Stack:** bash, QEMU, OVMF, Nix flakes/apps, qcow2 images, shared folders, operator docs

---

## File Structure

- Create: `tools/qemu/common.sh` — shared path/runtime helpers, port defaults, logging, and command assembly
- Create: `tools/qemu/run-installer.sh` — launch the official stable NixOS installer ISO with a fresh qcow2 disk
- Create: `tools/qemu/run-preinstalled-stable.sh` — boot the reusable preinstalled stable qcow2 image
- Create: `tools/qemu/prepare-preinstalled-stable.sh` — create/reset the base stable disk metadata and launch instructions
- Create: `tools/qemu/README.md` — quick-start for the manual lab
- Modify: `flake.nix` — expose manual lab helpers as flake apps/packages
- Modify: `docs/operations/live-testing.md` — document manual lab usage
- Modify: `README.md` — point operators at the manual lab entrypoints

### Task 1: Add the shared QEMU runtime wrapper

**Files:**
- Create: `tools/qemu/common.sh`
- Test: `tools/qemu/common.sh`

- [ ] **Step 1: Create the shared runtime helper**

Create `tools/qemu/common.sh` with this content:

```bash
#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${TOOLS_DIR}/../.." && pwd)"
LAB_DIR="${NIXPI_QEMU_DIR:-${REPO_DIR}/.omx/qemu-lab}"
DISK_DIR="${LAB_DIR}/disks"
LOG_DIR="${LAB_DIR}/logs"
SHARE_DIR="${REPO_DIR}"
SSH_PORT="${NIXPI_QEMU_SSH_PORT:-2222}"
HTTP_PORT="${NIXPI_QEMU_HTTP_PORT:-8081}"
HTTPS_PORT="${NIXPI_QEMU_HTTPS_PORT:-8444}"
MEMORY_MB="${NIXPI_QEMU_MEMORY_MB:-4096}"
CPUS="${NIXPI_QEMU_CPUS:-4}"
DISK_SIZE="${NIXPI_QEMU_DISK_SIZE:-40G}"

mkdir -p "${DISK_DIR}" "${LOG_DIR}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

qemu_bin() {
  command -v qemu-system-x86_64
}

qemu_img_bin() {
  command -v qemu-img
}

virtiofsd_bin() {
  command -v virtiofsd || true
}

create_qcow2() {
  local disk_path="$1"
  if [ ! -f "${disk_path}" ]; then
    "$(qemu_img_bin)" create -f qcow2 "${disk_path}" "${DISK_SIZE}"
  fi
}

print_access() {
  echo "SSH:   ssh -p ${SSH_PORT} nixos@127.0.0.1"
  echo "HTTP:  http://127.0.0.1:${HTTP_PORT}/"
  echo "HTTPS: https://127.0.0.1:${HTTPS_PORT}/"
}

run_qemu() {
  local name="$1"
  shift
  local serial_log="${LOG_DIR}/${name}-serial.log"
  echo "Launching ${name}"
  echo "Serial log: ${serial_log}"
  print_access
  echo "QEMU command:"
  printf ' %q' "$(qemu_bin)" "$@"
  echo
  exec "$(qemu_bin)" "$@" -serial "file:${serial_log}"
}
```

- [ ] **Step 2: Make the shared helper executable**

Run:

```bash
chmod +x tools/qemu/common.sh
```

Expected: exit 0

- [ ] **Step 3: Verify the helper syntax**

Run:

```bash
bash -n tools/qemu/common.sh
```

Expected: no output, exit 0

- [ ] **Step 4: Commit**

```bash
git add tools/qemu/common.sh
git commit -m "Add a shared runtime wrapper for the manual QEMU lab"
```

### Task 2: Add the installer ISO launcher

**Files:**
- Create: `tools/qemu/run-installer.sh`
- Modify: `flake.nix`
- Test: `tools/qemu/run-installer.sh`

- [ ] **Step 1: Create the installer launcher script**

Create `tools/qemu/run-installer.sh` with this content:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

ISO_PATH="${1:-${LAB_DIR}/nixos-stable-installer.iso}"
DISK_PATH="${DISK_DIR}/installer-scratch.qcow2"
OVMF_CODE="${OVMF_CODE_PATH:-/run/libvirt/nix-ovmf/OVMF_CODE.fd}"
OVMF_VARS="${OVMF_VARS_PATH:-${LAB_DIR}/OVMF_VARS-installer.fd}"

require_cmd "$(qemu_bin)"
require_cmd "$(qemu_img_bin)"

if [ ! -f "${ISO_PATH}" ]; then
  echo "missing installer ISO: ${ISO_PATH}" >&2
  echo "Place a stable NixOS installer ISO there before launching." >&2
  exit 1
fi

create_qcow2 "${DISK_PATH}"

if [ ! -f "${OVMF_VARS}" ] && [ -f /run/libvirt/nix-ovmf/OVMF_VARS.fd ]; then
  cp /run/libvirt/nix-ovmf/OVMF_VARS.fd "${OVMF_VARS}"
fi

run_qemu "installer" \
  -enable-kvm \
  -machine q35,accel=kvm \
  -cpu host \
  -smp "${CPUS}" \
  -m "${MEMORY_MB}" \
  -drive if=pflash,format=raw,readonly=on,file="${OVMF_CODE}" \
  -drive if=pflash,format=raw,file="${OVMF_VARS}" \
  -drive file="${DISK_PATH}",if=virtio,format=qcow2 \
  -cdrom "${ISO_PATH}" \
  -boot d \
  -netdev user,id=net0,hostfwd=tcp::${SSH_PORT}-:22,hostfwd=tcp::${HTTP_PORT}-:80,hostfwd=tcp::${HTTPS_PORT}-:443 \
  -device virtio-net-pci,netdev=net0 \
  -virtfs local,path="${SHARE_DIR}",mount_tag=nixpi-repo,security_model=none,id=repo-share \
  -display gtk
```

- [ ] **Step 2: Make the installer launcher executable**

Run:

```bash
chmod +x tools/qemu/run-installer.sh
```

Expected: exit 0

- [ ] **Step 3: Expose the installer launcher as a flake app**

Add this app definition to `flake.nix`:

```nix
      apps.${system}.qemu-installer = {
        type = "app";
        program = "${pkgs.writeShellScript "qemu-installer" ''
          exec ${./tools/qemu/run-installer.sh} "$@"
        ''}";
      };
```

- [ ] **Step 4: Verify the launcher syntax**

Run:

```bash
bash -n tools/qemu/run-installer.sh
```

Expected: no output, exit 0

- [ ] **Step 5: Commit**

```bash
git add tools/qemu/run-installer.sh flake.nix
git commit -m "Add a manual QEMU launcher for the stable installer ISO"
```

### Task 3: Add the preinstalled stable VM launcher

**Files:**
- Create: `tools/qemu/run-preinstalled-stable.sh`
- Test: `tools/qemu/run-preinstalled-stable.sh`

- [ ] **Step 1: Create the preinstalled-stable launcher**

Create `tools/qemu/run-preinstalled-stable.sh` with this content:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

DISK_PATH="${DISK_DIR}/preinstalled-stable.qcow2"
OVMF_CODE="${OVMF_CODE_PATH:-/run/libvirt/nix-ovmf/OVMF_CODE.fd}"
OVMF_VARS="${OVMF_VARS_PATH:-${LAB_DIR}/OVMF_VARS-preinstalled.fd}"

require_cmd "$(qemu_bin)"

if [ ! -f "${DISK_PATH}" ]; then
  echo "missing preinstalled stable disk: ${DISK_PATH}" >&2
  echo "Run tools/qemu/prepare-preinstalled-stable.sh first." >&2
  exit 1
fi

if [ ! -f "${OVMF_VARS}" ] && [ -f /run/libvirt/nix-ovmf/OVMF_VARS.fd ]; then
  cp /run/libvirt/nix-ovmf/OVMF_VARS.fd "${OVMF_VARS}"
fi

run_qemu "preinstalled-stable" \
  -enable-kvm \
  -machine q35,accel=kvm \
  -cpu host \
  -smp "${CPUS}" \
  -m "${MEMORY_MB}" \
  -drive if=pflash,format=raw,readonly=on,file="${OVMF_CODE}" \
  -drive if=pflash,format=raw,file="${OVMF_VARS}" \
  -drive file="${DISK_PATH}",if=virtio,format=qcow2 \
  -netdev user,id=net0,hostfwd=tcp::${SSH_PORT}-:22,hostfwd=tcp::${HTTP_PORT}-:80,hostfwd=tcp::${HTTPS_PORT}-:443 \
  -device virtio-net-pci,netdev=net0 \
  -virtfs local,path="${SHARE_DIR}",mount_tag=nixpi-repo,security_model=none,id=repo-share \
  -display gtk
```

- [ ] **Step 2: Make the launcher executable and syntax-check it**

Run:

```bash
chmod +x tools/qemu/run-preinstalled-stable.sh
bash -n tools/qemu/run-preinstalled-stable.sh
```

Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add tools/qemu/run-preinstalled-stable.sh
git commit -m "Add a launcher for the reusable preinstalled stable VM"
```

### Task 4: Add base-image preparation guidance and helper

**Files:**
- Create: `tools/qemu/prepare-preinstalled-stable.sh`
- Create: `tools/qemu/README.md`

- [ ] **Step 1: Create the preinstalled image helper**

Create `tools/qemu/prepare-preinstalled-stable.sh` with this content:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

BASE_DISK="${DISK_DIR}/preinstalled-stable.qcow2"

create_qcow2 "${BASE_DISK}"

cat <<EOF
Preinstalled stable disk prepared at:
  ${BASE_DISK}

Next steps:
  1. Launch the installer path:
     tools/qemu/run-installer.sh
  2. Install stable NixOS onto ${BASE_DISK} manually inside the guest.
  3. Shut the guest down after first login validation.
  4. Reuse the disk with:
     tools/qemu/run-preinstalled-stable.sh
EOF
```

- [ ] **Step 2: Create the lab README**

Create `tools/qemu/README.md` with this content:

```md
# Manual QEMU Lab

## Paths

- installer ISO disk: `.omx/qemu-lab/disks/installer-scratch.qcow2`
- preinstalled stable disk: `.omx/qemu-lab/disks/preinstalled-stable.qcow2`
- logs: `.omx/qemu-lab/logs/`

## Flows

### Installer ISO

1. Put a stable NixOS installer ISO at `.omx/qemu-lab/nixos-stable-installer.iso`
2. Run:

```bash
tools/qemu/run-installer.sh
```

3. In the guest, install NixOS manually.
4. Reboot, log in, mount the shared repo if desired, and run bootstrap manually.

### Preinstalled Stable

1. Prepare the base disk:

```bash
tools/qemu/prepare-preinstalled-stable.sh
```

2. Populate that disk once via the installer flow.
3. Reuse it with:

```bash
tools/qemu/run-preinstalled-stable.sh
```

### Shared Repo

The repo is exposed to the guest as a 9p mount with tag `nixpi-repo`.
Mount manually in the guest if needed.
```

- [ ] **Step 3: Make the helper executable and syntax-check it**

Run:

```bash
chmod +x tools/qemu/prepare-preinstalled-stable.sh
bash -n tools/qemu/prepare-preinstalled-stable.sh
```

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add tools/qemu/prepare-preinstalled-stable.sh tools/qemu/README.md
git commit -m "Document and prepare the reusable stable VM disk flow"
```

### Task 5: Wire the manual lab into flake apps and docs

**Files:**
- Modify: `flake.nix`
- Modify: `docs/operations/live-testing.md`
- Modify: `README.md`

- [ ] **Step 1: Add flake apps for the remaining QEMU helpers**

Add these app definitions to `flake.nix`:

```nix
      apps.${system}.qemu-preinstalled-stable = {
        type = "app";
        program = "${pkgs.writeShellScript "qemu-preinstalled-stable" ''
          exec ${./tools/qemu/run-preinstalled-stable.sh} "$@"
        ''}";
      };

      apps.${system}.qemu-prepare-preinstalled-stable = {
        type = "app";
        program = "${pkgs.writeShellScript "qemu-prepare-preinstalled-stable" ''
          exec ${./tools/qemu/prepare-preinstalled-stable.sh} "$@"
        ''}";
      };
```

- [ ] **Step 2: Update `docs/operations/live-testing.md` with the manual lab commands**

Add a subsection like this:

```md
### Manual QEMU Lab

Scratch installer lab:

```bash
nix run .#qemu-installer
```

Reusable preinstalled stable disk:

```bash
nix run .#qemu-prepare-preinstalled-stable
nix run .#qemu-preinstalled-stable
```

These commands standardize the host-side QEMU environment only. Install, bootstrap, reboot, and service validation remain manual inside the guest.
```

- [ ] **Step 3: Update `README.md` with a short pointer**

Add this block under Docs or Quick start:

```md
For manual VM validation of the bootstrap flow, see `tools/qemu/README.md` and the `qemu-installer` / `qemu-preinstalled-stable` flake apps.
```

- [ ] **Step 4: Verify the references resolve**

Run:

```bash
rg -n "qemu-installer|qemu-preinstalled-stable|qemu-prepare-preinstalled-stable|tools/qemu/README.md" flake.nix README.md docs/operations/live-testing.md -S
```

Expected: all manual lab entrypoints are documented and exported.

- [ ] **Step 5: Commit**

```bash
git add flake.nix README.md docs/operations/live-testing.md
git commit -m "Expose the manual QEMU lab through flake apps and docs"
```

### Task 6: Final verification of the manual lab slice

**Files:**
- Modify: none
- Test: all manual lab files and exported apps

- [ ] **Step 1: Verify the helper scripts parse**

Run:

```bash
bash -n tools/qemu/common.sh
bash -n tools/qemu/run-installer.sh
bash -n tools/qemu/run-preinstalled-stable.sh
bash -n tools/qemu/prepare-preinstalled-stable.sh
```

Expected: all commands exit 0

- [ ] **Step 2: Verify the flake apps resolve**

Run:

```bash
nix run .#qemu-prepare-preinstalled-stable -- --help || true
nix run .#qemu-preinstalled-stable -- --help || true
```

Expected: the wrapper scripts execute and print their own usage/error text rather than flake resolution errors.

- [ ] **Step 3: Launch the installer lab far enough to confirm boot wiring**

Run:

```bash
nix run .#qemu-installer
```

Expected: QEMU starts, prints forwarded ports and serial log location, and reaches the NixOS installer environment.

- [ ] **Step 4: Launch the preinstalled-stable lab after preparing the disk**

Run:

```bash
nix run .#qemu-prepare-preinstalled-stable
nix run .#qemu-preinstalled-stable
```

Expected: the prepare step creates the base qcow2 disk and the launch step opens the preinstalled stable VM once the disk has been populated.

- [ ] **Step 5: Commit**

```bash
git add tools/qemu/common.sh tools/qemu/run-installer.sh tools/qemu/run-preinstalled-stable.sh tools/qemu/prepare-preinstalled-stable.sh tools/qemu/README.md flake.nix README.md docs/operations/live-testing.md
git commit -m "Finish the manual QEMU validation lab"
```
