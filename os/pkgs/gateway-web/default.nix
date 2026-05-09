{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs,
}:
buildNpmPackage {
  pname = "ownloom-gateway-web";
  version = "0.1.0";

  src = lib.cleanSource ./.;

  npmDepsHash = "sha256-U+5HTH/K1qnqzFiWziiY3RQONXoXnBRHV3/iuOpdONU=";

  nativeBuildInputs = [makeWrapper];

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run check
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/ownloom-gateway-web $out/bin
    cp -r public README.md server.mjs package.json $out/share/ownloom-gateway-web/

    makeWrapper ${nodejs}/bin/node $out/bin/ownloom-gateway-web \
      --add-flags "$out/share/ownloom-gateway-web/server.mjs" \
      --set-default OWNLOOM_GATEWAY_WEB_STATIC_ROOT "$out/share/ownloom-gateway-web/public"
    runHook postInstall
  '';

  meta = {
    description = "Static protocol/v1 web client skeleton for Ownloom Gateway";
    license = lib.licenses.mit;
    mainProgram = "ownloom-gateway-web";
  };
}
