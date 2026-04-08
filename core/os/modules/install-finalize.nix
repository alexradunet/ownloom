{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.nixpi.install;
  finalizeScript = pkgs.writeShellScript "nixpi-install-finalize" ''
    exec ${../../scripts/nixpi-install-finalize.sh} \
      ${lib.escapeShellArg cfg.repoUrl} \
      ${lib.escapeShellArg cfg.repoBranch} \
      ${lib.escapeShellArg config.nixpi.primaryUser} \
      ${lib.escapeShellArg config.networking.hostName} \
      ${lib.escapeShellArg config.nixpi.timezone} \
      ${lib.escapeShellArg config.nixpi.keyboard}
  '';
in
{
  imports = [ ./options.nix ];

  config = lib.mkIf cfg.enable {
    systemd.services.nixpi-install-finalize = {
      description = "Seed /srv/nixpi and initialize /etc/nixos/flake.nix";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        User = "root";
      };
      path = with pkgs; [
        bash
        coreutils
        git
      ];
      script = ''
        ${finalizeScript}
      '';
    };
  };
}
