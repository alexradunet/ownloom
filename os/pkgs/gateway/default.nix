{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
  nixpi-wiki,
}:
buildNpmPackage {
  pname = "nixpi-gateway";
  version = "0.1.0";

  src = ./.;

  npmDepsHash = "sha256-+bqjYFU/xRSK1wfnVmC6xnd6eppQeqIwBq0wVPdY244=";

  nativeBuildInputs = [makeWrapper nixpi-wiki];

  makeCacheWritable = true;
  env.PUPPETEER_SKIP_DOWNLOAD = "1";

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --ignore-scripts --no-audit --no-fund

    mkdir -p $out/share/nixpi-gateway $out/bin
    cp -r dist ui node_modules package.json $out/share/nixpi-gateway/

    makeWrapper ${nodejs}/bin/node $out/bin/nixpi-gateway \
      --add-flags "$out/share/nixpi-gateway/dist/main.js"

    runHook postInstall
  '';

  meta = {
    description = "NixPI generic transport gateway — routes WhatsApp and local API messages to a configurable agent backend";
    license = lib.licenses.mit;
    mainProgram = "nixpi-gateway";
  };
}
