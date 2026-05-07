import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  SessionManager,
  type AgentSession,
  type ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import type { AgentClient, PromptAttachment, PromptOptions } from "./agent-client.js";

export type SdkImageContent = {
  type: "image";
  data: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

export type PiSdkSession = Pick<AgentSession, "sessionFile" | "prompt" | "getLastAssistantText" | "dispose" | "subscribe"> & {
  abort?: () => Promise<void>;
};

type PiSdkSessionFactoryOptions = {
  cwd: string;
  agentDir?: string;
  sessionDir: string;
  sessionPath: string | null;
  model?: string;
  systemPromptAppend: string;
};

export type PiSdkSessionFactory = (options: PiSdkSessionFactoryOptions) => Promise<PiSdkSession>;

type PiSdkHealthCheck = (options: { cwd: string; agentDir?: string }) => Promise<void>;

export type PiClientConfig = {
  sessionDir: string;
  cwd: string;
  agentDir?: string;
  timeoutMs?: number;
  sessionFactory?: PiSdkSessionFactory;
  healthCheckFactory?: PiSdkHealthCheck;
};

function sessionManagerFor(cwd: string, sessionDir: string, sessionPath: string | null): SessionManager {
  if (sessionPath && existsSync(sessionPath)) {
    return SessionManager.open(sessionPath, sessionDir);
  }
  if (sessionPath) {
    console.warn(`pi-sdk: stored session does not exist, starting a new session: ${sessionPath}`);
  }
  return SessionManager.create(cwd, sessionDir);
}

function resolveModelSelector(modelRegistry: ModelRegistry, selector?: string) {
  if (!selector) return undefined;
  const trimmed = selector.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new Error(`Invalid Pi model selector "${selector}". Expected provider/model-id, for example synthetic/hf:moonshotai/Kimi-K2.6.`);
  }

  const provider = trimmed.slice(0, slash);
  const modelId = trimmed.slice(slash + 1);
  const model = modelRegistry.find(provider, modelId);
  if (!model) {
    throw new Error(`Configured Pi model not found: ${provider}/${modelId}`);
  }
  return model;
}

function reportDiagnostics(diagnostics: Array<{ type: string; message: string }>): void {
  const errors = diagnostics.filter((diagnostic) => diagnostic.type === "error");
  for (const diagnostic of diagnostics) {
    const line = `pi-sdk diagnostic (${diagnostic.type}): ${diagnostic.message}`;
    if (diagnostic.type === "error") console.error(line);
    else console.warn(line);
  }
  if (errors.length > 0) {
    throw new Error(errors.map((diagnostic) => diagnostic.message).join("\n"));
  }
}

function reportExtensionErrors(errors: Array<{ path: string; error: string }>): void {
  if (errors.length === 0) return;
  throw new Error(
    [
      "Pi extension loading failed:",
      ...errors.map((error) => `- ${error.path}: ${error.error}`),
    ].join("\n"),
  );
}

const defaultPiSdkSessionFactory: PiSdkSessionFactory = async (options) => {
  const services = await createAgentSessionServices({
    cwd: options.cwd,
    agentDir: options.agentDir,
    resourceLoaderOptions: {
      appendSystemPromptOverride: (base) => [...base, options.systemPromptAppend],
    },
  });
  reportDiagnostics(services.diagnostics);

  const model = resolveModelSelector(services.modelRegistry, options.model);
  const { session, extensionsResult, modelFallbackMessage } = await createAgentSessionFromServices({
    services,
    sessionManager: sessionManagerFor(options.cwd, options.sessionDir, options.sessionPath),
    model,
  });
  reportExtensionErrors(extensionsResult.errors);
  if (modelFallbackMessage) console.warn(`pi-sdk: ${modelFallbackMessage}`);

  await session.bindExtensions({
    onError: (error) => {
      console.error(`pi-sdk extension error in ${error.extensionPath}:`, error.error);
    },
  });
  return session;
};

const defaultPiSdkHealthCheck: PiSdkHealthCheck = async (options) => {
  const services = await createAgentSessionServices({ cwd: options.cwd, agentDir: options.agentDir });
  reportDiagnostics(services.diagnostics);
  reportExtensionErrors(services.resourceLoader.getExtensions().errors);
};

