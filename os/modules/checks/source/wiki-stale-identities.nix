{
  runCommand,
  ripgrep,
}:
runCommand "nixpi-wiki-stale-identities" {
  nativeBuildInputs = [ripgrep];
} ''
  set -euo pipefail
  cd ${../../../..}

  # Keep the packaged wiki core free of stale private/fleet identities
  # without forbidding intentional NixPI branding or test fixtures.
  ! rg -ni --glob '!**/tests/**' --glob '!**/*.md' \
    '/home/alex|vps-nixos|evo-nixos|nixpi-mini-pc|syncthing|personal-second-brain|pi_llm|nixpi-tool|assistant-profile' \
    os/pkgs/wiki

  touch $out
''
