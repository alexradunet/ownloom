{
  lib,
  writeShellApplication,
  coreutils,
  git,
  nix,
  nixos-rebuild,
}:
writeShellApplication {
  name = "nixpi-config";

  runtimeInputs = [
    coreutils
    git
    nix
    nixos-rebuild
  ];

  text = ''
        set -euo pipefail

        usage() {
          cat <<'EOF'
    Usage: nixpi-config <status|diff|validate|apply>

    Manage the local NixPI host configuration lifecycle.

      status    Show repository state and recent commits
      diff      Show unstaged/staged diff stats
      validate  Run full flake check
      apply     Run nixos-rebuild switch for the current host

    Publication is handled via standard git; use git commit/push to publish changes.
    EOF
        }

        if [ "''${1:-}" = "--help" ] || [ "''${1:-}" = "-h" ]; then
          usage
          exit 0
        fi

        if [ "$#" -ne 1 ]; then
          usage >&2
          exit 2
        fi

        action="$1"
        repo_dir="''${NIXPI_FLAKE_DIR:-''${NIXPI_ROOT:-''${HOME:-/tmp}/NixPI}}"
        host="''${NIXPI_WIKI_HOST:-}"
        if [ -z "$host" ] && [ -r /etc/hostname ]; then
          host="$(tr -d '\n' < /etc/hostname)"
        fi
        if [ -z "$host" ]; then
          host="''${HOSTNAME:-nixos}"
        fi

        ensure_repo() {
          cd "$repo_dir" || {
            echo "nixpi-config: could not cd to $repo_dir" >&2
            exit 1
          }
          git rev-parse --git-dir >/dev/null 2>&1 || {
            echo "nixpi-config: not a git repository: $repo_dir" >&2
            exit 1
          }
        }

        case "$action" in
          status)
            ensure_repo
            branch="$(git branch --show-current || true)"
            remote="$(git remote -v | head -1 || true)"
            status="$(git status --short || true)"
            log="$(git log --oneline -8 || true)"
            cat <<EOF
    Repo: $repo_dir
    Branch: ''${branch:-unknown}
    Remote: ''${remote:-none}

    Working tree:
    ''${status:-Clean}

    Recent commits:
    ''${log:-none}
    EOF
            ;;
          diff)
            ensure_repo
            unstaged="$(git diff --stat || true)"
            staged="$(git diff --stat --cached || true)"
            cat <<EOF
    Unstaged diff:
    ''${unstaged:-(none)}

    Staged diff:
    ''${staged:-(none)}
    EOF
            ;;
          validate)
            ensure_repo
            nix flake check --accept-flake-config
            ;;
          apply)
            ensure_repo
            if [ ! -f "$repo_dir/flake.nix" ]; then
              echo "nixpi-config: flake.nix not found at $repo_dir" >&2
              exit 1
            fi
            exec nixos-rebuild switch --flake "$repo_dir#$host"
            ;;
          *)
            echo "nixpi-config: unsupported action: $action" >&2
            usage >&2
            exit 2
            ;;
        esac
  '';

  meta = {
    description = "Manage the local NixPI host configuration lifecycle";
    license = lib.licenses.mit;
    mainProgram = "nixpi-config";
  };
}
