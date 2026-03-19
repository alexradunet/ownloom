# core/os/modules/app.nix
{ pkgs, lib, appPackage, piAgent, ... }:

{
  environment.systemPackages = [ appPackage piAgent ];

  systemd.tmpfiles.rules = [
    "L+ /usr/local/share/nixpi - - - - ${appPackage}/share/nixpi"
    "d /etc/nixpi/appservices 0755 root root -"
  ];

  systemd.user.services.pi-daemon = {
    description = "nixPI Pi Daemon (Matrix room agent)";
    wantedBy = [ "default.target" ];

    unitConfig.ConditionPathExists = "%h/.nixpi/.setup-complete";

    serviceConfig = {
      Type       = "simple";
      ExecStart  = "${pkgs.nodejs}/bin/node /usr/local/share/nixpi/dist/core/daemon/index.js";
      Environment = [
        "HOME=%h"
        "NIXPI_DIR=%h/nixPI"
        "PATH=${lib.makeBinPath [ piAgent pkgs.nodejs ]}:/run/current-system/sw/bin"
      ];
      Restart    = "on-failure";
      RestartSec = 15;
    };
  };
}
