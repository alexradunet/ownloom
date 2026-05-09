{
  pi,
  python3,
  runCommand,
}:
runCommand "ownloom-pi-extension-startup-smoke" {
  nativeBuildInputs = [pi python3];
} ''
  set -euo pipefail

  export HOME="$TMPDIR/home"
  export PI_CODING_AGENT_DIR="$TMPDIR/agent"
  export PI_OFFLINE=1
  export OWNLOOM_WIKI_ROOT="$TMPDIR/wiki"
  export OWNLOOM_WIKI_WORKSPACE=smoke
  export OWNLOOM_WIKI_DEFAULT_DOMAIN=technical
  export NODE_PATH=${pi}/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:${pi}/lib/node_modules
  mkdir -p "$HOME" "$PI_CODING_AGENT_DIR" "$OWNLOOM_WIKI_ROOT"

  cat > "$PI_CODING_AGENT_DIR/models.json" <<'JSON'
  {
    "providers": {
      "fake-llm": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "api": "openai-completions",
        "apiKey": "fake",
        "compat": {
          "supportsDeveloperRole": false,
          "supportsReasoningEffort": false
        },
        "models": [
          {
            "id": "test:latest",
            "name": "Fake Test Model",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 4096,
            "maxTokens": 1024,
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            }
          }
        ]
      }
    }
  }
  JSON

  cat > "$TMPDIR/fake-llm.py" <<'PY'
  import http.server
  import json
  import sys

  class Handler(http.server.BaseHTTPRequestHandler):
      def log_message(self, fmt, *args):
          print(f"[fake-llm] {fmt % args}", flush=True)

      def send_json(self, body):
          raw = json.dumps(body).encode()
          self.send_response(200)
          self.send_header("Content-Type", "application/json")
          self.send_header("Content-Length", str(len(raw)))
          self.end_headers()
          self.wfile.write(raw)

      def do_GET(self):
          if "/api/tags" in self.path or "/models" in self.path:
              self.send_json({"models": [{"name": "test:latest"}], "data": [{"id": "test:latest", "object": "model"}]})
          else:
              self.send_response(404)
              self.end_headers()

      def do_POST(self):
          length = int(self.headers.get("Content-Length", 0))
          req = json.loads(self.rfile.read(length) or b"{}")
          if req.get("stream"):
              self.send_response(200)
              self.send_header("Content-Type", "text/event-stream")
              self.end_headers()
              self.wfile.write(b'data: {"choices":[{"delta":{"role":"assistant","content":"extension smoke ok"},"finish_reason":null}]}\n\n')
              self.wfile.write(b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')
              self.wfile.write(b'data: [DONE]\n\n')
          else:
              self.send_json({
                  "choices": [{"message": {"role": "assistant", "content": "extension smoke ok"}, "finish_reason": "stop"}],
                  "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
              })

  server = http.server.HTTPServer(("127.0.0.1", 11434), Handler)
  print("fake-llm ready", flush=True)
  sys.stdout.flush()
  server.serve_forever()
  PY

  python3 "$TMPDIR/fake-llm.py" >fake-llm.log 2>&1 &
  server_pid=$!
  trap 'kill "$server_pid" 2>/dev/null || true' EXIT

  for _ in $(seq 1 50); do
    if grep -q 'fake-llm ready' fake-llm.log; then
      break
    fi
    sleep 0.1
  done
  grep -q 'fake-llm ready' fake-llm.log

  repo=${../../../..}
  pi \
    --extension "$repo/os/pkgs/pi-adapter/extension" \
    --provider fake-llm \
    --model test:latest \
    --print \
    --no-tools \
    --no-session \
    'extension load smoke' >stdout.log 2>stderr.log

  if grep -q 'Failed to load extension' stderr.log stdout.log; then
    cat stderr.log
    cat stdout.log
    exit 1
  fi
  grep -q 'extension smoke ok' stdout.log

  touch $out
''
