# core/os/hosts/x86_64-installer.nix
# Graphical installer ISO configuration for Bloom OS.
# Uses Calamares GUI installer with LXQt desktop.
# Custom calamares-nixos-extensions override provides Bloom-specific wizard pages.
{ lib, modulesPath, ... }:

{
  imports = [
    # Calamares + GNOME installer base (provides Calamares, display manager, etc.)
    # We override the desktop to LXQt below.
    "${modulesPath}/installer/cd-dvd/installation-cd-graphical-calamares-gnome.nix"

    # LXQt desktop configuration
    ../modules/bloom-desktop.nix
  ];

  # Replace upstream calamares-nixos-extensions with our custom Bloom version.
  # Use prev.callPackage so package.nix receives the pre-overlay pkgs and the
  # pre-overlay calamares-nixos-extensions — prevents infinite recursion.
  nixpkgs.overlays = [
    (final: prev: {
      calamares-nixos-extensions = prev.callPackage ../../calamares/package.nix {
        upstreamCalamares = prev.calamares-nixos-extensions;
      };
    })
  ];

  # Override: Use LXQt instead of GNOME
  services.desktopManager.gnome.enable = lib.mkForce false;
  services.displayManager.gdm.enable   = lib.mkForce false;

  # Ensure LightDM for LXQt
  services.xserver.displayManager.lightdm.enable = lib.mkDefault true;

  # ISO-specific settings
  isoImage.volumeID  = lib.mkDefault "BLOOM_INSTALLER";
  image.fileName     = lib.mkDefault "bloom-os-installer.iso";

  boot.kernelParams = [
    "copytoram"
    "quiet"
    "splash"
  ];

  environment.etc."issue".text = ''
    Welcome to Bloom OS Installer!

    Double-click the desktop icon to launch the installer.

    For help, visit: https://github.com/alexradunet/piBloom

  '';

  programs.firefox.preferences = {
    "browser.startup.homepage" = "https://github.com/alexradunet/piBloom";
  };

  networking.hostName = lib.mkDefault "bloom-installer";

  services.libinput.enable = true;
  networking.networkmanager.enable    = true;
  networking.wireless.enable          = lib.mkForce false;
}
