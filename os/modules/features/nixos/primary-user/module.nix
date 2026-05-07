{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.ownloom.primaryUser;
  userName = config.ownloom.human.name;
  userHome = config.ownloom.human.homeDirectory;
  hasPasswordSecret = builtins.hasAttr cfg.password.sopsSecretName config.sops.secrets;
in {
  imports = [../paths/module.nix];

  options.ownloom.primaryUser = {
    enable = lib.mkEnableOption "the primary Ownloom normal user" // {default = true;};

    description = lib.mkOption {
      type = lib.types.str;
      default = config.ownloom.owner.displayName;
      defaultText = lib.literalExpression "config.ownloom.owner.displayName";
      description = "GECOS description for the primary Ownloom user.";
    };

    extraGroups = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = ["wheel" "git"];
      description = "Supplementary groups for the primary Ownloom user.";
    };

    authorizedKeys = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = config.ownloom.owner.sshKeys;
      defaultText = lib.literalExpression "config.ownloom.owner.sshKeys";
      description = "SSH public keys authorized for the primary Ownloom user.";
    };

    shell = lib.mkOption {
      type = lib.types.package;
      default = pkgs.bashInteractive;
      description = "Login shell package for the primary Ownloom user.";
    };

    password = {
      mode = lib.mkOption {
        type = lib.types.enum ["locked" "hashed" "sops"];
        default = "locked";
        description = ''
          Password provisioning mode for the primary Ownloom user.

          - locked: disable password login by setting a locked password hash.
          - hashed: use ownloom.primaryUser.password.hashedPassword directly.
          - sops: read the hash from a sops-nix secret.
        '';
      };

      hashedPassword = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Native NixOS password hash used when ownloom.primaryUser.password.mode = \"hashed\".";
      };

      sopsSecretName = lib.mkOption {
        type = lib.types.str;
        default = "${userName}_hashed_password";
        defaultText = lib.literalExpression ''"''${config.ownloom.human.name}_hashed_password"'';
        description = "sops-nix secret name containing the user's hashed password when password.mode = \"sops\".";
      };
    };

    sudo = {
      mode = lib.mkOption {
        type = lib.types.enum ["passwordless" "allowlist" "password"];
        default = "passwordless";
        description = ''
          Sudo policy for the primary Ownloom user.

          - passwordless: allow all sudo commands with NOPASSWD.
          - allowlist: allow only sudo.allowlistCommands with NOPASSWD.
          - password: do not install a NOPASSWD rule.
        '';
      };

      allowlistCommands = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [
          "/run/current-system/sw/bin/nixos-rebuild"
          "/run/current-system/sw/bin/systemctl"
          "/run/current-system/sw/bin/nix-collect-garbage"
          "/run/wrappers/bin/reboot"
          "/run/wrappers/bin/poweroff"
        ];
        description = "Commands the primary user may run through sudo without a password when sudo.mode = \"allowlist\".";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion =
          !config.services.openssh.enable
          || cfg.authorizedKeys != []
          || config.services.openssh.settings.PasswordAuthentication or false
          || config.services.openssh.settings.KbdInteractiveAuthentication or false;
        message = "OpenSSH is enabled for the primary Ownloom user, but no SSH keys are configured and password authentication is disabled. Set ownloom.owner.sshKeys or disable OpenSSH for generic builds.";
      }
      {
        assertion = cfg.password.mode != "hashed" || cfg.password.hashedPassword != null;
        message = "ownloom.primaryUser.password.hashedPassword must be set when password.mode = \"hashed\".";
      }
      {
        assertion = cfg.password.mode != "sops" || hasPasswordSecret;
        message = "${cfg.password.sopsSecretName} must be provided through sops-nix when password.mode = \"sops\".";
      }
      {
        assertion = cfg.password.mode != "locked" || cfg.sudo.mode != "password";
        message = "Locked primary user password cannot be paired with password-based sudo; use sudo.mode = \"passwordless\" or \"allowlist\".";
      }
    ];

    users.users.${userName} =
      {
        isNormalUser = true;
        inherit (cfg) description;
        home = userHome;
        extraGroups =
          cfg.extraGroups
          ++ lib.optionals config.networking.networkmanager.enable ["networkmanager"];
        inherit (cfg) shell;
        openssh.authorizedKeys.keys = cfg.authorizedKeys;
      }
      // lib.optionalAttrs (cfg.password.mode == "locked") {
        hashedPassword = "!";
      }
      // lib.optionalAttrs (cfg.password.mode == "hashed") {
        inherit (cfg.password) hashedPassword;
      }
      // lib.optionalAttrs (cfg.password.mode == "sops" && hasPasswordSecret) {
        hashedPasswordFile = config.sops.secrets.${cfg.password.sopsSecretName}.path;
      };

    # Short global timestamp so sudo -n works across sessions.
    security.sudo.extraConfig = ''
      Defaults timestamp_type=global
      Defaults timestamp_timeout=1
    '';

    security.sudo.extraRules = lib.optionals (cfg.sudo.mode != "password") [
      {
        users = [userName];
        commands =
          if cfg.sudo.mode == "passwordless"
          then [
            {
              command = "ALL";
              options = ["NOPASSWD"];
            }
          ]
          else
            map (command: {
              inherit command;
              options = ["NOPASSWD"];
            })
            cfg.sudo.allowlistCommands;
      }
    ];
  };
}
