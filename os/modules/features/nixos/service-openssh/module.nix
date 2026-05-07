{
  config,
  lib,
  ...
}: let
  cfg = config.nixpi.openssh;
in {
  imports = [../nixpi-paths/module.nix];

  options.nixpi.openssh = {
    extraTrustedIps = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = ''
        Additional IPs or CIDRs exempt from fail2ban banning.
        Useful for a residential static IP or a trusted egress address.
        Do not put these in tracked config if the value is sensitive
        (e.g. use hosts/*/secrets.private.nix instead).
      '';
    };
  };

  config = {
    programs.ssh.systemd-ssh-proxy.enable = false;

    services.openssh = {
      enable = true;
      ports = [22 2222];
      settings = {
        PermitRootLogin = "no";
        PasswordAuthentication = false;
        KbdInteractiveAuthentication = false;
        MaxStartups = "10:30:60";
        PerSourceMaxStartups = 3;
        PerSourceNetBlockSize = "32:128";
        PerSourcePenalties = "authfail:30s noauth:30s grace-exceeded:10s max:10m";
      };
    };

    services.fail2ban = {
      enable = true;
      bantime = "1h";
      bantime-increment = {
        enable = true;
        maxtime = "24h";
        overalljails = true;
      };
      maxretry = 5;
      ignoreIP =
        [
          "127.0.0.1/8"
          "::1"
        ]
        ++ cfg.extraTrustedIps;
      jails.sshd.settings = {
        enabled = true;
        filter = "sshd";
        port = "ssh,2222";
        mode = "aggressive";
      };
    };

    networking.nftables.enable = lib.mkDefault true;
  };
}
