{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.nixpi.pi;
  userName = config.nixpi.human.name;
  userHome = config.nixpi.human.homeDirectory;
  userGroup = config.users.users.${userName}.group or "users";

  extensionSources = {
    nixpi = "${config.nixpi.root}/os/pkgs/nixpi-pi-adapter/extensions/nixpi/nixpi";
  };

  desiredSettings =
    {
      inherit (cfg) packages;
      extensions = map (name: extensionSources.${name}) cfg.extensions;
      inherit (cfg) skills;
      inherit (cfg) prompts;
      inherit (cfg) themes;
    }
    // lib.optionalAttrs (cfg.enableSkillCommands != null) {
      inherit (cfg) enableSkillCommands;
    };

  desiredSettingsFile = pkgs.writeText "nixpi-pi-settings.json" (builtins.toJSON desiredSettings);
  extensionSourceChecks =
    lib.concatMapStringsSep "\n" (name: ''
      if [ ! -d ${lib.escapeShellArg extensionSources.${name}} ]; then
        echo "nixpi-pi-settings: missing PI extension source ${name}: ${extensionSources.${name}}" >&2
        echo "nixpi-pi-settings: sync the NixPI checkout before activating this host, or remove the extension from nixpi.pi.extensions." >&2
        exit 1
      fi
    '')
    cfg.extensions;
in {
  imports = [../nixpi-paths/module.nix];

  options.nixpi.pi = {
    enable = lib.mkEnableOption "declarative PI resource activation for the primary user" // {default = true;};

    extensions = lib.mkOption {
      type = lib.types.listOf (lib.types.enum (builtins.attrNames extensionSources));
      default = [];
      example = ["nixpi"];
      description = ''
        Declaratively enabled PI extensions. Names map to local extension source
        directories under the NixPI checkout and are merged into
        ~/.pi/agent/settings.json during activation.
      '';
    };

    packages = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI package sources written to ~/.pi/agent/settings.json.";
    };

    skills = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI skill paths written to ~/.pi/agent/settings.json.";
    };

    prompts = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI prompt template paths written to ~/.pi/agent/settings.json.";
    };

    themes = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Declarative PI theme paths written to ~/.pi/agent/settings.json.";
    };

    enableSkillCommands = lib.mkOption {
      type = lib.types.nullOr lib.types.bool;
      default = null;
      description = ''
        Optional declarative override for PI skill command registration.
        Null preserves the existing runtime/user value.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    # Expose the Synthetic API key from the NixOS sops secret to interactive Pi sessions.
    # This replaces the deleted nixpi-syntethic extension: no TypeScript needed for a file-read.
    programs.bash.interactiveShellInit = ''
      if [ -r /run/secrets/synthetic_api_key ] && [ -z "''${SYNTHETIC_API_KEY:-}" ]; then
        export SYNTHETIC_API_KEY="$(< /run/secrets/synthetic_api_key)"
      fi
    '';

    system.activationScripts.nixpi-pi-settings = lib.stringAfter ["users"] ''
      install -d -m 0755 -o ${userName} -g ${userGroup} ${lib.escapeShellArg "${userHome}/.pi/agent"}

      ${extensionSourceChecks}

      settings=${lib.escapeShellArg "${userHome}/.pi/agent/settings.json"}
      desired=${lib.escapeShellArg desiredSettingsFile}

      # Merge desired keys into existing settings.json, creating it if absent.
      # jq null-input reads desired, then slurps existing (if present) and merges.
      if [ -f "$settings" ]; then
        ${pkgs.jq}/bin/jq -s '.[0] * .[1]' "$settings" "$desired" > "$settings.tmp"
      else
        ${pkgs.jq}/bin/jq '.' "$desired" > "$settings.tmp"
      fi
      mv "$settings.tmp" "$settings"

      chown ${userName}:${userGroup} ${lib.escapeShellArg "${userHome}/.pi/agent/settings.json"}
      chmod 0644 ${lib.escapeShellArg "${userHome}/.pi/agent/settings.json"}
    '';
  };
}
