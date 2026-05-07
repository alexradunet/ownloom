{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.nixpi-health-snapshot;
  humanName = config.nixpi.human.name;
  humanHome = config.nixpi.human.homeDirectory;
  stateDir = "/var/lib/${cfg.stateDirectory}";
  outPath = "${stateDir}/${cfg.outFile}";
  extraCmds =
    lib.concatMapStrings (cmd: ''
      echo
      ${cmd}
    '')
    cfg.extraStatusCommands;
in {
  imports = [../nixpi-paths/module.nix];

  options.services.nixpi-health-snapshot = {
    enable = lib.mkEnableOption "NixPI host health snapshot timer";

    serviceName = lib.mkOption {
      type = lib.types.str;
      default = "nixpi-health-snapshot";
      description = "systemd service and timer unit name.";
    };

    schedule = lib.mkOption {
      type = lib.types.str;
      default = "*-*-* 04:15:00";
      description = "systemd OnCalendar expression for the snapshot timer.";
    };

    stateDirectory = lib.mkOption {
      type = lib.types.str;
      default = "nixpi-health";
      description = "systemd StateDirectory name (relative to /var/lib/).";
    };

    outFile = lib.mkOption {
      type = lib.types.str;
      default = "status.txt";
      description = "Output filename written inside the state directory.";
    };

    extraStatusCommands = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = ''
        Additional shell commands appended to the base snapshot script.
        Each string is emitted on its own line, preceded by an echo blank line.
      '';
    };

    extraPackages = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = [];
      description = "Extra packages added to the service PATH.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.${cfg.serviceName} = {
      description = "Write a read-only NixPI host health snapshot";
      serviceConfig = {
        Type = "oneshot";
        User = humanName;
        Group = "users";
        WorkingDirectory = config.nixpi.root;
        StateDirectory = cfg.stateDirectory;
      };
      path =
        [
          pkgs.coreutils
          pkgs.git
          pkgs.nixpi-wiki
        ]
        ++ cfg.extraPackages;
      script = ''
        set -euo pipefail
        export HOME=${humanHome}
        export NIXPI_WIKI_ROOT=${config.nixpi.wiki.root}
        export NIXPI_WIKI_HOST=${config.networking.hostName}
        export NO_COLOR=1
        out=${outPath}
        tmp="$out.tmp"
        {
          echo "# NixPI host health snapshot"
          echo "timestamp=$(date -Is)"
          echo "host=${config.networking.hostName}"
          echo
          echo "## git status --short"
          git status --short || true
          echo
          echo "## wiki status"
          nixpi-wiki call wiki_status '{"domain":"technical"}' || true
          ${extraCmds}
        } > "$tmp"
        mv "$tmp" "$out"
      '';
    };

    systemd.timers.${cfg.serviceName} = {
      wantedBy = ["timers.target"];
      timerConfig = {
        OnCalendar = cfg.schedule;
        Persistent = true;
      };
    };
  };
}
