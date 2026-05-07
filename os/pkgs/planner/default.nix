{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
  radicale,
}:
buildNpmPackage {
  pname = "nixpi-planner";
  version = "0.1.0";

  src = ./.;

  npmDepsHash = "sha256-+sTP1dDppWDS1MosH6wi1Pd1bo9Qlf52b1aJfmfa21w=";

  nativeBuildInputs = [makeWrapper radicale];

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

    mkdir -p $out/share/nixpi-planner $out/bin
    cp -r dist node_modules package.json $out/share/nixpi-planner/

    makeWrapper ${nodejs}/bin/node $out/bin/nixpi-planner \
      --add-flags "$out/share/nixpi-planner/dist/cli.js"

    makeWrapper ${nodejs}/bin/node $out/bin/nixpi-planner-server \
      --add-flags "$out/share/nixpi-planner/dist/server.js"

    runHook postInstall
  '';

  meta = {
    description = "Tiny NixPI planner adapter for local CalDAV/iCalendar tasks, reminders, and events";
    license = lib.licenses.mit;
    mainProgram = "nixpi-planner";
  };
}
