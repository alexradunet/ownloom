{pkgs, ...}: {
  environment.systemPackages = with pkgs; [
    bash-completion
    bubblewrap
    curl
    dua
    eza
    fastfetch
    fd
    fzf
    git
    jq
    ownloom-context
    ownloom-wiki
    nodejs
    pi
    procs
    python3
    ripgrep
    zellij
    # Language servers (visible to pi agent and any LSP-capable editor)
    nixd # Nix LSP, nix-community supported
    bash-language-server
    typescript-language-server
    typescript # tsserver, used by typescript-language-server
    ripgrep-all
    tree
    unzip
    vivid
    wget
    zoxide
  ];
}
