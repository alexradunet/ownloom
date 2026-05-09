{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
}:
buildNpmPackage {
  pname = "ownloom-wiki";
  version = "0.3.0";

  src = lib.cleanSourceWith {
    # The wiki adapter tests import the sibling pi-adapter package via
    # ../../pi-adapter, so the package source is rooted at os/pkgs while npm
    # still runs from the wiki package directory.
    src = ./..;
    filter = path: _type: let
      base = baseNameOf path;
      parent = baseNameOf (dirOf path);
      forbidden = [
        "node_modules"
        "dist"
        "dist-test"
        "coverage"
        ".vite"
      ];
    in
      !(lib.elem base forbidden || lib.elem parent forbidden || lib.hasSuffix ".sqlite" base);
  };

  npmRoot = "wiki";
  npmDepsHash = "sha256-Qc7KY8/wMoC0k+WRFbGV9aNBaWAG5bRGR5n1/hIRbLA=";

  nativeBuildInputs = [makeWrapper];
  makeCacheWritable = true;

  buildPhase = ''
    runHook preBuild
    cd wiki
    npm run build
    cd ..
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    cd wiki
    npm test
    cd ..
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/ownloom-wiki $out/bin
    cd wiki
    cp -r dist package.json README.md seed skill $out/share/ownloom-wiki/
    cd ..

    makeWrapper ${nodejs}/bin/node $out/bin/ownloom-wiki \
      --add-flags "$out/share/ownloom-wiki/dist/cli.cjs"

    runHook postInstall
  '';

  meta = {
    description = "Portable plain-Markdown LLM wiki CLI and core tools";
    license = lib.licenses.mit;
    mainProgram = "ownloom-wiki";
  };
}
