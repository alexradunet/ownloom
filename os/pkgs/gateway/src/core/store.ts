import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ChatSession } from "./types.js";

function utcNow(): string {
  return new Date().toISOString();
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, filePath);
}

function emptyState(): StateSchema {
  return { processedMessages: {}, chatSessions: {}, sentReminders: {}, queuedDeliveries: {}, attachments: {}, idempotency: {}, runtimeClients: {} };
}

function normalizeState(input: Partial<StateSchema>): StateSchema {
  return {
    processedMessages: input.processedMessages ?? {},
    chatSessions: input.chatSessions ?? {},
    sentReminders: input.sentReminders ?? {},
    queuedDeliveries: input.queuedDeliveries ?? {},
    attachments: input.attachments ?? {},
    idempotency: input.idempotency ?? {},
    runtimeClients: input.runtimeClients ?? {},
  };
}

function readState(filePath: string): StateSchema {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return normalizeState(JSON.parse(raw) as Partial<StateSchema>);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return emptyState();
    }
    // Any other error (parse failure, permission) is fatal to prevent silent data loss.
    throw new Error(`Failed to read gateway state at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function writeState(filePath: string, state: StateSchema): void {
  atomicWriteJson(filePath, state);
}

type ProcessedMessageEntry = {
  chatId: string;
  senderId: string;
  receivedAt: string;
  processedAt: string;
};

type ReminderKey = string;

export type QueuedDelivery = {
  id: string;
  recipientId: string;
  transport: string;
  text: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastError?: string;
  deliveredAt?: string;
  deadAt?: string;
};

export type StoredAttachment = {
  id: string;
  kind: "image" | "audio";
  path: string;
  mimeType: string;
  fileName?: string;
  sizeBytes: number;
  createdAt: string;
};

export type IdempotencyResult = {
  ok: boolean;
  payload?: unknown;
  error?: { message: string; code?: string };
};

export type RuntimeClientRecord = {
  id: string;
  displayName: string;
  scopes: Array<"read" | "write" | "admin">;
  tokenHash?: string;
  tokenPreview?: string;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string;
  revokedAt?: string;
};

export type IdempotencyEntry = {
  key: string;
  status: "pending" | "done";
  createdAt: string;
  updatedAt: string;
  result?: IdempotencyResult;
};

type StateSchema = {
  processedMessages: Record<string, ProcessedMessageEntry>;
  chatSessions: Record<string, ChatSession & { updatedAt: string; createdAt: string }>;
  sentReminders: Record<ReminderKey, { reminderKey: string; channel: string; recipientId: string; sentAt: string }>;
  queuedDeliveries: Record<string, QueuedDelivery>;
  attachments: Record<string, StoredAttachment>;
  idempotency: Record<string, IdempotencyEntry>;
  runtimeClients: Record<string, RuntimeClientRecord>;
};

function makeReminderKey(reminderKey: string, channel: string, recipientId: string): string {
  return `${reminderKey}::${channel}::${recipientId}`;
}

function makeDeliveryId(): string {
  return `delivery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeAttachmentId(): string {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeClientToken(): string {
  return `ogw_${randomBytes(24).toString("base64url")}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenPreview(token: string): string {
  return `${token.slice(0, 7)}…${token.slice(-4)}`;
}

function safeFileName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "attachment.bin";
}

function isOlderThan(iso: string, maxAgeMs: number): boolean {
  const time = Date.parse(iso);
  return Number.isFinite(time) && Date.now() - time > maxAgeMs;
}

export class Store {
  private readonly statePath: string;

  constructor(statePath: string) {
    mkdirSync(dirname(statePath), { recursive: true });
    this.statePath = statePath;
  }

  getDataDir(): string {
    return dirname(this.statePath);
  }

  hasProcessedMessage(messageId: string): boolean {
    const state = readState(this.statePath);
    return messageId in state.processedMessages;
  }

  markProcessed(messageId: string, chatId: string, senderId: string, receivedAt: string): void {
    const state = readState(this.statePath);
    if (!(messageId in state.processedMessages)) {
      state.processedMessages[messageId] = {
        chatId,
        senderId,
        receivedAt,
        processedAt: utcNow(),
      };
      writeState(this.statePath, state);
    }
  }

  getChatSession(chatId: string): ChatSession | null {
    const state = readState(this.statePath);
    const row = state.chatSessions[chatId];
    if (!row) return null;
    return {
      chatId: row.chatId,
      senderId: row.senderId,
      sessionPath: row.sessionPath,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  listChatSessions(): ChatSession[] {
    const state = readState(this.statePath);
    return Object.values(state.chatSessions)
      .map((row) => ({
        chatId: row.chatId,
        senderId: row.senderId,
        sessionPath: row.sessionPath,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  upsertChatSession(chatId: string, senderId: string, sessionPath: string): void {
    const state = readState(this.statePath);
    const now = utcNow();
    const existing = state.chatSessions[chatId];
    state.chatSessions[chatId] = {
      chatId,
      senderId,
      sessionPath,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    writeState(this.statePath, state);
  }

  resetChatSession(chatId: string): void {
    const state = readState(this.statePath);
    delete state.chatSessions[chatId];
    writeState(this.statePath, state);
  }

  hasSentReminder(reminderKeyStr: string, channel: string, recipientId: string): boolean {
    const state = readState(this.statePath);
    const key = makeReminderKey(reminderKeyStr, channel, recipientId);
    return key in state.sentReminders;
  }

  markReminderSent(reminderKeyStr: string, channel: string, recipientId: string): void {
    const state = readState(this.statePath);
    const key = makeReminderKey(reminderKeyStr, channel, recipientId);
    if (!(key in state.sentReminders)) {
      state.sentReminders[key] = {
        reminderKey: reminderKeyStr,
        channel,
        recipientId,
        sentAt: utcNow(),
      };
      writeState(this.statePath, state);
    }
  }

  enqueueDelivery(recipientId: string, transport: string, text: string, lastError?: string): QueuedDelivery {
    const state = readState(this.statePath);
    const id = makeDeliveryId();
    const delivery: QueuedDelivery = {
      id,
      recipientId,
      transport,
      text,
      createdAt: utcNow(),
      attempts: 0,
      ...(lastError ? { lastError } : {}),
    };
    state.queuedDeliveries[id] = delivery;
    writeState(this.statePath, state);
    return delivery;
  }

  listQueuedDeliveries(transport?: string, options: { includeDead?: boolean; dueOnly?: boolean } = {}): QueuedDelivery[] {
    const state = readState(this.statePath);
    const now = utcNow();
    return Object.values(state.queuedDeliveries)
      .filter((delivery) => !delivery.deliveredAt)
      .filter((delivery) => options.includeDead || !delivery.deadAt)
      .filter((delivery) => !options.dueOnly || !delivery.nextAttemptAt || delivery.nextAttemptAt <= now)
      .filter((delivery) => !transport || delivery.transport === transport)
      .sort((a, b) => (a.nextAttemptAt ?? a.createdAt).localeCompare(b.nextAttemptAt ?? b.createdAt));
  }

  markQueuedDeliveryDelivered(id: string): void {
    const state = readState(this.statePath);
    const delivery = state.queuedDeliveries[id];
    if (!delivery) return;
    delivery.deliveredAt = utcNow();
    writeState(this.statePath, state);
  }

  retryQueuedDelivery(id: string): QueuedDelivery | null {
    const state = readState(this.statePath);
    const delivery = state.queuedDeliveries[id];
    if (!delivery || delivery.deliveredAt) return null;
    delivery.attempts = 0;
    delete delivery.deadAt;
    delete delivery.nextAttemptAt;
    writeState(this.statePath, state);
    return delivery;
  }

  deleteQueuedDelivery(id: string): boolean {
    const state = readState(this.statePath);
    if (!(id in state.queuedDeliveries)) return false;
    delete state.queuedDeliveries[id];
    writeState(this.statePath, state);
    return true;
  }

  recordQueuedDeliveryFailure(id: string, error: string, options: { maxAttempts: number; nextAttemptAt?: string }): void {
    const state = readState(this.statePath);
    const delivery = state.queuedDeliveries[id];
    if (!delivery) return;
    const now = utcNow();
    delivery.attempts += 1;
    delivery.lastAttemptAt = now;
    delivery.lastError = error;
    if (delivery.attempts >= options.maxAttempts) {
      delivery.deadAt = now;
      delete delivery.nextAttemptAt;
    } else if (options.nextAttemptAt) {
      delivery.nextAttemptAt = options.nextAttemptAt;
    }
    writeState(this.statePath, state);
  }

  saveAttachment(input: {
    kind: "image" | "audio";
    mimeType: string;
    fileName?: string;
    data: Buffer;
  }): StoredAttachment {
    const state = readState(this.statePath);
    const id = makeAttachmentId();
    const dir = join(this.getDataDir(), "attachments");
    mkdirSync(dir, { recursive: true });
    const fileName = safeFileName(input.fileName ?? `${id}.bin`);
    const filePath = join(dir, `${id}-${fileName}`);
    writeFileSync(filePath, input.data);
    const attachment: StoredAttachment = {
      id,
      kind: input.kind,
      path: filePath,
      mimeType: input.mimeType,
      ...(input.fileName ? { fileName: input.fileName } : {}),
      sizeBytes: input.data.length,
      createdAt: utcNow(),
    };
    state.attachments[id] = attachment;
    writeState(this.statePath, state);
    return attachment;
  }

  getAttachment(id: string): StoredAttachment | null {
    const state = readState(this.statePath);
    return state.attachments[id] ?? null;
  }

  deleteAttachment(id: string): void {
    const state = readState(this.statePath);
    const attachment = state.attachments[id];
    if (!attachment) return;
    delete state.attachments[id];
    if (existsSync(attachment.path)) unlinkSync(attachment.path);
    writeState(this.statePath, state);
  }

  pruneAttachments(maxAgeMs: number): number {
    const state = readState(this.statePath);
    let removed = 0;
    for (const [id, attachment] of Object.entries(state.attachments)) {
      if (!isOlderThan(attachment.createdAt, maxAgeMs)) continue;
      delete state.attachments[id];
      if (existsSync(attachment.path)) unlinkSync(attachment.path);
      removed += 1;
    }
    if (removed > 0) writeState(this.statePath, state);
    return removed;
  }

  listRuntimeClients(): RuntimeClientRecord[] {
    const state = readState(this.statePath);
    return Object.values(state.runtimeClients).sort((a, b) => a.id.localeCompare(b.id));
  }

  getRuntimeClient(id: string): RuntimeClientRecord | null {
    const state = readState(this.statePath);
    return state.runtimeClients[id] ?? null;
  }

  rotateRuntimeClient(input: {
    id: string;
    displayName: string;
    scopes: Array<"read" | "write" | "admin">;
  }): { client: RuntimeClientRecord; token: string } {
    const state = readState(this.statePath);
    const now = utcNow();
    const token = makeClientToken();
    const existing = state.runtimeClients[input.id];
    const client: RuntimeClientRecord = {
      id: input.id,
      displayName: input.displayName,
      scopes: input.scopes,
      tokenHash: hashToken(token),
      tokenPreview: tokenPreview(token),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      rotatedAt: now,
    };
    state.runtimeClients[input.id] = client;
    writeState(this.statePath, state);
    return { client, token };
  }

  revokeRuntimeClient(input: {
    id: string;
    displayName: string;
    scopes: Array<"read" | "write" | "admin">;
  }): RuntimeClientRecord {
    const state = readState(this.statePath);
    const now = utcNow();
    const existing = state.runtimeClients[input.id];
    const client: RuntimeClientRecord = {
      id: input.id,
      displayName: input.displayName,
      scopes: input.scopes,
      ...(existing?.tokenHash ? { tokenHash: existing.tokenHash } : {}),
      ...(existing?.tokenPreview ? { tokenPreview: existing.tokenPreview } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.rotatedAt ? { rotatedAt: existing.rotatedAt } : {}),
      revokedAt: now,
    };
    state.runtimeClients[input.id] = client;
    writeState(this.statePath, state);
    return client;
  }

  resolveRuntimeClientToken(token: string): RuntimeClientRecord | null {
    const state = readState(this.statePath);
    const hashed = hashToken(token);
    return Object.values(state.runtimeClients).find((client) => !client.revokedAt && client.tokenHash === hashed) ?? null;
  }

  beginIdempotentRequest(key: string, maxAgeMs: number):
    | { status: "started" }
    | { status: "duplicate"; result: IdempotencyResult }
    | { status: "pending" } {
    const state = readState(this.statePath);
    const now = utcNow();
    for (const [entryKey, entry] of Object.entries(state.idempotency)) {
      if (isOlderThan(entry.updatedAt, maxAgeMs)) delete state.idempotency[entryKey];
    }

    const existing = state.idempotency[key];
    if (existing?.status === "done" && existing.result) {
      writeState(this.statePath, state);
      return { status: "duplicate", result: existing.result };
    }
    if (existing?.status === "pending") {
      writeState(this.statePath, state);
      return { status: "pending" };
    }

    state.idempotency[key] = {
      key,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    writeState(this.statePath, state);
    return { status: "started" };
  }

  finishIdempotentRequest(key: string, result: IdempotencyResult): void {
    const state = readState(this.statePath);
    const now = utcNow();
    const existing = state.idempotency[key];
    state.idempotency[key] = {
      key,
      status: "done",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      result,
    };
    writeState(this.statePath, state);
  }
}
