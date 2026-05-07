import type { InboundMessage } from "../core/types.js";
import type { Clock } from "./date.js";
import { systemClock } from "./date.js";
import { PersonalJournalService } from "./journal.js";

const WHATSAPP_CONVERSATION_SECTION = "WhatsApp conversation";
const MAX_CAPTURE_CHARS = 6000;

function normalizeForCapture(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= MAX_CAPTURE_CHARS) return normalized;
  const remaining = normalized.length - MAX_CAPTURE_CHARS;
  return `${normalized.slice(0, MAX_CAPTURE_CHARS).trimEnd()} … [truncated ${remaining} chars]`;
}

function isBuiltinNoise(text: string): boolean {
  const command = text.trim().replace(/^\//, "").trim().toLowerCase();
  return ["help", "status", "reset"].includes(command);
}

function shouldCaptureUserText(msg: InboundMessage, text: string): boolean {
  if (msg.channel !== "whatsapp") return false;
  if (!text.trim()) return false;
  return !isBuiltinNoise(text);
}

function shouldCaptureAssistantText(msg: InboundMessage, text: string): boolean {
  if (msg.channel !== "whatsapp") return false;
  return !!text.trim();
}

export class PersonalConversationCaptureService {
  private readonly journal: PersonalJournalService;

  constructor(clock: Clock = systemClock, journal?: PersonalJournalService) {
    this.journal = journal ?? new PersonalJournalService(clock);
  }

  captureUserMessage(msg: InboundMessage, text: string): boolean {
    if (!shouldCaptureUserText(msg, text)) return false;
    const normalized = normalizeForCapture(text);
    const result = this.journal.appendWhatsAppLog(`User: ${normalized}`, {
      sectionTitle: WHATSAPP_CONVERSATION_SECTION,
    });
    return result !== null;
  }

  captureAssistantReply(msg: InboundMessage, text: string): boolean {
    if (!shouldCaptureAssistantText(msg, text)) return false;
    const normalized = normalizeForCapture(text);
    const result = this.journal.appendWhatsAppLog(`Assistant: ${normalized}`, {
      sectionTitle: WHATSAPP_CONVERSATION_SECTION,
    });
    return result !== null;
  }
}
