{ config, ... }:

let
  primaryUser = config.nixpi.primaryUser;
  stateDir = config.nixpi.stateDir;
in
{
  imports = [ ../options.nix ];

  systemd.tmpfiles.settings.nixpi-bootstrap = {
    "${stateDir}/bootstrap".d = { mode = "0770"; user = primaryUser; group = primaryUser; };
  };
}
