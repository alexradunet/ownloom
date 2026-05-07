{
  lib,
  writeShellApplication,
  coreutils,
  findutils,
  gnugrep,
  jq,
  nixos-rebuild,
  nixpi-planner,
  nixpi-wiki,
  podman,
  procps,
}:
writeShellApplication {
  name = "nixpi-context";

  runtimeInputs = [
    coreutils
    findutils
    gnugrep
    jq
    nixos-rebuild
    nixpi-planner
    nixpi-wiki
    podman
    procps
  ];

  text = builtins.readFile ./nixpi-context.sh;

  meta = {
    description = "Print the current NixPI agent context for prompt injection";
    license = lib.licenses.mit;
    mainProgram = "nixpi-context";
  };
}
