{ lib, ... }:

{
  options.nixpi.agent = {
    autonomy = lib.mkOption {
      type = lib.types.enum [ "observe" "maintain" "admin" ];
      default = "maintain";
      description = ''
        Default privileged autonomy level granted to the always-on agent.
      '';
    };

    allowedUnits = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [
        "netbird.service"
        "nixpi-chat.service"
        "nixpi-update.service"
      ];
      description = ''
        Systemd units that the broker may operate on.
      '';
    };

    broker.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Whether the root-owned NixPI operations broker is enabled.
      '';
    };

    elevation.duration = lib.mkOption {
      type = lib.types.str;
      default = "30m";
      description = ''
        Default duration for a temporary admin elevation grant.
      '';
    };

    osUpdate.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Whether the broker may apply or roll back NixOS generations.
      '';
    };
  };
}
