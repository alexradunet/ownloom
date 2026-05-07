{
  inputs,
  lib,
  pkgs,
  system,
}: let
  eval = inputs.nixpkgs.lib.nixosSystem {
    inherit system;
    modules = [
      {
        nixpkgs.overlays = [
          (final: _prev: {
            pi = final.writeShellScriptBin "pi" "exit 0";
            nixpi-gateway = final.writeShellScriptBin "nixpi-gateway" "exit 0";
            nixpi-planner = final.writeShellScriptBin "nixpi-planner" "exit 0";
            nixpi-context = final.writeShellScriptBin "nixpi-context" "exit 0";
            nixpi-wiki = final.writeShellScriptBin "nixpi-wiki" "exit 0";
          })
        ];
      }
      ../../features/nixos/service-gateway/module.nix
      {
        networking.hostName = "nixpi-gateway-module-test";
        system.stateVersion = "26.05";

        users.groups.gateway = {};
        users.users.gateway = {
          isSystemUser = true;
          group = "gateway";
        };

        services.nixpi-gateway = {
          enable = true;
          user = "gateway";
          group = "gateway";
          stateDir = "/var/lib/nixpi-gateway";
          settings = {
            pi.cwd = "/srv/nixpi";
            wiki.dir = "/srv/wiki";
            transports = {
              websocket = {
                enable = true;
                host = "127.0.0.1";
                port = 8081;
              };
              whatsapp = {
                enable = true;
                ownerNumbers = ["+15550003333"];
                allowedModels = [
                  "hf:moonshotai/Kimi-K2.6"
                  "hf:deepseek-ai/DeepSeek-V3.2"
                ];
                model = "synthetic/hf:deepseek-ai/DeepSeek-V3.2";
              };
            };
          };
        };
      }
    ];
  };
  service = eval.config.systemd.services.nixpi-gateway;
  execStart = service.serviceConfig.ExecStart;
  inherit (service) environment serviceConfig;
in
  assert lib.asserts.assertMsg (lib.hasInfix "/bin/nixpi-gateway" execStart) "nixpi-gateway ExecStart must invoke the configured package";
  assert lib.asserts.assertMsg (lib.hasInfix "nixpi-gateway.yml" execStart) "nixpi-gateway ExecStart must include generated YAML config";
  assert lib.asserts.assertMsg (environment.NIXPI_WIKI_ROOT == "/srv/wiki") "nixpi-gateway must expose the single wiki root";
  assert lib.asserts.assertMsg (!(builtins.hasAttr "NIXPI_WIKI_ROOTS" environment)) "nixpi-gateway must not expose split wiki roots";
  assert lib.asserts.assertMsg (!(builtins.hasAttr "NIXPI_WIKI_ROOT_TECHNICAL" environment)) "nixpi-gateway must not expose a split technical wiki root";
  assert lib.asserts.assertMsg (!(builtins.hasAttr "NIXPI_WIKI_ROOT_PERSONAL" environment)) "nixpi-gateway must not expose a split personal wiki root";
  assert lib.asserts.assertMsg (!(builtins.hasAttr "NIXPI_WIKI_ALLOWED_DOMAINS" environment)) "nixpi-gateway must not restrict domains inside the single wiki";
  assert lib.asserts.assertMsg (environment.PI_SYNTHETIC_API_KEY_FILE == "%d/synthetic_api_key") "nixpi-gateway must read the Synthetic key through a systemd credential";
  assert lib.asserts.assertMsg (environment.PI_CODING_AGENT_DIR == "/home/human/.pi/agent") "nixpi-gateway must use the normal Pi SDK agent directory";
  # ReadWritePaths intentionally absent: ProtectSystem is not set so the
  # gateway process (running as the primary user) can run privileged
  # operations via sudo (nixos-rebuild, systemctl, etc.).
  assert lib.asserts.assertMsg (!serviceConfig.NoNewPrivileges) "nixpi-gateway must not set NoNewPrivileges so that sudo works for privileged operations";
  assert lib.asserts.assertMsg (lib.elem "synthetic_api_key:/run/secrets/synthetic_api_key" serviceConfig.LoadCredential) "nixpi-gateway must load the Synthetic key credential";
  assert lib.asserts.assertMsg (lib.elem "nixpi-gateway/sessions" serviceConfig.StateDirectory) "nixpi-gateway must create session state with StateDirectory";
  assert lib.asserts.assertMsg (lib.elem "nixpi-gateway/whatsapp/auth" serviceConfig.StateDirectory) "nixpi-gateway must create whatsapp auth state with StateDirectory";
    pkgs.runCommand "nixpi-gateway-module-eval" {} ''
      touch $out
    ''
