import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function atomicWriteFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}
