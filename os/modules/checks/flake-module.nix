{
  inputs,
  lib,
  ...
}: {
  perSystem = {
    pkgs,
    system,
    ...
  }: {
    checks = {
      formatting =
        pkgs.runCommand "formatting-check" {
          nativeBuildInputs = [pkgs.alejandra];
        } ''
          cd ${../../..}

          find . -type f -name '*.nix' -print0 \
            | xargs -0 alejandra --check

          touch $out
        '';

      deadnix =
        pkgs.runCommand "deadnix-check" {
          nativeBuildInputs = [pkgs.deadnix];
        } ''
          cd ${../../..}
          deadnix --fail .
          touch $out
        '';

      statix =
        pkgs.runCommand "statix-check" {
          nativeBuildInputs = [pkgs.statix];
        } ''
          cd ${../../..}
          statix check .
          touch $out
        '';

      nixpi-purity-check = pkgs.callPackage ./source/purity.nix {};
      nixpi-wiki-stale-identities = pkgs.callPackage ./source/wiki-stale-identities.nix {};
      nixpi-wiki-adapter-api-boundary = pkgs.callPackage ./source/wiki-adapter-api-boundary.nix {};

      nixpi-wiki-npm-pack-smoke = pkgs.callPackage ./wiki-npm-pack-smoke.nix {};
      nixpi-pi-extension-startup-smoke = pkgs.callPackage ./smoke/pi-extension-startup.nix {};
      nixpi-wiki-cli-smoke = pkgs.callPackage ./smoke/wiki-cli.nix {};

      # Build package derivations in flake checks so their package-local test suites run.
      nixpi-wiki-package = pkgs.nixpi-wiki;
      nixpi-gateway-package = pkgs.nixpi-gateway;
      nixpi-planner-package = pkgs.nixpi-planner;

      nixpi-gateway-module-eval = import ./eval/gateway-module.nix {inherit inputs lib pkgs system;};
      nixpi-openssh-native-abuse-eval = import ./eval/openssh-native-abuse.nix {inherit inputs lib pkgs system;};
      nixpi-vps-security-eval = import ./eval/vps-security.nix {inherit inputs lib pkgs;};
      nixpi-host-configurations-eval = import ./eval/host-configurations.nix {inherit inputs lib pkgs;};

      # NixOS integration tests (pkgs.testers.runNixOSTest).
      nixos-planner-radicale = import ./nixos-tests/planner-radicale.nix {inherit lib pkgs;};
      nixos-ollama-smoke = import ./nixos-tests/ollama-smoke.nix {inherit lib pkgs;};
      nixos-planner-pi-e2e = import ./nixos-tests/planner-pi-e2e.nix {inherit lib pkgs;};
      nixos-gateway-loopback = import ./nixos-tests/gateway-loopback.nix {inherit lib pkgs;};
      nixos-nixpi-services-boot-smoke = import ./nixos-tests/services-boot-smoke.nix {inherit lib pkgs;};
    };
  };
}
