{
  inputs,
  lib,
  pkgs,
}: let
  vps = inputs.self.nixosConfigurations.nixpi-vps;
  expectedPiExtensions = [
    "nixpi"
  ];
  expectedPiPackages = [
    "git:github.com/aliou/pi-synthetic@v0.15.0"
  ];
  assertFleet = name: host: let
    userHome = host.config.nixpi.human.homeDirectory;
  in
    assert lib.asserts.assertMsg (host.config.environment.sessionVariables.NIXPI_ROOT == "${userHome}/NixPI") "${name} must export NIXPI_ROOT";
    assert lib.asserts.assertMsg (host.config.environment.sessionVariables.NIXPI_WIKI_ROOT == "${userHome}/wiki") "${name} must export the NixPI wiki root as ~/wiki";
    assert lib.asserts.assertMsg (host.config.environment.sessionVariables.NIXPI_WIKI_WORKSPACE == "nixpi") "${name} must export the NixPI NixPI wiki workspace label"; true;
  assertHost = name: host: let
    activationText = host.config.system.activationScripts.nixpi-pi-settings.text or "";
    userHome = host.config.nixpi.human.homeDirectory;
    hasPackage = packageName: lib.any (package: lib.getName package == packageName) host.config.environment.systemPackages;
    gatewayEnabled = host.config.services.nixpi-gateway.enable or false;
    gatewayPiAgentDir = host.config.services.nixpi-gateway.settings.pi.agentDir or "";
    gatewayServiceConfig = host.config.systemd.services.nixpi-gateway.serviceConfig or {};
  in
    assert lib.asserts.assertMsg (host.config.system.build.toplevel.drvPath != "") "${name} toplevel must evaluate";
    assert lib.asserts.assertMsg host.config.services.userborn.enable "${name} must use Userborn";
    assert lib.asserts.assertMsg host.config.boot.initrd.systemd.enable "${name} must use systemd initrd";
    assert lib.asserts.assertMsg host.config.system.etc.overlay.enable "${name} must use the /etc overlay";
    assert lib.asserts.assertMsg host.config.system.nixos-init.enable "${name} must enable nixos-init";
    assert lib.asserts.assertMsg (builtins.hasAttr "safe" host.config.specialisation) "${name} must expose the safe specialisation";
    assert lib.asserts.assertMsg (!host.config.specialisation.safe.configuration.system.nixos-init.enable) "${name} safe specialisation must disable nixos-init";
    assert lib.asserts.assertMsg (host.config.nixpi.pi.extensions == expectedPiExtensions) "${name} must declare the shared PI extension set";
    assert lib.asserts.assertMsg (host.config.nixpi.pi.packages == expectedPiPackages) "${name} must declare the shared PI package set";
    assert lib.asserts.assertMsg (host.config.nixpi.role != "common") "${name} must declare a concrete role";
    assert lib.asserts.assertMsg (host.config.nixpi.role == "server" -> !hasPackage "chromium") "${name} server role must not inherit desktop browser packages";
    assert lib.asserts.assertMsg (host.config.nixpi.role != "server" -> (hasPackage "chromium" || hasPackage "firefox")) "${name} desktop-capable role must keep desktop browser packages";
    assert lib.asserts.assertMsg (!gatewayEnabled || gatewayPiAgentDir == "${userHome}/.pi/agent") "${name} gateway must use the normal Pi SDK agent directory";
    assert lib.asserts.assertMsg (!gatewayEnabled || gatewayServiceConfig.UMask == "0077") "${name} gateway must use private file creation mask";
    assert lib.asserts.assertMsg (!gatewayEnabled || gatewayServiceConfig.StateDirectoryMode == "0700") "${name} gateway state directory must be private";
    assert lib.asserts.assertMsg (activationText != "") "${name} must define the PI activation script";
    assert lib.asserts.assertMsg (lib.hasInfix "${userHome}/.pi/agent/settings.json" activationText) "${name} PI activation must manage settings.json";
    assert lib.asserts.assertMsg (lib.hasInfix "nixpi-pi-settings.json" activationText) "${name} PI activation must consume generated declarative settings";
    assert assertFleet name host; true;
in
  assert assertHost "nixpi-vps" vps;
    pkgs.runCommand "nixpi-host-configurations-eval" {} ''
      touch $out
    ''
