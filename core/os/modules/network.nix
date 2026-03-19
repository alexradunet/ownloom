# core/os/modules/network.nix
{ pkgs, lib, config, ... }:

let
  primaryUser = config.nixpi.primaryUser;
  primaryHome =
    if config.nixpi.primaryHome != ""
    then config.nixpi.primaryHome
    else "/home/${primaryUser}";
  serviceUser = config.nixpi.serviceUser;
  stateDir = config.nixpi.stateDir;
  cfg = config.nixpi.services;
  securityCfg = config.nixpi.security;
  mkService = import ../lib/mk-service.nix { inherit lib; };
  exposedPorts =
    lib.optionals cfg.home.enable [ cfg.home.port ]
    ++ lib.optionals cfg.chat.enable [ cfg.chat.port ]
    ++ lib.optionals cfg.files.enable [ cfg.files.port ]
    ++ lib.optionals cfg.code.enable [ cfg.code.port ]
    ++ [ config.nixpi.matrix.port ];

  homeBootstrap = pkgs.writeShellScript "nixpi-home-bootstrap" ''
    set -eu
    mkdir -p ${stateDir}/services/home ${stateDir}/services/home/tmp
    if [ ! -f ${stateDir}/services/home/index.html ]; then
      cat > ${stateDir}/services/home/index.html <<'HTML'
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>nixPI Home</title></head>
<body>
  <h1>nixPI Home</h1>
  <ul>
    <li><a href="http://localhost:${toString cfg.chat.port}">nixPI Chat</a></li>
    <li><a href="http://localhost:${toString cfg.files.port}">nixPI Files</a></li>
    <li><a href="http://localhost:${toString cfg.code.port}">code-server</a></li>
  </ul>
</body>
</html>
HTML
    fi
    cat > ${stateDir}/services/home/nginx.conf <<'NGINX'
daemon off;
pid /run/nixpi-home-nginx.pid;
error_log stderr;
events { worker_connections 64; }
http {
    include ${pkgs.nginx}/conf/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path ${stateDir}/services/home/tmp;
    server {
        listen ${toString cfg.home.port};
        root ${stateDir}/services/home;
        try_files $uri $uri/ =404;
    }
}
NGINX
  '';

  chatBootstrap = pkgs.writeShellScript "nixpi-chat-bootstrap" ''
    set -eu
    mkdir -p ${stateDir}/services/chat ${stateDir}/services/chat/tmp
    cat > ${stateDir}/services/chat/config.json <<'CONFIG'
{
  "applicationName": "nixPI Chat",
  "defaultHomeserver": "http://localhost:${toString config.nixpi.matrix.port}"
}
CONFIG
    cat > ${stateDir}/services/chat/nginx.conf <<'NGINX'
daemon off;
pid /run/nixpi-chat-nginx.pid;
error_log stderr;
events { worker_connections 64; }
http {
    include ${pkgs.nginx}/conf/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path ${stateDir}/services/chat/tmp;
    server {
        listen ${toString cfg.chat.port};
        location /config.json {
            alias ${stateDir}/services/chat/config.json;
        }
        location / {
            root /etc/nixpi/fluffychat-web;
            try_files $uri $uri/ /index.html;
        }
    }
}
NGINX
  '';
in

