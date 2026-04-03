{ pkgs }:
pkgs.writeScriptBin "nixpi-broker" (
  "#!${pkgs.python3}/bin/python3\n" + builtins.readFile ./broker.py
)
