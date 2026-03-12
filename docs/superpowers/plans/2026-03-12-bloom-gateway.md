# Bloom Gateway Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace standalone Cinny container with a Caddy-based unified reverse proxy (bloom-gateway) that serves Cinny, Matrix API, and WebDAV on a single port.

**Architecture:** Caddy container with host networking and baked-in Cinny static files. Routes `/_matrix/*` to Continuwuity (localhost:6167), `/webdav/*` to dufs (localhost:5000), and serves Cinny as the default. Single port 18810 from any IP. Host networking is required so the gateway can reach localhost-bound backend services.

**Tech Stack:** Caddy 2 (alpine), Cinny v4.3.0 (static files), Podman Quadlet, bash

**Spec:** `docs/superpowers/specs/2026-03-12-bloom-gateway-design.md`

---

## Chunk 1: Create Gateway Service Package

### Task 1: Create gateway Containerfile

**Files:**
- Create: `services/gateway/Containerfile`

- [ ] **Step 1: Create the Containerfile**

```dockerfile
FROM ghcr.io/cinnyapp/cinny:v4.3.0 AS cinny
FROM docker.io/library/caddy:2-alpine
COPY --from=cinny /usr/share/nginx/html /srv/cinny
COPY Caddyfile /etc/caddy/Caddyfile
COPY cinny-config.json /srv/cinny/config.json
```

- [ ] **Step 2: Commit**

```bash
git add services/gateway/Containerfile
git commit -m "feat(gateway): add Containerfile — Caddy + Cinny multi-stage build"
```

### Task 2: Create Caddyfile

**Files:**
- Create: `services/gateway/Caddyfile`

- [ ] **Step 1: Create the Caddyfile**

Uses `Network=host` so the gateway shares the host's network namespace. This means Caddy listens directly on the host's port 18810, and can reach localhost-bound services (Continuwuity on :6167, dufs on :5000) without container networking complications.

```
:18810 {
	# Matrix API — preserve /_matrix prefix for Continuwuity
	handle /_matrix/* {
		reverse_proxy localhost:6167
	}

	# Well-known for Matrix client discovery (same-origin base URL)
	handle /.well-known/matrix/client {
		header Content-Type application/json
		respond `{"m.homeserver": {"base_url": "/"}}` 200
	}

	# WebDAV — strip /webdav prefix (dufs expects root paths)
	handle_path /webdav/* {
		reverse_proxy localhost:5000
	}

	# Default: Cinny web client (SPA with fallback)
	handle {
		root * /srv/cinny
		file_server
		try_files {path} /index.html
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add services/gateway/Caddyfile
git commit -m "feat(gateway): add Caddyfile — Matrix, WebDAV, and Cinny routing"
```

### Task 3: Create Cinny config for gateway

**Files:**
- Create: `services/gateway/cinny-config.json`

- [ ] **Step 1: Create cinny-config.json**

The empty string means "same origin" — Cinny will resolve `/_matrix/*` relative to whatever address the user opened. If `""` doesn't work at runtime, fall back to `"/"`.

```json
{
	"defaultHomeserver": 0,
	"homeserverList": [""],
	"allowCustomHomeservers": false
}
```

- [ ] **Step 2: Commit**

```bash
git add services/gateway/cinny-config.json
git commit -m "feat(gateway): add Cinny config — same-origin homeserver"
```

### Task 4: Create gateway quadlet unit

**Files:**
- Create: `services/gateway/quadlet/bloom-gateway.container`

- [ ] **Step 1: Create the quadlet file**

Based on the existing `bloom-cinny.container` but with changes:
- Image: `localhost/bloom-gateway:latest` (locally built)
- `Network=host` — required so gateway can reach localhost-bound backends (Continuwuity :6167, dufs :5000). Caddy listens directly on host port 18810.
- No config volume mount (config is baked into image)
- Memory: 128m (Caddy needs more than static nginx)
- Health check uses `wget` (available in alpine), hitting port 18810 (host network)

