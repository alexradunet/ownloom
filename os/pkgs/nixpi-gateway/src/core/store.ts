import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { ChatSession } from "./types.js";

function utcNow(): string {
  return new Date().toISOString();
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, filePath);
}

function readState(filePath: string): StateSchema {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as StateSchema;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { processedMessages: {}, chatSessions: {}, sentReminders: {} };
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

type StateSchema = {
  processedMessages: Record<string, ProcessedMessageEntry>;
  chatSessions: Record<string, ChatSession & { updatedAt: string; createdAt: string }>;
  sentReminders: Record<ReminderKey, { reminderKey: string; channel: string; recipientId: string; sentAt: string }>;
};

function makeReminderKey(reminderKey: string, channel: string, recipientId: string): string {
  return `${reminderKey}::${channel}::${recipientId}`;
}

export class Store {
  private readonly statePath: string;

  constructor(statePath: string) {
    mkdirSync(dirname(statePath), { recursive: true });
    this.statePath = statePath;
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
}
