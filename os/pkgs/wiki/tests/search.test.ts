import { describe, expect, it } from "vitest";
import { handleWikiSearch, searchRegistry } from "../src/wiki/actions-search.ts";
import type { RegistryData, RegistryEntry } from "../src/wiki/types.ts";

function makeEntry(overrides: Partial<RegistryEntry>): RegistryEntry {
  return {
    type: "concept",
    path: "pages/resources/technical/default.md",
    folder: "resources/technical",
    title: "Default",
    aliases: [],
    summary: "",
    status: "active",
    tags: [],
    hosts: [],
    domain: "technical",
    areas: ["infrastructure"],
    updated: "2026-04-19",
    sourceIds: [],
    linksOut: [],
    headings: [],
    wordCount: 10,
    ...overrides,
  };
}

function makeRegistry(pages: RegistryEntry[]): RegistryData {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    pages,
  };
}

describe("searchRegistry", () => {
  it("ranks exact title matches first", () => {
    const registry = makeRegistry([
      makeEntry({ title: "Attention Mechanism", path: "pages/resources/technical/attention-mechanism.md" }),
      makeEntry({ title: "Attention", path: "pages/resources/technical/attention.md" }),
    ]);

    const result = searchRegistry(registry, "Attention");
    expect(result.matches[0]?.title).toBe("Attention");
    expect(result.matches[0]?.score).toBeGreaterThanOrEqual(120);
  });

  it("can find by alias, domain, and area", () => {
    const registry = makeRegistry([
      makeEntry({
        title: "Flake Patterns",
        aliases: ["nix flakes"],
        domain: "technical",
        areas: ["nixos", "infrastructure"],
        path: "pages/resources/technical/flake-patterns.md",
      }),
    ]);

    expect(searchRegistry(registry, "nix flakes").matches[0]?.title).toBe("Flake Patterns");
    expect(searchRegistry(registry, "technical", { domain: "technical" }).matches[0]?.title).toBe("Flake Patterns");
    expect(searchRegistry(registry, "nixos", { areas: ["nixos"] }).matches[0]?.title).toBe("Flake Patterns");
  });

  it("scores headings, tags, source ids, and paths", () => {
    const registry = makeRegistry([
      makeEntry({
        title: "System Landscape",
        headings: ["Kernel Tuning"],
        tags: ["performance"],
        sourceIds: ["SRC-2026-04-19-001"],
        path: "pages/resources/technical/system-landscape.md",
      }),
    ]);

    expect(searchRegistry(registry, "kernel").matches[0]?.title).toBe("System Landscape");
    expect(searchRegistry(registry, "performance").matches[0]?.title).toBe("System Landscape");
    expect(searchRegistry(registry, "src-2026-04-19-001").matches[0]?.title).toBe("System Landscape");
    expect(searchRegistry(registry, "system-landscape").matches[0]?.title).toBe("System Landscape");
  });

  it("filters by folder, host, domain, type, objectType, and area conjunction", () => {
    const registry = makeRegistry([
      makeEntry({
        title: "pad Host Notes",
        objectType: "host",
        path: "pages/resources/technical/pad.md",
        folder: "resources/technical",
        hosts: ["yoga-nixos"],
        domain: "technical",
        areas: ["infra", "ops"],
      }),
      makeEntry({
        title: "Personal Identity",
        type: "identity",
        objectType: "person",
        path: "pages/areas/personal/personal-identity.md",
        folder: "areas/personal",
        domain: "personal",
        areas: ["identity"],
      }),
    ]);

    expect(searchRegistry(registry, "notes", { folder: "resources/technical", host: "yoga-nixos" }).matches).toHaveLength(1);
    expect(searchRegistry(registry, "notes", { folder: "resources/technical", host: "vps-nixos" }).matches).toHaveLength(0);
    expect(searchRegistry(registry, "identity", { domain: "personal", type: "identity" }).matches[0]?.title).toBe("Personal Identity");
    expect(searchRegistry(registry, "identity", { objectType: "person", hostScope: "all" }).matches[0]?.title).toBe("Personal Identity");
    expect(searchRegistry(registry, "notes", { objectType: "host", host: "yoga-nixos" }).matches[0]?.title).toBe("pad Host Notes");
    expect(searchRegistry(registry, "notes", { areas: ["infra", "ops"], host: "yoga-nixos" }).matches).toHaveLength(1);
    expect(searchRegistry(registry, "notes", { areas: ["infra", "missing"], host: "yoga-nixos" }).matches).toHaveLength(0);
  });

  it("includes host-specific pages only in hostScope=all or matching host", () => {
    const registry = makeRegistry([
      makeEntry({ title: "Shared", path: "pages/resources/technical/shared.md", hosts: [] }),
      makeEntry({ title: "Laptop", path: "pages/resources/technical/laptop.md", hosts: ["yoga-nixos"] }),
    ]);

    expect(searchRegistry(registry, "laptop", { host: "vps-nixos" }).matches).toHaveLength(0);
    const result = searchRegistry(registry, "laptop", { host: "vps-nixos", hostScope: "all" });
    expect(result.matches).toHaveLength(1);
    expect(result.host).toBeUndefined();
  });

  it("normalizes query options and enforces limits", () => {
    const registry = makeRegistry([
      makeEntry({ title: "Alpha Note", areas: ["infra"], path: "pages/resources/technical/alpha-note.md" }),
      makeEntry({ title: "Alpha Systems", areas: ["infra"], path: "pages/resources/technical/alpha-systems.md" }),
      makeEntry({ title: "Alpha Docs", areas: ["infra"], path: "pages/resources/technical/alpha-docs.md" }),
    ]);

    const result = searchRegistry(registry, "Alpha Alpha", {
      domain: " Technical ",
      areas: [" Infra "],
      folder: " resources/technical ",
      limit: 2,
    });

    expect(result.domain).toBe("technical");
    expect(result.areas).toEqual(["infra"]);
    expect(result.folder).toBe("resources/technical");
    expect(result.matches).toHaveLength(2);
  });

  it("returns no matches for empty queries", () => {
    const registry = makeRegistry([makeEntry({ title: "Anything" })]);
    expect(searchRegistry(registry, "   ").matches).toEqual([]);
  });
});

