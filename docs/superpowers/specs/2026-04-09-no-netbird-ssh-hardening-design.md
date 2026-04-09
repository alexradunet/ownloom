# No-NetBird SSH Hardening Design

## Goal

Remove NetBird from the supported NixPI remote-admin model and replace it with a plain, auditable SSH policy:

1. install through OVH
2. use public SSH for bootstrap
3. keep public SSH in steady state only for explicitly allowlisted admin CIDRs
4. require SSH keys in both bootstrap and steady state
5. recover only through OVH console or rescue mode when remote access is lost

The design must not depend on any WireGuard, NetBird, Tailscale, Headscale, or VPS-based private admin path.

## Current State

The current repository uses `nixpi.netbird` as the steady-state security boundary:

- bootstrap SSH remains public while bootstrap mode is enabled
- once bootstrap mode is disabled and NetBird is enabled, public TCP/22 closes
- SSH remains reachable only on the trusted NetBird interface
- password authentication is disabled only in the NetBird steady-state path

That is the opposite of the desired deployment model. Without NetBird, the current fallback would leave public SSH reachable without a source-IP restriction and would still permit password authentication in some steady-state paths.

## Design Principles

- Prefer standard, transparent controls over overlay-network control planes.
- Keep the remote-admin policy understandable from plain NixOS SSH and firewall settings.
- Require explicit source allowlists for internet-reachable SSH.
- Fail closed when required SSH security inputs are missing.
- Keep recovery out-of-band through OVH console/rescue rather than hidden remote backdoors.
- Reuse existing NixPI security surfaces where they already fit; add only the minimum new options needed.

## Proposed Architecture

## 1. Remove NetBird As A First-Class NixPI Access Path

Delete the repository-level NetBird option surface and service wiring:

- remove `nixpi.netbird` options
- remove `services.netbird.clients.wt0` integration
- remove NetBird package installation from the core network module
- remove NetBird-specific broker allowlists, tests, and operator checks

After this change, NixPI no longer models a private overlay interface as the normal administrative boundary.

## 2. Keep Bootstrap SSH Public But Hardened

The OVH bootstrap lane still needs reachable SSH on the public interface, but it should be hardened immediately:

- SSH enabled during bootstrap
- TCP/22 open during bootstrap
- NixPI-managed bootstrap disables root SSH login and uses the primary operator account only
- password authentication disabled during bootstrap
- public-key authentication required
- `AllowUsers` restricted to the intended bootstrap identities

Because the user explicitly wants key-only bootstrap, password login must not remain as a bootstrap convenience path. If the plain `ovh-base` install lane briefly requires key-based root access before the first NixPI-managed rebuild, that exception belongs only to the provider base profile and ends at the NixPI handoff.

## 3. Make Steady-State Public SSH CIDR-Restricted

Steady-state SSH remains available on the public interface, but only from explicitly allowlisted source networks.

Required policy:

- public SSH remains enabled
- TCP/22 remains open only for configured admin CIDRs
- no global `allowedTCPPorts = [ 22 ]` exposure in steady state
- firewall rules enforce source-based allowlisting on the public interface
- SSH remains key-only
- root login remains disabled
- `AllowUsers` stays restricted to the primary operator account or an explicit user allowlist

This keeps operational access simple while materially reducing exposure compared with an internet-open SSH daemon.

## 4. Fail Closed When Admin CIDRs Are Missing

If steady-state public SSH is enabled but no admin CIDRs are configured, evaluation should fail.

This is an intentional safety property:

- do not silently widen SSH exposure
- do not silently fall back to “open to the world”
- make the operator provide explicit source networks before deployment succeeds

The design should express this as a declarative assertion so the failure happens before the host is deployed.

## 5. Reframe Recovery As Console-Only

There is no remote break-glass path in this design.

If the operator loses remote access because:

- the CIDR allowlist is wrong
- SSH keys are missing or rotated incorrectly
- firewall rules are too narrow
- SSH daemon policy is misconfigured

then recovery happens only through:

- OVH web console
- OVH rescue mode
- other direct provider-side console access

This keeps the remote policy honest. There is no hidden fallback VPN and no emergency remote bypass toggle to defend.

