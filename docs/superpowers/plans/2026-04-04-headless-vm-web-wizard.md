# Headless VM, Web Wizard, Dev SSH, and ttyd Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the XFCE desktop and bash wizard with a fully headless NixOS VM that has a pre-authorized dev SSH key, a browser-based setup wizard, and a web terminal via ttyd at `/terminal`.

**Architecture:** The NixOS VM host strips all graphical packages and the bash wizard package; a committed dev keypair authorizes agent SSH from first boot. The TypeScript chat server gains a setup gate (redirects to `/setup` if not configured) plus an `/api/setup/apply` handler that streams a shell apply script. ttyd is added as a systemd service and proxied through nginx at `/terminal`.

**Tech Stack:** NixOS/Nix, TypeScript/Node.js (chat server), bash (apply script), ttyd, nginx, Vitest

---

## File Map

**Create:**
- `tools/dev-key` — SSH dev private key (committed, dev VM only)
- `tools/dev-key.pub` — SSH dev public key
- `core/os/modules/ttyd.nix` — ttyd systemd service + option
- `core/chat-server/setup.ts` — setup gate helpers + `/api/setup/apply` handler
- `tests/chat-server/setup.test.ts` — unit tests for setup gate and apply routing

**Modify:**
- `core/os/modules/default.nix` — remove `./desktop-xfce.nix`, `./setup.nix`; add `./ttyd.nix`
- `core/os/modules/service-surface.nix` — add nginx `/terminal` location block
- `core/os/hosts/x86_64.nix` — remove `services.xserver.xkb`
- `core/os/hosts/x86_64-vm.nix` — add `users.users.pi.openssh.authorizedKeys.keyFiles`
- `core/chat-server/index.ts` — wire setup gate + `/setup` route + `/api/setup/apply`
- `core/chat-server/frontend/index.html` — add Terminal nav link
- `tools/run-qemu.sh` — remove `gui`/`headless` modes, keep `daemon` only
- `justfile` — update VM recipes, `vm-ssh` uses dev key
- `flake.nix` — remove `setupPackage` everywhere, remove desktop/wizard test lanes
- `tests/nixos/default.nix` — remove `setupPackage`, remove wizard/desktop tests

**Delete:**
- `core/os/modules/desktop-xfce.nix`
- `core/os/modules/setup.nix`
- `core/os/pkgs/setup/default.nix` (and parent dir `core/os/pkgs/setup/`)
- `core/scripts/setup-wizard.sh`
- `core/scripts/wizard-identity.sh`
- `core/scripts/wizard-services.sh`
- `core/scripts/wizard-repo.sh`
- `core/scripts/wizard-promote.sh`
- `core/scripts/setup-lib.sh`
- `tests/nixos/nixpi-install-wizard.nix`
- `tests/nixos/nixpi-desktop.nix`

---

## Task 1: Generate dev SSH keypair

**Files:**
- Create: `tools/dev-key`
- Create: `tools/dev-key.pub`

- [ ] **Step 1: Generate the keypair**

```bash
ssh-keygen -t ed25519 -C "nixpi-dev" -N "" -f tools/dev-key
```

Expected: `tools/dev-key` (private, mode 600) and `tools/dev-key.pub` created.

- [ ] **Step 2: Verify the key files exist**

```bash
head -1 tools/dev-key       # should print -----BEGIN OPENSSH PRIVATE KEY-----
cat tools/dev-key.pub        # should print ssh-ed25519 AAAA... nixpi-dev
```

- [ ] **Step 3: Commit**

```bash
git add tools/dev-key tools/dev-key.pub
git commit -m "chore: add dev VM SSH keypair for agent access"
```

---

## Task 2: Strip desktop from NixOS

**Files:**
- Modify: `core/os/modules/default.nix`
- Delete: `core/os/modules/desktop-xfce.nix`
- Modify: `core/os/hosts/x86_64.nix`

- [ ] **Step 1: Remove desktop-xfce and setup imports from default.nix**

Replace the full contents of `core/os/modules/default.nix` with:

```nix
{ ... }:

{
  imports = [
    ./options.nix
    ./network.nix
    ./update.nix
    ./runtime.nix
    ./collab.nix
    ./tooling.nix
    ./shell.nix
    ./firstboot
  ];
}
```

- [ ] **Step 2: Delete desktop-xfce.nix**

```bash
rm core/os/modules/desktop-xfce.nix
```

- [ ] **Step 3: Remove services.xserver.xkb from x86_64.nix**

In `core/os/hosts/x86_64.nix`, remove the line:

```nix
  services.xserver.xkb = { layout = config.nixpi.keyboard; variant = ""; };
```

The `console.keyMap = config.nixpi.keyboard;` line stays.

- [ ] **Step 4: Verify NixOS evaluation**

```bash
nix build .#nixosConfigurations.desktop-vm.config.system.build.vm --dry-run 2>&1 | tail -5
```

Expected: evaluation succeeds (no errors about missing desktop-xfce.nix or xserver).

- [ ] **Step 5: Commit**

```bash
git add core/os/modules/default.nix core/os/hosts/x86_64.nix
git rm core/os/modules/desktop-xfce.nix
git commit -m "feat: strip XFCE desktop from NixOS VM — headless only"
```

---

## Task 3: Add dev SSH key to VM host and simplify justfile

**Files:**
- Modify: `core/os/hosts/x86_64-vm.nix`
- Modify: `tools/run-qemu.sh`
- Modify: `justfile`

- [ ] **Step 1: Authorize dev key in x86_64-vm.nix**

Replace the full contents of `core/os/hosts/x86_64-vm.nix` with:

