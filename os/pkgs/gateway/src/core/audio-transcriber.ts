import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AudioTranscriptionConfig } from "../config.js";
import type { InboundAttachment } from "./types.js";

const execFileAsync = promisify(execFile);

export interface AudioTranscriber {
  transcribe(attachment: InboundAttachment): Promise<string>;
}

export class WhisperCliAudioTranscriber implements AudioTranscriber {
  constructor(private readonly config: AudioTranscriptionConfig) {}

  async healthCheck(): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.config.command) throw new Error("Audio transcription command is not configured.");
    if (!this.config.ffmpegCommand) throw new Error("Audio transcription ffmpeg command is not configured.");
    if (!this.config.modelPath) throw new Error("Audio transcription model path is not configured.");
  }

  async transcribe(attachment: InboundAttachment): Promise<string> {
    if (!this.config.enabled) throw new Error("Audio transcription is not enabled for this gateway.");
    if (attachment.kind !== "audio") throw new Error(`Cannot transcribe non-audio attachment kind: ${attachment.kind}`);

    const maxSeconds = this.config.maxSeconds ?? 180;
    if (attachment.seconds && attachment.seconds > maxSeconds) {
      throw new Error(`Audio message is too long (${attachment.seconds}s > ${maxSeconds}s).`);
    }

    const workDir = await mkdtemp(join(tmpdir(), "nixpi-stt-"));
    const wavPath = join(workDir, "audio.wav");

    try {
      await this.convertToWav(attachment.path, wavPath);

      const args = [
        "-m", this.config.modelPath,
        "-f", wavPath,
        "-l", this.config.language ?? "auto",
        "-nt",
        "-np",
        ...(this.config.threads ? ["-t", String(this.config.threads)] : []),
      ];

      const { stdout, stderr } = await execFileAsync(this.config.command, args, {
        timeout: this.config.timeoutMs ?? 120_000,
        maxBuffer: 1024 * 1024,
        env: process.env,
      });

      const transcript = stdout.trim();
      if (transcript) return transcript;

      const fallback = stderr.trim();
      if (fallback) throw new Error(`Audio transcription produced no transcript: ${fallback}`);
      throw new Error("Audio transcription produced no transcript.");
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async convertToWav(inputPath: string, outputPath: string): Promise<void> {
    const ffmpeg = this.config.ffmpegCommand;
    if (!ffmpeg) throw new Error("Audio transcription ffmpeg command is not configured.");

    await execFileAsync(ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      outputPath,
    ], {
      timeout: Math.min(this.config.timeoutMs ?? 120_000, 60_000),
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
  }
}
