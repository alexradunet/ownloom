{ pkgs, nixPiModules, piAgent, appPackage, ... }:

pkgs.testers.runNixOSTest {
  name = "nixpi-desktop";

  nodes.nixpi = { ... }: {
    imports = [
      ../../core/os/modules/firstboot.nix
      ../../core/os/modules/desktop-openbox.nix
      {
        fileSystems."/" = { device = "/dev/vda"; fsType = "ext4"; };
        fileSystems."/boot" = { device = "/dev/vda1"; fsType = "vfat"; };
      }
    ] ++ nixPiModules;
    _module.args = { inherit piAgent appPackage; };

    services.xserver.xkb = { layout = "us"; variant = ""; };
    console.keyMap = "us";

    nixpi.primaryUser = "pi";
    nixpi.install.mode = "managed-user";
    nixpi.createPrimaryUser = true;
    networking.hostName = "nixpi-desktop-test";

    virtualisation.diskSize = 20480;
    virtualisation.memorySize = 4096;
    virtualisation.graphics = true;
  };

  testScript = ''
    nixpi = machines[0]
    display_env = "DISPLAY=:0 XAUTHORITY=/home/pi/.Xauthority"
    user_cmd = "su - pi -c '" + display_env + " "

    nixpi.start()
    nixpi.wait_for_unit("display-manager.service", timeout=300)
    nixpi.wait_until_succeeds("systemctl is-active display-manager.service", timeout=120)
    nixpi.wait_until_succeeds("pgrep -u pi -x openbox", timeout=120)
    nixpi.wait_until_succeeds("pgrep -u pi -x tint2", timeout=120)
    nixpi.wait_until_succeeds("test -f /home/pi/.Xauthority", timeout=120)

    nixpi.succeed(user_cmd + "wmctrl -m | grep -q Name:.*Openbox'")
    nixpi.succeed(user_cmd + "command -v rofi'")
    nixpi.succeed(user_cmd + "command -v pcmanfm'")
    nixpi.succeed(user_cmd + "command -v xdotool'")
    nixpi.succeed(user_cmd + "command -v scrot'")

    nixpi.succeed(user_cmd + "xterm -title NixPIDesktopSmoke >/tmp/nixpi-desktop-xterm.log 2>&1 &'")
    nixpi.wait_until_succeeds(user_cmd + "wmctrl -l | grep -q NixPIDesktopSmoke'", timeout=120)
    nixpi.succeed(user_cmd + "wmctrl -r NixPIDesktopSmoke -e 0,120,140,640,420'")
    nixpi.succeed(user_cmd + "wmctrl -a NixPIDesktopSmoke'")
    nixpi.wait_until_succeeds(
        user_cmd + "wmctrl -lG | awk '/NixPIDesktopSmoke/ { if ($3 == 120 && $4 == 140) found=1 } END { exit(found ? 0 : 1) }'",
        timeout=60,
    )

    nixpi.succeed(user_cmd + "import -window root /tmp/nixpi-desktop-root.png'")
    nixpi.succeed("test -s /tmp/nixpi-desktop-root.png")
  '';
}