## 6. Reuse Existing Security Controls Where Appropriate

The repository already has useful SSH hardening defaults that should remain in place:

- `AllowAgentForwarding = false`
- `AllowTcpForwarding = false`
- `X11Forwarding = false`
- reduced `LoginGraceTime`
- reduced `MaxAuthTries`
- `ClientAliveInterval` / `ClientAliveCountMax`
- `fail2ban`
- `AllowUsers` restriction

The design should preserve those controls and tighten the current gaps:

- remove bootstrap/steady-state password-auth drift
- decouple steady-state SSH exposure from NetBird presence
- add source-CIDR enforcement for public SSH

## Configuration Surface

The minimal configuration model should look like this:

- retain `nixpi.security.ssh.allowUsers`
- retain `nixpi.security.ssh.passwordAuthentication`, but keep the secure default `false`
- add a new option for public admin source CIDRs, for example `nixpi.security.ssh.allowedSourceCIDRs`
- optionally add a narrow bootstrap-specific allowlist only if the OVH flow genuinely needs it; otherwise reuse the same CIDR list for both phases

Recommended default behavior:

- bootstrap SSH enabled when bootstrap mode is enabled
- steady-state SSH enabled when the host is intended to be remotely administered
- both phases require keys
- both phases require CIDR allowlisting
- missing CIDRs cause assertion failure when public SSH would otherwise be exposed

## Testing Strategy

Lock this behavior down with regression tests before and during the cleanup:

1. option-surface tests
   - NetBird options removed
   - new SSH source-CIDR option exists
2. NixOS security policy tests
   - bootstrap host exposes TCP/22 only to allowlisted sources
   - steady-state host exposes TCP/22 only to allowlisted sources
   - password auth disabled in both phases
   - root login disabled in steady state
3. integration tests
   - OVH deploy flow no longer emits `nixpi.netbird`
   - generated host configs include required SSH allowlist inputs
4. docs tests / assertion-style checks where feasible
   - NetBird service checks appear only in historical/spec material, not current operator docs

## Documentation Changes

Update operator-facing docs to describe the new plain-security model:

- no NetBird prerequisites
- no private overlay requirement
- bootstrap over public SSH with keys
- steady-state SSH limited to configured admin CIDRs
- console/rescue recovery only

Docs that currently present `netbird-wt0.service` as a normal expectation must be rewritten or made explicitly historical.

## Acceptance Criteria

The design is complete when all of the following are true:

1. `nixpi.netbird` no longer exists in the active option surface or core host policy
2. no active host module configures NetBird services or packages
3. bootstrap SSH is key-only
4. steady-state SSH is key-only
5. steady-state public SSH requires explicit source CIDRs
6. deployment/evaluation fails if public SSH would be exposed without source CIDRs
7. docs describe OVH console/rescue as the only recovery path
8. tests cover the new SSH exposure model and no longer require NetBird service presence

## Rejected Alternatives

Rejected: keep NetBird as an optional recommended path | still leaves the repository centered on an overlay-network security story the user no longer wants

Rejected: leave public SSH open to the world and rely only on keys plus fail2ban | too much unnecessary attack surface for an internet-reachable admin service

Rejected: add a remote break-glass toggle | creates a second high-risk access path that must itself be protected and audited

Rejected: disable SSH entirely after bootstrap | strongest reduction in exposure, but inconsistent with the desired OVH operational model

## Risks

- source-IP allowlisting can lock out operators if their egress IPs change unexpectedly
- tightening bootstrap SSH may require the OVH install flow to provide operator keys and CIDRs more explicitly
- docs and tests may have broad NetBird assumptions that need systematic removal

## External Guidance

This design is aligned with the external guidance reviewed during brainstorming:

- OpenSSH server hardening and user restriction guidance: `sshd_config(5)`
- NixOS firewall guidance for explicit port exposure and source-based rules
- CIS-style SSH hardening guidance favoring restricted SSH access, key-only auth, and root-login disablement

Reference links:

- https://man.openbsd.org/sshd_config
- https://wiki.nixos.org/wiki/Firewall
- https://camscsc.github.io/CIS-Breakdown/systems/ubuntu/5.html
