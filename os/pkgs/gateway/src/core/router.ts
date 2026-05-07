import { rm } from "node:fs/promises";
import type { InboundAttachment, InboundMessage, RouterResult } from "./types.js";
import { Store } from "./store.js";
import type { AgentClient } from "./agent-client.js";
import { PersonalConversationCaptureService } from "../personal/conversation-capture.js";
import { wikiSearch, wikiShowPage } from "../personal/wiki.js";
import { chunkText, normalizeReply } from "./formatter.js";
import { KeyedSerialQueue } from "./queue.js";
import type { AudioTranscriber } from "./audio-transcriber.js";

export type ChannelConfig = {
  /** Pi model selector, e.g. `synthetic/hf:moonshotai/Kimi-K2.6`. */
  model?: string;
  /** Allowlist of model ids the channel may switch to. */
  allowedModels?: string[];
  /** Appended to the system prompt for every message on this channel. */
  systemPromptAddendum?: string;
  /** Extra environment variables set during agent.prompt() for this channel. */
  env?: NodeJS.ProcessEnv;
  /** Extra text appended to the /reset acknowledgement on this channel. */
  resetHint?: string;
};

export class Router {
  private readonly queue = new KeyedSerialQueue();
  private readonly conversationCapture = new PersonalConversationCaptureService();

  constructor(
    private readonly store: Store,
    private readonly agent: AgentClient,
    private readonly maxReplyChars: number,
    private readonly maxReplyChunks: number,
    private readonly channelConfigs: Record<string, ChannelConfig> = {},
    private readonly audioTranscriber?: AudioTranscriber,
    private readonly fallbackModel?: string,
  ) {}

  handleMessage(msg: InboundMessage, onChunk?: (chunk: string) => void): Promise<RouterResult> {
    return this.queue.run(msg.chatId, () => this.handleMessageInner(msg, onChunk));
  }

  private async handleMessageInner(
    msg: InboundMessage,
    onChunk?: (chunk: string) => void,
  ): Promise<RouterResult> {
    try {
      if (msg.access.selfSenderIds.includes(msg.senderId)) return { replies: [], markProcessed: false };
      if (!msg.access.allowedSenderIds.includes(msg.senderId)) return { replies: [], markProcessed: false };
      if (msg.access.directMessagesOnly && msg.isGroup) return { replies: [], markProcessed: false };
      if (this.store.hasProcessedMessage(msg.messageId)) return { replies: [], markProcessed: false };

      const audioAttachments = (msg.attachments ?? []).filter((a) => a.kind === "audio");
      const imageAttachments = (msg.attachments ?? []).filter((a) => a.kind === "image");
      const transcribedAudio =
        audioAttachments.length > 0 ? await this.transcribeAudioAttachments(audioAttachments) : null;
      if (transcribedAudio?.error) {
        return {
          replies: chunkText(normalizeReply(transcribedAudio.error), this.maxReplyChars, this.maxReplyChunks),
          markProcessed: true,
        };
      }

      const text = this.buildEffectiveText(msg.text.trim(), transcribedAudio?.text ?? null).trim();
      const commandText = this.normalizeCommandText(text);
      if (!text && imageAttachments.length === 0) return { replies: [], markProcessed: true };

      const builtin = this.handleBuiltin(msg, commandText);
      if (builtin !== null) {
        return {
          replies: chunkText(normalizeReply(builtin), this.maxReplyChars, this.maxReplyChunks),
          markProcessed: true,
        };
      }

      this.captureUserMessage(msg, text);

      try {
        const channelCfg = this.channelConfigs[msg.channel];
        const existing = this.store.getChatSession(msg.chatId);

        // Privacy routing: messages prefixed with "/private" (or "private" after
        // normalizeCommandText strips the slash) must never leave this host.
        // They are routed to the local fallback model only.
        const PRIVATE_PREFIX = "private ";
        const isPrivate = commandText.toLowerCase().startsWith(PRIVATE_PREFIX);
        if (isPrivate && !this.fallbackModel) {
          return {
            replies: chunkText(
              "Privacy routing is not available: no local model is configured.",
              this.maxReplyChars,
              this.maxReplyChunks,
            ),
            markProcessed: true,
          };
        }
        const effectiveText = isPrivate ? text.slice(text.toLowerCase().indexOf(PRIVATE_PREFIX) + PRIVATE_PREFIX.length).trim() : text;

        const effectiveModel = isPrivate
          ? this.fallbackModel!
          : channelCfg?.model
            ? toSyntheticModelArg(channelCfg.model)
            : undefined;

        const reply = await this.agent.prompt(effectiveText, existing?.sessionPath ?? null, {
          systemPromptAddendum: channelCfg?.systemPromptAddendum,
          model: effectiveModel,
          env: channelCfg?.env,
          onChunk,
          attachments: imageAttachments.map((a) => ({
            kind: a.kind,
            path: a.path,
            mimeType: a.mimeType,
            fileName: a.fileName,
          })),
        });
        this.store.upsertChatSession(msg.chatId, msg.senderId, reply.sessionPath);
        const normalizedReply = normalizeReply(reply.text);
        this.captureAssistantReply(msg, normalizedReply);

        // When streaming, chunks were already delivered via onChunk — no text to re-send.
        if (onChunk) {
          return { replies: [], markProcessed: true };
        }
        return {
          replies: chunkText(normalizedReply, this.maxReplyChars, this.maxReplyChunks),
          markProcessed: true,
        };
      } catch (err) {
        console.error("router.handleMessageInner failed:", err);

        // Fallback: if no chunks were streamed yet and a local fallback model is
        // configured, retry once with that model. Annotate the reply so the
        // operator can see which provider served it.
        if (!onChunk && this.fallbackModel) {
          console.warn(
            `router: primary provider failed, retrying with fallback model ${this.fallbackModel}`,
          );
          try {
            const channelCfg = this.channelConfigs[msg.channel];
            const fallbackReply = await this.agent.prompt(text, null, {
              systemPromptAddendum: channelCfg?.systemPromptAddendum,
              model: this.fallbackModel,
              env: channelCfg?.env,
            });
            const normalizedFallback = normalizeReply(fallbackReply.text);
            this.captureAssistantReply(msg, normalizedFallback);
            return {
              replies: chunkText(
                `[⚡ local] ${normalizedFallback}`,
                this.maxReplyChars,
                this.maxReplyChunks,
              ),
              markProcessed: true,
            };
          } catch (fallbackErr) {
            console.error("router: fallback provider also failed:", fallbackErr);
          }
        }

        return {
          replies: chunkText(
            "I hit an internal error. Please try again in a moment.",
            this.maxReplyChars,
            this.maxReplyChunks,
          ),
          markProcessed: true,
        };
      }
    } finally {
      await this.cleanupInboundAttachments(msg);
    }
  }

