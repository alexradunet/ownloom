/**
 * actions-pages v2 tests — updated for v2 frontmatter schema.
 * Tests validate: no object_type, no schema_version, no validation_level,
 * new confidence/last_confirmed/decay fields, objects/ default folder.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rebuildAllMeta } from "../src/wiki/actions-meta.ts";
import { handleEnsurePage } from "../src/wiki/actions-pages.ts";

describe("actions-pages v2 scaffolding", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-pages-v2-"));
    mkdirSync(path.join(wikiRoot, "objects"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("creates v2 canonical notes with confidence, decay, last_confirmed and no v1 fields", () => {
    rebuildAllMeta(wikiRoot);
    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Flake Patterns",
      domain: "technical",
      areas: ["nixos"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, result.value.details.path), "utf8");
      expect(content).toContain("id: concept/flake-patterns");
      expect(content).toContain("type: concept");
      expect(content).toContain("confidence:");
      expect(content).toContain("decay: slow"); // concept = slow
      expect(content).toContain("last_confirmed:");
      // v2: no v1 fields
      expect(content).not.toContain("object_type:");
      expect(content).not.toContain("schema_version:");
      expect(content).not.toContain("validation_level:");
      expect(content).not.toContain("review_cycle_days:");
    }
  });

  it("creates task, event, and reminder context pages in objects/ without live planner frontmatter", () => {
    rebuildAllMeta(wikiRoot);

    const task = handleEnsurePage(wikiRoot, { type: "task", title: "Pay rent", domain: "personal" });
    const event = handleEnsurePage(wikiRoot, { type: "event", title: "Weekly Sync", domain: "technical" });
    const reminder = handleEnsurePage(wikiRoot, { type: "reminder", title: "Review backups", domain: "technical" });

    expect(task.isOk()).toBe(true);
    expect(event.isOk()).toBe(true);
    expect(reminder.isOk()).toBe(true);

    if (task.isOk() && task.value.details?.resolved && !task.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, task.value.details.path), "utf8");
      // v2: planner types go to objects/ by default
      expect(task.value.details.path).toBe("objects/pay-rent.md");
      expect(content).toContain("type: task");
      expect(content).not.toContain("object_type:");
      expect(content).not.toContain("priority:");
      expect(content).not.toContain("due:");
    }

    if (event.isOk() && event.value.details?.resolved && !event.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, event.value.details.path), "utf8");
      expect(event.value.details.path).toBe("objects/weekly-sync.md");
      expect(content).toContain("type: event");
      expect(content).not.toContain("start:");
      expect(content).not.toContain("end:");
    }

    if (reminder.isOk() && reminder.value.details?.resolved && !reminder.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, reminder.value.details.path), "utf8");
      expect(reminder.value.details.path).toBe("objects/review-backups.md");
      expect(content).toContain("type: reminder");
      expect(content).not.toContain("remind_at:");
    }
  });

  it("creates person, project, decision objects in objects/ with correct decay", () => {
    rebuildAllMeta(wikiRoot);

    const person = handleEnsurePage(wikiRoot, { type: "person", title: "Alice", domain: "personal" });
    const project = handleEnsurePage(wikiRoot, { type: "project", title: "NixPI v2", domain: "technical" });
    const decision = handleEnsurePage(wikiRoot, { type: "decision", title: "Use TypeScript", domain: "technical" });

    expect(person.isOk()).toBe(true);
    expect(project.isOk()).toBe(true);
    expect(decision.isOk()).toBe(true);

    if (person.isOk() && person.value.details?.resolved) {
      const content = readFileSync(path.join(wikiRoot, person.value.details.path), "utf8");
      expect(content).toContain("type: person");
      expect(content).toContain("decay: slow");
    }
    if (project.isOk() && project.value.details?.resolved) {
      const content = readFileSync(path.join(wikiRoot, project.value.details.path), "utf8");
      expect(content).toContain("type: project");
      expect(content).toContain("decay: normal");
    }
    if (decision.isOk() && decision.value.details?.resolved) {
      const content = readFileSync(path.join(wikiRoot, decision.value.details.path), "utf8");
      expect(content).toContain("type: decision");
      expect(content).toContain("decay: slow");
    }
  });
});