```nix
# core/os/hosts/x86_64-vm.nix
# Local headless VM/dev host. Pre-authorizes the committed dev key so agents
# and developers can SSH in from first boot without any wizard interaction.
{ ... }:

{
  imports = [ ./x86_64.nix ];

  # Pre-authorize the committed dev keypair for passwordless agent SSH.
  # tools/dev-key is intentionally committed — this is a dev-only VM.
  users.users.pi.openssh.authorizedKeys.keyFiles = [ ../../tools/dev-key.pub ];

  # VM dev share: mount host's ~/.nixpi into /mnt/host-nixpi via 9p virtfs.
  fileSystems."/mnt/host-nixpi" = {
    device = "host-nixpi";
    fsType = "9p";
    options = [ "trans=virtio" "ro" "nofail" ];
  };
}
```

- [ ] **Step 2: Simplify run-qemu.sh to daemon-only**

Replace the `while` loop, mode check block, and the `case "$mode"` block at the bottom of `tools/run-qemu.sh`. The entire file should become:

```bash
#!/usr/bin/env bash
# run-qemu.sh — VM launcher. Runs the NixOS VM in background daemon mode.
# Usage: run-qemu.sh
set -euo pipefail

DISK="${NIXPI_VM_DISK_PATH:-/tmp/nixpi-vm-disk.qcow2}"
OUTPUT="${NIXPI_VM_OUTPUT:-result}"
RUNNER="${OUTPUT}/bin/run-nixos-vm"
LOG_FILE="${NIXPI_VM_LOG_PATH:-/tmp/nixpi-vm.log}"
DISK_SIZE="${NIXPI_VM_DISK_SIZE:-80G}"
MEMORY_MB="${NIXPI_VM_MEMORY_MB:-16384}"
VM_CPUS="${NIXPI_VM_CPUS:-4}"
MIN_DISK_BYTES=$((16 * 1024 * 1024 * 1024))
HOST_REPO_PATH="${NIXPI_VM_HOST_REPO_PATH:-$PWD}"
HOST_NIXPI_PATH="${NIXPI_VM_HOST_STATE_PATH:-$HOME/.nixpi}"
PREFILL_SOURCE="${NIXPI_VM_PREFILL_SOURCE:-core/scripts/prefill.env}"

host_port_busy() {
    local port="$1"
    ss -ltn "( sport = :${port} )" 2>/dev/null | tail -n +2 | grep -q .
}

create_empty_filesystem_image() {
    local name="$1"
    local size="$2"
    local temp
    temp="$(mktemp)"
    qemu-img create -f raw "$temp" "$size" >/dev/null
    mkfs.ext4 -L nixos "$temp" >/dev/null
    qemu-img convert -f raw -O qcow2 "$temp" "$name"
    rm -f "$temp"
}

ensure_vm_disk() {
    local recreate=0
    if [[ ! -f "$DISK" ]]; then
        recreate=1
    else
        local virtual_size
        virtual_size="$(qemu-img info --output=json "$DISK" 2>/dev/null | sed -n 's/.*"virtual-size":[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n1)"
        if [[ -z "$virtual_size" || "$virtual_size" -lt "$MIN_DISK_BYTES" ]]; then
            echo "Recreating stale VM disk at ${DISK} (detected size below 16 GiB)..."
            rm -f "$DISK"
            recreate=1
        fi
    fi

    if [[ "$recreate" -eq 1 ]]; then
        echo "Creating VM disk image at ${DISK} (${DISK_SIZE})..."
        create_empty_filesystem_image "$DISK" "$DISK_SIZE"
    fi
}

if [[ ! -x "$RUNNER" ]]; then
    echo "Error: ${RUNNER} not found. Run 'just qcow2' first." >&2
    exit 1
fi

ensure_vm_disk

if [[ -f "$PREFILL_SOURCE" ]]; then
    mkdir -p "$HOST_NIXPI_PATH"
    cp "$PREFILL_SOURCE" "$HOST_NIXPI_PATH/prefill.env"
    echo "Staged ${PREFILL_SOURCE} -> ${HOST_NIXPI_PATH}/prefill.env"
fi

export NIX_DISK_IMAGE="$DISK"
mkdir -p "$HOST_NIXPI_PATH"
export QEMU_OPTS="-m ${MEMORY_MB} -smp ${VM_CPUS} -nographic \
  -virtfs local,path=${HOST_REPO_PATH},security_model=none,readonly=on,mount_tag=host-repo \
  -virtfs local,path=${HOST_NIXPI_PATH},security_model=none,readonly=on,mount_tag=host-nixpi"

net_opts=()
for spec in "2222:22:required"; do
    IFS=":" read -r host_port guest_port policy <<<"${spec}"
    if host_port_busy "${host_port}"; then
        if [[ "${policy}" == "required" ]]; then
            echo "Error: required host port ${host_port} is already in use." >&2
            exit 1
        fi
        continue
    fi
    net_opts+=("hostfwd=tcp::${host_port}-:${guest_port}")
done

export QEMU_NET_OPTS
QEMU_NET_OPTS="$(IFS=,; echo "${net_opts[*]}")"

if pgrep -f "[r]un-nixos-vm|[q]emu-system-x86_64.*${DISK}" > /dev/null; then
    echo "VM already running. Use 'just vm-ssh' to connect or 'just vm-stop' to stop."
    exit 1
fi

echo "Starting VM in background..."
echo "  - Log file: ${LOG_FILE}"
echo "  - Connect:  just vm-ssh"
echo "  - Stop:     just vm-stop"

nohup "$RUNNER" >"${LOG_FILE}" 2>&1 &

echo "Waiting for VM to boot..."
for i in {1..60}; do
    if nc -z localhost 2222 2>/dev/null; then
        echo "VM is ready! SSH available on port 2222"
        exit 0
    fi
    sleep 1
done
echo "VM starting... try 'just vm-ssh' in a few seconds"
```

- [ ] **Step 3: Update justfile VM recipes**

In `justfile`, replace all VM-related recipes (everything from `# Build qcow2` down through `vm-kill`) with:

