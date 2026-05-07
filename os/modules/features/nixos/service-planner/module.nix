{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.nixpi-planner;
  bindHost =
    if lib.hasInfix ":" cfg.host && !(lib.hasPrefix "[" cfg.host)
    then "[${cfg.host}]"
    else cfg.host;
  isLoopback = builtins.elem cfg.host ["127.0.0.1" "::1" "localhost"];
  usesPasswordAuth = cfg.htpasswdFile != null;
  caldavUrl = "http://${bindHost}:${toString cfg.port}/";

  baseSettings = {
    server.hosts = ["${bindHost}:${toString cfg.port}"];
    storage.filesystem_folder = cfg.storageDir;
    auth =
      if usesPasswordAuth
      then {
        type = "htpasswd";
        htpasswd_filename = cfg.htpasswdFile;
        htpasswd_encryption = "bcrypt";
      }
      else {
        type = "none";
      };
  };
in {
  options.services.nixpi-planner = {
    enable = lib.mkEnableOption "standards-based NixPI planner backend using CalDAV/iCalendar";

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = ''
        Address Radicale binds for the NixPI planner CalDAV endpoint.
        Keep loopback-only unless it is protected by TLS and password auth.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 5232;
      description = "TCP port for the NixPI planner CalDAV endpoint.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open the planner CalDAV port in the host firewall.";
    };

    storageDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/nixpi-planner/radicale/collections";
      description = "Filesystem storage directory for Radicale collections.";
    };

    htpasswdFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        Optional htpasswd file for Radicale users. Required before binding the
        planner outside loopback or opening the firewall.
      '';
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = config.nixpi.human.name;
      defaultText = lib.literalExpression "config.nixpi.human.name";
      description = "Planner CalDAV principal used by the local NixPI adapter.";
    };

    collection = lib.mkOption {
      type = lib.types.str;
      default = "planner";
      description = "Planner CalDAV collection name used by the local NixPI adapter.";
    };

    enableServer = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Run nixpi-planner-server as a systemd service for the local web view/API.";
    };

    serverPort = lib.mkOption {
      type = lib.types.port;
      default = 8082;
      description = "TCP port for the nixpi-planner-server web view/API.";
    };

    serverListen = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address nixpi-planner-server binds to. Keep loopback-only unless protected.";
    };

    extraSettings = lib.mkOption {
      type = lib.types.attrs;
      default = {};
      description = "Extra Radicale settings merged over the safe NixPI defaults.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = lib.hasPrefix "/var/lib/" cfg.storageDir;
        message = "services.nixpi-planner.storageDir must live under /var/lib.";
      }
      {
        assertion = isLoopback || usesPasswordAuth;
        message = "services.nixpi-planner.htpasswdFile is required when binding outside loopback.";
      }
      {
        assertion = (!cfg.openFirewall) || usesPasswordAuth;
        message = "services.nixpi-planner.htpasswdFile is required when opening the firewall.";
      }
    ];

    environment.systemPackages = [
      pkgs.nixpi-planner
      pkgs.radicale
    ];

    # Three vars shared by the interactive shell, gateway injection, and the
    # planner server service. Declare once, merge per consumer.
    nixpi.plannerEnvVars = {
      NIXPI_PLANNER_CALDAV_URL = caldavUrl;
      NIXPI_PLANNER_USER = cfg.user;
      NIXPI_PLANNER_COLLECTION = cfg.collection;
    };

    environment.sessionVariables =
      config.nixpi.plannerEnvVars
      // {
        NIXPI_PLANNER_BACKEND = "caldav-radicale";
        NIXPI_PLANNER_COLLECTION_URL = "${caldavUrl}${cfg.user}/${cfg.collection}/";
        NIXPI_PLANNER_COLLECTIONS_DIR = cfg.storageDir;
      };

    networking.firewall.allowedTCPPorts = lib.optional cfg.openFirewall cfg.port;

    systemd.tmpfiles.rules = [
      "d /var/lib/nixpi-planner 0750 radicale radicale - -"
      "d /var/lib/nixpi-planner/radicale 0750 radicale radicale - -"
      "d ${cfg.storageDir} 0750 radicale radicale - -"
    ];

    services.radicale = {
      enable = true;
      settings = lib.recursiveUpdate baseSettings cfg.extraSettings;
      rights = lib.mkIf usesPasswordAuth {
        root = {
          user = ".+";
          collection = "";
          permissions = "R";
        };
        principal = {
          user = ".+";
          collection = "{user}";
          permissions = "RW";
        };
        calendars = {
          user = ".+";
          collection = "{user}/[^/]+";
          permissions = "rw";
        };
      };
    };

    systemd.services.nixpi-planner-server = lib.mkIf cfg.enableServer {
      description = "NixPI planner web view/API server";
      wantedBy = ["multi-user.target"];
      after = ["network.target" "radicale.service"];
      serviceConfig = {
        Type = "simple";
        Restart = "on-failure";
        ExecStart = "${pkgs.nixpi-planner}/bin/nixpi-planner server";
        Environment = lib.mapAttrsToList (k: v: "${k}=${v}") (config.nixpi.plannerEnvVars
          // {
            NIXPI_PLANNER_PORT = toString cfg.serverPort;
            NIXPI_PLANNER_LISTEN = cfg.serverListen;
          });
        User = "radicale";
        Group = "radicale";
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        NoNewPrivileges = true;
        ReadWritePaths = [cfg.storageDir];
      };
    };
  };
}
