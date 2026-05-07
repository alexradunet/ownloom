import { createHash } from "node:crypto";
import {
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  jidDecode,
  jidNormalizedUser,
  normalizeMessageContent,
  type WAMessage,
} from "@whiskeysockets/baileys";
import type { InboundMessage } from "../../core/types.js";

type WhatsAppAttachmentDescriptor =
  | {
      kind: "image";
      mimeType: string;
      fileName?: string;
    }
  | {
      kind: "audio";
      mimeType: string;
      fileName?: string;
      seconds?: number;
      voice?: boolean;
    };

const DEFAULT_IMAGE_PROMPT = "Please analyze the attached image.";
const DEFAULT_AUDIO_PROMPT = "Please transcribe the attached audio.";

function toIsoFromUnixSeconds(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function hashMessage(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function unixSeconds(value: WAMessage["messageTimestamp"] | null | undefined): number {
  const raw = value == null ? Math.floor(Date.now() / 1000) : Number(value.toString());
  return Number.isFinite(raw) && raw > 0 ? raw : Math.floor(Date.now() / 1000);
}

function normalizePhoneLike(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  return `+${digits}`;
}

function normalizeChatLike(prefix: "whatsapp" | "whatsapp-group", jid: string): string {
  const normalized = jidNormalizedUser(jid);
  const decoded = jidDecode(normalized);
  if (!decoded?.user) return `${prefix}:${normalized}`;

  if (decoded.server === "g.us") return `whatsapp-group:${decoded.user}`;
  if (decoded.server === "s.whatsapp.net" || decoded.server === "c.us") {
    return `whatsapp:${normalizePhoneLike(decoded.user)}`;
  }

  return `${prefix}:${decoded.user}`;
}

function normalizeSenderId(
  primaryJid: string,
  alternateJid?: string | null,
  resolvePnForLid?: (jid: string) => string | undefined,
): string {
  const mappedPn = resolvePnForLid?.(primaryJid);
  const candidate =
    (alternateJid && /^\d+@(?:s\.whatsapp\.net|c\.us)$/.test(alternateJid) ? alternateJid : undefined) ??
    mappedPn ??
    primaryJid;

  return normalizeChatLike("whatsapp", candidate);
}

function normalizeChatId(jid: string, resolvePnForLid?: (jid: string) => string | undefined): string {
  const mappedPn = !isJidGroup(jid) ? resolvePnForLid?.(jid) : undefined;
  return normalizeChatLike(isJidGroup(jid) ? "whatsapp-group" : "whatsapp", mappedPn ?? jid);
}

function extractText(input: WAMessage): string {
  const content = normalizeMessageContent(input.message);
  if (!content) return "";

  const type = getContentType(content);
  switch (type) {
    case "conversation":
      return content.conversation ?? "";
    case "extendedTextMessage":
      return content.extendedTextMessage?.text ?? "";
    case "imageMessage":
      return content.imageMessage?.caption ?? "";
    case "videoMessage":
      return content.videoMessage?.caption ?? "";
    case "documentMessage":
      return content.documentMessage?.caption ?? "";
    case "buttonsResponseMessage":
      return content.buttonsResponseMessage?.selectedDisplayText ?? "";
    case "listResponseMessage":
      return content.listResponseMessage?.title ?? "";
    case "templateButtonReplyMessage":
      return content.templateButtonReplyMessage?.selectedDisplayText ?? "";
    default:
      return "";
  }
}

export function extractWhatsAppAttachmentDescriptors(input: WAMessage): WhatsAppAttachmentDescriptor[] {
  const content = normalizeMessageContent(input.message);
  if (!content) return [];

  const type = getContentType(content);
  switch (type) {
    case "imageMessage": {
      const mimeType = content.imageMessage?.mimetype?.trim() || "image/jpeg";
      return [{ kind: "image", mimeType }];
    }
    case "documentMessage": {
      const mimeType = content.documentMessage?.mimetype?.trim();
      if (!mimeType?.startsWith("image/")) return [];
      return [{ kind: "image", mimeType, fileName: content.documentMessage?.fileName ?? undefined }];
    }
    case "audioMessage": {
      const audio = content.audioMessage;
      const mimeType = audio?.mimetype?.trim() || "audio/ogg; codecs=opus";
      return [{
        kind: "audio",
        mimeType,
        seconds: audio?.seconds ?? undefined,
        voice: audio?.ptt ?? undefined,
      }];
    }
    default:
      return [];
  }
}

export function parseWhatsAppMessage(
  input: WAMessage,
  resolvePnForLid?: (jid: string) => string | undefined,
): Omit<InboundMessage, "access"> | null {
  const remoteJid = input.key.remoteJid;
  if (!remoteJid) return null;
  if (input.key.fromMe) return null;
  if (isJidStatusBroadcast(remoteJid)) return null;
  if (isJidBroadcast(remoteJid)) return null;
  if (isJidNewsletter(remoteJid)) return null;

  const attachments = extractWhatsAppAttachmentDescriptors(input);
  const extractedText = extractText(input).trim();
  const hasAudio = attachments.some((attachment) => attachment.kind === "audio");
  const text = extractedText || (hasAudio ? DEFAULT_AUDIO_PROMPT : attachments.length > 0 ? DEFAULT_IMAGE_PROMPT : "");
  if (!text) return null;

  const isGroup = Boolean(isJidGroup(remoteJid));
  const senderJid = isGroup ? input.key.participantAlt ?? input.key.participant : input.key.remoteJidAlt ?? remoteJid;
  if (!senderJid) return null;

  const chatId = normalizeChatId(remoteJid, resolvePnForLid);
  const senderId = normalizeSenderId(
    senderJid,
    isGroup ? input.key.participantAlt : input.key.remoteJidAlt,
    resolvePnForLid,
  );
  const messageId = input.key.id?.trim()
    ? `whatsapp:${remoteJid}:${input.key.id.trim()}`
    : `whatsapp:${hashMessage([senderJid, remoteJid, String(unixSeconds(input.messageTimestamp)), text])}`;

  return {
    channel: "whatsapp",
    chatId,
    senderId,
    senderName: input.pushName?.trim() || undefined,
    messageId,
    timestamp: toIsoFromUnixSeconds(unixSeconds(input.messageTimestamp)),
    text,
    isGroup,
    transportRef: input.key.id
      ? {
          remoteJid,
          keyId: input.key.id,
          participant: input.key.participant ?? undefined,
        }
      : undefined,
  };
}
