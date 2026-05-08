{
  lib,
  makeWrapper,
  nodejs,
  stdenvNoCC,
}:
stdenvNoCC.mkDerivation {
  pname = "ownloom-gateway-web";
  version = "0.1.0";

  src = lib.cleanSource ./.;

  nativeBuildInputs = [makeWrapper];

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/ownloom-gateway-web $out/bin
    cp -r public README.md server.mjs $out/share/ownloom-gateway-web/

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
