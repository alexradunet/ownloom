import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReply } from "../src/core/formatter.js";

const TOOL_CALL_RAW = '<|tool_calls_section_begin|> <|tool_call_begin|> functions.read:59 <|tool_call_argument_begin|> {"path":"/tmp/file"} <|tool_call_end|> <|tool_calls_section_end|>';

test("normalizeReply replaces raw tool-call markup with a safe fallback", () => {
  const reply = normalizeReply(TOOL_CALL_RAW);
  // Must not contain raw markup tokens
  assert.ok(!reply.includes("<|tool_calls_section_begin|>"), "markup should be stripped");
  // Should contain a human-readable message
  assert.ok(reply.length > 0);
});

test("normalizeReply leaves ordinary replies intact", () => {
  assert.equal(normalizeReply(" hello \nworld  "), "hello\nworld");
});
