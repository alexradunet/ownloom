{
  config,
  lib,
  pkgs,
  ...
}: let
  terminalSessionName = lib.attrByPath ["services" "ownloom-terminal" "sessionName"] "ownloom" config;
  terminalBasePath = lib.attrByPath ["services" "ownloom-terminal" "basePath"] "/terminal" config;
  terminalBaseUrl =
    if lib.hasSuffix "/" terminalBasePath
    then terminalBasePath
    else "${terminalBasePath}/";
  terminalHost = lib.attrByPath ["services" "ownloom-terminal" "host"] "127.0.0.1" config;
  terminalPort = lib.attrByPath ["services" "ownloom-terminal" "port"] 8091 config;
  shellZellijConfig = pkgs.writeText "ownloom-shell-zellij.kdl" ''
    default_cwd ${builtins.toJSON config.ownloom.root}
    session_name ${builtins.toJSON terminalSessionName}
    attach_to_session true
    web_server_ip ${builtins.toJSON terminalHost}
    web_server_port ${toString terminalPort}
    web_sharing "on"

    web_client {
        base_url ${builtins.toJSON terminalBaseUrl}
    }
  '';
in {
  time.timeZone = "Europe/Bucharest";
  i18n.defaultLocale = "en_US.UTF-8";
  console.keyMap = "us";

  # 26.05 perlless/bashless user and init path. These options are coupled:
  # nixos-init requires systemd initrd, immutable /etc overlay, and Userborn
  # or systemd-sysusers.
  services.userborn.enable = true;
  boot.initrd.systemd.enable = true;
  system.etc.overlay.enable = true;
  system.nixos-init.enable = true;

  programs = {
    bash = {
      enable = true;
      completion.enable = true;
      loginShellInit = ''
        if [ "''${USER:-}" = "${config.ownloom.human.name}" ] \
          && [ -z "''${ZELLIJ:-}" ] \
          && [ -z "''${OWNLOOM_NO_ZELLIJ:-}" ] \
          && [ -t 0 ] \
          && [ -t 1 ] \
          && command -v zellij >/dev/null 2>&1; then
          cd ${lib.escapeShellArg config.ownloom.root} 2>/dev/null || cd
          export ZELLIJ_CONFIG_FILE=${lib.escapeShellArg shellZellijConfig}
          exec zellij attach --create --forget ${lib.escapeShellArg terminalSessionName}
        fi
      '';
    };

    # whois (new NixOS module in 26.05) — intelligent WHOIS client.
    whois.enable = true;

    # nh — a modern nix CLI helper with beautiful build diffs (via nvd).
    # NH_FLAKE is picked up automatically by `nh os switch`, `nh os boot`, etc.
    nh = {
      enable = true;
      flake = config.ownloom.config;

      # Weekly automatic garbage collection — keeps the store tidy without
      # manual intervention.
      clean = {
        enable = true;
        extraArgs = "--keep-since 14d --keep 5";
      };
    };
  };

  nix = {
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
        # pipe-operators: Nix 2.26+ |> operator for chained function calls.
        "pipe-operators"
      ];
      extra-substituters = ["https://cache.numtide.com"];
      extra-trusted-public-keys = [
        "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g="
      ];
      # Hard-link identical files in the store — reduces disk usage with
      # no build-time cost.
      auto-optimise-store = true;
    };

    # Periodic scheduled store optimisation (complements auto-optimise-store).
    optimise.automatic = true;
    # nix.gc is intentionally omitted — programs.nh.clean handles GC instead,
    # giving richer output and avoiding the conflicting-settings warning.
  };

  # Base safe specialisation — disable the perlless init stack for recovery.
  # Hosts add their own service overrides on top of this.
  specialisation.safe.configuration = {
    system.nixos.tags = ["safe"];
    system.nixos-init.enable = lib.mkForce false;
  };
}
