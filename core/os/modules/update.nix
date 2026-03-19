# core/os/modules/update.nix
{ pkgs, lib, config, ... }:

let
  mkService = import ../lib/mk-service.nix { inherit lib; };
  primaryUser = config.nixpi.primaryUser;
  primaryHome =
    if config.nixpi.primaryHome != ""
    then config.nixpi.primaryHome
    else "/home/${primaryUser}";
in

{
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  assertions = [
    {
      assertion = config.nixpi.update.onBootSec != "";
      message = "nixpi.update.onBootSec must not be empty.";
    }
    {
      assertion = config.nixpi.update.interval != "";
      message = "nixpi.update.interval must not be empty.";
    }
  ];

  systemd.services.nixpi-update = mkService {
    description = "nixPI NixOS update";
    serviceType = "oneshot";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    execStart = pkgs.writeShellScript "nixpi-update" (builtins.readFile ../../../core/scripts/system-update.sh);
    environment = [
        "PATH=/run/current-system/sw/bin:${lib.makeBinPath (with pkgs; [ nix git jq ])}"
        "NIXPI_PRIMARY_USER=${primaryUser}"
        "NIXPI_PRIMARY_HOME=${primaryHome}"
      ];
    hardening = false;
    serviceConfig.RemainAfterExit = false;
  };

  systemd.timers.nixpi-update = {
    description = "nixPI update check timer";
    wantedBy    = [ "timers.target" ];

    timerConfig = {
      OnBootSec        = config.nixpi.update.onBootSec;
      OnUnitActiveSec  = config.nixpi.update.interval;
      Persistent       = true;
    };
  };
}