describe("handleWikiSearch", () => {
  it("renders scope info in successful search output", () => {
    const registry = makeRegistry([
      makeEntry({ title: "Daily Journal", type: "journal", path: "pages/journal/daily/2026-04-19.md", folder: "journal/daily", domain: "personal", areas: ["journal"] }),
    ]);

    const result = handleWikiSearch(registry, "daily", {
      domain: "personal",
      areas: ["journal"],
      folder: "journal/daily",
      host: "yoga-nixos",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toContain("domain=personal");
      expect(result.value.text).toContain("areas=journal");
      expect(result.value.text).toContain("folder=journal/daily");
    }
  });

  it("renders no-match output with scope info", () => {
    const result = handleWikiSearch(makeRegistry([]), "ghost", { domain: "technical", folder: "resources/technical" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toContain("No wiki matches");
      expect(result.value.text).toContain("domain=technical");
      expect(result.value.text).toContain("folder=resources/technical");
    }
  });

  it("renders domain, area, host, and objectType suffixes for successful matches", () => {
    const registry = makeRegistry([
      makeEntry({
        title: "Laptop Note",
        objectType: "host",
        hosts: ["yoga-nixos"],
        domain: "technical",
        areas: ["infra", "ops"],
        summary: "Host-specific note",
      }),
    ]);

    const result = handleWikiSearch(registry, "laptop", { host: "yoga-nixos" });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toContain("(concept/host)");
      expect(result.value.text).toContain("[domain: technical]");
      expect(result.value.text).toContain("[areas: infra, ops]");
      expect(result.value.text).toContain("[hosts: yoga-nixos]");
    }
  });
});