  private captureUserMessage(msg: InboundMessage, text: string): void {
    try {
      this.conversationCapture.captureUserMessage(msg, text);
    } catch (err) {
      console.error("router: failed to auto-capture user message:", err);
    }
  }

  private captureAssistantReply(msg: InboundMessage, text: string): void {
    try {
      this.conversationCapture.captureAssistantReply(msg, text);
    } catch (err) {
      console.error("router: failed to auto-capture assistant reply:", err);
    }
  }

  private async transcribeAudioAttachments(
    attachments: InboundAttachment[],
  ): Promise<{ text: string | null; error?: string }> {
    if (!this.audioTranscriber) {
      return {
        text: null,
        error: "I received an audio message, but speech-to-text is not configured yet.",
      };
    }

    const transcripts: string[] = [];
    for (const [index, attachment] of attachments.entries()) {
      try {
        const transcript = (await this.audioTranscriber.transcribe(attachment)).trim();
        if (transcript) transcripts.push(transcript);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`router: failed to transcribe audio attachment ${index + 1}/${attachments.length}:`, err);
        return {
          text: null,
          error: `I couldn't transcribe that audio message: ${message}`,
        };
      }
    }

    return { text: transcripts.join("\n\n").trim() || null };
  }

  private buildEffectiveText(originalText: string, transcript: string | null): string {
    if (!transcript) return originalText;
    if (!originalText || originalText === "Please transcribe the attached audio.") return transcript;
    return `${originalText}\n\nTranscribed audio:\n${transcript}`;
  }

  private normalizeCommandText(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return trimmed;
    return trimmed.slice(1).trimStart();
  }

  private handleBuiltin(msg: InboundMessage, text: string): string | null {
    const lowered = text.toLowerCase();
    const isAdmin = msg.access.adminSenderIds.includes(msg.senderId);

    if (lowered === "help") {
      return [
        `You can chat with Pi here through ${msg.channel}.`,
        "",
        "Commands: use plain text or slash form, e.g. help or /help.",
        "  /help              — show this message",
        "  /reset             — start a fresh conversation",
        "  /status            — show session info (admin)",
        "  /wiki <query>      — search the wiki",
        "  /wiki show <title> — preview a wiki page",
        "",
        "Everything else is passed straight to Pi SDK with the normal tool and extension registry.",
      ].join("\n");
    }

    if (lowered === "reset") {
      this.store.resetChatSession(msg.chatId);
      const hint = this.channelConfigs[msg.channel]?.resetHint;
      const base = `Started a fresh conversation for this ${msg.channel} chat.`;
      return hint ? `${base} ${hint}` : base;
    }

    if (lowered === "status") {
      if (!isAdmin) return "That command is admin-only.";
      const existing = this.store.getChatSession(msg.chatId);
      return [
        `channel: ${msg.channel}`,
        `sender:  ${msg.senderId}`,
        `admin:   yes`,
        `chat_id: ${msg.chatId}`,
        `session: ${existing?.sessionPath ?? "none"}`,
      ].join("\n");
    }

    if (lowered === "wiki") {
      return "Usage: wiki <query>  |  wiki show <title>";
    }

    if (lowered.startsWith("wiki ")) {
      const rest = text.slice(5).trim();
      if (!rest) return "Usage: wiki <query>  |  wiki show <title>";
      if (rest.toLowerCase().startsWith("show ")) return wikiShowPage(rest.slice(5).trim());
      return wikiSearch(rest);
    }

    return null;
  }

  private async cleanupInboundAttachments(msg: InboundMessage): Promise<void> {
    for (const attachment of msg.attachments ?? []) {
      await rm(attachment.path, { force: true }).catch((err) => {
        console.error(`router: failed to remove inbound attachment ${attachment.path}:`, err);
      });
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSyntheticModelArg(model: string): string {
  const trimmed = model.trim();
  const id = trimmed.startsWith("synthetic/") ? trimmed.slice("synthetic/".length) : trimmed;
  return `synthetic/${id}`;
}
