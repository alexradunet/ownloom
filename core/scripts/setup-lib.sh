#!/usr/bin/env bash
# setup-lib.sh — Shared function library for setup-wizard.sh.
# Source this file; do not execute directly.
#
# Provides: step state management, NetBird utilities.
#
# Required env vars (callers must set before sourcing):
#   WIZARD_STATE        — path to state directory (e.g. ~/.nixpi/wizard-state)
#   WIZARD_STATE_FILE   — path to JSON step state file
#   PI_DIR              — path to Pi config dir (typically ~/.pi)
#   NIXPI_CONFIG        — path to NixPI service config dir
#   NIXPI_DIR           — path to the user-editable NixPI workspace (typically ~/nixpi)

# --- Step state helpers (JSON-backed) ---

_state_read() {
	[[ -f "$WIZARD_STATE_FILE" ]] && cat "$WIZARD_STATE_FILE" || echo '{}'
}

_state_write() {
	mkdir -p "$(dirname "$WIZARD_STATE_FILE")"
	echo "$1" > "$WIZARD_STATE_FILE"
}

mark_done() {
	local step="$1"
	local updated
	updated=$(jq --arg step "$step" --arg ts "$(date -Iseconds)" \
		'.[$step] = {status: "done", ts: $ts}' <<< "$(_state_read)")
	_state_write "$updated"
}

# Store data alongside a step completion (e.g., mesh IP)
mark_done_with() {
	local step="$1" data="$2"
	local updated
	updated=$(jq --arg step "$step" --arg ts "$(date -Iseconds)" --arg data "$data" \
		'.[$step] = {status: "done", ts: $ts, data: $data}' <<< "$(_state_read)")
	_state_write "$updated"
}

# Read stored data from a step
read_checkpoint_data() {
	jq -r --arg step "$1" '.[$step].data // empty' <<< "$(_state_read)"
}

netbird_status_json() {
	netbird status --json 2>/dev/null || true
}

netbird_fqdn() {
	local status
	status=$(netbird_status_json)
	[[ -n "$status" ]] || return 0
	jq -r '.fqdn // empty' <<< "$status"
}

netbird_ip() {
	local status
	status=$(netbird_status_json)
	[[ -n "$status" ]] || return 0
	jq -r '.netbirdIp // empty | split("/")[0]' <<< "$status"
}

canonical_state_dir() {
	printf '%s/access-state' "$NIXPI_CONFIG"
}

stored_canonical_host() {
	local path
	path="$(canonical_state_dir)/canonical-host"
	[[ -f "$path" ]] && cat "$path" || true
}

current_canonical_host() {
	netbird_fqdn
}

record_canonical_host() {
	local host="$1"
	[[ -n "$host" ]] || return 0
	mkdir -p "$(canonical_state_dir)"
	printf '%s' "$host" > "$(canonical_state_dir)/canonical-host"
}

canonical_access_mode() {
	local current stored
	current=$(current_canonical_host)
	stored=$(stored_canonical_host)
	if [[ -n "$current" ]]; then
		echo "healthy"
	elif [[ -n "$stored" ]]; then
		echo "degraded"
	else
		echo "not-ready"
	fi
}

canonical_service_host() {
	local current stored
	current=$(current_canonical_host)
	if [[ -n "$current" ]]; then
		record_canonical_host "$current"
		printf '%s' "$current"
		return 0
	fi
	stored=$(stored_canonical_host)
	if [[ -n "$stored" ]]; then
		printf '%s' "$stored"
	fi
	return 0
}

root_command() {
	if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
		"$@"
		return
	fi

	local sudo_bin=""
	if command -v sudo >/dev/null 2>&1; then
		sudo_bin="$(command -v sudo)"
	elif [[ -x /run/wrappers/bin/sudo ]]; then
		sudo_bin="/run/wrappers/bin/sudo"
	fi

	if [[ -n "$sudo_bin" ]]; then
		"$sudo_bin" "$@"
	else
		"$@"
	fi
}

read_bootstrap_primary_password() {
	if command -v nixpi-bootstrap >/dev/null 2>&1; then
		root_command nixpi-bootstrap read-primary-password 2>/dev/null || true
	fi
}





