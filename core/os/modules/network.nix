# core/os/modules/network.nix
{ lib, config, ... }:

let
  primaryUser = config.nixpi.primaryUser;
  securityCfg = config.nixpi.security;
  bootstrapCfg = config.nixpi.bootstrap;
  allowedSourceCIDRs = securityCfg.ssh.allowedSourceCIDRs;
  isDigits = value: builtins.match "^[0-9]+$" value != null;
  parseInt = value: builtins.fromJSON value;
  hasValidPrefix =
    max: prefix:
    if isDigits prefix then
      let
        prefixInt = parseInt prefix;
      in
      prefixInt >= 0 && prefixInt <= max
    else
      false;
  isValidIPv4CIDR =
    cidr:
    let
      parts = lib.splitString "/" cidr;
    in
    builtins.length parts == 2
    && (
      let
        address = builtins.elemAt parts 0;
        prefix = builtins.elemAt parts 1;
        octets = lib.splitString "." address;
      in
      builtins.length octets == 4
      && hasValidPrefix 32 prefix
      && builtins.all (
        octet:
        if isDigits octet then
          let
            octetInt = parseInt octet;
          in
          octetInt >= 0 && octetInt <= 255
        else
          false
      ) octets
    );
  ipv6Segments = part: if part == "" then [ ] else lib.splitString ":" part;
  isValidIPv6Hextet = hextet: builtins.match "^[0-9A-Fa-f]{1,4}$" hextet != null;
  isValidIPv6CIDR =
    cidr:
    let
      parts = lib.splitString "/" cidr;
    in
    builtins.length parts == 2
    && (
      let
        address = builtins.elemAt parts 0;
        prefix = builtins.elemAt parts 1;
        compressionParts = lib.splitString "::" address;
        compressionCount = builtins.length compressionParts - 1;
        segments = builtins.concatLists (map ipv6Segments compressionParts);
      in
      lib.hasInfix ":" address
      && compressionCount <= 1
      && hasValidPrefix 128 prefix
      && builtins.all isValidIPv6Hextet segments
      && (if compressionCount == 0 then builtins.length segments == 8 else builtins.length segments < 8)
    );
  isValidSourceCIDR = cidr: isValidIPv4CIDR cidr || isValidIPv6CIDR cidr;
  invalidAllowedSourceCIDRs = lib.filter (cidr: !(isValidSourceCIDR cidr)) allowedSourceCIDRs;
  sshAllowUsers =
    if securityCfg.ssh.allowUsers != [ ] then
      securityCfg.ssh.allowUsers
    else
      lib.optional (primaryUser != "") primaryUser;
  publicSshEnabled = bootstrapCfg.ssh.enable;
  ipv4AllowedSourceCIDRs = lib.filter (cidr: !(lib.hasInfix ":" cidr)) allowedSourceCIDRs;
  ipv6AllowedSourceCIDRs = lib.filter (cidr: lib.hasInfix ":" cidr) allowedSourceCIDRs;
  sshFirewallRules = lib.concatStringsSep "\n" (
    (map (cidr: "ip saddr ${cidr} tcp dport 22 accept") ipv4AllowedSourceCIDRs)
    ++ (map (cidr: "ip6 saddr ${cidr} tcp dport 22 accept") ipv6AllowedSourceCIDRs)
  );
in

{
  imports = [ ./options.nix ];

  config = {
    assertions = [
      {
        assertion = securityCfg.trustedInterface != "";
        message = "nixpi.security.trustedInterface must not be empty.";
      }
      {
        assertion = !securityCfg.ssh.passwordAuthentication;
        message = ''
          nixpi.security.ssh.passwordAuthentication must remain false. NixPI's
          public SSH model is key-only during both bootstrap and steady state.
        '';
      }
      {
        assertion = !bootstrapCfg.ssh.enable || allowedSourceCIDRs != [ ];
        message = "nixpi.security.ssh.allowedSourceCIDRs must be set when bootstrap SSH is enabled.";
      }
      {
        assertion = !config.services.openssh.enable || allowedSourceCIDRs != [ ];
        message = "nixpi.security.ssh.allowedSourceCIDRs must be set when public SSH is enabled.";
      }
      {
        assertion = invalidAllowedSourceCIDRs == [ ];
        message = ''
          nixpi.security.ssh.allowedSourceCIDRs contains invalid CIDR entries:
          ${lib.concatStringsSep ", " invalidAllowedSourceCIDRs}
        '';
      }
    ];

    hardware.enableAllFirmware = true;

    services.openssh = {
      enable = publicSshEnabled;
      openFirewall = false;
      settings = {
        AllowAgentForwarding = false;
        AllowTcpForwarding = false;
        ClientAliveCountMax = 2;
        ClientAliveInterval = 300;
        LoginGraceTime = 30;
        MaxAuthTries = 3;
        PasswordAuthentication = false;
        PubkeyAuthentication = "yes";
        PermitRootLogin = "no";
        X11Forwarding = false;
      };
      extraConfig = lib.optionalString (sshAllowUsers != [ ]) ''
        AllowUsers ${lib.concatStringsSep " " sshAllowUsers}
      '';
    };

    networking.nftables.enable = true;
    networking.firewall = {
      enable = true;
      allowedTCPPorts = [ ];
      extraInputRules = lib.optionalString publicSshEnabled sshFirewallRules;
    };
    networking.useDHCP = lib.mkDefault false;
    networking.networkmanager.enable = true;

    services.fail2ban = lib.mkIf securityCfg.fail2ban.enable {
      enable = true;
      jails.sshd.settings = {
        enabled = true;
        backend = "systemd";
        bantime = "1h";
        findtime = "10m";
        maxretry = 5;
      };
    };

    systemd.tmpfiles.settings = {
      nixpi-workspace = {
        "${config.nixpi.agent.workspaceDir}".d = {
          mode = "2775";
          user = primaryUser;
          group = primaryUser;
        };
      };
    };
  };
}
