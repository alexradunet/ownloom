# Headscale Admin Tailnet Design

Date: 2026-04-09
Status: Proposed

## Goal

Replace the repository's WireGuard-based private management overlay with a Headscale-managed admin tailnet that is easier to operate and more declarative for a small set of NixOS hosts owned by a single operator.

## Scope

This design covers:

- Running `headscale` as a built-in service on one NixOS host managed by this repository.
- Enrolling managed NixOS hosts into the admin tailnet using the Tailscale client against the self-hosted Headscale control server.
- Replacing WireGuard-specific platform concepts, docs, and tests with Headscale and tailnet-specific ones.

This design does not cover:

- Multi-user or team-oriented access workflows.
- Exit nodes, subnet routers, or complex relay/routing features.
- A compatibility layer for existing WireGuard options or services.
- A web UI or additional management stack beyond Headscale itself.

## Decision

The repository will hard-replace its current WireGuard management overlay with a Headscale-managed admin tailnet.

The new model is:

- `headscale` is the control plane.
- Tailscale clients on managed hosts and the operator machine are the node agents.
- SSH remains the administrative access protocol.
- The trusted boundary is tailnet membership and reachability, not the presence of a `wg0` interface or raw WireGuard peer definitions.

No backward compatibility will be preserved for the previous `nixpi.wireguard` model.

## Why Headscale

Headscale is the better fit for this repository and operator model because:

- The repository needs a small self-hosted control plane for a handful of hosts, not a larger team-oriented networking platform.
- NixOS already exposes Headscale as a native service surface via `services.headscale.*`.
- The declarative shape is closer to standard NixOS service management than raw WireGuard peer and interface modeling.
- The operator wants to remove manual WireGuard complexity rather than preserve it behind a custom abstraction.

NetBird was considered because NixOS support exists for both clients and server components, but it was rejected for this use case because it introduces a broader platform with more moving parts than needed for single-operator administrative access.

## Architecture

There are two roles in the new design.

### 1. Headscale Server Role

One designated NixOS host runs Headscale as a built-in service.

Responsibilities:

- expose the Headscale control server at a stable public URL
- persist control-plane state
- optionally load a policy or ACL file
- act as the only supported control plane for administrative mesh membership

Design constraints:

- the module should wrap native `services.headscale` rather than recreating upstream configuration in a parallel schema
- low-level settings should flow through `services.headscale.settings`
- secrets and runtime-only credentials must remain outside the Nix store

### 2. Tailnet Client Role

Managed NixOS hosts join the admin tailnet using the Tailscale client configured to use the self-hosted Headscale server.

Responsibilities:

- install and run the Tailscale client
- log in to the configured Headscale server
- expose a stable administrative presence on the private tailnet
- support SSH access over that path

Design constraints:

- hosts should not model raw WireGuard peers, interface names, or tunnel addresses
- enrollment material must come from runtime secret paths, not store-managed literal values
- the module surface should stay minimal and focus on enrollment and operator access, not general-purpose networking features

## Configuration Model

The repository should move from a network-interface-first model to an admin-tailnet-first model.

The configuration should express:

- whether a host runs the Headscale server role
- whether a host joins the admin tailnet as a client
- the Headscale server URL used for enrollment
- the runtime path to enrollment credentials
- optional host naming and tagging behavior where it helps administration

The configuration should not express:

- raw WireGuard peer lists
- interface names such as `wg0`
- manual peer key exchange
- compatibility shims for old WireGuard-specific options

## Module Boundaries

### Headscale Module

Create a dedicated module for the control-plane host that:

- enables `services.headscale`
- sets the public server URL and listening behavior
- optionally wires in policy file paths and related settings
- uses upstream-native `settings` passthrough for advanced configuration

This module should expose only repository-relevant options and otherwise defer to the native NixOS Headscale module.

### Tailnet Client Module

Create a dedicated module for managed hosts that:

- installs and enables the Tailscale client
- configures login against the Headscale server URL
- accepts a runtime file path for auth or preauth material
- optionally controls hostname or tags if needed for operator clarity

This module should not attempt to present a generic overlay networking abstraction. Its job is only to make a host part of the administrative tailnet.

## Documentation Changes

The repository documentation should be rewritten to describe the new trust and access model.

Required changes:

- replace references to the preferred private management network being WireGuard
- replace service references to `wireguard-wg0.service`
- update installation, deploy, live-testing, and architecture docs to describe Headscale plus Tailscale client enrollment
- update security docs so the trusted administrative boundary is tailnet membership rather than a specific WireGuard interface

Operator checks should move toward:

- Headscale server health on the designated control-plane host
- Tailscale client service health on managed hosts
- SSH reachability over the admin tailnet

## Testing Strategy

The old WireGuard-focused verification must be removed and replaced.

Required test coverage:

### Headscale Server Test

Verify that the server role:

- evaluates correctly
- starts the Headscale service successfully
- renders the expected configuration
- exposes the expected listening endpoint

### Tailnet Client Test

Verify that the client role:

- evaluates correctly
- starts the Tailscale client service successfully
- is configured to use the Headscale login server

### Operator Path Integration Test

Preferred target:

- enroll a managed node into Headscale
- verify that it becomes reachable over the admin tailnet
- verify that SSH succeeds over that path

If fully automated enrollment is too heavy in the first implementation pass, the initial test plan may split service/config validation from enrollment flow validation, but the intended steady state is one real end-to-end test of the administrative path.

## Migration Plan

This is a hard replacement with no compatibility support.

Sequence:

1. Add the Headscale server module.
2. Add the tailnet client module.
3. Replace docs and service architecture language.
4. Replace NixOS and integration tests.
5. Delete WireGuard options, implementation, and references.
6. Run repository verification and fix fallout until the new path is the only supported one.

## Risks

### Enrollment Secret Handling

The design depends on keeping enrollment credentials outside the Nix store. The implementation must provide a clean runtime-secret path and avoid accidental store capture.

### Automated End-to-End Testing

The most useful proof of correctness is a real Headscale-to-client enrollment test. That may require more care than the current WireGuard-focused tests and should not be deferred indefinitely.

### Documentation Drift During Replacement

Because this is a hard cutover, stale WireGuard wording will become actively misleading. Documentation replacement must be treated as part of the core migration, not as optional cleanup.

## Rejected Alternatives

### Keep Raw WireGuard and Simplify the Existing Module

Rejected because it preserves the main source of pain: raw peer, key, and interface management.

### Add a Compatibility Layer for Existing WireGuard Options

Rejected because it would prolong the old model, complicate the codebase, and weaken the clarity of the new design.

### Use Self-Hosted NetBird Instead

Rejected because the repository only needs a small single-operator administrative mesh, and NetBird introduces a broader platform shape than necessary for that goal.

## Success Criteria

The migration is successful when:

- the repository has no remaining WireGuard-first platform path
- one host can run Headscale declaratively
- managed hosts can join that Headscale network declaratively using runtime enrollment material
- operator guidance uses the tailnet as the normal administrative path
- tests and documentation verify and describe the new model rather than the old one
