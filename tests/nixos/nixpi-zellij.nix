{ nixPiModules, mkTestFilesystems, ... }:

{
  name = "nixpi-zellij";

  nodes.nixpi =
    { ... }:
    {
      imports = nixPiModules ++ [ mkTestFilesystems ];

      nixpi.primaryUser = "pi";
      nixpi.terminal.interface = "zellij";
      nixpi.terminal.zellij.enable = true;

      networking.hostName = "nixpi-zellij-test";
    };

  testScript = ''
    nixpi = machines[0]

    nixpi.start()
    nixpi.wait_for_unit("multi-user.target", timeout=300)

    assert nixpi.succeed("sudo -u pi -- bash -lc \"command -v zellij\"").strip()
    assert nixpi.succeed("sudo -u pi -- bash -lc \"command -v nixpi-launch-terminal-ui\"").strip()
    nixpi.succeed("test -L /home/pi/.config/zellij/config.kdl")
    nixpi.succeed("test -L /home/pi/.config/zellij/layouts/nixpi.kdl")
    nixpi.succeed("grep -q 'pane command=\"pi\"' /home/pi/.config/zellij/layouts/nixpi.kdl")

    assert nixpi.succeed(
        "sudo -u pi -- env NIXPI_TERMINAL_UI_TEST=1 bash -lc \"nixpi-launch-terminal-ui\""
    ).strip() == "launch"
    assert nixpi.succeed(
        "sudo -u pi -- env NIXPI_TERMINAL_UI_TEST=1 NIXPI_NO_ZELLIJ=1 bash -lc \"nixpi-launch-terminal-ui\""
    ).strip() == "skip:bypass"
    assert nixpi.succeed(
        "sudo -u pi -- env ZELLIJ=1 NIXPI_TERMINAL_UI_TEST=1 bash -lc \"nixpi-launch-terminal-ui\""
    ).strip() == "skip:already-in-zellij"
  '';
}
