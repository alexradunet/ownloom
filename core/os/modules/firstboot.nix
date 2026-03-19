# core/os/modules/firstboot.nix
{ config, pkgs, lib, ... }:

let
  primaryUser = config.nixpi.primaryUser;
  primaryHome =
    if config.nixpi.primaryHome != ""
    then config.nixpi.primaryHome
    else "/home/${primaryUser}";
  stateDir = config.nixpi.stateDir;
in
{
  imports = [ ./options.nix ];

  systemd.services.nixpi-firstboot = {
    description = "nixPI First-Boot Setup";
    wantedBy = [ "multi-user.target" ];
    after = [
      "network-online.target"
      "matrix-synapse.service"
      "netbird.service"
      "pi-daemon.service"
      "nixpi-home.service"
      "nixpi-chat.service"
      "nixpi-files.service"
      "nixpi-code.service"
    ];
    wants = [
      "network-online.target"
      "matrix-synapse.service"
      "netbird.service"
      "pi-daemon.service"
      "nixpi-home.service"
      "nixpi-chat.service"
      "nixpi-files.service"
      "nixpi-code.service"
    ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      User = primaryUser;
      ExecStart = "${pkgs.bash}/bin/bash ${../../scripts/firstboot.sh}";
      StandardOutput = "journal";
      StandardError = "journal";
      Environment = [
        "HOME=${primaryHome}"
        "NIXPI_DIR=${primaryHome}/nixPI"
        "NIXPI_STATE_DIR=${stateDir}"
        "NIXPI_PI_DIR=${stateDir}/agent"
        "NIXPI_CONFIG_DIR=${stateDir}/services"
      ];
      SuccessExitStatus = "0 1";
    };
    unitConfig.ConditionPathExists = "!${primaryHome}/.nixpi/.setup-complete";
  };

  security.sudo.extraRules = [
    {
      users = [ primaryUser ];
      commands = [
        { command = "/run/current-system/sw/bin/cat /var/lib/matrix-synapse/registration_shared_secret"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/journalctl -u matrix-synapse --no-pager"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/netbird up --setup-key *"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl * netbird.service"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl * pi-daemon.service"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl * nixpi-home.service"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl * nixpi-chat.service"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl * nixpi-files.service"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl * nixpi-code.service"; options = [ "NOPASSWD" ]; }
      ];
    }
  ];
}
