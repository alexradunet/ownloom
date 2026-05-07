export type InboundAccessPolicy = {
  allowedSenderIds: string[];
  adminSenderIds: string[];
  directMessagesOnly: boolean;
  selfSenderIds: string[];
};

export type InboundTransportRef = {
  remoteJid: string;
  keyId: string;
  participant?: string;
};

export type InboundAttachment = {
  kind: "image" | "audio";
  path: string;
  mimeType: string;
  fileName?: string;
  seconds?: number;
  voice?: boolean;
};

export type InboundMessage = {
  channel: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  messageId: string;
  timestamp: string;
  text: string;
  isGroup: boolean;
  transportRef?: InboundTransportRef;
  attachments?: InboundAttachment[];
  access: InboundAccessPolicy;
};

export type ChatSession = {
  chatId: string;
  senderId: string;
  sessionPath: string;
  createdAt: string;
  updatedAt: string;
};

export type RouterResult = {
  replies: string[];
  markProcessed: boolean;
};
