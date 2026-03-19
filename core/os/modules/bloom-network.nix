# core/os/modules/bloom-network.nix
{ pkgs, lib, config, ... }:

let
  u = config.bloom.username;
  bloomHomeBootstrap = pkgs.writeShellScript "bloom-home-bootstrap" ''
    set -eu
    mkdir -p "$HOME/.config/bloom/home" "$HOME/.config/bloom/home/tmp"
    if [ ! -f "$HOME/.config/bloom/home/index.html" ]; then
      cat > "$HOME/.config/bloom/home/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bloom Home</title></head>
<body>
  <h1>Bloom Home</h1>
  <ul>
    <li><a href="http://localhost:8081">Bloom Web Chat</a></li>
    <li><a href="http://localhost:5000">Bloom Files</a></li>
    <li><a href="http://localhost:8443">code-server</a></li>
  </ul>
</body>
</html>
HTML
    fi
    cat > "$HOME/.config/bloom/home/nginx.conf" <<'NGINX'
daemon off;
pid /run/user/1000/bloom-home-nginx.pid;
error_log stderr;
events { worker_connections 64; }
http {
    include ${pkgs.nginx}/conf/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path /home/${u}/.config/bloom/home/tmp;
    server {
        listen 8080;
        root /home/${u}/.config/bloom/home;
        try_files $uri $uri/ =404;
    }
}
NGINX
  '';
  fluffychatBootstrap = pkgs.writeShellScript "bloom-fluffychat-bootstrap" ''
    set -eu
    mkdir -p "$HOME/.config/bloom/fluffychat" "$HOME/.config/bloom/fluffychat/tmp"
    cat > "$HOME/.config/bloom/fluffychat/config.json" <<'CONFIG'
{
  "applicationName": "Bloom Web Chat",
  "defaultHomeserver": "http://localhost:6167"
}
CONFIG
    cat > "$HOME/.config/bloom/fluffychat/nginx.conf" <<'NGINX'
daemon off;
pid /run/user/1000/bloom-fluffychat-nginx.pid;
error_log stderr;
events { worker_connections 64; }
http {
    include ${pkgs.nginx}/conf/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path /home/${u}/.config/bloom/fluffychat/tmp;
    server {
        listen 8081;
        location /config.json {
            alias /home/${u}/.config/bloom/fluffychat/config.json;
        }
        location / {
            root /etc/bloom/fluffychat-web;
            try_files $uri $uri/ /index.html;
        }
    }
}
NGINX
  '';
in

