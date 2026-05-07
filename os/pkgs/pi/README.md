# Updating `pi`

This package builds the published npm tarball for `@mariozechner/pi-coding-agent` and pins:

- `version` in `hashes.json`
- `sourceHash` in `hashes.json`
- upstream `package-lock.json`
- `npmDepsHash` in `hashes.json`

## Update flow

From the repo root:

```bash
version="0.72.1"
url="https://registry.npmjs.org/@mariozechner/pi-coding-agent/-/pi-coding-agent-${version}.tgz"
tmpdir="$(mktemp -d)"

curl -L "$url" -o "$tmpdir/pi.tgz"
tar -xzf "$tmpdir/pi.tgz" -C "$tmpdir"
(cd "$tmpdir/package" && npm install --package-lock-only --ignore-scripts)
cp "$tmpdir/package/package-lock.json" ./os/pkgs/pi/package-lock.json
```

Update `pkgs/pi/hashes.json`:

- set `version` to the new version
- set `sourceHash` with:

```bash
nix-prefetch-url --type sha256 "$url" | xargs -I{} nix hash to-sri --type sha256 {}
```

- set `npmDepsHash` with:

```bash
nix run nixpkgs#prefetch-npm-deps -- ./os/pkgs/pi/package-lock.json
```

## Verify

```bash
nix build .#pi
nix run .#pi -- --help
```

If the build reports a fixed-output hash mismatch, replace the hash in `pkgs/pi/hashes.json` with the hash shown by Nix and build again.

## Notes

- The package definition is in `os/pkgs/pi/default.nix`.
- The flake exposes `pi` as both:
  - `packages.x86_64-linux.pi`
  - `apps.x86_64-linux.pi`
- If upstream changes the tarball layout or entrypoint, update `pkgs/pi/default.nix` too.
