# core/os/modules/bloom-network.nix
{ pkgs, lib, ... }:

{
  config = {
    # Enable all firmware for maximum hardware compatibility.
    # This ensures WiFi, Bluetooth, and other hardware works out of the box
    # on the widest range of devices (Intel, Broadcom, Realtek, Atheros, etc.)
    hardware.enableAllFirmware = true;
    services.netbird.enable = true;

    services.openssh = {
      enable = true;
      settings = {
        PasswordAuthentication = true;
        PubkeyAuthentication = "yes";
        PermitRootLogin = "no";
      };
    };

    networking.firewall.trustedInterfaces = [ "wt0" ];
    networking.networkmanager.enable = true;

    environment.etc."bloom/fluffychat-web".source = pkgs.fluffychat-web;

    environment.systemPackages = with pkgs; [
      git git-lfs gh
      ripgrep fd bat htop jq curl wget unzip openssl
      just shellcheck biome typescript
      qemu OVMF
      chromium
      netbird
      # optional services (installed on demand by the wizard)
      dufs nginx
    ];
  };
}
