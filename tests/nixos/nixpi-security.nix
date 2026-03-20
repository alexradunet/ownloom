# tests/nixos/nixpi-security.nix
# Verify nixPI service ports are scoped to the trusted mesh interface and not
# reachable from an untrusted peer by default.

{ pkgs, nixpiModulesNoShell, piAgent, appPackage, mkTestFilesystems, ... }:

pkgs.testers.runNixOSTest {
  name = "nixpi-security";

  nodes = {
    nixpi = { ... }: let
      username = "pi";
      homeDir = "/home/${username}";
    in {
      imports = nixpiModulesNoShell ++ [
        ../../core/os/modules/firstboot.nix
        mkTestFilesystems
      ];
      _module.args = { inherit piAgent appPackage; };

      nixpi.primaryUser = username;
      nixpi.security.enforceServiceFirewall = true;

      virtualisation.diskSize = 20480;
      virtualisation.memorySize = 4096;

      boot.loader.systemd-boot.enable = true;
      boot.loader.efi.canTouchEfiVariables = true;
      networking.hostName = "nixpi-security-test";
      time.timeZone = "UTC";
      i18n.defaultLocale = "en_US.UTF-8";
      networking.networkmanager.enable = true;
      system.stateVersion = "25.05";

      users.users.${username} = {
        isNormalUser = true;
        group = username;
        extraGroups = [ "wheel" "networkmanager" "agent" ];
        home = homeDir;
        shell = pkgs.bash;
      };
      users.groups.${username} = { };

      system.activationScripts.nixpi-prefill = ''
        mkdir -p ${homeDir}/.nixpi
        cat > ${homeDir}/.nixpi/prefill.env << 'EOF'
PREFILL_USERNAME=testuser
PREFILL_MATRIX_PASSWORD=testpassword123
EOF
        chown -R ${username}:${username} ${homeDir}/.nixpi
        chmod 755 ${homeDir}/.nixpi
        chmod 644 ${homeDir}/.nixpi/prefill.env
      '';
    };

    client = { ... }: {
      virtualisation.diskSize = 5120;
      virtualisation.memorySize = 1024;

      boot.loader.systemd-boot.enable = true;
      boot.loader.efi.canTouchEfiVariables = true;
      networking.hostName = "client";
      time.timeZone = "UTC";
      i18n.defaultLocale = "en_US.UTF-8";
      networking.networkmanager.enable = true;
      system.stateVersion = "25.05";

      environment.systemPackages = with pkgs; [ curl netcat ];
    };
  };

  testScript = ''
    client = machines[0]
    nixpi = machines[1]

    nixpi.start()
    nixpi.wait_for_unit("multi-user.target", timeout=300)
    nixpi.wait_for_unit("nixpi-firstboot.service", timeout=120)
    nixpi.wait_until_succeeds("test -f /home/pi/.nixpi/.setup-complete", timeout=120)

    client.start()
    client.wait_for_unit("multi-user.target", timeout=120)
    client.wait_until_succeeds("ip -4 addr show dev eth1 | grep -q 'inet '", timeout=60)

    # Local access remains available.
    nixpi.wait_until_succeeds("curl -sf http://127.0.0.1:6167/_matrix/client/versions", timeout=60)
    nixpi.wait_until_succeeds("curl -sf http://127.0.0.1:8080 | grep -q 'nixPI Home'", timeout=60)

    # SSH is still reachable from an untrusted peer for bootstrap.
    client.succeed("nc -z nixpi-security-test 22")

    # Application ports are blocked from the untrusted peer because the trusted
    # mesh interface is absent in the test environment.
    blocked_ports = [6167, 8080, 8081, 5000, 8443]
    for port in blocked_ports:
        client.succeed(f"! nc -z -w 2 nixpi-security-test {port}")

    print("nixPI security exposure policy tests passed!")
  '';
}