```ini
[Unit]
Description=Bloom Gateway — unified web proxy (Cinny + Matrix + WebDAV)
After=network-online.target
Wants=network-online.target

[Container]
Image=localhost/bloom-gateway:latest
ContainerName=bloom-gateway

# Host networking — gateway must reach localhost-bound backends
Network=host

PodmanArgs=--memory=128m
PodmanArgs=--security-opt label=disable
HealthCmd=wget -qO- http://localhost:18810/ || exit 1
HealthInterval=30s
HealthRetries=3
HealthTimeout=10s
HealthStartPeriod=30s
NoNewPrivileges=true
LogDriver=journald

[Service]
Restart=on-failure
RestartSec=10
TimeoutStartSec=120
TimeoutStopSec=30

[Install]
WantedBy=default.target
```

- [ ] **Step 2: Commit**

```bash
git add services/gateway/quadlet/bloom-gateway.container
git commit -m "feat(gateway): add quadlet unit — port 18810, locally built image"
```

### Task 5: Create gateway SKILL.md

**Files:**
- Create: `services/gateway/SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Adapt from `services/cinny/SKILL.md` — update to reflect the gateway role:

```markdown
---
name: gateway
version: 0.1.0
description: Bloom Gateway — unified web proxy for Cinny, Matrix API, and WebDAV
image: localhost/bloom-gateway:latest
---

# Bloom Gateway

Unified reverse proxy serving all Bloom web services on a single port.

## Overview

The gateway runs Caddy with baked-in Cinny static files. It routes:

- `/_matrix/*` → Continuwuity Matrix homeserver (localhost:6167)
- `/webdav/*` → dufs file server (localhost:5000)
- `/*` → Cinny web client (default)

All services are accessible from a single address: `http://<host>:18810`.

## Setup

Installed via the first-boot wizard or service tools:

- `service_install(name="gateway")`

The gateway image must be built locally before first use (the wizard handles this).

## Usage

1. Open `http://<host>:18810` in a browser
2. Log in with your Matrix credentials (username and password from setup)
3. Session persists in browser — no need to log in again

WebDAV: `http://<host>:18810/webdav/`

## Troubleshooting

- Logs: `journalctl --user -u bloom-gateway -n 50`
- Status: `systemctl --user status bloom-gateway`
- Restart: `systemctl --user restart bloom-gateway`
- Rebuild image: `podman build -t localhost/bloom-gateway:latest -f Containerfile .` (from services/gateway/)
```

- [ ] **Step 2: Commit**

```bash
git add services/gateway/SKILL.md
git commit -m "feat(gateway): add SKILL.md"
```

---

## Chunk 2: Update Catalog and Service Infrastructure

### Task 6: Replace cinny with gateway in catalog

**Files:**
- Modify: `services/catalog.yaml`

- [ ] **Step 1: Update catalog.yaml**

Replace the `cinny` entry with `gateway`. The gateway uses a locally-built image (like code-server), so it follows the `localhost/` pattern:

```yaml
  gateway:
    version: "0.1.0"
    category: communication
    image: localhost/bloom-gateway:latest
    optional: false
    port: 18810
    preflight:
      commands: [podman, systemctl]
```

Remove the `cinny` entry entirely.

- [ ] **Step 2: Commit**

```bash
git add services/catalog.yaml
git commit -m "feat(gateway): replace cinny with gateway in service catalog"
```

### Task 7: Update service-io.ts — remove Cinny config templating

**Files:**
- Modify: `extensions/bloom-services/service-io.ts`

- [ ] **Step 1: Remove templateCinnyConfig function and its usage**

The gateway bakes its config into the image, so no runtime templating is needed.

Delete the `templateCinnyConfig` function (lines 18-29) and remove the special-case check for `cinny-config.json` in `installServicePackage` (lines 90-91). The config copy loop (lines 83-95) should just copy files without transformation:

In the config copy loop, change the body from:
```typescript
		let content = readFileSync(src, "utf-8");
		if (fileName === "cinny-config.json") {
			content = templateCinnyConfig(content);
		}
		writeFileSync(dest, content);
