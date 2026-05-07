export type PromptAttachment = {
  path: string;
  mimeType?: string;
  kind?: "image" | "audio";
  fileName?: string;
};

export type PromptOptions = {
  systemPromptAddendum?: string;
  env?: NodeJS.ProcessEnv;
  model?: string;
  attachments?: PromptAttachment[];
  /** Called with each streamed text fragment as the model generates its reply. */
  onChunk?: (chunk: string) => void;
};

export type PromptReply = { text: string; sessionPath: string };

export interface AgentClient {
  readonly name: string;
  prompt(message: string, sessionPath: string | null, options?: PromptOptions): Promise<PromptReply>;
  healthCheck(): Promise<void>;
}
