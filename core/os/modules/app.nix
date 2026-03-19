# core/os/modules/app.nix
{ pkgs, lib, config, appPackage, piAgent, ... }:

let
  mkService = import ../lib/mk-service.nix { inherit lib; };
  primaryUser = config.nixpi.primaryUser;
  primaryHome =
    if config.nixpi.primaryHome != ""
    then config.nixpi.primaryHome
    else "/home/${primaryUser}";
  serviceUser = config.nixpi.serviceUser;
  stateDir = config.nixpi.stateDir;
  serviceHome = "${stateDir}/home";
  agentStateDir = "${stateDir}/agent";
in

{
  imports = [ ./options.nix ];

  environment.systemPackages = [ appPackage piAgent ];

  users.groups.${serviceUser} = {};
  users.users.${serviceUser} = {
    isSystemUser = true;
    group = serviceUser;
    home = serviceHome;
    createHome = true;
  };

  systemd.tmpfiles.rules = [
    "L+ /usr/local/share/nixpi - - - - ${appPackage}/share/nixpi"
    "d /etc/nixpi/appservices 0755 root root -"
    "d ${stateDir} 0770 ${serviceUser} ${serviceUser} -"
    "d ${serviceHome} 0770 ${serviceUser} ${serviceUser} -"
    "d ${agentStateDir} 0770 ${serviceUser} ${serviceUser} -"
    "d ${stateDir}/pi-daemon 0770 ${serviceUser} ${serviceUser} -"
    "d ${stateDir}/services 0770 ${serviceUser} ${serviceUser} -"
    "d ${stateDir}/services/home 0770 ${serviceUser} ${serviceUser} -"
    "d ${stateDir}/services/chat 0770 ${serviceUser} ${serviceUser} -"
    "d ${stateDir}/services/code 0770 ${serviceUser} ${serviceUser} -"
    "d ${stateDir}/services/files 0770 ${serviceUser} ${serviceUser} -"
  ];

  system.activationScripts.nixpi-app = lib.stringAfter [ "users" ] ''
    primary_group="$(id -gn ${primaryUser})"

    install -d -m 0755 -o ${primaryUser} -g "$primary_group" ${primaryHome}
    install -d -m 2775 -o ${primaryUser} -g ${serviceUser} ${primaryHome}/nixPI
    install -d -m 2775 -o ${primaryUser} -g ${serviceUser} ${primaryHome}/Public
    install -d -m 2775 -o ${primaryUser} -g ${serviceUser} ${primaryHome}/Public/nixPI
    install -d -m 0755 -o ${serviceUser} -g ${serviceUser} ${serviceHome}
    install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${agentStateDir}
    install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/pi-daemon
    install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/home
    install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/chat
    install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/code
    install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/files

    if [ -d ${primaryHome}/.pi ] && [ ! -L ${primaryHome}/.pi ] && [ ! -e ${agentStateDir}/.migration-complete ]; then
      cp -a ${primaryHome}/.pi/. ${agentStateDir}/
      touch ${agentStateDir}/.migration-complete
    fi

    ln -sfn ${agentStateDir} ${primaryHome}/.pi
    chown -h ${primaryUser}:"$primary_group" ${primaryHome}/.pi

    ln -sfn ${agentStateDir} ${serviceHome}/.pi
    chown -h ${serviceUser}:${serviceUser} ${serviceHome}/.pi
  '';

  systemd.services.pi-daemon = mkService {
    description = "nixPI Pi Daemon (Matrix room agent)";
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    unitConfig.ConditionPathExists = "${primaryHome}/.nixpi/.setup-complete";
    execStart = "${pkgs.nodejs}/bin/node /usr/local/share/nixpi/dist/core/daemon/index.js";
    workingDirectory = "${primaryHome}/nixPI";
    environment = [
      "HOME=${serviceHome}"
      "NIXPI_DIR=${primaryHome}/nixPI"
      "NIXPI_STATE_DIR=${stateDir}"
      "NIXPI_PI_DIR=${agentStateDir}"
      "NIXPI_DAEMON_STATE_DIR=${stateDir}/pi-daemon"
      "NIXPI_PRIMARY_USER=${primaryUser}"
      "NIXPI_PRIMARY_HOME=${primaryHome}"
      "PATH=${lib.makeBinPath [ piAgent pkgs.nodejs ]}:/run/current-system/sw/bin"
    ];
    restart = "on-failure";
    restartSec = 15;
    protectHome = false;
    readWritePaths = [ "${stateDir}" "${primaryHome}/nixPI" ];
    serviceConfig = {
      User = serviceUser;
      Group = serviceUser;
      UMask = "0007";
    };
  };
}
