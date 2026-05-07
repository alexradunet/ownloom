{
  lib,
  writeShellApplication,
  systemd,
}:
writeShellApplication {
  name = "nixpi-reboot";

  runtimeInputs = [systemd];

  text = ''
        set -euo pipefail

        usage() {
          cat <<'EOF'
    Usage: nixpi-reboot --in <minutes>

    Schedule a system reboot after a bounded delay. This command does not elevate;
    callers that need privileges should run it through sudo after confirmation.
    EOF
        }

        delay=""
        while [ "$#" -gt 0 ]; do
          case "$1" in
            --in|--delay-minutes)
              if [ "$#" -lt 2 ]; then
                echo "nixpi-reboot: $1 requires a minute value" >&2
                exit 2
              fi
              delay="$2"
              shift 2
              ;;
            --help|-h)
              usage
              exit 0
              ;;
            *)
              echo "nixpi-reboot: unknown argument: $1" >&2
              usage >&2
              exit 2
              ;;
          esac
        done

        if ! [[ "$delay" =~ ^[0-9]+$ ]]; then
          echo "nixpi-reboot: --in must be an integer minute value" >&2
          exit 2
        fi

        if [ "$delay" -lt 1 ]; then
          delay=1
        fi
        max=$((7 * 24 * 60))
        if [ "$delay" -gt "$max" ]; then
          delay="$max"
        fi

        exec shutdown -r +"$delay"
  '';

  meta = {
    description = "Schedule a system reboot after a bounded delay";
    license = lib.licenses.mit;
    mainProgram = "nixpi-reboot";
  };
}
