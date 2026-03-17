---
name: local-llm
description: Use local LLM inference (llama-server) — OpenAI-compatible LLM API with OmniCoder 9B
---

# Local LLM (llama-server)

llama-server runs on every Bloom OS instance and is always available at boot. It provides an OpenAI-compatible API for LLM inference.

## Service

llama-server is a system service managed by systemd:

```bash
systemctl status localai          # check status
sudo systemctl restart localai    # restart if needed
```

API base URL: `http://localhost:11435/v1`

List loaded models:
```bash
curl http://localhost:11435/v1/models
```

## Default Model

`omnicoder-9b-q4_k_m` is pre-loaded at boot. No download needed.

## LLM Inference

```bash
curl http://localhost:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "omnicoder-9b-q4_k_m",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Adding More Models

Drop any GGUF file into `/var/lib/localai/models/` and restart the service:

```bash
sudo cp mymodel.gguf /var/lib/localai/models/
sudo systemctl restart localai
```

Note: restart is needed because llama-server loads a single model at startup via `--model`.

## When to Use Local vs Cloud

**Prefer local:**
- Offline or air-gapped operation
- Privacy-sensitive tasks (nothing leaves the device)
- Bulk processing (no rate limits)

**Prefer cloud Claude:**
- Tasks requiring strong reasoning or very large context
