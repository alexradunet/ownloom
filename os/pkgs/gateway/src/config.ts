import { readFileSync } from "node:fs";
import YAML from "yaml";

export type WhatsAppTransportConfig = {
  enabled: boolean;
  trustedNumbers: string[];
  adminNumbers: string[];
  directMessagesOnly: boolean;
  sessionDataPath: string;
  model?: string;
  allowedModels?: string[];
};

export type AudioTranscriptionConfig = {
  enabled: boolean;
  command: string;
  ffmpegCommand?: string;
  modelPath: string;
  language?: string;
  threads?: number;
  timeoutMs?: number;
  maxSeconds?: number;
};

export type ClientTransportConfig = {
  enabled: boolean;
  host: string;
  port: number;
  authToken?: string;
};

export type GatewayConfig = {
  gateway: {
    statePath: string;
    sessionDir: string;
    maxReplyChars: number;
    maxReplyChunks: number;
  };
  audioTranscription?: AudioTranscriptionConfig;
  pi: {
    cwd: string;
    agentDir?: string;
    timeoutMs?: number;
  };
  transports: {
    whatsapp?: WhatsAppTransportConfig;
    client?: ClientTransportConfig;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid ownloom-gateway config: ${label} must be an object.`);
  return value;
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | null {
  return value === undefined || value === null ? null : record(value, label);
}

function expectString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ownloom-gateway config: ${label} must be a non-empty string.`);
  }
}

function expectOptionalString(value: unknown, label: string): void {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(`Invalid ownloom-gateway config: ${label} must be a string.`);
  }
}

function expectNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ownloom-gateway config: ${label} must be a finite number.`);
  }
}

function expectOptionalNumber(value: unknown, label: string): void {
  if (value !== undefined && value !== null) expectNumber(value, label);
}

function expectBoolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") throw new Error(`Invalid ownloom-gateway config: ${label} must be a boolean.`);
}

function expectOptionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && value !== null && typeof value !== "boolean") {
    throw new Error(`Invalid ownloom-gateway config: ${label} must be a boolean.`);
  }
}

function expectStringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Invalid ownloom-gateway config: ${label} must be a string array.`);
  }
}

function expectOptionalStringArray(value: unknown, label: string): void {
  if (value !== undefined && value !== null) expectStringArray(value, label);
}

function validateAudio(value: unknown): void {
  const audio = optionalRecord(value, "audioTranscription");
  if (!audio) return;
  expectBoolean(audio.enabled, "audioTranscription.enabled");
  expectString(audio.command, "audioTranscription.command");
  expectOptionalString(audio.ffmpegCommand, "audioTranscription.ffmpegCommand");
  expectString(audio.modelPath, "audioTranscription.modelPath");
  expectOptionalString(audio.language, "audioTranscription.language");
  expectOptionalNumber(audio.threads, "audioTranscription.threads");
  expectOptionalNumber(audio.timeoutMs, "audioTranscription.timeoutMs");
  expectOptionalNumber(audio.maxSeconds, "audioTranscription.maxSeconds");
}

function validateClient(value: unknown): void {
  const client = optionalRecord(value, "transports.client");
  if (!client) return;
  expectBoolean(client.enabled, "transports.client.enabled");
  expectString(client.host, "transports.client.host");
  expectNumber(client.port, "transports.client.port");
  expectOptionalString(client.authToken, "transports.client.authToken");
}

function validateWhatsApp(value: unknown): void {
  const whatsapp = optionalRecord(value, "transports.whatsapp");
  if (!whatsapp) return;
  expectBoolean(whatsapp.enabled, "transports.whatsapp.enabled");
  expectStringArray(whatsapp.trustedNumbers, "transports.whatsapp.trustedNumbers");
  expectStringArray(whatsapp.adminNumbers, "transports.whatsapp.adminNumbers");
  expectBoolean(whatsapp.directMessagesOnly, "transports.whatsapp.directMessagesOnly");
  expectString(whatsapp.sessionDataPath, "transports.whatsapp.sessionDataPath");
  expectOptionalString(whatsapp.model, "transports.whatsapp.model");
  expectOptionalStringArray(whatsapp.allowedModels, "transports.whatsapp.allowedModels");
}

export function validateGatewayConfig(input: unknown): GatewayConfig {
  const root = record(input, "root");
  const gateway = record(root.gateway, "gateway");
  const pi = record(root.pi, "pi");
  const transports = record(root.transports, "transports");

  expectString(gateway.statePath, "gateway.statePath");
  expectString(gateway.sessionDir, "gateway.sessionDir");
  expectNumber(gateway.maxReplyChars, "gateway.maxReplyChars");
  expectNumber(gateway.maxReplyChunks, "gateway.maxReplyChunks");
  if (Object.hasOwn(pi, "bin")) throw new Error("Invalid ownloom-gateway config: pi.bin was removed; Pi prompts use the SDK directly.");
  if (Object.hasOwn(pi, "extraArgs")) throw new Error("Invalid ownloom-gateway config: pi.extraArgs was removed; Pi SDK tools come from the shared Pi tool registry.");
  expectString(pi.cwd, "pi.cwd");
  expectOptionalString(pi.agentDir, "pi.agentDir");
  expectOptionalNumber(pi.timeoutMs, "pi.timeoutMs");
  if (Object.hasOwn(transports, "websocket")) throw new Error("Invalid ownloom-gateway config: transports.websocket was removed; use transports.client.");
  validateClient(transports.client);
  validateWhatsApp(transports.whatsapp);
  validateAudio(root.audioTranscription);
  if (Object.hasOwn(transports, "signal")) throw new Error("Invalid ownloom-gateway config: Signal transport was removed.");

  return root as GatewayConfig;
}

export function loadConfig(path: string): GatewayConfig {
  const raw = readFileSync(path, "utf-8");
  return validateGatewayConfig(YAML.parse(raw));
}
