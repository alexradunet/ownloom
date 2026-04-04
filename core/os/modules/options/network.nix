{ lib, ... }:

{
  options.nixpi = {
    netbird.ssh.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Whether to enable NetBird's built-in SSH daemon on the Pi (port 22022).
        Authentication uses NetBird peer identity (WireGuard key).
      '';
    };

    update = {
      onBootSec = lib.mkOption {
        type = lib.types.str;
        default = "5min";
        description = ''
          Delay before the first automatic update check after boot.
        '';
      };

      interval = lib.mkOption {
        type = lib.types.str;
        default = "6h";
        description = ''
          Recurrence interval for the automatic update timer.
        '';
      };
    };
  };
}