```
to:
```typescript
		writeFileSync(dest, readFileSync(src));
```

Also remove the `templateCinnyConfig` function entirely (lines 18-29) and its JSDoc comment (line 18).

- [ ] **Step 2: Commit**

```bash
git add extensions/bloom-services/service-io.ts
git commit -m "refactor(services): remove Cinny config templating — gateway bakes its own config"
```

### Task 8: Delete services/cinny/ directory

**Files:**
- Delete: `services/cinny/` (entire directory)

- [ ] **Step 1: Remove the directory**

```bash
git rm -r services/cinny/
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(gateway): remove standalone cinny service — replaced by gateway"
```

---

## Chunk 3: Lock Down Backend Services

### Task 9: Bind dufs to localhost only

**Files:**
- Modify: `services/dufs/quadlet/bloom-dufs.container`

- [ ] **Step 1: Change dufs to bind to localhost only**

Keep `Network=host` (simplest — avoids container networking issues with volume mounts) but change dufs to listen on `127.0.0.1` only. The gateway (also on host network) reaches it at `localhost:5000`.

Change the comment and Exec line:
```ini
# Host networking — localhost only, accessed via bloom-gateway reverse proxy
Network=host
```

Change:
```ini
Exec=/data -A -p 5000
```
to:
```ini
# Localhost only — proxied via bloom-gateway on :18810/webdav/
Exec=/data -A -b 127.0.0.1 -p 5000
```

The `-b 127.0.0.1` flag tells dufs to bind to localhost only.

- [ ] **Step 2: Commit**

```bash
git add services/dufs/quadlet/bloom-dufs.container
git commit -m "fix(dufs): bind to localhost only — proxied via gateway"
```

### Task 10: Bind Continuwuity to localhost only

**Files:**
- Modify: `os/system_files/etc/bloom/matrix.toml`

- [ ] **Step 1: Change Continuwuity address binding**

Change:
```toml
address = "0.0.0.0"
```
to:
```toml
address = "127.0.0.1"
```

- [ ] **Step 2: Commit**

```bash
git add os/system_files/etc/bloom/matrix.toml
git commit -m "fix(matrix): bind Continuwuity to localhost only — proxied via gateway"
```

---

## Chunk 4: Update Wizard and Setup References

### Task 11: Update wizard to install gateway instead of cinny

**Files:**
- Modify: `os/system_files/usr/local/bin/bloom-wizard.sh`

- [ ] **Step 1: Update step_services function**

The wizard needs three changes:

1. Replace the Cinny prompt with a gateway prompt
2. Add image build step before installing gateway (since it uses `localhost/bloom-gateway:latest`)
3. Update the `install_service` function to handle local image building

**Change 1:** In `step_services()` (around line 366), replace:
```bash
	read -rp "Install Cinny Matrix client? (web-based Matrix chat) [y/N]: " cinny_answer
	if [[ "${cinny_answer,,}" == "y" ]]; then
		echo "  Installing Cinny..."
		if install_service cinny; then
			echo "  Cinny installed."
			installed="${installed} cinny"
		else
			echo "  Cinny installation failed."
		fi
	fi
```
with:
```bash
	read -rp "Install Bloom Gateway? (web access to Matrix chat + file server) [y/N]: " gateway_answer
	if [[ "${gateway_answer,,}" == "y" ]]; then
		echo "  Building gateway image (this may take a minute)..."
		if build_local_image gateway && install_service gateway; then
			echo "  Gateway installed."
			installed="${installed} gateway"
		else
			echo "  Gateway installation failed."
		fi
	fi
