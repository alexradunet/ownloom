# NetBird Bootstrap Dark VPS Design

Date: 2026-04-09
Status: Proposed

## Goal

Replace the current private-admin networking direction with a simpler NetBird client integration that uses the official managed NetBird service, enrolls the VPS during bootstrap from a setup key provided at install time, and leaves the host dark in steady state except for OVH KVM recovery.

## Scope

This design covers:

- Using the managed NetBird service rather than self-hosting any control plane.
- Accepting a NetBird setup key file path at install time through the OVH deployment wrapper.
- Bootstrapping a VPS so it enrolls into NetBird automatically on first boot.
- Keeping public SSH as a one-time bootstrap fallback only.
- Converging to a steady state where administrative access is through NetBird and OVH KVM, not public SSH.

This design does not cover:

- Self-hosted Headscale or Tailscale.
- Self-hosted NetBird server components.
- A generic VPN-provider abstraction.
- Public application ports in steady state.

## Decision

The repository will drop the current Headscale/Tailscale direction and instead support a NetBird-client-only model for private administrative access.

The new model is:

- NetBird managed service is the network control plane.
- NixPI provisions only the NetBird client on the VPS.
- The operator supplies a NetBird setup key file path at install time.
- The VPS enrolls automatically during first boot.
- Public SSH exists only as a bootstrap fallback and is closed in steady state.
- OVH KVM remains the break-glass recovery path.

The installer interface for secret input should accept a local file path, not a literal setup key value.

## Why NetBird

NetBird is the better fit for the stated goal because:

- The operator does not want to host or manage a private-network control plane.
- The managed NetBird service already provides the account, policy, and enrollment workflow.
- NixOS already exposes a client-side NetBird module suitable for declarative setup with `login.setupKeyFile`.
- A server-only VPS that should become dark after bootstrap is easier to model as a managed-client enrollment flow than as a self-hosted control-plane appliance.

The earlier Headscale/Tailscale direction is rejected because it adds control-plane hosting, TLS/public-endpoint concerns, and domain assumptions that are not required for the stated deployment goal.

## Architecture

There are two operational phases.

### 1. Bootstrap Phase

The OVH deployment wrapper receives a local file path containing a NetBird setup key.

Responsibilities:

- carry the setup key file path into the generated host configuration without embedding the key in the Nix store
- install a VPS that can still be reached over public SSH on first login
- start the NetBird client automatically at first boot
- enroll the host into the managed NetBird network using the provided setup key

Bootstrap expectations:

- the host may still expose SSH publicly during bootstrap
- the bootstrap password remains valid only until first successful login and forced password rotation
- the host should be recoverable via OVH KVM even if NetBird enrollment fails

### 2. Steady-State Phase

Once the host is enrolled and verified over NetBird, the system converges to a dark steady state.

Responsibilities:

- remove public administrative access
- keep NetBird as the primary administrative path
- retain OVH KVM as the emergency path

Steady-state expectations:

- no public SSH exposure
- no public application ports
- outbound connectivity sufficient for NetBird operation
- operator access only via NetBird or KVM

## Configuration Model

The repository should model this as a NetBird client feature, not a generic overlay abstraction.

The configuration should express:

- whether NetBird client enrollment is enabled
- the runtime path to the setup key file
- optional management URL override only for non-default cases
- optional client identity or extra flags only where the native NixOS NetBird module already supports them

The configuration should not express:

- self-hosted network control-plane settings
- generic VPN-provider switching
- persistent public-admin access in steady state

## NixOS-Native Shape

The design should stay close to the existing NixOS NetBird module shape documented by the NixOS Wiki.

Relevant native patterns:

- `services.netbird.clients.<name>.login.enable = true`
- `services.netbird.clients.<name>.login.setupKeyFile = "/run/..."`
- `services.netbird.clients.<name>.ui.enable = false`
- `services.netbird.clients.<name>.openFirewall = true`
- `services.netbird.clients.<name>.openInternalFirewall = true`
- `services.resolved.enable = true` for client DNS behavior