{
  imports = [ ./options.nix ];

  config = {
    assertions = [
      {
        assertion = securityCfg.trustedInterface != "";
        message = "nixpi.security.trustedInterface must not be empty.";
      }
      {
        assertion = cfg.bindAddress != "";
        message = "nixpi.services.bindAddress must not be empty.";
      }
      {
        assertion = lib.length (lib.unique exposedPorts) == lib.length exposedPorts;
        message = "nixPI service ports must be unique across built-in services and Matrix.";
      }
    ];

    hardware.enableAllFirmware = true;
    services.netbird.enable = true;

    services.openssh = {
      enable = true;
      settings = {
        PasswordAuthentication = true;
        PubkeyAuthentication = "yes";
        PermitRootLogin = "no";
      };
    };

    networking.firewall.enable = true;
    networking.firewall.allowedTCPPorts = [ 22 ];
    networking.firewall.interfaces = lib.mkIf securityCfg.enforceServiceFirewall {
      "${securityCfg.trustedInterface}".allowedTCPPorts = exposedPorts;
    };
    networking.networkmanager.enable = true;

    environment.etc."nixpi/fluffychat-web".source = pkgs.fluffychat-web;

    environment.systemPackages = with pkgs; [
      git git-lfs gh
      ripgrep fd bat htop jq curl wget unzip openssl
      just shellcheck biome typescript
      qemu OVMF
      chromium
      netbird
      dufs nginx code-server
    ];

    systemd.services = lib.mkMerge [
      (lib.mkIf cfg.home.enable {
        nixpi-home = mkService {
          description = "nixPI Home landing page";
          wantedBy = [ "multi-user.target" ];
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          execStartPre = "${homeBootstrap}";
          execStart = "${pkgs.nginx}/bin/nginx -c ${stateDir}/services/home/nginx.conf";
          restart = "on-failure";
          restartSec = 10;
          protectHome = false;
          readWritePaths = [ "${stateDir}/services/home" ];
          serviceConfig = {
            User = serviceUser;
            Group = serviceUser;
            UMask = "0007";
          };
        };
      })
      (lib.mkIf cfg.chat.enable {
        nixpi-chat = mkService {
          description = "nixPI web chat client";
          wantedBy = [ "multi-user.target" ];
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          execStartPre = "${chatBootstrap}";
          execStart = "${pkgs.nginx}/bin/nginx -c ${stateDir}/services/chat/nginx.conf";
          restart = "on-failure";
          restartSec = 10;
          protectHome = false;
          readWritePaths = [ "${stateDir}/services/chat" ];
          serviceConfig = {
            User = serviceUser;
            Group = serviceUser;
            UMask = "0007";
          };
        };
      })
      (lib.mkIf cfg.files.enable {
        nixpi-files = mkService {
          description = "nixPI Files WebDAV";
          wantedBy = [ "multi-user.target" ];
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          execStartPre = "${pkgs.coreutils}/bin/mkdir -p ${primaryHome}/Public/nixPI";
          execStart = "${pkgs.dufs}/bin/dufs ${primaryHome}/Public/nixPI -A -b ${cfg.bindAddress} -p ${toString cfg.files.port}";
          restart = "on-failure";
          restartSec = 10;
          protectHome = false;
          readWritePaths = [ "${primaryHome}/Public/nixPI" ];
          serviceConfig = {
            User = serviceUser;
            Group = serviceUser;
            UMask = "0007";
          };
        };
      })
      (lib.mkIf cfg.code.enable {
        nixpi-code = mkService {
          description = "nixPI code-server";
          wantedBy = [ "multi-user.target" ];
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          workingDirectory = "${primaryHome}/nixPI";
          execStart = "${pkgs.code-server}/bin/code-server --bind-addr ${cfg.bindAddress}:${toString cfg.code.port} --auth none --disable-telemetry --user-data-dir ${stateDir}/services/code/user-data --extensions-dir ${stateDir}/services/code/extensions ${primaryHome}/nixPI";
          restart = "on-failure";
          restartSec = 10;
          hardening = false;
          serviceConfig = {
            User = serviceUser;
            Group = serviceUser;
            UMask = "0007";
          };
        };
      })
    ];

    system.activationScripts.nixpi-builtins = lib.stringAfter [ "users" ] ''
      install -d -m 2775 -o ${primaryUser} -g ${serviceUser} ${primaryHome}/Public
      install -d -m 2775 -o ${primaryUser} -g ${serviceUser} ${primaryHome}/Public/nixPI
      install -d -m 2775 -o ${primaryUser} -g ${serviceUser} ${primaryHome}/nixPI
      install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/home
      install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/home/tmp
      install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/chat
      install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/chat/tmp
      install -d -m 0770 -o ${serviceUser} -g ${serviceUser} ${stateDir}/services/code
    '';

    warnings = lib.optional config.nixpi.security.enforceServiceFirewall ''
      nixPI opens Home, Chat, Files, Code, and Matrix only on
      `${config.nixpi.security.trustedInterface}`. Without that interface, only local
      access remains available.
    '';
  };
}
