import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleWikiLint } from "../src/wiki/actions-lint.ts";

describe.skip("actions-lint semantic heuristics", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-semantic-"));
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "planner", "tasks"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("defaults to strict lint and keeps curation heuristics opt-in", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "thin-valid-note.md"),
      `---
type: concept
id: concept/thin-valid-note
schema_version: 1
object_type: concept
title: Thin Valid Note
domain: technical
areas: [infra]
status: active
created: 2026-04-21
updated: 2026-04-21
source_ids: [SRC-1]
summary: Valid but intentionally thin note.
---
# Thin Valid Note

Tiny note.
`,
      "utf8",
    );

    const strict = handleWikiLint(wikiRoot);
    const curation = handleWikiLint(wikiRoot, "curation");
    expect(strict.isOk()).toBe(true);
    expect(curation.isOk()).toBe(true);
    if (strict.isOk() && curation.isOk()) {
      expect(strict.value.details?.counts.total).toBe(0);
      expect(curation.value.details?.counts.thinContent).toBe(1);
    }
  });

  it("flags thin knowledge pages but ignores operational notes", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "thin-note.md"),
      `---
type: concept
id: concept/thin-note
object_type: concept
title: Thin Note
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: thin note summary
---
# Thin Note

Tiny note.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "tasks", "short-task.md"),
      `---
type: task
id: task/short-task
object_type: task
title: Short Task
domain: technical
areas: [planning]
status: open
updated: 2026-04-21
summary: short task summary
---
# Short Task
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "thin-content");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.thinContent).toBe(1);
      expect(result.value.details?.issues[0]?.path).toContain("thin-note.md");
      expect(result.value.details?.issues[0]?.message).toContain("Thin content");
    }
  });

  it("does not flag cross-reference gaps when frontmatter relations already model the reference", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "special-topic.md"),
      `---
type: concept
id: concept/special-topic
object_type: concept
title: Special Topic
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: a well developed topic
---
# Special Topic

This page has enough body text to avoid thin-content warnings. It explains the special topic in enough words to clear the threshold comfortably.
`,
      "utf8",
    );

    for (const name of ["one", "two"]) {
      writeFileSync(
        path.join(wikiRoot, "pages", "resources", "technical", `mention-${name}.md`),
        `---
type: concept
id: concept/mention-${name}
object_type: concept
title: Mention ${name}
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
related: [concept/special-topic]
summary: mention page ${name}
---
# Mention ${name}

Special Topic is discussed here and is already represented by a frontmatter relation.
`,
        "utf8",
      );
    }

    const result = handleWikiLint(wikiRoot, "crossref-gaps");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.crossrefGaps).toBe(0);
    }
  });

  it("ignores source packet mentions when checking cross-reference gaps", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "special-topic.md"),
      `---
type: concept
id: concept/special-topic
object_type: concept
title: Special Topic
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: a well developed topic
---
# Special Topic

This page has enough body text to avoid thin-content warnings. It explains the special topic in enough words to clear the threshold comfortably.
`,
      "utf8",
    );

    for (const id of ["one", "two"]) {
      writeFileSync(
        path.join(wikiRoot, "pages", "resources", "technical", `source-${id}.md`),
        `---
type: source
id: source/${id}
object_type: source
title: Source ${id}
domain: technical
areas: [infra]
status: captured
updated: 2026-04-21
source_ids: [SRC-${id}]
summary: source ${id}
---
# Source ${id}

Special Topic is mentioned inside captured evidence, but source packets should not create cross-reference maintenance noise.
`,
        "utf8",
      );
    }

    const result = handleWikiLint(wikiRoot, "crossref-gaps");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.crossrefGaps).toBe(0);
    }
  });

  it("flags pages mentioned across notes without explicit links", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "special-topic.md"),
      `---
type: concept
id: concept/special-topic
object_type: concept
title: Special Topic
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: a well developed topic
---
# Special Topic

This page has enough body text to avoid thin-content warnings. It explains the special topic in enough words to clear the threshold comfortably.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "mention-one.md"),
      `---
type: concept
id: concept/mention-one
object_type: concept
title: Mention One
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
summary: mention page one
---
# Mention One

We should revisit Special Topic during the next infra review.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "mention-two.md"),
      `---
type: concept
id: concept/mention-two
object_type: concept
title: Mention Two
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-3]
summary: mention page two
---
# Mention Two

Special Topic matters here as well, but this note forgot to link it.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "mention-linked.md"),
      `---
type: concept
id: concept/mention-linked
object_type: concept
title: Mention Linked
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-4]
summary: linked mention page
---
# Mention Linked

[Special Topic](./special-topic.md) is already linked correctly here.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "crossref-gaps");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.crossrefGaps).toBe(1);
      expect(result.value.details?.issues[0]?.path).toContain("special-topic.md");
      expect(result.value.details?.issues[0]?.message).toContain("Referenced in 2 page(s) without explicit links");
    }
  });
});
