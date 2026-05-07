{
  config,
  lib,
  ...
}: {
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
    };

    # whois (new NixOS module in 26.05) — intelligent WHOIS client.
    whois.enable = true;

    # nh — a modern nix CLI helper with beautiful build diffs (via nvd).
    # NH_FLAKE is picked up automatically by `nh os switch`, `nh os boot`, etc.
    nh = {
      enable = true;
      flake = config.nixpi.config;

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
