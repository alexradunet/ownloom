# CLAUDE.md

## Project

Bloom — Pi-native OS platform on Fedora bootc. Pi IS the product. Bloom is the OS concept — a Fedora bootc image that makes Pi a first-class citizen with extensions teaching it about its host.
The bloom word comes from the concept that you "plant" your mini-pc and then in time it grows and blooms with you.

## Architecture

- **Pi package**: Extensions + skills bundled as a Pi package (`pi install ./`)
- **Extensions**: `extensions/` — TypeScript Pi extensions (bloom-persona, bloom-os, bloom-memory, bloom-channels)
- **Skills**: `skills/` — Pi skill markdown files (os-operations, bridge-management, object-store, self-evolution)
- **Persona**: `persona/` — OpenPersona 4-layer identity (SOUL.md, BODY.md, FACULTY.md, SKILL.md)
- **OS image**: `os/Containerfile` — Fedora bootc 42

## Build and Test

```bash
npm install                    # install dev deps
npm run build                  # tsc --build
npm run check                  # biome lint + format check
npm run check:fix              # biome auto-fix
```

## Conventions

- **TypeScript**: strict, ES2022, NodeNext
- **Formatting**: Biome (tabs, double quotes)
- **Extensions**: `export default function(pi: ExtensionAPI) { ... }` pattern
- **Skills**: SKILL.md with frontmatter (name, description)
- **Containers**: `Containerfile` (not Dockerfile), `podman` (not docker)

## Do Not

- Add eslint, prettier, or formatting tools besides Biome
- Use `Dockerfile` naming — always `Containerfile`
- Use `docker` CLI — always `podman`
- Import from pi SDK at runtime — use `peerDependencies` only
