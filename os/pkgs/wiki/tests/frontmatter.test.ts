import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteFile, ensureDir } from "../src/wiki/lib/filesystem.ts";
import { err, ok } from "../src/wiki/lib/core-utils.ts";
import { parseFrontmatter, stringifyFrontmatter } from "../src/wiki/lib/frontmatter.ts";
import { EmptyToolParams, errorResult, nowIso, textToolResult, toToolResult, truncate } from "../src/wiki/lib/utils.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("frontmatter", () => {
  it("serializes and parses structured frontmatter", () => {
    const markdown = stringifyFrontmatter(
      {
        type: "concept",
        title: "System Landscape",
        tags: ["nixos", "pi"],
        hosts: ["yoga-nixos"],
        domain: "technical",
        areas: ["infrastructure", "ai"],
      },
      "# Body",
    );

    const parsed = parseFrontmatter(markdown);
    expect(parsed.attributes).toMatchObject({
      type: "concept",
      title: "System Landscape",
      tags: ["nixos", "pi"],
      hosts: ["yoga-nixos"],
      domain: "technical",
      areas: ["infrastructure", "ai"],
    });
    expect(parsed.body).toBe("# Body");
  });

  it("parses comma-separated arrays as flexible input", () => {
    const parsed = parseFrontmatter(`---
aliases: foo, bar
tags: one, two
hosts: yoga-nixos, vps-nixos
areas: infra, ai
---
body
`);

    expect(parsed.attributes.aliases).toEqual(["foo", "bar"]);
    expect(parsed.attributes.tags).toEqual(["one", "two"]);
    expect(parsed.attributes.hosts).toEqual(["yoga-nixos", "vps-nixos"]);
    expect(parsed.attributes.areas).toEqual(["infra", "ai"]);
  });

  it("parses CRLF frontmatter from Windows editors", () => {
    const parsed = parseFrontmatter("---\r\ntitle: Windows Note\r\ntags: work, wiki\r\n---\r\n# Body\r\n");

    expect(parsed.attributes).toMatchObject({ title: "Windows Note", tags: ["work", "wiki"] });
    expect(parsed.body).toBe("# Body\r\n");
  });

  it("returns empty attributes for malformed frontmatter", () => {
    const parsed = parseFrontmatter(`---
: bad yaml
---
hello
`);
    expect(parsed.attributes).toEqual({});
    expect(parsed.body).toContain("hello");
  });

  it("returns empty attributes when frontmatter parses to a non-object", () => {
    const parsed = parseFrontmatter(`---
- one
- two
---
body
`);
    expect(parsed.attributes).toEqual({});
    expect(parsed.body).toContain("body");
  });

  it("handles missing closing delimiter by treating the whole input as body", () => {
    const parsed = parseFrontmatter(`---
title: Missing close
body
`);
    expect(parsed.attributes).toEqual({});
    expect(parsed.body).toContain("title: Missing close");
  });

  it("supports trailing frontmatter delimiters without a body", () => {
    const parsed = parseFrontmatter(`---
title: Header Only
aliases: one, two
---`);
    expect(parsed.attributes).toMatchObject({
      title: "Header Only",
      aliases: ["one", "two"],
    });
    expect(parsed.body).toBe("");
  });

  it("stringifies empty frontmatter objects with explicit delimiters", () => {
    expect(stringifyFrontmatter({}, "body")).toBe(`---
---
body`);
  });
});

describe("helper utilities", () => {
  it("writes files atomically and creates directories on demand", () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-wiki-frontmatter-"));
    const nestedDir = path.join(tempDir, "nested", "dir");
    ensureDir(nestedDir);
    expect(existsSync(nestedDir)).toBe(true);

    const filePath = path.join(nestedDir, "note.md");
    atomicWriteFile(filePath, "hello");
    expect(readFileSync(filePath, "utf8")).toBe("hello");

    const brandNewPath = path.join(tempDir, "brand", "new", "file.md");
    atomicWriteFile(brandNewPath, "seed");
    expect(readFileSync(brandNewPath, "utf8")).toBe("seed");
  });

  it("converts action results to tool results", () => {
    expect(toToolResult(ok({ text: "worked", details: { a: 1 } }))).toEqual({
      content: [{ type: "text", text: "worked" }],
      details: { a: 1 },
    });
    expect(toToolResult(err("failed"))).toEqual({
      content: [{ type: "text", text: "failed" }],
      details: {},
      isError: true,
    });
    expect(errorResult("boom")).toEqual({
      content: [{ type: "text", text: "boom" }],
      details: {},
      isError: true,
    });
    expect(textToolResult("plain", { ok: true })).toEqual({
      content: [{ type: "text", text: "plain" }],
      details: { ok: true },
    });

    expect((EmptyToolParams as { type?: string }).type).toBe("object");
  });

  it("truncates long text and emits ISO timestamps without milliseconds", () => {
    const long = Array.from({ length: 2500 }, (_, i) => `line-${i}`).join("\n");
    expect(truncate(long)).toContain("line-0");
    expect(truncate(long).split("\n").length).toBeLessThanOrEqual(2000);
    expect(nowIso()).toMatch(/Z$/);
    expect(nowIso()).not.toContain(".");
  });
});
