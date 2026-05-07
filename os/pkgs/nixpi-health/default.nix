{
  lib,
  writeShellApplication,
  coreutils,
  gnugrep,
  jq,
  nixos-rebuild,
  podman,
  procps,
}:
writeShellApplication {
  name = "nixpi-health";

  runtimeInputs = [
    coreutils
    gnugrep
    jq
    nixos-rebuild
    podman
    procps
  ];

  text = ''
        set -euo pipefail

        format="markdown"
        while [ "$#" -gt 0 ]; do
          case "$1" in
            --json)
              format="json"
              shift
              ;;
            --format)
              if [ "$#" -lt 2 ]; then
                echo "nixpi-health: --format requires markdown or json" >&2
                exit 2
              fi
              format="$2"
              shift 2
              ;;
            --help|-h)
              cat <<'EOF'
    Usage: nixpi-health [--format markdown|json] [--json]

    Composite NixPI host health snapshot: OS generation, nixpi containers, disk, load, uptime, and memory.
    EOF
              exit 0
              ;;
            *)
              echo "nixpi-health: unknown argument: $1" >&2
              exit 2
              ;;
          esac
        done

        if [ "$format" != "markdown" ] && [ "$format" != "json" ]; then
          echo "nixpi-health: unsupported format: $format" >&2
          exit 2
        fi

        current_generation_line() {
          awk '
            BEGIN { found = 0 }
            NR == 1 && $1 ~ /^Generation$/ { next }
            /True[[:space:]]*$/ {
              sub(/[[:space:]]+True[[:space:]]*$/, " (current)")
              print
              found = 1
              exit
            }
            /\(current\)|current/ && found == 0 {
              print
              found = 1
              exit
            }
            found == 0 && NF > 0 {
              first = $0
              found = 2
            }
            END {
              if (found == 2) print first
              if (found == 0) print "No generation info available."
            }
          '
        }

        sections_file="$(mktemp)"
        trap 'rm -f "$sections_file"' EXIT

        if generations="$(nixos-rebuild list-generations 2>/dev/null)"; then
          current_line="$(printf '%s\n' "$generations" | current_generation_line)"
          printf '## OS\nNixOS — %s\n\n' "$current_line" >> "$sections_file"
        else
          printf '## OS\n(nixos-rebuild unavailable)\n\n' >> "$sections_file"
        fi

        if containers_json="$(podman ps --format json --filter name=nixpi- 2>/dev/null)"; then
          containers_text="$(printf '%s' "$containers_json" | jq -r '
            if type == "array" and length > 0 then
              .[] | "- " + (((.Names // []) | join(", ")) // "unknown") + ": " + (.Status // .State // "unknown")
            else
              "No nixpi-* containers running."
            end
          ' 2>/dev/null || printf '%s' '(parse error)')"
          printf '## Containers\n%s\n\n' "$containers_text" >> "$sections_file"
        fi

        if disk="$(df -h / /var /home 2>/dev/null)"; then
          {
            printf '## Disk Usage\n'
            printf '%s\n' '```'
            printf '%s\n' "$disk"
            printf '%s\n\n' '```'
          } >> "$sections_file"
        fi

        system_lines=""
        if [ -r /proc/loadavg ]; then
          read -r load1 load5 load15 _ < /proc/loadavg || true
          system_lines="''${system_lines}- Load: $load1 $load5 $load15\n"
        fi
        if uptime_text="$(uptime -p 2>/dev/null)"; then
          system_lines="''${system_lines}- Uptime: $uptime_text\n"
        fi
        if mem_line="$(free -h --si 2>/dev/null | grep '^Mem:' || true)"; then
          if [ -n "$mem_line" ]; then
            total="$(printf '%s\n' "$mem_line" | awk '{print $2}')"
            used="$(printf '%s\n' "$mem_line" | awk '{print $3}')"
            system_lines="''${system_lines}- Memory: $used used / $total total\n"
          fi
        fi
        if [ -n "$system_lines" ]; then
          printf '## System\n%b\n' "$system_lines" >> "$sections_file"
        fi

        text="$(sed -e ':a' -e '/^$/N; /\n$/ba' -e 's/[[:space:]]*$//' "$sections_file")"

        if [ "$format" = "json" ]; then
          jq -n --arg text "$text" '{ok: true, text: $text}'
          exit 0
        fi

        printf '%s\n' "$text"
  '';

  meta = {
    description = "Composite NixPI host health snapshot";
    license = lib.licenses.mit;
    mainProgram = "nixpi-health";
  };
}
