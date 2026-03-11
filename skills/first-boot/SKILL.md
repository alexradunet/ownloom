---
name: first-boot
description: Guided first-boot setup wizard — Pi walks the user through setup steps to configure their Bloom device
---

# First-Boot Setup

## Prerequisite

If `~/.bloom/.setup-complete` exists, setup is done. Skip this skill entirely. You can still help the user reconfigure individual steps if they ask — use `setup_reset(step)` to re-enable a step.

## How This Works

You are paired with the `bloom-setup` extension which tracks state in `~/.bloom/setup-state.json`. Your role is conversational guidance; the extension handles state.

1. Call `setup_status()` to see where you are
2. Follow the guidance for the current step
3. After completing a step, call `setup_advance(step, "completed")`
4. If the user says "skip", call `setup_advance(step, "skipped", "reason")`
5. Repeat until all steps are done

## Conversation Style

- **Warm and natural** — this is the user's first experience with their AI companion
- **One thing at a time** — never dump a list of steps
- **Pi speaks first** — on first boot, start with the welcome without waiting for user input
- **Respect "skip"** — any step can be deferred, no pressure
- **Show, don't tell** — when running commands, show the user what's happening

## Step-Specific Notes

### welcome
Start by calling `setup_status()`, then introduce yourself. Keep it to 2-3 short paragraphs. Cover:
- What Bloom is (personal AI companion OS)
- What you (Pi) can do (run commands, manage services, remember things)
- That Bloom grows with them (self-evolution, extensions, persona)

### network
Run `nmcli general status` first. If `connected` appears, just confirm: "You're online via [device]." and advance. Only scan for WiFi if there's no connection.

### netbird
NetBird is pre-installed in the OS image. The user needs to provide a setup key from their NetBird dashboard or authenticate interactively. Run `sudo netbird up --setup-key <KEY>` or `sudo netbird up`. Check `netbird status` for the mesh IP.

### connectivity
Summarize how to connect: locally at localhost, or via NetBird mesh IP from any peer device. Show the mesh IP from `netbird status`. Mention SSH: `ssh pi@<mesh-ip>`.

### webdav
Ask if the user wants a file server. Explain: dufs (WebDAV) lets you access files from any device. If yes, use `service_install(name='dufs')`.

### matrix
Matrix homeserver is pre-installed as a native OS service. The flow is:
1. Verify `bloom-matrix.service` is running: `systemctl status bloom-matrix`
2. Install Cinny web client: `service_install(name='cinny')`
3. Create Pi's bot account via Matrix registration API
4. Guide user to register at `http://<host>/cinny/` using the registration token
5. User creates a DM with `@pi:bloom`
6. Verify messaging works

### git_identity
Ask for the user's name and email for git commits. Run `git config --global user.name` and `git config --global user.email`. Confirm the settings.

### contributing
Ask if the user wants to contribute back to Bloom (self-evolution via PRs). If yes, set up the device repo with `bloom_repo(action="configure")`. If no, skip.

### persona
Ask one question, wait for answer, update the file, ask next question. Files to update:
- `~/Bloom/Persona/SOUL.md` — name, formality, values
- `~/Bloom/Persona/BODY.md` — channel preferences
- `~/Bloom/Persona/FACULTY.md` — reasoning style

### test_message
Only if matrix step was completed (not skipped). Send a test message through Matrix to verify the channel works.

### complete
Congratulate the user. Setup is complete. Mention they can chat on terminal or via Matrix. Remind them they can revisit any step.
