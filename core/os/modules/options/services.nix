{ lib, ... }:

let
  mkPortOption = default: description:
    lib.mkOption {
      type = lib.types.port;
      inherit default description;
    };
in
{
  options.nixpi.services = {
    bindAddress = lib.mkOption {
      type = lib.types.str;
      default = "0.0.0.0";
      description = ''
        Bind address used by the built-in NixPI service surface.
      '';
    };

    home = {
      enable = lib.mkEnableOption "NixPI Chat service" // { default = true; };
      port = mkPortOption 8080 "TCP port for the NixPI Chat server.";
    };

    secureWeb = {
      enable = lib.mkEnableOption "canonical HTTPS gateway for NixPI Chat" // { default = true; };
      port = mkPortOption 443 "TCP port for the canonical HTTPS NixPI entry point.";
    };
  };
}
