{ pkgs }:

{ config, lib, ... }:

let
  inherit (lib) mkOption types;
in
{
  _class = "service";

  options.nixpi-code = {
    port = mkOption {
      type = types.port;
    };

    bindAddress = mkOption {
      type = types.str;
    };

    workspaceDir = mkOption {
      type = types.pathWith { absolute = true; };
    };

    stateDir = mkOption {
      type = types.pathWith { absolute = true; };
      };

    serviceUser = mkOption {
      type = types.str;
    };

    auth = mkOption {
      type = types.enum [ "none" "password" ];
    };

    passwordFile = mkOption {
      type = types.nullOr (types.pathWith {
        absolute = true;
        inStore = false;
      });
      default = null;
    };
  };

  config = {
    process.argv = [
      "${pkgs.code-server}/bin/code-server"
      "--bind-addr"
      "${config.nixpi-code.bindAddress}:${toString config.nixpi-code.port}"
      "--auth"
      config.nixpi-code.auth
      "--disable-telemetry"
      "--user-data-dir"
      "${config.nixpi-code.stateDir}/services/code/user-data"
      "--extensions-dir"
      "${config.nixpi-code.stateDir}/services/code/extensions"
      config.nixpi-code.workspaceDir
    ];

    systemd.service = {
      description = "nixPI code-server";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        User = config.nixpi-code.serviceUser;
        Group = config.nixpi-code.serviceUser;
        UMask = "0007";
        WorkingDirectory = config.nixpi-code.workspaceDir;
        ExecStartPre = pkgs.writeShellScript "nixpi-code-prestart" ''
          state_dir="${config.nixpi-code.stateDir}/services/code"
          home_dir="${config.nixpi-code.stateDir}/home"
          env_file="$state_dir/code-server.env"
          password_file="$state_dir/generated-password"

          mkdir -p "$state_dir"
          mkdir -p "$home_dir/.config"

          if [ "${config.nixpi-code.auth}" = "password" ]; then
            if [ -n "${if config.nixpi-code.passwordFile != null then toString config.nixpi-code.passwordFile else ""}" ]; then
              password="$(cat "${if config.nixpi-code.passwordFile != null then toString config.nixpi-code.passwordFile else "/dev/null"}")"
            else
              if [ ! -f "$password_file" ]; then
                ${pkgs.openssl}/bin/openssl rand -base64 24 > "$password_file"
                chmod 0600 "$password_file"
              fi
              password="$(cat "$password_file")"
            fi

            printf 'PASSWORD=%s\n' "$password" > "$env_file"
            chmod 0600 "$env_file"
          else
            rm -f "$env_file"
          fi
        '';
        EnvironmentFile = "-${config.nixpi-code.stateDir}/services/code/code-server.env";
        Environment = [
          "HOME=${config.nixpi-code.stateDir}/home"
          "XDG_CONFIG_HOME=${config.nixpi-code.stateDir}/home/.config"
        ];
        Restart = "on-failure";
        RestartSec = "10";
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = false;
        ReadWritePaths = [
          "${config.nixpi-code.stateDir}/home"
          "${config.nixpi-code.stateDir}/services/code"
          config.nixpi-code.workspaceDir
        ];
      };
    };
  };
}