{
  config = {
    # Enable all firmware for maximum hardware compatibility.
    # This ensures WiFi, Bluetooth, and other hardware works out of the box
    # on the widest range of devices (Intel, Broadcom, Realtek, Atheros, etc.)
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

    networking.firewall.trustedInterfaces = [ "wt0" ];
    networking.networkmanager.enable = true;

    environment.etc."bloom/fluffychat-web".source = pkgs.fluffychat-web;

    environment.systemPackages = with pkgs; [
      git git-lfs gh
      ripgrep fd bat htop jq curl wget unzip openssl
      just shellcheck biome typescript
      qemu OVMF
      chromium
      netbird
      dufs nginx code-server
    ];

    systemd.user.services.bloom-home = {
      description = "Bloom Home landing page";
      wantedBy = [ "default.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      serviceConfig = {
        ExecStartPre = "${bloomHomeBootstrap}";
        ExecStart = "${pkgs.nginx}/bin/nginx -c %h/.config/bloom/home/nginx.conf";
        Restart = "on-failure";
        RestartSec = 10;
      };
    };

    systemd.user.services.bloom-fluffychat = {
      description = "Bloom FluffyChat web client";
      wantedBy = [ "default.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      serviceConfig = {
        ExecStartPre = "${fluffychatBootstrap}";
        ExecStart = "${pkgs.nginx}/bin/nginx -c %h/.config/bloom/fluffychat/nginx.conf";
        Restart = "on-failure";
        RestartSec = 10;
      };
    };

    systemd.user.services.bloom-dufs = {
      description = "Bloom Files WebDAV";
      wantedBy = [ "default.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      serviceConfig = {
        ExecStartPre = "${pkgs.coreutils}/bin/mkdir -p %h/Public/Bloom";
        ExecStart = "${pkgs.dufs}/bin/dufs %h/Public/Bloom -A -b 0.0.0.0 -p 5000";
        Restart = "on-failure";
        RestartSec = 10;
      };
    };

    systemd.user.services.bloom-code-server = {
      description = "Bloom code-server";
      wantedBy = [ "default.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      serviceConfig = {
        ExecStart = "${pkgs.code-server}/bin/code-server --bind-addr 0.0.0.0:8443 --auth none --disable-telemetry";
        Restart = "on-failure";
        RestartSec = 10;
      };
    };

    systemd.tmpfiles.rules = [
      "d /home/${u}/.config/bloom 0755 ${u} ${u} -"
      "d /home/${u}/.config/bloom/home 0755 ${u} ${u} -"
      "d /home/${u}/.config/bloom/fluffychat 0755 ${u} ${u} -"
      "d /home/${u}/.config/code-server 0755 ${u} ${u} -"
      "d /home/${u}/Public/Bloom 0755 ${u} ${u} -"
    ];

    system.activationScripts.bloom-builtins = lib.stringAfter [ "users" ] ''
      install -d -m 0755 -o ${u} -g ${u} /home/${u}/.config/bloom/home
      install -d -m 0755 -o ${u} -g ${u} /home/${u}/.config/bloom/home/tmp
      install -d -m 0755 -o ${u} -g ${u} /home/${u}/.config/bloom/fluffychat
      install -d -m 0755 -o ${u} -g ${u} /home/${u}/.config/bloom/fluffychat/tmp
      install -d -m 0755 -o ${u} -g ${u} /home/${u}/.config/code-server
      install -d -m 0755 -o ${u} -g ${u} /home/${u}/Public/Bloom

      cat > /home/${u}/.config/bloom/home/index.html <<'HTML'
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bloom Home</title></head>
<body>
  <h1>Bloom Home</h1>
  <ul>
    <li><a href="http://localhost:8081">Bloom Web Chat</a></li>
    <li><a href="http://localhost:5000">Bloom Files</a></li>
    <li><a href="http://localhost:8443">Bloom Code</a></li>
  </ul>
</body>
</html>
HTML

      cat > /home/${u}/.config/bloom/home/nginx.conf <<'NGINX'
daemon off;
pid /run/user/1000/bloom-home-nginx.pid;
error_log stderr;
events { worker_connections 64; }
http {
    include ${pkgs.nginx}/conf/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path /home/${u}/.config/bloom/home/tmp;
    server {
        listen 8080;
        root /home/${u}/.config/bloom/home;
        try_files $uri $uri/ =404;
    }
}
NGINX

      cat > /home/${u}/.config/bloom/fluffychat/config.json <<'CONFIG'
{
  "applicationName": "Bloom Web Chat",
  "defaultHomeserver": "http://localhost:6167"
}
CONFIG

      cat > /home/${u}/.config/bloom/fluffychat/nginx.conf <<'NGINX'
daemon off;
pid /run/user/1000/bloom-fluffychat-nginx.pid;
error_log stderr;
events { worker_connections 64; }
http {
    include ${pkgs.nginx}/conf/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path /home/${u}/.config/bloom/fluffychat/tmp;
    server {
        listen 8081;
        location /config.json {
            alias /home/${u}/.config/bloom/fluffychat/config.json;
        }
        location / {
            root /etc/bloom/fluffychat-web;
            try_files $uri $uri/ /index.html;
        }
    }
}
NGINX

      chown -R ${u}:${u} /home/${u}/.config/bloom /home/${u}/.config/code-server /home/${u}/Public/Bloom
    '';
  };
}
