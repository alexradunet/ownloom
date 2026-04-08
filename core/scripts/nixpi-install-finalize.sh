#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:?repo url required}"
REPO_BRANCH="${2:?repo branch required}"
PRIMARY_USER="${3:?primary user required}"
HOSTNAME_VALUE="${4:?hostname required}"
TIMEZONE_VALUE="${5:?timezone required}"
KEYBOARD_VALUE="${6:?keyboard required}"
REPO_DIR="/srv/nixpi"

primary_group="$(id -gn "$PRIMARY_USER")"
install -d -m 0755 /srv

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  rm -rf "$REPO_DIR"
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR"
fi

chown -R "$PRIMARY_USER:$primary_group" "$REPO_DIR"

bash "$REPO_DIR/core/scripts/nixpi-init-system-flake.sh" \
  "$REPO_DIR" \
  "$HOSTNAME_VALUE" \
  "$PRIMARY_USER" \
  "$TIMEZONE_VALUE" \
  "$KEYBOARD_VALUE"
