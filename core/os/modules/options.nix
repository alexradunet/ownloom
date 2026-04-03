# core/os/modules/options.nix
# Aggregates NixPI option declarations split by concern.
{ ... }:

{
  imports = [
    ./options/core.nix
    ./options/security.nix
    ./options/bootstrap.nix
    ./options/agent.nix
    ./options/services.nix
    ./options/network.nix
  ];
}
