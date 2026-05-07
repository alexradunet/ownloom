const RAW_TOOL_CALL_PATTERNS = [
  /<\|tool_calls_section_begin\|>/i,
  /<\|tool_call_begin\|>/i,
  /<\|tool_call_argument_begin\|>/i,
  /\btool_calls?_section_(begin|end)\b/i,
  /\btool_call_(begin|argument_begin|end)\b/i,
];

const UNSUPPORTED_TOOL_CALL_REPLY = [
  "I received raw Pi tool-call markup instead of a final reply.",
  "I hid the internal syntax from this chat.",
  "Please try again; the Pi SDK gateway can use tools directly when the model emits proper tool calls.",
].join(" ");

function containsRawToolCallMarkup(text: string): boolean {
  return RAW_TOOL_CALL_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeReply(text: string): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "I don't have a reply for that.";
  if (containsRawToolCallMarkup(trimmed)) return UNSUPPORTED_TOOL_CALL_REPLY;
  return trimmed
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

export function chunkText(text: string, maxChars: number, maxChunks: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0 && chunks.length < maxChunks) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      remaining = "";
      break;
    }

    const splitAt =
      ["\n\n", "\n", " "].map((sep) => remaining.lastIndexOf(sep, maxChars)).find((i) => i > 0) ?? maxChars;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0 && chunks.length > 0) {
    chunks[chunks.length - 1] += "\n\n[truncated]";
  }

  return chunks.length > 1
    ? chunks.map((chunk, i) => `(${i + 1}/${chunks.length}) ${chunk}`)
    : chunks;
}
