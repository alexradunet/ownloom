# Disko layout: UEFI GPT, 1 GiB EFI partition, ext4 root, swap partition.
# @DISK@ and @SWAP_SIZE@ are substituted by the installer script at runtime.
{ ... }:
{
  disko.devices = {
    disk.main = {
      device = "@DISK@";
      type = "disk";
      content = {
        type = "gpt";
        partitions = {
          ESP = {
            size = "1G";
            type = "EF00";
            content = {
              type = "filesystem";
              format = "vfat";
              mountpoint = "/boot";
              mountOptions = [ "umask=0077" ];
            };
          };
          root = {
            size = "100%";
            end = "-@SWAP_SIZE@";
            content = {
              type = "filesystem";
              format = "ext4";
              mountpoint = "/";
              extraArgs = [ "-L" "nixos" ];
            };
          };
          swap = {
            size = "@SWAP_SIZE@";
            content = {
              type = "swap";
            };
          };
        };
      };
    };
  };
}
