import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "./markdown.js";

export function ensureMarkdownFile(filePath: string, buildContent: () => string): string {
  if (existsSync(filePath)) return readFileSync(filePath, "utf-8");

  const content = buildContent();
  mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteFile(filePath, content);
  return content;
}

function updateFrontmatterField(raw: string, key: string, value: string): string {
  if (!raw.startsWith("---\n")) return raw;
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return raw;

  const frontmatter = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const field = new RegExp(`(^|\\n)${escapedKey}:\\s*.*?(\\n|$)`);
  const nextFrontmatter = field.test(frontmatter)
    ? frontmatter.replace(field, `$1${key}: ${value}$2`)
    : `${frontmatter}\n${key}: ${value}`;

  return `---\n${nextFrontmatter}\n---\n${body}`;
}

export function updateFrontmatterUpdated(raw: string, date: string): string {
  return updateFrontmatterField(raw, "updated", date);
}

export function appendBulletUnderHeading(
  raw: string,
  options: {
    heading: string;
    entry: string;
    parentHeading?: string;
    blankLineAfterHeading?: boolean;
  },
): string {
  const headingLine = `${options.heading}\n`;
  const bulletBlock = `${options.blankLineAfterHeading === false ? "" : "\n"}- ${options.entry}\n`;

  if (raw.includes(headingLine)) {
    return raw.replace(headingLine, `${headingLine}${bulletBlock}`);
  }

  if (options.parentHeading) {
    const parentLine = `${options.parentHeading}\n`;
    if (raw.includes(parentLine)) {
      return raw.replace(parentLine, `${parentLine}\n${options.heading}\n${bulletBlock}`);
    }
  }

  const trimmed = raw.replace(/\s+$/g, "");
  const parentPrefix = options.parentHeading ? `\n\n${options.parentHeading}\n` : "";
  return `${trimmed}${parentPrefix}\n\n${options.heading}\n${bulletBlock}`;
}
