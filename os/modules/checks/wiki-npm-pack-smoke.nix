{
  buildNpmPackage,
  jq,
  lib,
  gnutar,
  ripgrep,
}:
buildNpmPackage {
  pname = "ownloom-wiki-npm-pack-smoke";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ../../pkgs/wiki;
    filter = path: _type: let
      base = baseNameOf path;
      parent = baseNameOf (dirOf path);
      forbidden = [
        "node_modules"
        "dist"
        ".vite"
      ];
    in
      !(lib.elem base forbidden || lib.elem parent forbidden || lib.hasSuffix ".sqlite" base);
  };

  npmDepsHash = "sha256-Qc7KY8/wMoC0k+WRFbGV9aNBaWAG5bRGR5n1/hIRbLA=";

  nativeBuildInputs = [gnutar jq ripgrep];
  makeCacheWritable = true;
  doCheck = true;

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  checkPhase = ''
    runHook preCheck

    pack_dir="$TMPDIR/pack"
    mkdir -p "$pack_dir"
    npm pack --json --pack-destination "$pack_dir" > pack.json
    tarball="$pack_dir/$(jq -r '.[0].filename' pack.json)"

    tar -tzf "$tarball" | grep '^package/dist/cli.cjs$'
    tar -tzf "$tarball" | grep '^package/dist/api.cjs$'
    tar -tzf "$tarball" | grep '^package/seed/WIKI_SCHEMA.md$'
    tar -tzf "$tarball" | grep '^package/seed/templates/markdown/page.md$'
    tar -tzf "$tarball" | grep '^package/skill/wiki/SKILL.md$'
    ! tar -tzf "$tarball" | grep '^package/dist/cli.js$'

    install_dir="$TMPDIR/install"
    mkdir -p "$install_dir"
    cd "$install_dir"
    npm init -y >/dev/null
    npm install --offline --ignore-scripts --no-audit --no-fund "$tarball" >/dev/null

    cli="./node_modules/@ownloom/wiki/dist/cli.cjs"

    node -e "const api = require('@ownloom/wiki'); if (!api.toolManifest?.some((tool) => tool.name === 'wiki_status')) process.exit(1);"
    node "$cli" list --json | jq -e 'all(.[]; .name | startswith("wiki_"))'
    node "$cli" list > list.txt
    grep 'wiki_status' list.txt

    node "$cli" init --root "$install_dir/wiki" --workspace work --domain work --json \
      | jq -e '.ok == true and .workspace == "work" and .domain == "work"'

    OWNLOOM_WIKI_ROOT="$install_dir/wiki" \
    OWNLOOM_WIKI_WORKSPACE=work \
    OWNLOOM_WIKI_DEFAULT_DOMAIN=work \
    OWNLOOM_WIKI_REPO_ROOT="$install_dir/wiki" \
      node "$cli" doctor --json | jq -e '.ok == true'

    ! rg -ni 'nixpi|\bpi\b|pi_llm|nixpi-tool|current[_-]?state|currentstateaudit|flakehosts|piextensions|callnixpi|buildnixpi|\bpersona\b|assistant-profile|/home/alex|vps-nixos|nixos|syncthing|personal-second-brain' "$install_dir/wiki"

    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    touch $out/passed
    runHook postInstall
  '';

  meta = {
    description = "ownloom Wiki npm pack/install smoke test";
    license = lib.licenses.mit;
  };
}
