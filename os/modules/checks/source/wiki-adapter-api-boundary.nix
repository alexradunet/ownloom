{
  runCommand,
  ripgrep,
}:
runCommand "ownloom-wiki-adapter-api-boundary" {
  nativeBuildInputs = [ripgrep];
} ''
  set -euo pipefail
  cd ${../../../..}

  ! rg -n --glob '!**/tests/**' --glob '!node_modules' --glob '!dist*' 'ownloom-wiki/src/(wiki|tools)' \
    os/pkgs/pi-adapter \
    os/pkgs/gateway \
    os/modules

  touch $out
''
