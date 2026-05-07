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
  failSends = false;

  async healthCheck(): Promise<void> {}

  async startReceiving(): Promise<never> {
    return new Promise<never>(() => undefined);
  }

  async sendText(_message: InboundMessage, _text: string): Promise<void> {}

  async sendTextToRecipient(recipientId: string, text: string): Promise<void> {
    if (this.failSends) throw new Error("offline");
    this.sent.push({ recipientId, text });
  }
}

test("ReminderDeliveryWorker sends due reminders once per recipient", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);

    const dueReminders: ReminderItem[] = [
      { uid: "ownloom-test-call-mom", kind: "reminder", status: "open", title: "Call Mom", alarmAt: "2000-01-01T09:00:00Z", description: "call mom" },
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
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);
    let alarmAt = "2000-01-01T09:00:00Z";

    const worker = new ReminderDeliveryWorker(store, delivery, ["whatsapp:+15550001111"], {
      scanReminders: async () => [
        { uid: "ownloom-test-rescheduled", kind: "reminder", status: "open", title: "Stretch", alarmAt },
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

test("DeliveryService queues failed sends and drains them later", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-delivery-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport], store);

    transport.failSends = true;
    const result = await delivery.sendTextToRecipient("whatsapp:+15550001111", "hello");
    assert.equal(result.queued, true);
    assert.equal(store.listQueuedDeliveries().length, 1);
    assert.deepEqual(transport.sent, []);

    transport.failSends = false;
    const drained = await delivery.drainQueuedDeliveries();
    assert.deepEqual(drained, { attempted: 1, delivered: 1, failed: 0 });
    assert.deepEqual(transport.sent, [{ recipientId: "whatsapp:+15550001111", text: "hello" }]);
    assert.equal(store.listQueuedDeliveries().length, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ReminderDeliveryWorker skips future reminders", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);

    const futureReminders: ReminderItem[] = [
      { uid: "ownloom-test-future", kind: "reminder", status: "open", title: "Future event", alarmAt: "2999-12-31T09:00:00Z" },
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
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-reminders-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport]);

    const doneReminders: ReminderItem[] = [
      { uid: "ownloom-test-done", kind: "reminder", status: "done", title: "Already done", alarmAt: "2000-01-01T09:00:00Z" },
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