function normalizeImageMimeType(mimeType: string | undefined, filePath: string): SdkImageContent["mimeType"] | null {
  const normalized = mimeType?.toLowerCase().split(";")[0].trim();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "image/jpeg";
  if (normalized === "image/png") return "image/png";
  if (normalized === "image/gif") return "image/gif";
  if (normalized === "image/webp") return "image/webp";

  switch (extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}

async function loadImageAttachments(options: PromptOptions): Promise<SdkImageContent[]> {
  const images: SdkImageContent[] = [];
  for (const attachment of options.attachments ?? []) {
    const mimeType = normalizeImageMimeType(attachment.mimeType, attachment.path);
    if (!mimeType) {
      throw new Error(`Unsupported image attachment type for Pi SDK prompt: ${attachment.path}`);
    }
    images.push({
      type: "image",
      data: await readFile(attachment.path, "base64"),
      mimeType,
    });
  }
  return images;
}

function temporaryEnv<T>(env: NodeJS.ProcessEnv, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

/**
 * SDK-backed Pi client for non-interactive gateway use.
 *
 * The client deliberately lets Pi discover tools/extensions through the normal
 * SDK ResourceLoader instead of maintaining a gateway-specific tool list.
 */
export class PiClient implements AgentClient {
  readonly name = "pi";
  private readonly sessionDir: string;
  private readonly cwd: string;
  private readonly agentDir?: string;
  private readonly timeoutMs: number;
  private readonly sessionFactory: PiSdkSessionFactory;
  private readonly healthCheckFactory: PiSdkHealthCheck;
  private sdkQueue: Promise<void> = Promise.resolve();

  constructor(config: PiClientConfig) {
    this.sessionDir = config.sessionDir;
    this.cwd = config.cwd;
    this.agentDir = config.agentDir;
    this.timeoutMs = config.timeoutMs ?? 5 * 60 * 1000;
    this.sessionFactory = config.sessionFactory ?? defaultPiSdkSessionFactory;
    this.healthCheckFactory = config.healthCheckFactory ?? defaultPiSdkHealthCheck;
    mkdirSync(this.sessionDir, { recursive: true });
  }

  async prompt(
    message: string,
    sessionPath: string | null,
    options: PromptOptions = {},
  ): Promise<{ text: string; sessionPath: string }> {
    return this.withSdkEnvironment(options.env ?? {}, async () => {
      const images = await loadImageAttachments(options);
      const session = await this.sessionFactory({
        cwd: this.cwd,
        agentDir: this.agentDir,
        sessionDir: this.sessionDir,
        sessionPath,
        model: options.model,
        systemPromptAppend: this.buildSystemPrompt(options.systemPromptAddendum),
      });

      const effectiveSessionPath = session.sessionFile ?? sessionPath ?? join(this.sessionDir, `session-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
      console.log(`pi-sdk: prompt start session=${effectiveSessionPath} chars=${message.length} images=${images.length}`);

      let unsubscribe: (() => void) | undefined;
      if (options.onChunk) {
        const { onChunk } = options;
        unsubscribe = session.subscribe((event) => {
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "text_delta"
          ) {
            onChunk(event.assistantMessageEvent.delta);
          }
        });
      }

      try {
        await this.withTimeout(session, message, images);
        const text = session.getLastAssistantText()?.trim() || "Pi returned an empty reply.";
        console.log(`pi-sdk: prompt done session=${effectiveSessionPath} replyChars=${text.length}`);
        return { text, sessionPath: effectiveSessionPath };
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        console.error(`pi-sdk: prompt failed session=${effectiveSessionPath}: ${text}`);
        throw err;
      } finally {
        unsubscribe?.();
        session.dispose();
      }
    });
  }

  async healthCheck(): Promise<void> {
    await this.withSdkEnvironment({}, async () => {
      await this.healthCheckFactory({ cwd: this.cwd, agentDir: this.agentDir });
    });
  }

  private async withTimeout(session: PiSdkSession, message: string, images: SdkImageContent[]): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        void session.abort?.().catch((err) => {
          console.error("pi-sdk: abort after timeout failed:", err);
        });
        reject(new Error(`Pi SDK prompt timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      await Promise.race([
        session.prompt(message, images.length > 0 ? { images } : undefined),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async withSdkEnvironment<T>(env: NodeJS.ProcessEnv, fn: () => Promise<T>): Promise<T> {
    const previous = this.sdkQueue;
    let release!: () => void;
    this.sdkQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await temporaryEnv(env, fn);
    } finally {
      release();
    }
  }

  private buildSystemPrompt(addendum?: string): string {
    return [
      "You are replying through a trusted messaging gateway.",
      "Keep replies concise, plain-text, and mobile-friendly.",
      "Avoid markdown-heavy formatting, large code blocks, and tables unless explicitly requested.",
      "Use the same Pi SDK tools and extensions that are available in normal Pi sessions when they help answer the user.",
      "Ask for explicit confirmation before privileged, destructive, publishing, rebuild, reboot, commit, push, or apply actions unless the user's current message clearly requested that exact action and the relevant tool guideline permits it.",
      addendum?.trim() ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }
}
