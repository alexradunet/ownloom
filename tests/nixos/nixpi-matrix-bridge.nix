{ lib, nixPiModulesNoShell, piAgent, appPackage, setupPackage, mkTestFilesystems, mkMatrixMultiSeedConfig, matrixRegisterScript, matrixTestClient, ... }:

{
  name = "nixpi-matrix-bridge";

  nodes = {
    homeserver = { pkgs, ... }: let
      username = "homeserver";
      homeDir = "/home/${username}";
    in {
      imports = nixPiModulesNoShell ++ [ mkTestFilesystems (mkMatrixMultiSeedConfig [
        { username = "host"; password = "hostpass123"; }
        { username = "operator"; password = "operatorpass123"; }
        { username = "clientuser"; password = "clientpass123"; }
      ]) ];
      _module.args = { inherit piAgent appPackage setupPackage; };
      nixpi.primaryUser = username;
      nixpi.security.trustedInterface = "eth1";

      networking.hostName = "nixpi";

      users.users.${username} = {
        isNormalUser = true;
        group = username;
        extraGroups = [ "wheel" "networkmanager" ];
        home = homeDir;
        shell = pkgs.bash;
      };
      users.groups.${username} = {};

      systemd.services.netbird.wantedBy = lib.mkForce [ ];
      systemd.services.nixpi-home.wantedBy = lib.mkForce [ ];
      systemd.services.nixpi-element-web.wantedBy = lib.mkForce [ ];
      systemd.timers.nixpi-update.wantedBy = lib.mkForce [ ];
    };

    nixpi = { pkgs, ... }: let
      username = "pi";
      homeDir = "/home/${username}";
    in {
      imports = nixPiModulesNoShell ++ [ mkTestFilesystems ];
      _module.args = { inherit piAgent appPackage setupPackage; };
      nixpi.primaryUser = username;

      networking.hostName = "nixpi-agent";

      users.users.${username} = {
        isNormalUser = true;
        group = username;
        extraGroups = [ "wheel" "networkmanager" ];
        home = homeDir;
        shell = pkgs.bash;
      };
      users.groups.${username} = {};

      systemd.services.continuwuity.wantedBy = lib.mkForce [ ];
      systemd.services.netbird.wantedBy = lib.mkForce [ ];
      systemd.services.nixpi-home.wantedBy = lib.mkForce [ ];
      systemd.services.nixpi-element-web.wantedBy = lib.mkForce [ ];
      systemd.timers.nixpi-update.wantedBy = lib.mkForce [ ];

      system.activationScripts.nixpi-bridge-fixtures = lib.stringAfter [ "users" ] ''
        install -d -m 0755 -o ${username} -g ${username} ${homeDir}/.nixpi
        install -d -m 0755 -o ${username} -g ${username} ${homeDir}/.pi
        install -d -m 0775 -o ${username} -g ${username} ${homeDir}/nixpi
        install -d -m 0775 -o ${username} -g ${username} ${homeDir}/nixpi/Agents
        install -d -m 0775 -o ${username} -g ${username} ${homeDir}/nixpi/Agents/host
        cat > ${homeDir}/nixpi/Agents/host/AGENTS.md <<'EOF'
---
id: host
name: Pi
matrix:
  username: host
  autojoin: true
respond:
  mode: silent
---
You are Pi.
EOF
        chown -R ${username}:${username} ${homeDir}/nixpi
        install -d -m 0755 -o ${username} -g ${username} ${homeDir}/.nixpi/wizard-state
        touch ${homeDir}/.nixpi/wizard-state/system-ready
        chown ${username}:${username} ${homeDir}/.nixpi/wizard-state/system-ready
        install -d -m 0775 -o ${username} -g ${username} /srv/nixpi
        install -d -m 0775 -o ${username} -g ${username} /srv/nixpi/Agents
        install -d -m 0775 -o ${username} -g ${username} /srv/nixpi/Agents/host
        cp ${homeDir}/nixpi/Agents/host/AGENTS.md /srv/nixpi/Agents/host/AGENTS.md
        chown -R ${username}:${username} /srv/nixpi
        install -d -m 0700 -o ${username} -g ${username} ${homeDir}/.pi/matrix-agents
      '';

      environment.systemPackages = [ pkgs.curl pkgs.jq ];
    };

    client = { pkgs, ... }: {
      imports = [ mkTestFilesystems ];
      networking.hostName = "client";
      environment.systemPackages = [ matrixTestClient pkgs.curl pkgs.jq ];
      virtualisation.diskSize = 5120;
      virtualisation.memorySize = 1024;
      virtualisation.graphics = false;
      boot.loader.systemd-boot.enable = true;
      boot.loader.efi.canTouchEfiVariables = true;
      networking.networkmanager.enable = true;
      time.timeZone = "UTC";
      i18n.defaultLocale = "en_US.UTF-8";
      system.stateVersion = "25.05";
    };
  };

  testScript = ''
    import urllib.parse

    ${matrixRegisterScript}

    client = machines[0]
    homeserver = machines[1]
    nixpi = machines[2]

    start_all()

    homeserver.wait_for_unit("continuwuity.service", timeout=120)
    homeserver.wait_until_succeeds("curl -sf http://127.0.0.1:6167/_matrix/client/versions", timeout=60)
    # Wait for admin_execute to create pre-seeded users (may be async)
    homeserver.wait_until_succeeds(
        "curl -sf -X POST http://127.0.0.1:6167/_matrix/client/v3/login"
        + " -H 'Content-Type: application/json'"
        + " -d '{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"host\"},\"password\":\"hostpass123\"}'"
        + " | grep -q 'access_token'",
        timeout=60,
    )
    host_creds = login_matrix_user(homeserver, "http://127.0.0.1:6167", "host", "hostpass123")
    admin_creds = login_matrix_user(homeserver, "http://127.0.0.1:6167", "operator", "operatorpass123")

    room = json.loads(homeserver.succeed(
        "curl -sf -X POST http://127.0.0.1:6167/_matrix/client/v3/createRoom "
        + "-H 'Authorization: Bearer " + admin_creds["access_token"] + "' "
        + "-H 'Content-Type: application/json' "
        + "-d '{"
        + "\"preset\":\"public_chat\","
        + "\"room_alias_name\":\"general\","
        + "\"invite\":[\"@host:nixpi\"]"
        + "}'"
    ))
    room_id = room["room_id"]
    room_id_enc = urllib.parse.quote(room_id, safe="")

    nixpi.succeed(
        "cat > /home/pi/.pi/matrix-credentials.json <<'EOF'\n"
        + json.dumps({
            "homeserver": "http://nixpi:6167",
            "botUserId": host_creds["user_id"],
            "botAccessToken": host_creds["access_token"],
            "botPassword": "hostpass123",
        }, indent=2)
        + "\nEOF"
    )
    nixpi.succeed("chown pi:pi /home/pi/.pi/matrix-credentials.json")
    nixpi.succeed("chmod 600 /home/pi/.pi/matrix-credentials.json")

    nixpi.succeed(
        "cat > /home/pi/.pi/matrix-agents/host.json <<'EOF'\n"
        + json.dumps({
            "homeserver": "http://nixpi:6167",
            "userId": host_creds["user_id"],
            "accessToken": host_creds["access_token"],
            "password": "hostpass123",
            "username": "host",
        }, indent=2)
        + "\nEOF"
    )
    nixpi.succeed("chown pi:pi /home/pi/.pi/matrix-agents/host.json")
    nixpi.succeed("chmod 600 /home/pi/.pi/matrix-agents/host.json")

    nixpi.wait_for_unit("nixpi-daemon.service", timeout=120)

    homeserver.wait_until_succeeds(
        "curl -sf http://127.0.0.1:6167/_matrix/client/v3/rooms/"
        + room_id_enc
        + "/members -H 'Authorization: Bearer "
        + admin_creds["access_token"]
        + "' | grep -q '\"membership\":\"join\"' && "
        + "curl -sf http://127.0.0.1:6167/_matrix/client/v3/rooms/"
        + room_id_enc
        + "/members -H 'Authorization: Bearer "
        + admin_creds["access_token"]
        + "' | grep -q '@host:nixpi'",
        timeout=60,
    )

    client.succeed(
        "nixpi-matrix-client http://nixpi:6167 clientuser clientpass123 '#general:nixpi' "
        + "'hello from integration test' -"
    )

    nixpi.succeed("journalctl -u nixpi-daemon.service --no-pager | grep -q 'starting nixpi-daemon'")
    homeserver.succeed(
        "curl -sf 'http://127.0.0.1:6167/_matrix/client/v3/rooms/"
        + room_id_enc
        + "/messages?dir=b&limit=10' -H 'Authorization: Bearer "
        + admin_creds["access_token"]
        + "' | grep -q 'hello from integration test'"
    )

    print("NixPI matrix bridge transport test passed!")
  '';
}
