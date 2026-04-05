# Terminal + Headless VPS-First NixPI Design

## Summary

NixPI will be reset from a desktop- and Raspberry-Pi-shaped project into a **VPS-first, headless NixOS service platform**. The product keeps a remote web app, but that app becomes the operator control plane for a headless system rather than a local desktop experience.

The retained operator surface is:
- browser chat
- browser terminal
- setup/admin screens where needed

These surfaces live in the same app.

The design intentionally removes or demotes:
- XFCE / desktop-first assumptions
- graphical QEMU installer and local GUI validation as the canonical workflow
- Raspberry Pi hardware framing as the product default
- RPC-mode Pi integration inside the app in favor of direct SDK-mode integration

## Goals

- Make NixPI easy to deploy on **NixOS-capable VPSes**
- Make NixPI operate as a **headless service platform**
- Preserve a cohesive remote operator experience through **one web app**
- Keep **chat + terminal** together in the same application surface
- Replace the current RPC subprocess integration with **Pi SDK mode** inside the application runtime
- Create a future path to a **one-command canonical install flow**

## Non-goals

- Supporting arbitrary non-NixOS Linux distributions in the first release
- Keeping Raspberry Pi hardware as the primary product framing
- Preserving desktop/XFCE setup as a required runtime or onboarding path
- Keeping graphical QEMU install/testing as the canonical development workflow
- Keeping RPC mode as the primary in-app integration model

## Product boundary

NixPI is a **headless NixOS platform for remote operation**.

“Pi” remains the product and agent identity, but it no longer implies Raspberry Pi hardware as the primary target. The main deployment target becomes a **generic NixOS-capable VPS**.

The browser app remains, but its role changes. It is no longer a local convenience surface for a desktop install. It becomes the standard remote control plane for a server-hosted system.

## Canonical deployment model

The long-term canonical path is a **fresh VPS deployment**, not an ISO-to-desktop install.

### Canonical operator flow
1. Start from a NixOS-capable VPS
2. Run a single bootstrap command
3. Bootstrap installs or wires in NixPI
4. Bootstrap activates the headless NixPI profile
5. Operator continues setup remotely through the web app and terminal

### Deployment assumptions
- First release targets **NixOS-capable VPSes only**
- `/srv/nixpi` can remain the canonical editable checkout on installed systems
- `nixos-rebuild` + flakes remain core deployment primitives

### Immediate implication
The repo should stop presenting the following as the primary story:
- installer ISO as the default install mechanism
- local monitor/keyboard setup
- desktop autologin + browser-based local completion
- graphical QEMU for standard development validation

## Runtime architecture

NixPI should run as **one headless application platform**.

### Core runtime components
- **Pi runtime in SDK mode** inside the server/application process
- **Web application** exposing chat, terminal, and setup/admin surfaces
- **System services** for scheduling, memory, updates, broker/autonomy boundaries, and secure ingress

### Pi integration model
Current integration uses RPC-oriented components in the chat server. That model should be replaced by a **direct SDK bridge**.

Target shape:
- the server hosts Pi through the SDK directly
- shared session/auth/context lives inside one application boundary
- one normalized event model feeds the web UI
- chat, setup/admin workflows, and future app capabilities share the same integration path

### Why SDK mode is preferred
- fewer process boundaries
- more cohesive application architecture
- simpler session and event handling
- easier extension of the same app into additional operator workflows
- reduced mismatch between “the app” and “the agent runtime”

## Web operator surface

The web app is retained, but simplified into a **single remote operator interface**.

### Included surfaces
- **Chat** with Pi
- **Browser terminal** for direct system/operator access
- **Setup/admin** pages only where necessary for first configuration and system operation

### UX principles
- terminal is first-class, not hidden behind a separate tool
- chat and terminal belong to one app shell
- headless operation is the default mental model
- local physical-console use is a fallback/debug path, not the primary UX

## Architecture simplifications

This redesign should simplify the codebase by collapsing redundant layers.

### Likely simplifications
- remove desktop-specific packages/modules from the default host profile
- remove or demote installer-web assumptions tied to local GUI presence
- shrink or delete the RPC client manager path in `core/chat-server/`
- consolidate UI-facing event translation in one SDK-based server path
- treat ttyd/terminal integration as part of the main app story rather than a sidecar mental model
- demote or remove graphical VM boot helpers that exist only to support GUI-first flows

## Migration shape

This design follows the user-selected **hard simplification reset**.

### Phase shape
The project should be redesigned around the new end state rather than maintaining compatibility with the old desktop-first narrative as a first-class product path.

Recommended migration chunks:
1. **Reframe product and docs** around VPS-first/headless-first
2. **Remove desktop/XFCE assumptions** from host profiles and first-boot docs
3. **Replace RPC with SDK integration** in the app/server runtime
4. **Unify chat + terminal** under one app shell and server architecture
5. **Demote ISO/QEMU GUI workflows** from primary operator/developer guidance
6. **Introduce one-command VPS bootstrap path** as the canonical install flow

## Testing strategy

Testing should stay strong, but shift toward **headless validation**.

### Primary test modes
- unit/integration tests around SDK-mode server integration
- headless NixOS tests for runtime/service behavior
- smoke tests for terminal + chat availability in the remote app surface
- deployment/bootstrap tests for the VPS-first path

### Demoted test modes
- graphical QEMU workflows as the default validation path
- tests whose main purpose is preserving local desktop UX

### Important note
This design does **not** require eliminating all virtualization. It removes the **graphical/local-desktop QEMU assumption**. Headless VM-based NixOS tests may still remain useful where they validate server behavior efficiently.

## Data flow

### Chat path
1. Browser sends chat request to the web app backend
2. Backend forwards directly into the Pi SDK session/runtime
3. Backend normalizes Pi events into the app event contract
4. Browser renders the streamed response in chat UI

### Terminal path
1. Browser opens embedded terminal surface
2. Backend/proxy attaches terminal session to the authorized shell/runtime path
3. Terminal session is presented inside the same app shell and security model as chat

### Setup/admin path
1. Operator accesses setup/admin within the same app
2. Backend runs configuration/update/admin operations inside the headless NixPI service model
3. Results stream back through the same app conventions used elsewhere when practical

## Security and operations

The redesign should preserve existing security boundaries while making remote operation the default.

Key implications:
- remote service exposure must remain tightly controlled
- browser terminal must be treated as a privileged operator surface
- VPS bootstrap must make secure ingress and operator authentication explicit
- local physical console should not be relied on for routine administration

## Acceptance criteria

The redesign is successful when:
1. NixPI is described and structured as a **VPS-first headless platform**
2. Raspberry Pi hardware is no longer the primary framing
3. XFCE/desktop is not required for install or normal operation
4. chat + browser terminal live in the same app story
5. the app uses **Pi SDK mode**, not RPC mode, as the primary integration path
6. graphical QEMU installer/dev flow is no longer canonical
7. the docs define a path to a **one-command fresh VPS install** on NixOS-capable hosts

## Risks

- Removing desktop assumptions may expose hidden dependencies in first-boot and docs
- SDK-mode integration may require reworking current event/session abstractions in `core/chat-server/`
- Moving too aggressively may break old local-install workflows before the VPS path is complete
- “one command” can hide real configuration complexity if the bootstrap boundary is underspecified

## Recommendation

Proceed with the reset as a deliberate product rewrite of the deployment/runtime model, not as a small incremental cleanup. Keep the scope disciplined around the chosen target:
- VPS-first
- headless-first
- web app retained
- chat + terminal unified
- Pi SDK mode integration
- no desktop-first or graphical-QEMU-first narrative
