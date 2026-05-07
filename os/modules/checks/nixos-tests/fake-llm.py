#!/usr/bin/env python3
"""
Fake OpenAI-compatible LLM server for NixOS integration tests.

Speaks the same API as ollama/llama-server on 127.0.0.1:11434.
- Turn 1 (no tool results yet): returns a nixpi_planner add_task tool call.
- Turn 2 (tool result present): returns a short confirmation text.

Handles both streaming (SSE) and non-streaming requests so pi works
regardless of its default streaming preference.
"""
import http.server
import json
import sys

TOOL_ARGS = json.dumps(
    {"action": "add_task", "title": "E2E test task", "due": "2026-06-01"}
)


def sse(data: dict) -> bytes:
    return ("data: " + json.dumps(data) + "\n\n").encode()


def sse_done() -> bytes:
    return b"data: [DONE]\n\n"


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # noqa: N802
        print(f"[fake-llm] {fmt % args}", flush=True)

    def _send_json(self, body: dict, status: int = 200) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):  # noqa: N802
        if "/api/tags" in self.path:
            self._send_json({"models": [{"name": "test:latest"}]})
        elif "/models" in self.path:
            self._send_json(
                {"object": "list", "data": [{"id": "test:latest", "object": "model"}]}
            )
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(length))
        messages = req.get("messages", [])
        streaming = req.get("stream", False)
        # Turn 2 is detected by the presence of a "tool" role message.
        has_tool_result = any(m.get("role") == "tool" for m in messages)

        if streaming:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            if not has_tool_result:
                # Turn 1: emit a single chunk with the full tool call.
                self.wfile.write(
                    sse(
                        {
                            "id": "fake-1",
                            "object": "chat.completion.chunk",
                            "model": "test:latest",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {
                                        "role": "assistant",
                                        "content": None,
                                        "tool_calls": [
                                            {
                                                "index": 0,
                                                "id": "call_e2e_1",
                                                "type": "function",
                                                "function": {
                                                    "name": "nixpi_planner",
                                                    "arguments": TOOL_ARGS,
                                                },
                                            }
                                        ],
                                    },
                                    "finish_reason": None,
                                }
                            ],
                        }
                    )
                )
                self.wfile.write(
                    sse(
                        {
                            "id": "fake-1",
                            "object": "chat.completion.chunk",
                            "choices": [
                                {"index": 0, "delta": {}, "finish_reason": "tool_calls"}
                            ],
                        }
                    )
                )
            else:
                # Turn 2: emit a short text confirmation.
                self.wfile.write(
                    sse(
                        {
                            "id": "fake-2",
                            "object": "chat.completion.chunk",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"role": "assistant", "content": ""},
                                    "finish_reason": None,
                                }
                            ],
                        }
                    )
                )
                self.wfile.write(
                    sse(
                        {
                            "id": "fake-2",
                            "object": "chat.completion.chunk",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {
                                        "content": "Done! Added 'E2E test task' to planner."
                                    },
                                    "finish_reason": None,
                                }
                            ],
                        }
                    )
                )
                self.wfile.write(
                    sse(
                        {
                            "id": "fake-2",
                            "object": "chat.completion.chunk",
                            "choices": [
                                {"index": 0, "delta": {}, "finish_reason": "stop"}
                            ],
                        }
                    )
                )
            self.wfile.write(sse_done())
        else:
            # Non-streaming fallback.
            if not has_tool_result:
                resp = {
                    "id": "fake-1",
                    "object": "chat.completion",
                    "model": "test:latest",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": None,
                                "tool_calls": [
                                    {
                                        "id": "call_e2e_1",
                                        "type": "function",
                                        "function": {
                                            "name": "nixpi_planner",
                                            "arguments": TOOL_ARGS,
                                        },
                                    }
                                ],
                            },
                            "finish_reason": "tool_calls",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 20,
                        "total_tokens": 30,
                    },
                }
            else:
                resp = {
                    "id": "fake-2",
                    "object": "chat.completion",
                    "model": "test:latest",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "Done! Added 'E2E test task' to planner.",
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 20,
                        "completion_tokens": 10,
                        "total_tokens": 30,
                    },
                }
            self._send_json(resp)


server = http.server.HTTPServer(("127.0.0.1", 11434), Handler)
print("fake-llm ready on 127.0.0.1:11434", flush=True)
sys.stdout.flush()
server.serve_forever()
