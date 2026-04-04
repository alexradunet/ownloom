# core/os/hosts/rpi4.nix
# NixPI profile for Raspberry Pi 4 (BCM2711, aarch64-linux).
# The nixos-hardware module (raspberry-pi-4) is imported in flake.nix.
# Boot: generic-extlinux-compatible (U-Boot). No UEFI/systemd-boot.
{ lib, config, ... }:

{
  imports = [
    ../modules
  ];

  system.stateVersion = "25.05";

  # Pi 4 uses generic-extlinux-compatible via the nixos-hardware module.
  # systemd-boot and EFI are not used on Pi.
  boot.loader.grub.enable = false;
  boot.loader.generic-extlinux-compatible.enable = true;

  # Serial console on UART0 (ttyAMA0) for headless access.
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
