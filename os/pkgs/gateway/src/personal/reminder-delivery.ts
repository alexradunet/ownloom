import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DeliveryService } from "../core/delivery.js";
import type { Store } from "../core/store.js";

const execFileAsync = promisify(execFile);

export type ReminderItem = {
  uid: string;
  kind: string;
  status: string;
  title: string;
  due?: string;
  alarmAt?: string;
  description?: string;
  categories?: string[];
};

function buildReminderText(reminder: ReminderItem): string {
  const what = reminder.description || reminder.title;
  return [
    `Reminder: ${reminder.title}`,
    `When: ${reminder.alarmAt ?? reminder.due ?? "no date"}`,
    what && what !== reminder.title ? `What: ${what}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseReminderDateTime(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
  const date = new Date(withSeconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class ReminderDeliveryWorker {
  private readonly pollIntervalMs: number;
  private readonly getReminders: () => Promise<ReminderItem[]>;

  constructor(
    private readonly store: Store,
    private readonly delivery: DeliveryService,
    private readonly recipientIds: string[],
    options: {
      pollIntervalMs?: number;
      scanReminders?: () => Promise<ReminderItem[]>;
    } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.getReminders = options.scanReminders ?? this.scanCalDAVReminders.bind(this);
  }

  start(): NodeJS.Timeout {
    return setInterval(() => {
      void this.tick().catch((err) => {
        console.error("Reminder delivery tick failed:", err);
      });
    }, this.pollIntervalMs);
  }

  async tick(): Promise<void> {
    const now = new Date();
    const reminders = await this.getReminders();

    for (const reminder of reminders) {
      if (reminder.status === "done") continue;
      const alarmAt = reminder.alarmAt ?? reminder.due;
      const remindAt = parseReminderDateTime(alarmAt);
      if (!remindAt || remindAt > now) continue;

      const text = buildReminderText(reminder);
      for (const recipientId of this.recipientIds) {
        const channel = recipientId.split(":", 1)[0] || "unknown";
        const reminderKey = `${reminder.uid}:${alarmAt}`;
        if (this.store.hasSentReminder(reminderKey, channel, recipientId)) continue;
        await this.delivery.sendTextToRecipient(recipientId, text);
        this.store.markReminderSent(reminderKey, channel, recipientId);
      }
    }
  }

  private async scanCalDAVReminders(): Promise<ReminderItem[]> {
    try {
      const { stdout } = await execFileAsync("ownloom-planner", ["list", "all", "--json"], {
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
      const items = JSON.parse(stdout.trim()) as ReminderItem[];
      return items.filter((item) => item.kind === "reminder" && item.status !== "done" && (item.alarmAt || item.due));
    } catch (err) {
      console.error("ReminderDeliveryWorker: failed to query CalDAV planner:", err);
      return [];
    }
  }
}
