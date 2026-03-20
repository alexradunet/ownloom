# core/os/modules/firstboot.nix
{ config, pkgs, lib, ... }:

let
  resolved = import ../lib/resolve-primary-user.nix { inherit lib config; };
  primaryUser = resolved.resolvedPrimaryUser;
  primaryHome = resolved.resolvedPrimaryHome;
  stateDir = config.nixpi.stateDir;
  matrixRegistrationSecretFile =
    if config.nixpi.matrix.registrationSharedSecretFile != null then
      config.nixpi.matrix.registrationSharedSecretFile
    else
      "${stateDir}/secrets/matrix-registration-shared-secret";
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

  security.sudo.extraRules = lib.optional config.nixpi.bootstrap.passwordlessSudo.enable {
    users = [ primaryUser ];
    commands = [
      { command = "/run/current-system/sw/bin/cat ${matrixRegistrationSecretFile}"; options = [ "NOPASSWD" ]; }
      { command = "/run/current-system/sw/bin/journalctl -u matrix-synapse --no-pager"; options = [ "NOPASSWD" ]; }
      { command = "/run/current-system/sw/bin/netbird up --setup-key *"; options = [ "NOPASSWD" ]; }
      { command = "/run/current-system/sw/bin/systemctl * netbird.service"; options = [ "NOPASSWD" ]; }
      { command = "/run/current-system/sw/bin/passwd ${primaryUser}"; options = [ "NOPASSWD" ]; }
      { command = "/run/current-system/sw/bin/chpasswd"; options = [ "NOPASSWD" ]; }
      { command = "/run/current-system/sw/bin/nixpi-brokerctl systemd *"; options = [ "NOPASSWD" ]; }
      { command = "/run/current-system/sw/bin/nixpi-brokerctl status"; options = [ "NOPASSWD" ]; }
    ];
  };
}
