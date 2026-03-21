{ pkgs, lib, config, ... }:

let
  stateDir = config.nixpi.stateDir;
  marker = "${stateDir}/bootstrap/full-appliance-switched";
  statusFile = "${stateDir}/bootstrap/full-appliance-upgrade.status";
  logFile = "${stateDir}/bootstrap/full-appliance-upgrade.log";
  bootstrapUpgrade = pkgs.writeShellScript "nixpi-bootstrap-upgrade" ''
    set -euo pipefail

    write_status() {
      umask 022
      printf '%s %s\n' "$(date -Iseconds)" "$1" > "${statusFile}"
    }

    if [ -f "${marker}" ]; then
      write_status "Full appliance already installed."
      exit 0
    fi

    mkdir -p "$(dirname "${marker}")"
    : > "${logFile}"
    chmod 0644 "${logFile}"
    write_status "Preparing first-boot promotion to the full NixPI appliance..."

    trap 'write_status "Promotion failed. Review ${logFile} or journalctl -u nixpi-bootstrap-upgrade.service."' ERR

    echo "[$(date -Iseconds)] Starting nixos-rebuild switch for /etc/nixos#${config.networking.hostName}" | tee -a "${logFile}"
    write_status "Building and activating the full NixPI appliance. This can take several minutes..."

    if /run/current-system/sw/bin/nixos-rebuild switch --flake /etc/nixos#${config.networking.hostName} 2>&1 | tee -a "${logFile}"; then
      touch "${marker}"
      write_status "Full NixPI appliance installed successfully."
    fi
  '';
in
{
  imports = [ ./options.nix ];

  systemd.tmpfiles.rules = [
    "d ${stateDir}/bootstrap 0755 root root -"
  ];

  systemd.services.nixpi-bootstrap-upgrade = {
    description = "Promote the minimal installed base into the standard NixPI appliance";
    wantedBy = [ "multi-user.target" ];
    wants = [ "network-online.target" ];
    after = [ "network-online.target" ];
    unitConfig.ConditionPathExists = "!${marker}";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = bootstrapUpgrade;
      RemainAfterExit = true;
    };
  };
}