```just
# Build qcow2 VM image for testing
qcow2:
    nix build {{ flake }}#nixosConfigurations.{{ vm_host }}.config.system.build.vm

# Run VM in background daemon mode
# Connect with: just vm-ssh  |  Stop with: just vm-stop
vm: qcow2
    tools/run-qemu.sh

# SSH into the running VM using the committed dev key
vm-ssh:
    #!/usr/bin/env bash
    if ! pgrep -f "[q]emu-system-x86_64.*nixpi-vm-disk" > /dev/null; then
        echo "No VM running. Start with: just vm"
        exit 1
    fi
    ssh -i tools/dev-key \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -p 2222 pi@localhost

# Show VM log
vm-logs:
    tail -f /tmp/nixpi-vm.log

# Stop the running VM
vm-stop:
    #!/usr/bin/env bash
    pid=$(pgrep -f "[q]emu-system-x86_64.*nixpi-vm-disk" || true)
    if [ -z "$pid" ]; then
        echo "No VM running"
        exit 0
    fi
    echo "Stopping VM (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
    fi
    echo "VM stopped"

# Remove build results and VM disk
clean:
    rm -f result result-*
    rm -f /tmp/nixpi-vm-disk.qcow2 /tmp/nixpi-ovmf-vars.fd
```

- [ ] **Step 4: Verify VM builds**

```bash
nix build .#nixosConfigurations.desktop-vm.config.system.build.vm --dry-run 2>&1 | tail -5
```

Expected: succeeds (no evaluation errors).

- [ ] **Step 5: Commit**

```bash
git add core/os/hosts/x86_64-vm.nix tools/run-qemu.sh justfile
git commit -m "feat: headless VM with pre-authorized dev SSH key"
```

---

## Task 4: Add ttyd NixOS module and nginx proxy

**Files:**
- Create: `core/os/modules/ttyd.nix`
- Modify: `core/os/modules/default.nix`
- Modify: `core/os/modules/service-surface.nix`

- [ ] **Step 1: Create ttyd.nix**

Create `core/os/modules/ttyd.nix`:

```nix
# core/os/modules/ttyd.nix
# Runs ttyd as a local service so the web terminal is available at /terminal.
# The nginx proxy in service-surface.nix exposes it on the public port.
{ pkgs, lib, config, ... }:

{
  options.nixpi.ttyd.enable = lib.mkEnableOption "web terminal via ttyd" // {
    default = true;
  };

  config = lib.mkIf config.nixpi.ttyd.enable {
    environment.systemPackages = [ pkgs.ttyd ];

    systemd.services.nixpi-ttyd = {
      description = "NixPI web terminal (ttyd)";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        ExecStart = "${pkgs.ttyd}/bin/ttyd --port 7681 --interface 127.0.0.1 ${pkgs.bash}/bin/bash";
        User = config.nixpi.primaryUser;
        Group = config.nixpi.primaryUser;
        Restart = "on-failure";
        RestartSec = "5";
        NoNewPrivileges = true;
        PrivateTmp = true;
      };
    };
  };
}
```

- [ ] **Step 2: Add ttyd.nix to default.nix**

In `core/os/modules/default.nix`, add `./ttyd.nix` to the imports list:

```nix
{ ... }:

{
  imports = [
    ./options.nix
    ./network.nix
    ./update.nix
    ./runtime.nix
    ./collab.nix
    ./tooling.nix
    ./shell.nix
    ./firstboot
    ./ttyd.nix
  ];
}
```

- [ ] **Step 3: Add /terminal nginx location to service-surface.nix**

In `core/os/modules/service-surface.nix`, find the nginx `locations."/"` blocks and add a `/terminal` location alongside each one. The two nginx server blocks (HTTP and HTTPS) both need the terminal location. Find the section containing `locations."/".proxyPass = "http://127.0.0.1:${toString cfg.home.port}";` and add before it (inside the same `virtualHosts` block):

```nix
locations."/terminal" = {
  proxyPass = "http://127.0.0.1:7681";
  extraConfig = ''
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  '';
};
```

Add this block to both the HTTP virtual host and the HTTPS virtual host inside the `lib.mkMerge` in service-surface.nix.

- [ ] **Step 4: Verify evaluation**

```bash
nix build .#nixosConfigurations.desktop-vm.config.system.build.vm --dry-run 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add core/os/modules/ttyd.nix core/os/modules/default.nix core/os/modules/service-surface.nix
git commit -m "feat: add ttyd web terminal at /terminal via nginx proxy"
```

---

## Task 5: Remove bash wizard — scripts, package, NixOS module, flake wiring

**Files:**
- Delete: `core/os/modules/setup.nix`, `core/os/pkgs/setup/`, wizard scripts in `core/scripts/`
- Delete: `tests/nixos/nixpi-install-wizard.nix`, `tests/nixos/nixpi-desktop.nix`
- Modify: `flake.nix`, `tests/nixos/default.nix`

- [ ] **Step 1: Delete wizard scripts**

```bash
rm core/scripts/setup-wizard.sh
rm core/scripts/wizard-identity.sh
rm core/scripts/wizard-services.sh
rm core/scripts/wizard-repo.sh
rm core/scripts/wizard-promote.sh
rm core/scripts/setup-lib.sh
rm core/os/modules/setup.nix
rm -r core/os/pkgs/setup/
```

- [ ] **Step 2: Delete wizard and desktop NixOS tests**

```bash
rm tests/nixos/nixpi-install-wizard.nix
rm tests/nixos/nixpi-desktop.nix
```

- [ ] **Step 3: Remove setupPackage from tests/nixos/default.nix**

In `tests/nixos/default.nix`:

Change the function signature from:
```nix
{ pkgs, lib, piAgent, appPackage, self, installerHelper ? null, setupPackage }:
```
to:
```nix
{ pkgs, lib, piAgent, appPackage, self, installerHelper ? null }:
```

Remove `setupPackage` from `sharedArgs`:
```nix
sharedArgs = {
  inherit piAgent appPackage self;
  inherit (testLib)
    nixPiModules
    nixPiModulesNoShell
    mkTestFilesystems
    mkManagedUserConfig
    mkPrefillActivation;
};
```

