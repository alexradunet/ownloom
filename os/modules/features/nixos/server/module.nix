{lib, ...}: {
  imports = [
    ../common/module.nix
    ../primary-user/module.nix
    ../service-openssh/module.nix
  ];

  nixpi.role = lib.mkOverride 900 "server";
}
