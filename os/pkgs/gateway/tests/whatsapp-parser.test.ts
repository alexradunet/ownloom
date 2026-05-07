import assert from "node:assert/strict";
import test from "node:test";
import { extractWhatsAppAttachmentDescriptors, parseWhatsAppMessage } from "../src/transports/whatsapp/parser.js";

test("parseWhatsAppMessage normalizes direct phone senders", () => {
  const parsed = parseWhatsAppMessage({
    key: {
      remoteJid: "15550001111@s.whatsapp.net",
      id: "MSG1",
      fromMe: false,
    },
    message: {
      conversation: " hello ",
    },
    messageTimestamp: 1_700_000_000,
    pushName: "Alex",
  } as any);

  assert.ok(parsed);
  assert.equal(parsed.channel, "whatsapp");
  assert.equal(parsed.chatId, "whatsapp:+15550001111");
  assert.equal(parsed.senderId, "whatsapp:+15550001111");
  assert.equal(parsed.text, "hello");
  assert.equal(parsed.messageId, "whatsapp:15550001111@s.whatsapp.net:MSG1");
});

test("parseWhatsAppMessage resolves LID senders through persisted mappings", () => {
  const parsed = parseWhatsAppMessage(
    {
      key: {
        remoteJid: "111111111111111@lid",
        id: "MSG2",
        fromMe: false,
      },
      message: {
        conversation: "ping",
      },
      messageTimestamp: 1_700_000_000,
    } as any,
    (jid) => jid === "111111111111111@lid" ? "15550001111@s.whatsapp.net" : undefined,
  );

  assert.ok(parsed);
  assert.equal(parsed.chatId, "whatsapp:+15550001111");
  assert.equal(parsed.senderId, "whatsapp:+15550001111");
});

test("parseWhatsAppMessage keeps group chat and sender identities separate", () => {
  const parsed = parseWhatsAppMessage({
    key: {
      remoteJid: "1234567890@g.us",
      participant: "15550001111@s.whatsapp.net",
      id: "MSG3",
      fromMe: false,
    },
    message: {
      extendedTextMessage: { text: "group hello" },
    },
    messageTimestamp: 1_700_000_000,
  } as any);

  assert.ok(parsed);
  assert.equal(parsed.chatId, "whatsapp-group:1234567890");
  assert.equal(parsed.senderId, "whatsapp:+15550001111");
  assert.equal(parsed.isGroup, true);
});

test("parseWhatsAppMessage uses a default prompt for image-only messages", () => {
  const parsed = parseWhatsAppMessage({
    key: {
      remoteJid: "15550001111@s.whatsapp.net",
      id: "IMG1",
      fromMe: false,
    },
    message: {
      imageMessage: {
        mimetype: "image/jpeg",
      },
    },
    messageTimestamp: 1_700_000_000,
  } as any);

  assert.ok(parsed);
  assert.equal(parsed.text, "Please analyze the attached image.");
});

test("parseWhatsAppMessage parses voice notes as audio attachments", () => {
  const message = {
    key: {
      remoteJid: "15550001111@s.whatsapp.net",
      id: "AUD1",
      fromMe: false,
    },
    message: {
      audioMessage: {
        mimetype: "audio/ogg; codecs=opus",
        seconds: 12,
        ptt: true,
      },
    },
    messageTimestamp: 1_700_000_000,
  } as any;
  const parsed = parseWhatsAppMessage(message);
  const descriptors = extractWhatsAppAttachmentDescriptors(message);

  assert.ok(parsed);
  assert.equal(parsed.text, "Please transcribe the attached audio.");
  assert.deepEqual(descriptors, [{
    kind: "audio",
    mimeType: "audio/ogg; codecs=opus",
    seconds: 12,
    voice: true,
  }]);
});

test("parseWhatsAppMessage ignores outbound messages", () => {
  const parsed = parseWhatsAppMessage({
    key: {
      remoteJid: "15550001111@s.whatsapp.net",
      id: "MSG4",
      fromMe: true,
    },
    message: {
      conversation: "ignore me",
    },
    messageTimestamp: 1_700_000_000,
  } as any);

  assert.equal(parsed, null);
});
