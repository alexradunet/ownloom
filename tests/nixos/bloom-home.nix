# tests/nixos/bloom-home.nix
# Test that Bloom Home and the built-in user services are provisioned after firstboot

{ pkgs, lib, bloomModulesNoShell, piAgent, bloomApp, mkTestFilesystems, ... }:

pkgs.testers.runNixOSTest {
  name = "bloom-home";

  nodes.bloom = { ... }: {
    imports = bloomModulesNoShell ++ [
      ../../core/os/modules/bloom-firstboot.nix
      mkTestFilesystems
    ];
    _module.args = { inherit piAgent bloomApp; };

    virtualisation.diskSize = 20480;
    virtualisation.memorySize = 4096;

    boot.loader.systemd-boot.enable = true;
    boot.loader.efi.canTouchEfiVariables = true;
    networking.hostName = "bloom-home-test";
    time.timeZone = "UTC";
    i18n.defaultLocale = "en_US.UTF-8";
    networking.networkmanager.enable = true;
    system.stateVersion = "25.05";

    users.users.pi = {
      isNormalUser = true;
      group = "pi";
      extraGroups = [ "wheel" "networkmanager" ];
      home = "/home/pi";
      shell = pkgs.bash;
    };
    users.groups.pi = {};

    systemd.tmpfiles.rules = [
      "d /home/pi/.bloom 0755 pi pi -"
      "f /home/pi/.bloom/prefill.env 0644 pi pi -"
    ];

    system.activationScripts.bloom-prefill = lib.stringAfter [ "users" ] ''
      mkdir -p /home/pi/.bloom
      cat > /home/pi/.bloom/prefill.env << 'EOF'
    PREFILL_USERNAME=testuser
    PREFILL_PASSWORD=testpassword123
    EOF
      chown -R pi:pi /home/pi/.bloom
      chmod 755 /home/pi/.bloom
      chmod 644 /home/pi/.bloom/prefill.env
    '';
  };

  testScript = ''
    bloom = machines[0]

    bloom.start()
    bloom.wait_for_unit("multi-user.target", timeout=300)
    bloom.wait_for_unit("bloom-firstboot.service", timeout=120)
    bloom.wait_until_succeeds("test -f /home/pi/.bloom/.setup-complete", timeout=120)

    bloom.wait_until_succeeds("test -f /home/pi/.config/bloom/home/index.html", timeout=120)
    bloom.wait_until_succeeds("test -f /home/pi/.config/bloom/fluffychat/config.json", timeout=120)
    bloom.succeed("grep -q 'Bloom Home' /home/pi/.config/bloom/home/index.html")
    bloom.succeed("grep -q 'Bloom Web Chat' /home/pi/.config/bloom/home/index.html")
    bloom.succeed("grep -q 'Bloom Files' /home/pi/.config/bloom/home/index.html")
    bloom.succeed("grep -q 'Bloom Code' /home/pi/.config/bloom/home/index.html")

    bloom.wait_until_succeeds("curl -sf http://127.0.0.1:8080 | grep -q 'Bloom Home'", timeout=60)
    bloom.wait_until_succeeds("curl -sf http://127.0.0.1:8080 | grep -q '8081'", timeout=60)
    bloom.wait_until_succeeds("curl -sf http://127.0.0.1:8080 | grep -q '5000'", timeout=60)
    bloom.wait_until_succeeds("curl -sf http://127.0.0.1:8080 | grep -q '8443'", timeout=60)
    bloom.wait_until_succeeds("curl -sf http://127.0.0.1:8081/config.json | grep -q 'defaultHomeserver'", timeout=60)
    bloom.wait_until_succeeds("curl -sf http://127.0.0.1:5000/ >/dev/null", timeout=60)
    bloom.wait_until_succeeds("curl -sf http://127.0.0.1:8443/ | grep -q 'code-server'", timeout=60)
    bloom.succeed("test -d /home/pi/.config/code-server")

    print("Bloom Home and built-in service tests passed!")
  '';
}
