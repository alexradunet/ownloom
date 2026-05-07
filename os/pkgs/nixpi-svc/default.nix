{
  lib,
  writeShellApplication,
  coreutils,
  systemd,
}:
writeShellApplication {
  name = "nixpi-svc";

  runtimeInputs = [coreutils systemd];

  text = ''
        set -euo pipefail

        usage() {
          cat <<'EOF'
    Usage: nixpi-svc <status|start|stop|restart> <service>

    Safely manage allowlisted systemd services. Allowed units are nixpi-* and sshd.
    EOF
        }

        if [ "''${1:-}" = "--help" ] || [ "''${1:-}" = "-h" ]; then
          usage
          exit 0
        fi

        if [ "$#" -ne 2 ]; then
          usage >&2
          exit 2
        fi

        action="$1"
        service="$2"

        case "$action" in
          status|start|stop|restart) ;;
          *)
            echo "nixpi-svc: unsupported action: $action" >&2
            exit 2
            ;;
        esac

        normalized="''${service%.service}"
        case "$normalized" in
          nixpi-*|sshd) ;;
          *)
            echo "Security error: service $service is not allowed." >&2
            exit 3
            ;;
        esac

        unit="$normalized.service"
        exec systemctl "$action" "$unit" --no-pager
  '';

  meta = {
    description = "Safely manage allowlisted NixPI systemd services";
    license = lib.licenses.mit;
    mainProgram = "nixpi-svc";
  };
}
