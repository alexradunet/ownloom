# Code Clarity Enforcer Memory

## Recurring Violations

- **Empty/stub types.ts files**: 3 extensions have stub types.ts with only `export {};`: bloom-setup, bloom-repo, bloom-objects.
  - bloom-services types.ts is also stub but its types live in lib/services-manifest.ts (correct per convention).
- **Thin barrel files**: bloom-channels/actions.ts is a 4-line re-export passthrough.
- **Oversized files**: bloom-channels/matrix-client.ts (306 lines), bloom-services/service-io.ts (267 lines), bloom-dev/index.ts (241 lines), bloom-os/actions.ts (235 lines).
- **Dead types**: bloom-channels/types.ts exports MatrixConnectionState, MatrixInboundMessage, MatrixMediaInfo — none imported anywhere.

## Post-Migration Stale References (2026-03-11)

Major migration moved Matrix/NetBird from containers to OS infrastructure. Unix socket channel architecture fully retired. Cinny added as Podman container proxied by nginx.

### Remaining stale references in main branch (verified 2026-03-11):
- README.md:15 — "Unix socket IPC" description
- README.md:59 — bloom-channels described as "Unix socket server"
- README.md:204 — dead link to docs/channel-protocol.md (file deleted)
- services/README.md:78 — lists element service (removed)
- docs/quick_deploy.md:119-120 — Sway/Wayland references (removed from OS)
- .claude/agents/bloom-live-tester.md — lemonade, element, channels.sock refs
- .pi/AGENTS.md:55 — lists element as service package
- CLAUDE.md:18 — references lib/containers.ts (does not exist)

### Already fixed since last audit:
- CLAUDE.md Key Paths table: channels.sock removed, matrix paths added
- AGENTS.md: service_pair removed, bloom-channels description updated, lib table updated
- docs/channel-protocol.md: deleted
- docs/service-architecture.md: updated with correct architecture
- docs/pibloom-setup.md: updated for Cinny/Matrix native
- services/matrix/SKILL.md: updated correctly
- ARCHITECTURE.md: references split lib files correctly
- skills/: service_pair references cleaned up

### What replaced the old architecture:
- bloom-channels uses matrix-bot-sdk directly (matrix-client.ts)
- Matrix (Continuwuity) is native systemd service in os/Containerfile
- Cinny served by nginx (static files from container)
- External bridges via bridge_create/remove/status tools

## File Duplication

- services/cinny/cinny-config.json and os/sysconfig/cinny-config.json are byte-identical

## Security Concern

- os/bib-config.toml is committed with a hardcoded password despite header saying "NEVER commit"

## CI/Workflow Notes

- build-os.yml uses docker/login-action@v3 (no podman equivalent exists for GitHub Actions)
- Template files (services/_template/) use console.log instead of createLogger

## Resolved Issues (from previous audits)

- lib/services.ts barrel: split into services-catalog, services-install, services-manifest, services-validation
- bloom-services/actions.ts (760 lines): split into actions-apply, actions-bridges, etc.
- bloom-display extension: removed entirely
- build-iso.sh shebang: fixed to #!/usr/bin/env bash
- bloom-greeting.sh: uses [[ ]] correctly

## Last Audit

- Date: 2026-03-11 (second pass, post-migration)
- Files reviewed: ~90
- Auto-fixes applied: 0 (report-only run)
- Stale documentation: 8 remaining items (down from 11)
- Convention violations: 6
- Oversized files: 4
- Minor issues: 6
- Clean files: ~65
