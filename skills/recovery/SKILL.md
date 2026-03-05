---
name: recovery
description: Troubleshooting and recovery procedures for common Bloom system issues
---

# Recovery Playbooks

Use these procedures when diagnosing and recovering from common system issues. Always start with `os_system_health` for an overview before diving into specific playbooks.

Use `audit_review` to inspect recent tool actions when you need to reconstruct what changed before an incident.

## WhatsApp Bridge Disconnect

**Symptoms**: Messages not delivered, channel shows disconnected.

1. Check channel status: `os_system_health`
2. Check container: `os_container_status` — look for bloom-whatsapp
3. If container not running: `os_systemd_control service=bloom-whatsapp action=status`
4. Check logs: `os_container_logs service=bloom-whatsapp lines=100`
5. Common causes:
   - WhatsApp session expired → user must re-scan QR code
   - Channel socket unreachable → verify `/run/bloom/channels.sock` exists
   - Token mismatch → verify `~/.config/bloom/channel-tokens/whatsapp.env`
6. Recovery: `os_systemd_control service=bloom-whatsapp action=restart`

## OS Update Failure

**Symptoms**: Update staged but reboot fails, or system boots into old image.

1. Check current image: `os_bootc_status`
2. If booted into wrong image: `os_bootc_rollback` to revert
3. If update stuck: check `os_bootc_update stage=check` for available updates
4. Common causes:
   - Network interruption during download → retry `os_bootc_update stage=download`
   - Incompatible image → rollback and report to maintainer
   - Disk full → check with `os_system_health`, clear space in /var
5. After rollback: schedule reboot with `os_schedule_reboot delay_minutes=1`

## Syncthing Sync Conflicts

**Symptoms**: Duplicate files with `.sync-conflict-*` suffix in Garden.

1. List conflicts: search for `.sync-conflict-` files in `~/Garden/`
2. Compare conflict file with original — keep the correct version
3. Delete the conflict file
4. Check service state: `os_systemd_control service=bloom-syncthing action=status`
5. Check Syncthing UI at `http://localhost:8384` if available
6. Prevention: avoid editing same file on multiple devices simultaneously

## Pi Startup Issues

**Symptoms**: Pi agent not responding or extensions failing to load.

1. Check Pi process: look for `pi` in running processes
2. Check logs: `journalctl -u pi-coding-agent --no-pager -n 50`
3. Common causes:
   - Extension compilation error → `npm run build` in Bloom package
   - Missing dependency → `npm install` in Bloom package
   - Socket file stale → remove `/run/bloom/channels.sock` and restart
4. Recovery: restart the Pi agent service

## Container Health Issues

**Symptoms**: Container reported unhealthy or restarting repeatedly.

1. Check status: `os_container_status`
2. Check health: look for "unhealthy" or "restarting" states
3. Inspect logs: `os_container_logs service=<name> lines=200`
4. Common causes:
   - Health check endpoint not responding → check application inside container
   - Resource limits hit → check memory/CPU with `os_system_health`
   - Network issue → verify bloom.network is configured
5. Recovery: `os_systemd_control service=<name> action=restart`
6. If persistent: `os_systemd_control service=<name> action=stop`, investigate, then start

## Disk Space Issues

**Symptoms**: Operations failing, "no space left on device" errors.

1. Check disk: `os_system_health` — look at Disk Usage section
2. Common consumers:
   - Container images: `podman image prune` to remove unused
   - Journal logs: `sudo journalctl --vacuum-size=500M`
   - Garden vault: check for large files in `~/Garden/`
   - Whisper models: check `/var/home/bloom/.local/share/whisper/`
3. For /var partition: focus on container images and logs
4. For /home partition: focus on Garden content and downloaded media
