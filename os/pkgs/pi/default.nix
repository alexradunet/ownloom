{
  lib,
  buildNpmPackage,
  fetchurl,
  fetchNpmDeps,
  fd,
  ripgrep,
  runCommand,
}: let
  versionData = lib.importJSON ./hashes.json;
  inherit (versionData) version;

  # Package the published pi npm tarball, but keep the lockfile in-repo so
  # we control updates ourselves.
  srcWithLock = runCommand "pi-src-with-lock" {} ''
    mkdir -p $out
    tar -xzf ${
      fetchurl {
        url = "https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-${version}.tgz";
        hash = versionData.sourceHash;
      }
    } -C $out --strip-components=1
    cp ${./package-lock.json} $out/package-lock.json
  '';
in
  buildNpmPackage {
    inherit version;
    pname = "pi";

    src = srcWithLock;

    npmDeps = fetchNpmDeps {
      src = srcWithLock;
      hash = versionData.npmDepsHash;
    };
    makeCacheWritable = true;

    dontNpmBuild = true;

    postInstall = ''
      wrapProgram $out/bin/pi \
        --prefix PATH : ${
        lib.makeBinPath [
          fd
          ripgrep
        ]
      } \
        --set PI_SKIP_VERSION_CHECK 1 \
        --set PI_TELEMETRY 0
    '';

    meta = {
      description = "A terminal-based coding agent with multi-model support";
      homepage = "https://github.com/badlogic/pi-mono";
      changelog = "https://github.com/badlogic/pi-mono/releases";
      license = lib.licenses.mit;
      sourceProvenance = with lib.sourceTypes; [binaryBytecode];
      platforms = lib.platforms.all;
      mainProgram = "pi";
    };
  }
