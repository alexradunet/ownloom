import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeliveryService } from "../src/core/delivery.js";
import { Store } from "../src/core/store.js";
import { ReminderDeliveryWorker, type ReminderItem } from "../src/personal/reminder-delivery.js";
import type { InboundMessage } from "../src/core/types.js";
import type { GatewayTransport } from "../src/transports/types.js";

class FakeTransport implements GatewayTransport {
  readonly name = "whatsapp";
  readonly sent: Array<{ recipientId: string; text: string }> = [];

  async healthCheck(): Promise<void> {}

  async startReceiving(): Promise<never> {
    return new Promise<never>(() => undefined);
  }

  async sendText(_message: InboundMessage, _text: string): Promise<void> {}

  async sendTextToRecipient(recipientId: string, text: string): Promise<void> {
    this.sent.push({ recipientId, text });
  }
}

test("ReminderDeliveryWorker sends due reminders once per recipient", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);

    const dueReminders: ReminderItem[] = [
      { uid: "nixpi-test-call-mom", kind: "reminder", status: "open", title: "Call Mom", alarmAt: "2000-01-01T09:00:00Z", description: "call mom" },
    ];

    const worker = new ReminderDeliveryWorker(store, delivery, ["whatsapp:+15550001111"], {
      scanReminders: async () => dueReminders,
    });

    await worker.tick();
    await worker.tick();

    assert.deepEqual(transport.sent, [
      {
        recipientId: "whatsapp:+15550001111",
        text: "Reminder: Call Mom\nWhen: 2000-01-01T09:00:00Z\nWhat: call mom",
      },
    ]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ReminderDeliveryWorker delivers a rescheduled reminder with the same UID", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);
    let alarmAt = "2000-01-01T09:00:00Z";

    const worker = new ReminderDeliveryWorker(store, delivery, ["whatsapp:+15550001111"], {
      scanReminders: async () => [
        { uid: "nixpi-test-rescheduled", kind: "reminder", status: "open", title: "Stretch", alarmAt },
      ],
    });

    await worker.tick();
    alarmAt = "2000-01-02T09:00:00Z";
    await worker.tick();

    assert.equal(transport.sent.length, 2);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ReminderDeliveryWorker skips future reminders", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);

    const futureReminders: ReminderItem[] = [
      { uid: "nixpi-test-future", kind: "reminder", status: "open", title: "Future event", alarmAt: "2999-12-31T09:00:00Z" },
    ];

    const worker = new ReminderDeliveryWorker(store, delivery, ["whatsapp:+15550001111"], {
      scanReminders: async () => futureReminders,
    });

    await worker.tick();
    assert.deepEqual(transport.sent, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ReminderDeliveryWorker skips completed reminders", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);

    const doneReminders: ReminderItem[] = [
      { uid: "nixpi-test-done", kind: "reminder", status: "done", title: "Already done", alarmAt: "2000-01-01T09:00:00Z" },
    ];

    const worker = new ReminderDeliveryWorker(store, delivery, ["whatsapp:+15550001111"], {
      scanReminders: async () => doneReminders,
    });

    await worker.tick();
    assert.deepEqual(transport.sent, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
