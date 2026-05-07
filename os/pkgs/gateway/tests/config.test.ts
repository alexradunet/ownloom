import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig, validateGatewayConfig } from "../src/config.js";

const minimalConfig = {
  gateway: {
    statePath: "/var/lib/nixpi-gateway/gateway-state.json",
    sessionDir: "/var/lib/nixpi-gateway/sessions",
    maxReplyChars: 1400,
    maxReplyChunks: 4,
  },
  pi: {
    cwd: "/home/alex/NixPI",
    agentDir: "/home/alex/.pi/agent",
    timeoutMs: 300000,
  },
  transports: {
    whatsapp: {
      enabled: true,
      trustedNumbers: ["whatsapp:+15550001111"],
      adminNumbers: ["whatsapp:+15550001111"],
      directMessagesOnly: true,
      sessionDataPath: "/var/lib/nixpi-gateway/whatsapp/auth",
      model: "hf:moonshotai/Kimi-K2.6",
      allowedModels: ["hf:moonshotai/Kimi-K2.6"],
    },
  },
};

test("validateGatewayConfig accepts the generated declarative config shape", () => {
  const config = validateGatewayConfig(minimalConfig);

  assert.equal(config.gateway.statePath, "/var/lib/nixpi-gateway/gateway-state.json");
  assert.equal(config.pi.agentDir, "/home/alex/.pi/agent");
  assert.equal(config.transports.whatsapp?.trustedNumbers[0], "whatsapp:+15550001111");
});

test("validateGatewayConfig rejects removed Pi CLI fields", () => {
  assert.throws(
    () => validateGatewayConfig({ ...minimalConfig, pi: { ...minimalConfig.pi, bin: "/run/current-system/sw/bin/pi" } }),
    /pi\.bin was removed/,
  );
  assert.throws(
    () => validateGatewayConfig({ ...minimalConfig, pi: { ...minimalConfig.pi, extraArgs: ["--no-tools"] } }),
    /pi\.extraArgs was removed/,
  );
});

test("validateGatewayConfig fails early for invalid config types", () => {
  assert.throws(
    () => validateGatewayConfig({ ...minimalConfig, gateway: { ...minimalConfig.gateway, maxReplyChars: "1400" } }),
    /gateway\.maxReplyChars must be a finite number/,
  );
});

test("validateGatewayConfig rejects removed Signal transport", () => {
  assert.throws(
    () => validateGatewayConfig({ ...minimalConfig, transports: { ...minimalConfig.transports, signal: { enabled: false } } }),
    /Signal transport was removed/,
  );
});

test("loadConfig parses YAML and validates it", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nixpi-gateway-config-"));
  try {
    const configPath = path.join(tmp, "nixpi-gateway.yml");
    writeFileSync(
      configPath,
      [
        "gateway:",
        "  statePath: /var/lib/nixpi-gateway/gateway-state.json",
        "  sessionDir: /var/lib/nixpi-gateway/sessions",
        "  maxReplyChars: 1400",
        "  maxReplyChunks: 4",
        "pi:",
        "  cwd: /home/alex/NixPI",
        "  agentDir: /home/alex/.pi/agent",
        "transports:",
        "  whatsapp:",
        "    enabled: true",
        "    trustedNumbers: ['+15550001111']",
        "    adminNumbers: ['+15550001111']",
        "    directMessagesOnly: true",
        "    sessionDataPath: /var/lib/nixpi-gateway/whatsapp/auth",
      ].join("\n"),
      "utf-8",
    );

    const config = loadConfig(configPath);

    assert.equal(config.transports.whatsapp?.trustedNumbers[0], "+15550001111");
    assert.equal(config.pi.agentDir, "/home/alex/.pi/agent");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
