{
  inputs,
  lib,
  ...
}: {
  imports = [
    ../paths/module.nix
    ../pi-agent/module.nix
    ../service-proactive/module.nix
    ../secrets-synthetic/module.nix
    ../service-health-snapshot/module.nix
    ./packages.nix
    ./system.nix
  ];

  nixpkgs.overlays = [inputs.self.overlays.default];
  nixpkgs.config.allowUnfree = true;

  ownloom.role = lib.mkDefault "common";
}
