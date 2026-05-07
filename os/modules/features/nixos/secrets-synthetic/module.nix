{
  inputs,
  config,
  lib,
  ...
}: let
  cfg = config.ownloom.secrets.synthetic;
in {
  imports = [
    ../paths/module.nix
    inputs.sops-nix.nixosModules.sops
  ];

  options.ownloom.secrets.synthetic = {
    sopsFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        Path to the host's sops-encrypted secrets file that contains
        the Synthetic API key. Set this unconditionally to ./secrets.yaml
        in your host config when the file is git-tracked.

        Do NOT wrap with lib.mkIf (builtins.pathExists ...) — untracked files
        are invisible to pure flake evaluation and the conditional will silently
        drop the secret in a pure build.

        Example:
          ownloom.secrets.synthetic.sopsFile = ./secrets.yaml;
      '';
    };

    owner = lib.mkOption {
      type = lib.types.str;
      default = config.ownloom.human.name;
      defaultText = lib.literalExpression "config.ownloom.human.name";
      description = "User that owns the decrypted Synthetic API key secret file.";
    };

    secretName = lib.mkOption {
      type = lib.types.str;
      default = "synthetic_api_key";
      description = "sops-nix secret name for the Synthetic API key.";
    };
  };

  config = lib.mkIf (cfg.sopsFile != null) {
    sops = {
      age.sshKeyPaths = lib.mkDefault ["/etc/ssh/ssh_host_ed25519_key"];
      secrets.${cfg.secretName} = {
        inherit (cfg) sopsFile owner;
        group = "users";
        mode = "0400";
      };
    };
  };
}
