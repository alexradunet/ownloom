import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWikiLint } from "../src/wiki/actions-lint.ts";

describe.skip("actions-lint v2 frontmatter and links", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-lint-v2-"));
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("validates new v2 frontmatter fields and per-type statuses", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "missing-type.md"),
      `---
title: Missing Type
summary: Missing type field
---
# Missing Type
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "invalid-type.md"),
      `---
type: nope
title: Invalid Type
summary: Invalid type field
---
# Invalid Type
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "invalid-v2.md"),
      `---
type: concept
id: invalid id
object_type: ""
title: Invalid V2
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-1]
summary: ""
schema_version: 2
validation_level: bogus
projects: project/missing
---
# Invalid V2
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "mismatched-id.md"),
      `---
type: concept
id: host/mismatch
object_type: concept
title: Mismatched ID
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-2]
summary: Mismatch
---
# Mismatched ID
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "valid-evolution.md"),
      `---
id: evolution/valid-evolution
schema_version: 1
type: evolution
object_type: evolution
title: Valid Evolution
domain: technical
areas: [planning]
status: planning
created: 2026-04-20
updated: 2026-04-20
source_ids: []
summary: Valid evolution status
---
# Valid Evolution
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "valid-dashboard.md"),
      `---
id: home/valid-dashboard
schema_version: 1
type: synthesis
object_type: dashboard
title: Valid Dashboard
domain: technical
areas: [planning]
status: active
created: 2026-04-20
updated: 2026-04-20
source_ids: []
summary: Valid dashboard prefix
---
# Valid Dashboard
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "bad-task.md"),
      `---
type: task
title: Bad Task
domain: technical
areas: [planning]
status: active
summary: Wrong status for task
---
# Bad Task
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "bad-event.md"),
      `---
type: event
title: Bad Event
domain: technical
areas: [planning]
status: open
summary: Wrong status for event
---
# Bad Event
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "bad-reminder.md"),
      `---
type: reminder
title: Bad Reminder
domain: technical
areas: [planning]
status: active
summary: Wrong status for reminder
---
# Bad Reminder
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "bad-source.md"),
      `---
type: source
source_id: ""
title: Broken Source
status: draft
captured_at: ""
origin_type: blob
origin_value: ""
source_ids: []
summary: source summary
---
# Broken Source
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "frontmatter");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const messages = result.value.details?.issues.map((issue) => issue.message) ?? [];
      expect(messages).toContain("Missing: type");
      expect(messages).toContain("Invalid type: nope");
      expect(messages).toContain("Field summary must be a non-empty string.");
      expect(messages).toContain("Invalid id format: invalid id");
      expect(messages).toContain("Field object_type must be a non-empty string.");
      expect(messages).toContain("Unsupported schema_version: 2");
      expect(messages).toContain("Invalid validation_level: bogus");
      expect(messages).toContain("Field projects must be an array of strings.");
      expect(messages).toContain('id prefix "host" does not match object_type "concept".');
      expect(messages.some((m) => m.includes('Invalid status "planning" for type "evolution"'))).toBe(false);
      expect(messages.some((m) => m.includes('id prefix "home" does not match object_type "dashboard"'))).toBe(false);
      expect(messages.some((m) => m.includes('Invalid status "active" for type "task"'))).toBe(true);
      expect(messages.some((m) => m.includes('Invalid status "open" for type "event"'))).toBe(true);
      expect(messages.some((m) => m.includes('Invalid status "active" for type "reminder"'))).toBe(true);
      expect(messages).toContain("Field source_id must be a non-empty string.");
      expect(messages).toContain("Invalid source status: draft");
      expect(messages).toContain("Invalid origin_type: blob");
      expect(messages).toContain("Field captured_at must be a non-empty string.");
      expect(messages).toContain("Field origin_value must be a non-empty string.");
    }
  });

  it("checks markdown heading links, implicit .md targets, absolute targets, and ignores external links", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "target.md"),
      `---
type: concept
title: Target
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-1]
summary: Target summary
---
# Target

## Deep Heading
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "good-links.md"),
      `---
type: concept
title: Good Links
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-2]
summary: Good links summary
---
# Good Links

[Relative](./target.md#Deep Heading)
[Implicit](./target#Deep Heading)
[Absolute](/pages/resources/technical/target.md#Deep Heading)
[Anchor Only](#local)
[External](https://example.com)
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "bad-heading.md"),
      `---
type: concept
title: Bad Heading
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-3]
summary: Bad heading summary
---
# Bad Heading

[Missing](./target.md#Nope)
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "links");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.brokenLinks).toBe(1);
      expect(result.value.details?.issues[0]?.message).toContain("Broken markdown heading link");
    }
  });

  it("all mode exposes the new count buckets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "alpha.md"),
      `---
type: concept
id: concept/shared
object_type: concept
title: Alpha
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-1]
summary: Alpha
next_review: 2026-04-01
projects: [project/missing]
---
# Alpha
[Ghost](./ghost.md)
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "beta.md"),
      `---
type: concept
id: concept/shared
object_type: concept
title: Beta
domain: technical
areas: [infra]
status: active
updated: 2026-04-20
source_ids: [SRC-2]
summary: ""
---
# Beta
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "all");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const counts = result.value.details?.counts;
      expect(counts?.brokenLinks).toBe(1);
      expect(counts?.staleReviews).toBe(1);
      expect(counts?.emptySummary).toBe(1);
      expect(counts?.duplicateIds).toBe(1);
      expect(counts?.unresolvedIds).toBe(1);
      expect(result.value.text).toContain("review=1");
      expect(result.value.text).toContain("dupId=1");
      expect(result.value.text).toContain("unresolved=1");
    }
  });
});
