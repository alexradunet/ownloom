# core/os/hosts/rpi5.nix
# NixPI profile for Raspberry Pi 5 (BCM2712, aarch64-linux).
# The nixos-hardware module (raspberry-pi-5) is imported in flake.nix.
# Boot: generic-extlinux-compatible. No UEFI/systemd-boot.
{ lib, config, ... }:

{
  imports = [
    ../modules
  ];

  system.stateVersion = "25.05";

  boot.loader.grub.enable = false;
  boot.loader.generic-extlinux-compatible.enable = true;

  # Serial console on UART0 for headless access.
  boot.kernelParams = [ "console=tty1" "console=ttyAMA0,115200" ];
  systemd.services."serial-getty@ttyAMA0".enable = lib.mkDefault true;

  nixpi.security.ssh.passwordAuthentication = lib.mkDefault true;
  nixpi.bootstrap.keepSshAfterSetup = lib.mkDefault true;
  nixpi.primaryUser = lib.mkDefault "pi";

  time.timeZone = config.nixpi.timezone;
  i18n.defaultLocale = "en_US.UTF-8";
  networking.networkmanager.enable = true;
  services.xserver.xkb = { layout = config.nixpi.keyboard; variant = ""; };
  console.keyMap = config.nixpi.keyboard;
  networking.hostName = lib.mkDefault "nixpi";

  fileSystems."/" = lib.mkDefault {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
  };
  fileSystems."/boot" = lib.mkDefault {
    device = "/dev/disk/by-label/BOOT";
    fsType = "vfat";
  };
}