The repository should wrap these capabilities minimally rather than rebuild them behind a large custom schema.

## Install Interface

The OVH deployment wrapper should accept a NetBird setup key file path.

Why file path instead of literal value:

- avoids shell-history leaks
- reduces accidental log exposure
- aligns with runtime-secret file patterns already used elsewhere
- is more suitable for automation and operator workflows

The wrapper should:

- validate the file exists locally before generating the deploy flake
- arrange for the key to be present on the target host at first boot as runtime secret material
- avoid embedding the key contents into the generated Nix source stored in the Nix store

## Firewall and Access Model

### During Bootstrap

- public SSH remains available temporarily for first access and password rotation
- NetBird enrollment happens automatically as soon as networking is available
- OVH KVM remains available regardless of network state

### In Steady State

- public SSH is disabled
- no public application ports are opened by default
- NetBird becomes the only normal remote administrative path
- KVM remains the recovery path

This is a "dark host" model rather than a public-service host model.

## Documentation Changes

Operator docs should describe:

- NetBird as the private admin path
- OVH KVM as the recovery path
- setup-key file provisioning during install
- bootstrap SSH as temporary only
- steady-state host reachability over NetBird only

The docs should explicitly avoid:

- self-hosted Headscale guidance
- domain/TLS requirements for the default install story
- implying that public SSH remains part of normal steady-state operation

## Testing Strategy

### Unit and Integration Coverage

Add or update tests to verify:

- install wrapper accepts a NetBird setup key file path
- generated bootstrap configuration references runtime secret material rather than literal key contents
- public SSH bootstrap behavior remains enabled where intended
- steady-state config closes public SSH

### NixOS VM Coverage

If deterministic managed-NetBird enrollment is not practical in NixOS VM tests, the NixOS tests should still verify:

- NetBird client service configuration is emitted correctly
- setup-key file paths are wired correctly
- DNS prerequisites such as `services.resolved.enable` are in place when required
- service/firewall behavior matches bootstrap versus steady-state expectations

Manual live validation should cover the real managed-NetBird enrollment path against the official service.

## Migration Plan

This is a hard pivot from the current Headscale/Tailscale direction.

Sequence:

1. Remove or replace the Headscale/Tailscale option surface.
2. Add a minimal NetBird client option surface aligned with native NixOS usage.
3. Extend `nixpi-deploy-ovh` to accept a setup-key file path.
4. Wire bootstrap host config to enroll into NetBird automatically.
5. Rework bootstrap-versus-steady-state SSH exposure.
6. Replace docs and tests.
7. Verify the dark-host behavior after bootstrap on a real OVH VPS.

## Risks

### Setup Key Handling

The setup key becomes critical bootstrap secret material. The implementation must ensure the key itself never lands in the Nix store, shell history, or generated committed configuration.

### Enrollment Failure at First Boot

If NetBird enrollment fails, the host must still be recoverable. This is why bootstrap public SSH and OVH KVM must both remain part of the design.

### Managed-Service Dependency

This design depends on the availability and behavior of the official NetBird service. That is an intentional tradeoff in exchange for lower operational complexity.

## Rejected Alternatives

### Keep Headscale/Tailscale

Rejected because it requires self-hosting a network control plane and introduces domain/TLS concerns that are unnecessary for the stated goal.

### Self-Host NetBird Server

Rejected because it still adds control-plane operational overhead, which the operator explicitly wants to avoid.

### Generic Overlay-Provider Abstraction

Rejected because the repository only needs one concrete solution and a generic abstraction would add complexity without immediate benefit.

### Disable Public SSH Immediately on First Boot

Rejected because it weakens recoverability if NetBird enrollment fails or the setup key is invalid.

## Success Criteria

The migration is successful when:

- the OVH deployment flow can accept a NetBird setup key file path
- a freshly installed VPS enrolls into NetBird automatically on first boot
- the operator can log in once, rotate the password, and verify NetBird access
- steady-state config removes public SSH exposure
- OVH KVM remains a viable recovery path
- no domain is required for the default install story
