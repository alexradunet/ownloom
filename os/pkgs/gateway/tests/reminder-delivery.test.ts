import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeliveryService, nextDeliveryAttemptAt } from "../src/core/delivery.js";
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

test("DeliveryService backs off failed queued sends", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-delivery-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const transport = new FakeTransport();
    const delivery = new DeliveryService([transport], store);

    transport.failSends = true;
    await delivery.sendTextToRecipient("whatsapp:+15550001111", "hello");
    const drained = await delivery.drainQueuedDeliveries();
    assert.deepEqual(drained, { attempted: 1, delivered: 0, failed: 1 });

    const queued = store.listQueuedDeliveries(undefined, { includeDead: true })[0];
    assert.equal(queued.attempts, 1);
    assert.ok(queued.nextAttemptAt);
    assert.equal(store.listQueuedDeliveries(undefined, { dueOnly: true }).length, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Store marks queued sends dead after max attempts", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ownloom-gateway-delivery-"));
  try {
    const store = new Store(path.join(tmpDir, "gateway-state.json"));
    const queued = store.enqueueDelivery("whatsapp:+15550001111", "whatsapp", "hello", "offline");

    for (let i = 0; i < 10; i += 1) {
      store.recordQueuedDeliveryFailure(queued.id, "offline", {
        maxAttempts: 10,
        nextAttemptAt: "2000-01-01T00:00:00.000Z",
      });
    }

    const dead = store.listQueuedDeliveries(undefined, { includeDead: true })[0];
    assert.equal(dead.attempts, 10);
    assert.ok(dead.deadAt);
    assert.equal(store.listQueuedDeliveries().length, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("nextDeliveryAttemptAt uses simple backoff", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(nextDeliveryAttemptAt(1, now), "2026-01-01T00:01:00.000Z");
  assert.equal(nextDeliveryAttemptAt(2, now), "2026-01-01T00:05:00.000Z");
  assert.equal(nextDeliveryAttemptAt(3, now), "2026-01-01T00:15:00.000Z");
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