Remove the two test entries from the `tests` attrset:
```nix
# remove these lines:
nixpi-desktop              = runTest ./nixpi-desktop.nix;
nixpi-install-wizard       = runTest ./nixpi-install-wizard.nix;
```

Remove from `smokeAliases`:
```nix
# remove these lines:
smoke-install-wizard   = tests.nixpi-install-wizard;
smoke-desktop   = tests.nixpi-desktop;
```

- [ ] **Step 4: Remove setupPackage and setup.nix from flake.nix**

In `flake.nix`, make the following changes:

a) Remove the `setupPackage` definition (line ~23):
```nix
# remove:
setupPackage = pkgs.callPackage ./core/os/pkgs/setup {};
```

b) Remove `setupPackage` from `specialArgs` (line ~32):
```nix
specialArgs = { inherit piAgent appPackage self installerHelper disko; };
```

c) Remove from `packages`:
```nix
# remove:
nixpi-setup = setupPackage;
```

d) Remove `./core/os/modules/setup.nix` from all `nixosModules.*` imports. Search for every occurrence of `./core/os/modules/setup.nix` in flake.nix and remove just that line from each `imports` list it appears in.

e) Remove `setupPackage` from the nixosTests callPackage invocation (line ~229):
```nix
inherit lib piAgent appPackage self installerHelper;
```
And remove it from the `_module.args` line ~238:
```nix
_module.args = { inherit piAgent appPackage self; };
```

f) Remove `smoke-desktop` and `smoke-install-wizard` from the `nixos-smoke` check lane. Remove `nixpi-install-wizard` and `nixpi-desktop` from `nixos-full` check lane.

