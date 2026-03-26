{ stdenvNoCC }:

stdenvNoCC.mkDerivation {
  pname = "nixpi-setup";
  version = "0.1.0";

  dontUnpack = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/bin"
    install -m 0755 ${../../../scripts/setup-lib.sh} "$out/bin/setup-lib.sh"
    install -m 0755 ${../../../scripts/setup-wizard.sh} "$out/bin/setup-wizard.sh"
    install -m 0755 ${../../../scripts/wizard-identity.sh} "$out/bin/wizard-identity.sh"
    install -m 0755 ${../../../scripts/wizard-matrix.sh} "$out/bin/wizard-matrix.sh"
    install -m 0755 ${../../../scripts/wizard-repo.sh} "$out/bin/wizard-repo.sh"
    install -m 0755 ${../../../scripts/wizard-promote.sh} "$out/bin/wizard-promote.sh"

    runHook postInstall
  '';
}
