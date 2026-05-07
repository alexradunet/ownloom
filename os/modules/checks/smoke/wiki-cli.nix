{
  jq,
  nixpi-wiki,
  runCommand,
}:
runCommand "nixpi-wiki-cli-smoke" {
  nativeBuildInputs = [nixpi-wiki jq];
} ''
  set -euo pipefail
  export NIXPI_WIKI_ROOT="$TMPDIR/wiki"
  export NIXPI_WIKI_HOST="smoke-host"
  mkdir -p "$NIXPI_WIKI_ROOT/pages/resources/technical"
  cat > "$NIXPI_WIKI_ROOT/pages/resources/technical/smoke.md" <<'EOF'
  ---
  type: concept
  title: Smoke Page
  domain: technical
  areas: [tests]
  hosts: []
  status: active
  updated: 2026-04-27
  source_ids: []
  summary: Smoke page.
  ---
  # Smoke Page
  EOF
  nixpi-wiki list --json | jq -e 'all(.[]; .name | startswith("wiki_"))'
  nixpi-wiki list | grep wiki_status
  nixpi-wiki describe wiki_status | grep "Wiki Status"
  nixpi-wiki call wiki_status '{"domain":"technical"}' | grep "Pages: 1 total"
  nixpi-wiki context --format json | jq -e '.host == "smoke-host"'
  nixpi-wiki doctor --json > doctor.json || true
  jq -e '.checks[] | select(.name == "wiki-status") | .ok == true' doctor.json
  touch $out
''