g) Remove the `desktop-vm` check entry that builds the VM:
```nix
# remove:
desktop-vm = self.nixosConfigurations.desktop-vm.config.system.build.vm;
```
(This is a build artifact check — keep `qcow2` buildable via `just qcow2` but don't expose it as a named check.)

- [ ] **Step 5: Verify evaluation**

```bash
nix build .#checks.x86_64-linux.config --dry-run 2>&1 | tail -10
nix build .#nixosConfigurations.desktop-vm.config.system.build.vm --dry-run 2>&1 | tail -5
```

Expected: both succeed (no references to missing files).

- [ ] **Step 6: Commit**

```bash
git add flake.nix tests/nixos/default.nix core/os/modules/default.nix
git rm core/os/modules/setup.nix
git rm core/scripts/setup-wizard.sh core/scripts/wizard-identity.sh \
    core/scripts/wizard-services.sh core/scripts/wizard-repo.sh \
    core/scripts/wizard-promote.sh core/scripts/setup-lib.sh
git rm -r core/os/pkgs/setup/
git rm tests/nixos/nixpi-install-wizard.nix tests/nixos/nixpi-desktop.nix
git commit -m "feat: remove bash wizard and desktop setup package"
```

---

## Task 6: Write failing tests for the setup gate

**Files:**
- Create: `tests/chat-server/setup.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/chat-server/setup.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSystemReady, shouldRedirectToSetup } from "../../core/chat-server/setup.js";

let tmpDir: string;
let systemReadyFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-setup-test-"));
  systemReadyFile = path.join(tmpDir, "system-ready");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("isSystemReady", () => {
  it("returns false when system-ready file is absent", () => {
    expect(isSystemReady(systemReadyFile)).toBe(false);
  });

  it("returns true when system-ready file exists", () => {
    fs.writeFileSync(systemReadyFile, "");
    expect(isSystemReady(systemReadyFile)).toBe(true);
  });
});

describe("shouldRedirectToSetup", () => {
  it("returns true for / when system is not ready", () => {
    expect(shouldRedirectToSetup("/", systemReadyFile)).toBe(true);
  });

  it("returns true for /chat when system is not ready", () => {
    expect(shouldRedirectToSetup("/chat", systemReadyFile)).toBe(true);
  });

  it("returns false for /setup when system is not ready", () => {
    expect(shouldRedirectToSetup("/setup", systemReadyFile)).toBe(false);
  });

  it("returns false for /setup/assets/foo.js when system is not ready", () => {
    expect(shouldRedirectToSetup("/setup/assets/foo.js", systemReadyFile)).toBe(false);
  });

  it("returns false for /terminal when system is not ready", () => {
    expect(shouldRedirectToSetup("/terminal", systemReadyFile)).toBe(false);
  });

  it("returns false for /terminal/ws when system is not ready", () => {
    expect(shouldRedirectToSetup("/terminal/ws", systemReadyFile)).toBe(false);
  });

  it("returns false for /api/setup/apply when system is not ready", () => {
    expect(shouldRedirectToSetup("/api/setup/apply", systemReadyFile)).toBe(false);
  });

  it("returns false for / when system is ready", () => {
    fs.writeFileSync(systemReadyFile, "");
    expect(shouldRedirectToSetup("/", systemReadyFile)).toBe(false);
  });

  it("returns false for /chat when system is ready", () => {
    fs.writeFileSync(systemReadyFile, "");
    expect(shouldRedirectToSetup("/chat", systemReadyFile)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npx vitest run tests/chat-server/setup.test.ts 2>&1 | tail -15
```

Expected: FAIL with `Cannot find module '../../core/chat-server/setup.js'`.

---

## Task 7: Implement setup.ts — gate helpers and apply handler

**Files:**
- Create: `core/chat-server/setup.ts`
- Modify: `core/chat-server/index.ts`

- [ ] **Step 1: Create core/chat-server/setup.ts**

```typescript
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

/** Paths that bypass the setup redirect gate unconditionally. */
const SETUP_EXEMPT_PREFIXES = ["/setup", "/terminal", "/api/setup"];

/** Returns true if the system-ready marker file exists. */
export function isSystemReady(systemReadyFile: string): boolean {
  try {
    fs.accessSync(systemReadyFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if the request at `pathname` should be redirected to /setup.
 * Exempt paths: anything under /setup, /terminal, or /api/setup.
 */
export function shouldRedirectToSetup(pathname: string, systemReadyFile: string): boolean {
  if (SETUP_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return !isSystemReady(systemReadyFile);
}

export interface ApplyPayload {
  name: string;
  email: string;
  username: string;
  password: string;
  claudeApiKey: string;
  netbirdKey: string;
}

/**
 * Serves the wizard HTML page for GET /setup.
 */
export function serveSetupPage(res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getSetupHtml());
}

/**
 * Handles POST /api/setup/apply.
 * Reads the JSON payload, validates it, then spawns nixpi-setup-apply.sh
 * and streams its output as SSE lines until it exits.
 */
export async function handleSetupApply(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  opts: { applyScript: string },
): Promise<void> {
  let body = "";
  for await (const chunk of req) body += chunk;

  let payload: ApplyPayload;
  try {
    payload = JSON.parse(body) as ApplyPayload;
  } catch {
    res.writeHead(400).end(JSON.stringify({ error: "invalid JSON" }));
    return;
  }

  for (const field of ["name", "email", "username", "password"] as const) {
    if (!payload[field] || typeof payload[field] !== "string") {
      res.writeHead(400).end(JSON.stringify({ error: `${field} is required` }));
      return;
    }
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (line: string) => res.write(`data: ${line}\n\n`);

  const child = spawn(opts.applyScript, [], {
    env: {
      ...process.env,
      SETUP_NAME: payload.name,
      SETUP_EMAIL: payload.email,
      SETUP_USERNAME: payload.username,
      SETUP_PASSWORD: payload.password,
      SETUP_CLAUDE_API_KEY: payload.claudeApiKey ?? "",
      SETUP_NETBIRD_KEY: payload.netbirdKey ?? "",
    },
  });

  child.stdout.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line) send(line);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line) send(`[err] ${line}`);
    }
  });

  await new Promise<void>((resolve) => {
    child.on("close", (code) => {
      send(code === 0 ? "SETUP_COMPLETE" : `SETUP_FAILED:${code}`);
      res.end();
      resolve();
    });
  });
}

function getSetupHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NixPI Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ui-monospace, monospace; background: #10161d; color: #e6edf3; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 2rem; width: 100%; max-width: 480px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .subtitle { color: #8b949e; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; color: #8b949e; margin-bottom: 0.25rem; margin-top: 1rem; }
    input { width: 100%; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #e6edf3; padding: 0.5rem 0.75rem; font-family: inherit; font-size: 0.875rem; }
    input:focus { outline: none; border-color: #58a6ff; }
    .optional { color: #8b949e; font-size: 0.75rem; margin-left: 0.25rem; }
    button { margin-top: 1.5rem; width: 100%; background: #238636; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-family: inherit; font-size: 0.875rem; padding: 0.625rem; }
    button:hover { background: #2ea043; }
    button:disabled { background: #21262d; color: #8b949e; cursor: not-allowed; }
    .step { display: none; }
    .step.active { display: block; }
    .progress { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; font-size: 0.75rem; height: 12rem; margin-top: 1rem; overflow-y: auto; padding: 0.75rem; white-space: pre-wrap; }
    .error { color: #f85149; font-size: 0.875rem; margin-top: 0.75rem; }
  </style>
</head>
<body>
<div class="card">
  <h1>NixPI Setup</h1>
  <p class="subtitle">Configure your machine before first use.</p>

  <div id="step-identity" class="step active">
    <label>Full name</label>
    <input id="name" type="text" placeholder="Alex Smith" autocomplete="name">
    <label>Email</label>
    <input id="email" type="email" placeholder="alex@example.com" autocomplete="email">
    <label>Username</label>
    <input id="username" type="text" placeholder="alex" autocomplete="username">
    <label>Password</label>
    <input id="password" type="password" autocomplete="new-password">
    <button id="btn-next-identity">Continue</button>
    <p class="error" id="err-identity"></p>
  </div>

  <div id="step-keys" class="step">
    <label>Claude API key <span class="optional">(optional)</span></label>
    <input id="claude-api-key" type="password" placeholder="sk-ant-...">
    <label>Netbird setup key <span class="optional">(optional)</span></label>
    <input id="netbird-key" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
    <button id="btn-apply">Apply configuration</button>
    <p class="error" id="err-keys"></p>
  </div>

  <div id="step-progress" class="step">
    <p class="subtitle">Applying configuration — this will take a few minutes.</p>
    <div class="progress" id="progress-log"></div>
  </div>
</div>

<script>
  function show(id) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  document.getElementById('btn-next-identity').addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const err = document.getElementById('err-identity');
    if (!name || !email || !username || !password) {
      err.textContent = 'All fields are required.'; return;
    }
    err.textContent = '';
    show('step-keys');
  });

  document.getElementById('btn-apply').addEventListener('click', async () => {
    const btn = document.getElementById('btn-apply');
    btn.disabled = true;
    document.getElementById('err-keys').textContent = '';
    show('step-progress');

    const log = document.getElementById('progress-log');
    const append = (text) => { log.textContent += text + '\\n'; log.scrollTop = log.scrollHeight; };

    const payload = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
      claudeApiKey: document.getElementById('claude-api-key').value.trim(),
      netbirdKey: document.getElementById('netbird-key').value.trim(),
    };

    try {
      const res = await fetch('/api/setup/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n\\n');
        buffer = lines.pop() ?? '';
        for (const block of lines) {
          const data = block.replace(/^data: /, '');
          if (data === 'SETUP_COMPLETE') {
            append('Setup complete! Redirecting...');
            setTimeout(() => { window.location.href = '/'; }, 2000);
            return;
          } else if (data.startsWith('SETUP_FAILED')) {
            append('Setup failed. Check the log above.');
            btn.disabled = false;
          } else {
            append(data);
          }
        }
      }
    } catch (e) {
      append('Network error: ' + e.message);
      btn.disabled = false;
    }
  });
</script>
</body>
</html>`;
}
```

- [ ] **Step 2: Run setup tests — they should now pass**

```bash
npx vitest run tests/chat-server/setup.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 3: Wire setup gate and routes into index.ts**

