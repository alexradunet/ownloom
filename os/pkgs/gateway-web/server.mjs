#!/usr/bin/env node
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const staticRoot = resolve(process.env.OWNLOOM_GATEWAY_WEB_STATIC_ROOT ?? join(here, "public"));
const host = process.env.OWNLOOM_GATEWAY_WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.OWNLOOM_GATEWAY_WEB_PORT ?? "8090");
const target = new URL(process.env.OWNLOOM_GATEWAY_URL ?? "http://127.0.0.1:8081");
const terminalTargetRaw = process.env.OWNLOOM_TERMINAL_URL ?? "";
const terminalTarget = terminalTargetRaw ? new URL(terminalTargetRaw) : null;
const terminalPathPrefix = "/terminal";
const terminalTokenFile = process.env.OWNLOOM_TERMINAL_TOKEN_FILE ?? "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const server = createServer((req, res) => {
  if (new URL(req.url ?? "/", "http://localhost").pathname === "/api/v1/terminal-token") {
    serveTerminalToken(req, res);
    return;
  }
  if (req.url?.startsWith("/api/v1/")) {
    proxyHttp(req, res, target, "gateway");
    return;
  }
  if (isTerminalPath(req.url)) {
    proxyTerminal(req, res);
    return;
  }
  serveStatic(req.url ?? "/", res);
});

server.on("upgrade", (req, socket, head) => {
  if (isTerminalPath(req.url)) {
    if (!terminalTarget) {
      socket.destroy();
      return;
    }
    proxyUpgrade(req, socket, head, terminalTarget, stripTerminalPrefix(req.url ?? "/"));
    return;
  }
  proxyUpgrade(req, socket, head, target);
});

server.listen(port, host, () => {
  const terminal = terminalTarget ? `, terminal -> ${terminalTarget.href}` : "";
  console.log(`ownloom-gateway-web: http://${host}:${port} -> ${target.href}${terminal}`);
});

function isTerminalPath(url) {
  const pathname = new URL(url ?? "/", "http://localhost").pathname;
  return pathname === terminalPathPrefix || pathname.startsWith(`${terminalPathPrefix}/`);
}

function proxyTerminal(req, res) {
  if (!terminalTarget) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Ownloom terminal is not configured.\n");
    return;
  }
  if (new URL(req.url ?? "/", "http://localhost").pathname === terminalPathPrefix) {
    res.writeHead(308, { Location: `${terminalPathPrefix}/` });
    res.end();
    return;
  }
  proxyHttp(req, res, terminalTarget, "terminal", {
    path: stripTerminalPrefix(req.url ?? "/"),
    rewriteHeaders: rewriteTerminalHeaders,
  });
}

function stripTerminalPrefix(url) {
  const parsed = new URL(url, "http://localhost");
  if (parsed.pathname === terminalPathPrefix || parsed.pathname === `${terminalPathPrefix}/`) {
    parsed.pathname = "/";
  } else if (parsed.pathname.startsWith(`${terminalPathPrefix}/`)) {
    parsed.pathname = parsed.pathname.slice(terminalPathPrefix.length);
  }
  return `${parsed.pathname}${parsed.search}`;
}

function rewriteTerminalHeaders(headers) {
  return {
    ...headers,
    "x-frame-options": "SAMEORIGIN",
  };
}

function serveTerminalToken(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }
  if (!isLoopbackRemote(req.socket.remoteAddress)) {
    sendJson(res, 403, { error: "terminal token is loopback-only" });
    return;
  }
  if (!terminalTokenFile) {
    sendJson(res, 404, { error: "terminal token file is not configured" });
    return;
  }

  let raw;
  try {
    raw = readFileSync(terminalTokenFile, "utf8");
  } catch {
    sendJson(res, 404, { error: "terminal token is not available yet" });
    return;
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const token = lines[lines.length - 1];
  if (!token) {
    sendJson(res, 404, { error: "terminal token file does not contain a token" });
    return;
  }
  sendJson(res, 200, { token });
}

function isLoopbackRemote(remoteAddress) {
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function proxyHttp(req, res, upstreamTarget, name, proxyOptions = {}) {
  const options = {
    protocol: upstreamTarget.protocol,
    hostname: upstreamTarget.hostname,
    port: upstreamTarget.port,
    method: req.method,
    path: proxyOptions.path ?? req.url,
    headers: { ...req.headers, host: upstreamTarget.host },
  };
  const upstream = httpRequest(options, (upstreamRes) => {
    const headers = proxyOptions.rewriteHeaders
      ? proxyOptions.rewriteHeaders(upstreamRes.headers)
      : upstreamRes.headers;
    res.writeHead(upstreamRes.statusCode ?? 502, headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (err) => {
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `${name} proxy failed: ${err.message}` }));
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head, upstreamTarget, upstreamPath = req.url || "/") {
  const targetPort = Number(upstreamTarget.port || (upstreamTarget.protocol === "https:" ? 443 : 80));
  const upstream = netConnect(targetPort, upstreamTarget.hostname, () => {
    const path = upstreamPath;
    const headers = { ...req.headers, host: upstreamTarget.host };
    const lines = [`${req.method} ${path} HTTP/${req.httpVersion}`];
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) for (const item of value) lines.push(`${name}: ${item}`);
      else if (value !== undefined) lines.push(`${name}: ${value}`);
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
}

function serveStatic(url, res) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(staticRoot, normalize(relative));
  if (!filePath.startsWith(`${staticRoot}/`) && filePath !== staticRoot) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let stats;
  try {
    stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    "Content-Length": stats.size,
  });
  createReadStream(filePath).pipe(res);
}
