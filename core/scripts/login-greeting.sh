#!/usr/bin/env bash
set -euo pipefail

# nixPI login script — ensures Pi settings include the nixPI package.

NIXPI_PKG="/usr/local/share/nixpi"
PI_DIR="${NIXPI_PI_DIR:-$HOME/.pi}"
PI_SETTINGS="${PI_DIR}/agent/settings.json"

# Ensure Pi settings include the nixPI package (idempotent)
if [[ -d "$NIXPI_PKG" ]]; then
    mkdir -p "$(dirname "$PI_SETTINGS")"
    if [[ -f "$PI_SETTINGS" ]]; then
        if command -v jq >/dev/null 2>&1; then
            if ! jq -e '.packages // [] | index("'"$NIXPI_PKG"'")' "$PI_SETTINGS" >/dev/null 2>&1; then
                jq '.packages = ((.packages // []) + ["'"$NIXPI_PKG"'"] | unique)' "$PI_SETTINGS" > "${PI_SETTINGS}.tmp" && \
                    mv "${PI_SETTINGS}.tmp" "$PI_SETTINGS"
            fi
        fi
    else
        cp "$NIXPI_PKG/.pi/agent/settings.json" "$PI_SETTINGS"
    fi
fi