In `core/chat-server/index.ts`:

Add the import at the top:
```typescript
import { handleSetupApply, serveSetupPage, shouldRedirectToSetup } from "./setup.js";
```

Add `systemReadyFile` and `applyScript` to `ChatServerOptions`:
```typescript
export interface ChatServerOptions extends ChatSessionManagerOptions {
  staticDir: string;
  /** Path to ~/.nixpi/wizard-state/system-ready */
  systemReadyFile: string;
  /** Path to the nixpi-setup-apply script */
  applyScript: string;
}
```

At the very top of the `http.createServer` callback, before any route handling, insert the setup gate and setup routes:

```typescript
const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

// Setup gate: redirect to /setup if not configured
if (shouldRedirectToSetup(url.pathname, opts.systemReadyFile)) {
  res.writeHead(302, { Location: "/setup" }).end();
  return;
}

// GET /setup — serve the setup wizard page
if (req.method === "GET" && url.pathname === "/setup") {
  serveSetupPage(res);
  return;
}

// POST /api/setup/apply — run the setup apply script with SSE streaming
if (req.method === "POST" && url.pathname === "/api/setup/apply") {
  await handleSetupApply(req, res, { applyScript: opts.applyScript });
  return;
}
```

Remove the duplicate `const url = ...` line that was already in the handler (it's now at the top).

Update the entry-point block at the bottom of `index.ts` to pass the new options:

```typescript
const primaryUser = process.env.NIXPI_PRIMARY_USER ?? "pi";
const systemReadyFile = process.env.NIXPI_SYSTEM_READY_FILE ??
  `/home/${primaryUser}/.nixpi/wizard-state/system-ready`;
const applyScript = process.env.NIXPI_SETUP_APPLY_SCRIPT ??
  "/run/current-system/sw/bin/nixpi-setup-apply";

const server = createChatServer({
  nixpiShareDir,
  chatSessionsDir,
  idleTimeoutMs: parseInt(process.env.NIXPI_CHAT_IDLE_TIMEOUT ?? "1800", 10) * 1000,
  maxSessions: parseInt(process.env.NIXPI_CHAT_MAX_SESSIONS ?? "4", 10),
  staticDir,
  systemReadyFile,
  applyScript,
});
```

- [ ] **Step 4: Update server.test.ts to pass the new required options**

In `tests/chat-server/server.test.ts`, update the `createChatServer` call to include the new fields:

```typescript
server = createChatServer({
  nixpiShareDir: "/mock/share",
  chatSessionsDir: "/tmp/test-chat-sessions",
  idleTimeoutMs: 5000,
  maxSessions: 4,
  staticDir: new URL("../../core/chat-server/frontend/dist", import.meta.url).pathname,
  systemReadyFile: "/tmp/nonexistent-system-ready-for-tests",
  applyScript: "/bin/false",
});
```

Note: `/tmp/nonexistent-system-ready-for-tests` does not exist, so all requests in server.test.ts will be redirected to `/setup`. Update the existing tests to either:
a) Create the system-ready file in `beforeAll` and clean up in `afterAll`, OR
b) Use a temp dir with a pre-created system-ready file.

Use approach (a) — add to `beforeAll`:

```typescript
import os from "node:os";
import path from "node:path";

let tmpDir: string;
let systemReadyFile: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-server-test-"));
  systemReadyFile = path.join(tmpDir, "system-ready");
  fs.writeFileSync(systemReadyFile, "");   // mark system as ready for all existing tests
  // ... rest of beforeAll
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  server.close();
});
```

Update the `createChatServer` call to use `systemReadyFile`.

- [ ] **Step 5: Add setup gate integration test to setup.test.ts**

Add this test block to `tests/chat-server/setup.test.ts`:

