{lib, ...}: {
  imports = [
    ../common/module.nix
    ../primary-user/module.nix
    ../service-openssh/module.nix
  ];

  ownloom.role = lib.mkOverride 900 "server";
}
