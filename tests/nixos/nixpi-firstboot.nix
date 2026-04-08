{
  lib,
  nixPiModulesNoShell,
  mkTestFilesystems,
  ...
}:

let
  mkNode =
    {
      hostName ? "nixpi-firstboot-test",
    }:
    { pkgs, ... }:
    let
      username = "pi";
      homeDir = "/home/${username}";
    in
    {
      imports = nixPiModulesNoShell ++ [ mkTestFilesystems ];
      nixpi.primaryUser = username;
      nixpi.install.enable = true;
      nixpi.install.repoUrl = "file:///var/lib/nixpi-source";
      nixpi.install.repoBranch = "main";

      networking.hostName = hostName;
      users.users.${username} = {
        isNormalUser = true;
        group = username;
        extraGroups = [
          "wheel"
          "networkmanager"
        ];
        home = homeDir;
        shell = pkgs.bash;
      };
      users.groups.${username} = { };
      environment.systemPackages = [
        pkgs.curl
        pkgs.git
        pkgs.jq
      ];
      systemd.tmpfiles.rules = [ "d ${homeDir}/.nixpi 0755 ${username} ${username} -" ];

      system.activationScripts.nixpi-test-install-seed = lib.stringAfter [ "users" ] ''
          mkdir -p ${homeDir}/.nixpi
          install -d -m 0755 /etc/nixos
          cat > /etc/nixos/configuration.nix <<'EOF'
        { ... }:
        {
          networking.hostName = "${hostName}";
        }
        EOF
          cat > /etc/nixos/hardware-configuration.nix <<'EOF'
        { ... }:
        {}
        EOF
          if [ ! -d /var/lib/nixpi-source/.git ]; then
            rm -rf /var/lib/nixpi-source
            install -d -m 0755 /var/lib/nixpi-source
            cp -R ${../../.}/. /var/lib/nixpi-source/
            chmod -R u+rwX /var/lib/nixpi-source
            ${lib.getExe pkgs.git} -C /var/lib/nixpi-source init -b main
            ${lib.getExe pkgs.git} -C /var/lib/nixpi-source add .
            ${lib.getExe pkgs.git} -C /var/lib/nixpi-source -c user.name='Test User' -c user.email='test@example.com' commit -m 'seed repo'
          fi
          chown -R ${username}:${username} ${homeDir}/.nixpi
          chmod 755 ${homeDir}/.nixpi
      '';
    };
in
{
  name = "nixpi-firstboot";

  nodes = {
    nixpi = mkNode { hostName = "nixpi-firstboot-test"; };
  };

  testScript = ''
    nixpi = machines[0]
    home = "/home/pi"

    nixpi.start()
    nixpi.wait_for_unit("multi-user.target", timeout=300)
    nixpi.wait_until_succeeds("ip -4 addr show dev eth1 | grep -q 'inet '", timeout=60)
    nixpi.wait_for_unit("wireguard-wg0.service", timeout=60)
    nixpi.wait_for_unit("nixpi-app-setup.service", timeout=120)
    nixpi.succeed("test -d " + home + "/.nixpi")
    nixpi.wait_until_succeeds("test ! -f " + home + "/.nixpi/wizard-state/system-ready", timeout=60)
    nixpi.fail("test -f " + home + "/.nixpi/.setup-complete")
    nixpi.succeed("su - pi -c 'sudo -n true'")

    nixpi.succeed("test -d " + home + "/.pi")
    nixpi.succeed("test -f " + home + "/.pi/settings.json")
    nixpi.succeed("test ! -L " + home + "/.pi")
    nixpi.succeed("test \"$(stat -c %U " + home + "/.pi)\" = pi")
    nixpi.succeed("test -d /srv/nixpi/.git")
    nixpi.succeed("test -f /srv/nixpi/flake.nix")
    nixpi.fail("test -e /var/lib/nixpi/pi-nixpi")
    nixpi.succeed("test -f /etc/nixos/flake.nix")
    nixpi.succeed("grep -q 'nixosConfigurations.nixos' /etc/nixos/flake.nix")
    nixpi.succeed("grep -q 'path:/srv/nixpi' /etc/nixos/flake.nix")
    nixpi.fail("command -v codex")
    nixpi.succeed(
        "su - pi -c 'test \"$PI_CODING_AGENT_DIR\" = /home/pi/.pi; "
        + "pi --help | grep -q \"AI coding assistant\"'"
    )

    print("All nixpi-firstboot tests passed!")
  '';
}
