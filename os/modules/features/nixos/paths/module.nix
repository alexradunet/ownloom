{
  config,
  lib,
  ...
}: let
  cfg = config.nixpi;
in {
  imports = [
    (lib.mkRenamedOptionModule ["nixpi" "user"] ["nixpi" "human"])
  ];

  config.environment.sessionVariables = {
    NIXPI_ROOT = cfg.root;
    NIXPI_WIKI_ROOT = cfg.wiki.root;
    NIXPI_WIKI_WORKSPACE = cfg.wiki.workspace;
    NIXPI_WIKI_DEFAULT_DOMAIN = cfg.wiki.defaultDomain;
    NIXPI_WIKI_HOST = config.networking.hostName;
  };

  options.nixpi.plannerEnvVars = lib.mkOption {
    type = lib.types.attrsOf lib.types.str;
    default = {};
    description = ''Planner environment variables for injection into Pi service environments.  Set by service-planner when the planner is enabled.'';
  };

  options.nixpi = {
    role = lib.mkOption {
      type = lib.types.enum ["common" "server" "workstation" "laptop"];
      default = "common";
      description = ''
        High-level NixPI role for this host. Role modules set this for
        diagnostics, assertions, documentation, and generated context.
      '';
    };

    human = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "human";
        description = ''
          Primary human/operator username for NixPI services and user-scoped paths.
          Hosts may override this to a real local account name such as "alex".
        '';
        example = "alex";
      };

      homeDirectory = lib.mkOption {
        type = lib.types.str;
        default = "/home/${cfg.human.name}";
        defaultText = lib.literalExpression ''"/home/${config.nixpi.human.name}"'';
        description = ''
          Home directory of the primary human/operator NixPI user.
          Defaults to /home/<nixpi.human.name>.
        '';
        example = "/home/alex";
      };
    };

    owner = {
      displayName = lib.mkOption {
        type = lib.types.str;
        default = "Human Operator";
        description = "Human-readable owner/operator name used for account descriptions and identity defaults.";
        example = "Alex";
      };

      email = lib.mkOption {
        type = lib.types.str;
        default = "";
        description = "Optional owner/operator email address for tools that need a contact identity.";
        example = "human@example.com";
      };

      sshKeys = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "SSH public keys for the owner/operator. The primary user uses these by default.";
      };
    };

    root = lib.mkOption {
      type = lib.types.str;
      default = "${cfg.human.homeDirectory}/NixPI";
      description = ''
        Absolute path to the NixPI root directory.
        All other nixpi.* paths derive from this by default.
        Change this to relocate the entire NixPI workspace.
      '';
      example = "/home/your-user/NixPI";
    };

    repos = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = {
        nixpi = cfg.root;
        os = "${cfg.root}/os";
      };
      defaultText = lib.literalExpression ''
        {
          nixpi = config.nixpi.root;
          os = "''${config.nixpi.root}/os";
        }
      '';
      description = ''
        Attribute set of absolute paths to NixPI source trees.
        Defaults derive from the root monorepo checkout.
      '';
    };

    config = lib.mkOption {
      type = lib.types.str;
      default = cfg.root;
      defaultText = lib.literalExpression "config.nixpi.root";
      description = ''
        Absolute path to the fleet configuration flake.
        This is the flake ref base for nixos-rebuild switch.
      '';
    };

    wiki = {
      root = lib.mkOption {
        type = lib.types.str;
        default = "${cfg.human.homeDirectory}/wiki";
        defaultText = lib.literalExpression ''"''${config.nixpi.human.homeDirectory}/wiki"'';
        description = ''
          Absolute path to the single Markdown wiki root. Technical and personal
          are frontmatter domains inside this root, not separate vaults.
        '';
      };

      workspace = lib.mkOption {
        type = lib.types.str;
        default = "nixpi";
        description = ''
          Wiki workspace name passed to Pi sessions and wiki tools.
        '';
      };

      defaultDomain = lib.mkOption {
        type = lib.types.str;
        default = "technical";
        description = ''
          Default wiki domain for tools when no domain is specified.
        '';
      };
    };
  };
}
