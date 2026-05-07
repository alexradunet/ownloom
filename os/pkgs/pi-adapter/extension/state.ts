import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentDir, atomicWriteText } from "./shared.ts";

export type UpdateStatus = {
  available: boolean;
  behindBy: number;
  checked: string;
  branch?: string;
  notified?: boolean;
};

export function updateStatusPath() {
  return join(agentDir(), "update-status.json");
}

export function readUpdateStatus(): UpdateStatus | null {
  try {
    return JSON.parse(readFileSync(updateStatusPath(), "utf-8")) as UpdateStatus;
  } catch {
    return null;
  }
}

export async function writeUpdateStatus(status: UpdateStatus) {
  const p = updateStatusPath();
  return withFileMutationQueue(p, async () => {
    atomicWriteText(p, JSON.stringify(status, null, 2) + "\n");
  });
}
