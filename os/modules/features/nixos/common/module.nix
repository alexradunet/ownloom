{
  inputs,
  lib,
  ...
}: {
  imports = [
    ../nixpi-paths/module.nix
    ../pi-agent/module.nix
    ../service-nixpi-proactive/module.nix
    ../secrets-synthetic/module.nix
    ../service-nixpi-health-snapshot/module.nix
    ./packages.nix
    ./system.nix
  ];

  nixpkgs.overlays = [inputs.self.overlays.default];
  nixpkgs.config.allowUnfree = true;

  nixpi.role = lib.mkDefault "common";
}
