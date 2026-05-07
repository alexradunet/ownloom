{pkgs, ...}:
pkgs.testers.runNixOSTest {
  name = "ollama-smoke";

  nodes.vm = {...}: {
    imports = [
      ../../features/nixos/service-ollama/module.nix
    ];

    networking.hostName = "ollama-smoke-test";
    system.stateVersion = "26.05";

    # No models — only testing service health, not inference.
    services.nixpi-ollama = {
      enable = true;
      models = [];
    };
  };

  testScript = ''
    vm.start()
    vm.wait_for_unit("ollama.service")
    vm.wait_for_open_port(11434)

    # /api/tags (ollama native) must respond with a model list key.
    vm.succeed("curl -sf http://127.0.0.1:11434/api/tags | grep -q '\"models\"'")

    # /v1/models (OpenAI-compat) must respond.
    vm.succeed("curl -sf http://127.0.0.1:11434/v1/models | grep -q '\"object\"'")

    # Session variable must be declared in /etc/set-environment.
    vm.succeed("grep -q NIXPI_LLM_BASE_URL /etc/set-environment")
    vm.succeed("grep -q NIXPI_LLM_PROVIDER /etc/set-environment")
  '';
}
