import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WhisperCliAudioTranscriber } from "../src/core/audio-transcriber.js";

function writeExecutable(filePath: string, source: string): void {
  writeFileSync(filePath, source, "utf-8");
  chmodSync(filePath, 0o755);
}

test("WhisperCliAudioTranscriber converts audio and returns the whisper transcript", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-stt-"));
  try {
    const ffmpeg = path.join(tmp, "fake-ffmpeg.cjs");
    const whisper = path.join(tmp, "fake-whisper.cjs");
    const model = path.join(tmp, "model.bin");
    const input = path.join(tmp, "input.ogg");
    const argsFile = path.join(tmp, "whisper-args.txt");

    writeFileSync(model, "model", "utf-8");
    writeFileSync(input, "audio", "utf-8");
    writeExecutable(ffmpeg, `#!${process.execPath}
const fs = require("node:fs");
fs.writeFileSync(process.argv.at(-1), "wav");
`);
    writeExecutable(whisper, `#!${process.execPath}
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(argsFile)}, process.argv.slice(2).join("\\n"));
console.log("hello from voice note");
`);

    const transcriber = new WhisperCliAudioTranscriber({
      enabled: true,
      command: whisper,
      ffmpegCommand: ffmpeg,
      modelPath: model,
      language: "en",
      threads: 2,
      timeoutMs: 10_000,
      maxSeconds: 180,
    });

    await transcriber.healthCheck();
    const transcript = await transcriber.transcribe({ kind: "audio", path: input, mimeType: "audio/ogg", seconds: 12 });

    assert.equal(transcript, "hello from voice note");
    const whisperArgs = readFileSync(argsFile, "utf-8");
    assert.match(whisperArgs, new RegExp(`-m\\n${model}`));
    assert.match(whisperArgs, /-l\nen/);
    assert.match(whisperArgs, /-t\n2/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("WhisperCliAudioTranscriber rejects audio above the configured duration limit", async () => {
  const transcriber = new WhisperCliAudioTranscriber({
    enabled: true,
    command: "/bin/false",
    ffmpegCommand: "/bin/false",
    modelPath: "/tmp/model.bin",
    maxSeconds: 10,
  });

  await assert.rejects(
    () => transcriber.transcribe({ kind: "audio", path: "/tmp/input.ogg", mimeType: "audio/ogg", seconds: 11 }),
    /Audio message is too long/,
  );
});