```typescript
import type http from "node:http";
import { afterAll, beforeAll } from "vitest";
// Add at the top with other imports:
// import { createChatServer } from "../../core/chat-server/index.js";

describe("setup gate integration", () => {
  let gatelessServer: http.Server;
  let gatePort: number;

  beforeAll(async () => {
    // Import here to avoid hoisting issues with the session mock in server.test.ts
    const { createChatServer } = await import("../../core/chat-server/index.js");
    gatelessServer = createChatServer({
      nixpiShareDir: "/mock/share",
      chatSessionsDir: "/tmp/test-chat-sessions-setup",
      idleTimeoutMs: 5000,
      maxSessions: 4,
      staticDir: "/tmp/nonexistent",
      systemReadyFile: "/tmp/this-file-does-not-exist-abc123",
      applyScript: "/bin/false",
    });
    await new Promise<void>((resolve) => {
      gatelessServer.listen(0, "127.0.0.1", () => {
        gatePort = (gatelessServer.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(() => { gatelessServer.close(); });

  it("redirects / to /setup when system-ready is absent", async () => {
    const res = await fetch(`http://127.0.0.1:${gatePort}/`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/setup");
  });

  it("serves /setup without redirect when system-ready is absent", async () => {
    const res = await fetch(`http://127.0.0.1:${gatePort}/setup`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("NixPI Setup");
  });

  it("does not redirect /terminal when system-ready is absent", async () => {
    const res = await fetch(`http://127.0.0.1:${gatePort}/terminal`, { redirect: "manual" });
    expect(res.status).not.toBe(302);
  });

  it("returns 400 for /api/setup/apply with missing fields", async () => {
    const res = await fetch(`http://127.0.0.1:${gatePort}/api/setup/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run all chat server tests**

```bash
npx vitest run tests/chat-server/ 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add core/chat-server/setup.ts core/chat-server/index.ts \
    tests/chat-server/setup.test.ts tests/chat-server/server.test.ts
git commit -m "feat: add web wizard at /setup with setup gate and SSE apply endpoint"
```

---

## Task 8: Create the nixpi-setup-apply shell script and NixOS wiring

**Files:**
- Create: `core/scripts/nixpi-setup-apply.sh`
- Create: `core/os/pkgs/nixpi-setup-apply/default.nix`
- Modify: `core/os/modules/default.nix` (add the package + sudoers rule)
- Modify: `flake.nix` (thread the new package into specialArgs)

- [ ] **Step 1: Write the apply script**

Create `core/scripts/nixpi-setup-apply.sh`:

```bash
#!/usr/bin/env bash
# nixpi-setup-apply.sh — called by the web wizard backend to write NixOS config
# and promote the installed system. Receives values via environment variables:
#   SETUP_NAME, SETUP_EMAIL, SETUP_USERNAME, SETUP_PASSWORD,
#   SETUP_CLAUDE_API_KEY (optional), SETUP_NETBIRD_KEY (optional)
set -euo pipefail

: "${SETUP_NAME:?SETUP_NAME is required}"
: "${SETUP_EMAIL:?SETUP_EMAIL is required}"
: "${SETUP_USERNAME:?SETUP_USERNAME is required}"
: "${SETUP_PASSWORD:?SETUP_PASSWORD is required}"

PRIMARY_USER="${SETUP_USERNAME}"
PRIMARY_HOME="/home/${PRIMARY_USER}"
NIXPI_DIR="/srv/nixpi"
NIXPI_STATE_DIR="${PRIMARY_HOME}/.nixpi"
BOOTSTRAP_LOG="${NIXPI_STATE_DIR}/bootstrap/full-appliance-upgrade.log"
SYSTEM_READY_FILE="${NIXPI_STATE_DIR}/wizard-state/system-ready"

log() { printf '[setup] %s\n' "$*"; }

log "Starting NixPI setup for user: ${PRIMARY_USER}"

# ---- 1. Write prefill.env for reference and CI re-runs ----
mkdir -p "${NIXPI_STATE_DIR}"
cat > "${NIXPI_STATE_DIR}/prefill.env" <<EOF
PREFILL_NAME="${SETUP_NAME}"
PREFILL_EMAIL="${SETUP_EMAIL}"
PREFILL_USERNAME="${SETUP_USERNAME}"
PREFILL_PRIMARY_PASSWORD="${SETUP_PASSWORD}"
PREFILL_NETBIRD_KEY="${SETUP_NETBIRD_KEY:-}"
EOF
chown "${PRIMARY_USER}:${PRIMARY_USER}" "${NIXPI_STATE_DIR}/prefill.env"
chmod 0600 "${NIXPI_STATE_DIR}/prefill.env"
log "Wrote prefill.env"

# ---- 2. Set user password ----
log "Setting password for ${PRIMARY_USER}..."
echo "${PRIMARY_USER}:${SETUP_PASSWORD}" | chpasswd
log "Password set"

# ---- 3. Clone nixpi repo if not present ----
if [[ ! -d "${NIXPI_DIR}/.git" ]]; then
  BOOTSTRAP_REPO="${NIXPI_BOOTSTRAP_REPO:-https://github.com/alexradunet/nixpi.git}"
  BOOTSTRAP_BRANCH="${NIXPI_BOOTSTRAP_BRANCH:-main}"
  log "Cloning ${BOOTSTRAP_REPO} (${BOOTSTRAP_BRANCH}) to ${NIXPI_DIR}..."
  mkdir -p "$(dirname "${NIXPI_DIR}")"
  git clone --branch "${BOOTSTRAP_BRANCH}" "${BOOTSTRAP_REPO}" "${NIXPI_DIR}"
  chown -R "${PRIMARY_USER}:${PRIMARY_USER}" "${NIXPI_DIR}"
  log "Repository cloned"
else
  log "Repository already present at ${NIXPI_DIR}"
fi

# ---- 4. Write nixpi-host.nix ----
HOST_FILE="${NIXPI_DIR}/nixpi-host.nix"
HOSTNAME="$(hostname)"
log "Writing host config to ${HOST_FILE}..."
cat > "${HOST_FILE}" <<NIX
{ config, ... }:
{
  nixpi.primaryUser = "${PRIMARY_USER}";
  networking.hostName = "${HOSTNAME}";
  time.timeZone = "UTC";
  nixpi.timezone = "UTC";
}
NIX
chown "${PRIMARY_USER}:${PRIMARY_USER}" "${HOST_FILE}"
log "Host config written"

# ---- 5. Store Claude API key in Pi config if provided ----
if [[ -n "${SETUP_CLAUDE_API_KEY:-}" ]]; then
  PI_DIR="${PRIMARY_HOME}/.pi"
  mkdir -p "${PI_DIR}"
  if [[ -f "${PI_DIR}/settings.json" ]]; then
    tmp="$(mktemp)"
    jq --arg key "${SETUP_CLAUDE_API_KEY}" \
      '.providerKeys = (.providerKeys // {}) | .providerKeys.anthropic = $key' \
      "${PI_DIR}/settings.json" > "$tmp"
    mv "$tmp" "${PI_DIR}/settings.json"
  fi
  chown -R "${PRIMARY_USER}:${PRIMARY_USER}" "${PI_DIR}"
  log "Claude API key stored"
fi

# ---- 6. Configure Netbird key if provided ----
if [[ -n "${SETUP_NETBIRD_KEY:-}" ]]; then
  log "Configuring Netbird..."
  netbird up --setup-key "${SETUP_NETBIRD_KEY}" --foreground=false || true
  log "Netbird configured"
fi

# ---- 7. Run nixos-rebuild switch ----
log "Running nixos-rebuild switch (this takes a few minutes)..."
mkdir -p "$(dirname "${BOOTSTRAP_LOG}")"
nixos-rebuild switch --flake "${NIXPI_DIR}" 2>&1 | tee -a "${BOOTSTRAP_LOG}"
log "nixos-rebuild switch complete"

# ---- 8. Write system-ready marker ----
mkdir -p "$(dirname "${SYSTEM_READY_FILE}")"
touch "${SYSTEM_READY_FILE}"
chown "${PRIMARY_USER}:${PRIMARY_USER}" "${SYSTEM_READY_FILE}"
log "System ready"
```

```bash
chmod +x core/scripts/nixpi-setup-apply.sh
```

- [ ] **Step 2: Create the Nix package derivation**

Create `core/os/pkgs/nixpi-setup-apply/default.nix`:

```nix
{ stdenvNoCC, makeWrapper, jq, git, netbird, nixos-rebuild ? null }:

stdenvNoCC.mkDerivation {
  pname = "nixpi-setup-apply";
  version = "0.1.0";

  dontUnpack = true;

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin"
    install -m 0755 ${../../../scripts/nixpi-setup-apply.sh} "$out/bin/nixpi-setup-apply"
    wrapProgram "$out/bin/nixpi-setup-apply" \
      --prefix PATH : ${jq}/bin \
      --prefix PATH : ${git}/bin \
      --prefix PATH : ${netbird}/bin
    runHook postInstall
  '';
}
```

- [ ] **Step 3: Wire the package into the NixOS module**

Create `core/os/modules/setup-apply.nix`:

```nix
# core/os/modules/setup-apply.nix
# Installs nixpi-setup-apply system-wide and grants the primary user
# passwordless sudo access to it. Called by the web wizard backend.
{ pkgs, lib, config, setupApplyPackage, ... }:

let
  primaryUser = config.nixpi.primaryUser;
in
{
  environment.systemPackages = [ setupApplyPackage ];

  security.sudo.extraRules = [
    {
      users = [ primaryUser ];
      commands = [
        {
          command = "${setupApplyPackage}/bin/nixpi-setup-apply";
          options = [ "NOPASSWD" ];
        }
      ];
    }
  ];
}
```

Add `./setup-apply.nix` to `core/os/modules/default.nix`:

```nix
{ ... }:

{
  imports = [
    ./options.nix
    ./network.nix
    ./update.nix
    ./runtime.nix
    ./collab.nix
    ./tooling.nix
    ./shell.nix
    ./firstboot
    ./ttyd.nix
    ./setup-apply.nix
  ];
}
```

- [ ] **Step 4: Add setupApplyPackage to flake.nix**

In `flake.nix`, add the new package derivation:

```nix
setupApplyPackage = pkgs.callPackage ./core/os/pkgs/nixpi-setup-apply {};
```

Add `setupApplyPackage` to `specialArgs`:

```nix
specialArgs = { inherit piAgent appPackage self installerHelper disko setupApplyPackage; };
```

Add to `packages`:
```nix
nixpi-setup-apply = setupApplyPackage;
```

- [ ] **Step 5: Update chat service env to pass apply script path**

In `core/os/services/nixpi-chat.nix`, add an `applyScript` option and pass it to the service:

```nix
options.nixpi-chat = {
  # ... existing options ...
  applyScript = mkOption {
    type = types.str;
    default = "/run/current-system/sw/bin/nixpi-setup-apply";
    description = "Path to the nixpi-setup-apply script callable by the wizard backend.";
  };
};

# in config.systemd.service.environment (add alongside existing entries):
NIXPI_SETUP_APPLY_SCRIPT = config.nixpi-chat.applyScript;
NIXPI_PRIMARY_USER = config.nixpi-chat.primaryUser;
```

- [ ] **Step 6: Verify evaluation**

```bash
nix build .#nixosConfigurations.desktop-vm.config.system.build.vm --dry-run 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add core/scripts/nixpi-setup-apply.sh core/os/pkgs/nixpi-setup-apply/ \
    core/os/modules/setup-apply.nix core/os/modules/default.nix \
    core/os/services/nixpi-chat.nix flake.nix
git commit -m "feat: add nixpi-setup-apply backend script and NixOS wiring"
```

---

## Task 9: Add Terminal link to chat frontend

**Files:**
- Modify: `core/chat-server/frontend/index.html`

- [ ] **Step 1: Add Terminal nav link**

Replace `core/chat-server/frontend/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pi</title>
    <script type="module" src="./app.ts"></script>
    <style>
      #nixpi-nav {
        position: fixed;
        top: 0.5rem;
        right: 0.75rem;
        z-index: 9999;
      }
      #nixpi-nav a {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 4px;
        color: #8b949e;
        font-family: ui-monospace, monospace;
        font-size: 0.75rem;
        padding: 0.25rem 0.6rem;
        text-decoration: none;
      }
      #nixpi-nav a:hover { color: #e6edf3; border-color: #8b949e; }
    </style>
  </head>
  <body>
    <nav id="nixpi-nav"><a href="/terminal">Terminal</a></nav>
    <nixpi-chat></nixpi-chat>
  </body>
</html>
```

- [ ] **Step 2: Rebuild frontend and verify**

```bash
npm run build 2>&1 | tail -5
```

Expected: build succeeds, `core/chat-server/frontend/dist/` updated.

- [ ] **Step 3: Commit**

```bash
git add core/chat-server/frontend/index.html core/chat-server/frontend/dist/
git commit -m "feat: add Terminal nav link to chat UI"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all TypeScript tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 2: Verify full NixOS build**

```bash
nix build .#nixosConfigurations.desktop-vm.config.system.build.vm --dry-run 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 3: Verify config check**

```bash
nix build .#checks.x86_64-linux.config --no-link 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 4: Verify SSH access (optional — requires VM to be running)**

```bash
just vm          # start VM in background
# wait ~30 seconds for boot
just vm-ssh      # should connect without password prompt
```

Expected: SSH session opens as `pi@nixpi` without a password prompt.

- [ ] **Step 5: Verify setup wizard (optional — requires VM to be running and chat server accessible)**

Open `http://localhost` in a browser (once VM boot and nginx are up). Expected: redirects to `/setup` wizard page.

- [ ] **Step 6: Commit if anything remains uncommitted**

```bash
git status
# if clean, nothing to do
```