```

**Change 2:** Add a generic `build_local_image` function near the other helpers (after `install_service`, around line 141). This mirrors the TypeScript `buildLocalImage` in `service-io.ts` and works for any future locally-built service:
```bash
# Build a localhost/* container image from a service's Containerfile
# Usage: build_local_image <name>  →  builds localhost/bloom-<name>:latest
build_local_image() {
	local name="$1"
	local svc_dir="${BLOOM_SERVICES}/${name}"
	if [[ ! -f "$svc_dir/Containerfile" ]]; then
		echo "  Containerfile not found: ${svc_dir}/Containerfile" >&2
		return 1
	fi
	podman build -t "localhost/bloom-${name}:latest" -f "$svc_dir/Containerfile" "$svc_dir"
}
```

And update the gateway install call to use `build_local_image gateway`:
```bash
		if build_local_image gateway && install_service gateway; then
```

- [ ] **Step 2: Commit**

```bash
git add os/system_files/usr/local/bin/bloom-wizard.sh
git commit -m "feat(wizard): install gateway instead of cinny, with local image build"
```

### Task 12: Update step-guidance.ts (if needed)

**Files:**
- Check: `extensions/bloom-setup/step-guidance.ts`

- [ ] **Step 1: Check if any references to cinny or homeserver URL exist**

The current `step-guidance.ts` only has `persona` and `complete` guidance — no cinny or homeserver references. The `complete` step mentions "connected messaging channel" generically. **No changes needed.**

- [ ] **Step 2: Verify — no commit needed**

Run: `grep -i cinny extensions/bloom-setup/step-guidance.ts`
Expected: no matches.

---

## Chunk 5: Update References and Verify

### Task 13: Search for remaining cinny references

**Files:**
- Various — search and update as needed

- [ ] **Step 1: Search for stale references**

```bash
grep -ri "cinny\|bloom-cinny\|18810.*cinny" --include='*.ts' --include='*.md' --include='*.yaml' --include='*.sh' --include='*.toml' -l .
```

Expected files that may need updates:
- `AGENTS.md` — tool reference docs may mention cinny
- `docs/` — various docs may reference cinny
- `skills/` — skill files may reference cinny
- `extensions/` — other extensions may reference cinny

For each file found: update references from "cinny" to "gateway" where appropriate. References to "Cinny" as the Matrix web client name (not the service name) can stay — Cinny is still the client, it's just served through the gateway now.

- [ ] **Step 2: Commit any updates**

```bash
git add -A
git commit -m "docs: update cinny references to gateway"
```

### Task 14: Verify build and lint

- [ ] **Step 1: Run TypeScript build**

```bash
npm run build
```
Expected: no errors (the only TS change was removing `templateCinnyConfig`).

- [ ] **Step 2: Run Biome lint/format check**

```bash
npm run check
```
Expected: clean. If format issues, run `npm run check:fix`.

- [ ] **Step 3: Run tests**

```bash
npm run test
```
Expected: all pass. If any tests reference cinny config templating, update them.

- [ ] **Step 4: Commit any fixes**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: resolve build/lint/test issues from gateway migration"
```

### Task 15: Test gateway container build locally

- [ ] **Step 1: Build the gateway image**

```bash
cd services/gateway && podman build -t localhost/bloom-gateway:latest -f Containerfile . && cd -
```
Expected: successful build, pulls Cinny + Caddy images, produces `localhost/bloom-gateway:latest`.

- [ ] **Step 2: Smoke test the container**

```bash
podman run --rm -d --name bloom-gateway-test --network=host localhost/bloom-gateway:latest
sleep 2
# Check Cinny serves
curl -sf http://localhost:18810/ | head -5
# Check well-known responds
curl -sf http://localhost:18810/.well-known/matrix/client
# Check Matrix proxy returns error (no Continuwuity running, but route exists)
curl -s http://localhost:18810/_matrix/client/versions || true
# Cleanup
podman stop bloom-gateway-test
```
Expected: Cinny HTML on `/`, JSON `{"m.homeserver": {"base_url": "/"}}` on `/.well-known/matrix/client`, connection refused or 502 on `/_matrix` (expected — no backend running).

- [ ] **Step 3: Clean up test image if desired**

No commit needed — this is a local verification step.
