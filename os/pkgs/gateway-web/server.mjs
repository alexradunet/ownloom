#!/usr/bin/env node
import { createReadStream, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const staticRoot = resolve(process.env.OWNLOOM_GATEWAY_WEB_STATIC_ROOT ?? join(here, "public"));
const host = process.env.OWNLOOM_GATEWAY_WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.OWNLOOM_GATEWAY_WEB_PORT ?? "8090");
const target = new URL(process.env.OWNLOOM_GATEWAY_URL ?? "http://127.0.0.1:8081");

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
  if (req.url?.startsWith("/api/v1/")) {
    proxyHttp(req, res);
    return;
  }
  serveStatic(req.url ?? "/", res);
});

server.on("upgrade", (req, socket, head) => {
  const targetPort = Number(target.port || (target.protocol === "https:" ? 443 : 80));
  const upstream = netConnect(targetPort, target.hostname, () => {
    const path = req.url || "/";
    const headers = { ...req.headers, host: target.host };
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
});

server.listen(port, host, () => {
  console.log(`ownloom-gateway-web: http://${host}:${port} -> ${target.href}`);
});

function proxyHttp(req, res) {
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: target.host },
  };
  const upstream = httpRequest(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `gateway proxy failed: ${err.message}` }));
  });
  req.pipe(upstream);
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
