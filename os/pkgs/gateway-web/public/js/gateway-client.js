import { CLIENT_VERSION, OPERATOR_SCOPES, PROTOCOL_VERSION } from "./constants.js";

export function createGatewayClient({
  getHttpUrl,
  getToken,
  onAgentEvent = () => {},
  onChangedEvent = () => {},
  onConnectionChange = () => {},
  log = () => {},
}) {
  let ws = null;
  let nextId = 1;
  const pending = new Map();

  function isConnected() {
    return ws?.readyState === WebSocket.OPEN;
  }

  function request(method, params = {}) {
    if (!isConnected()) return Promise.reject(new Error("not connected"));
    const id = `${method}-${nextId++}`;
    ws.send(JSON.stringify({ type: "req", id, method, params }));
    return waitForResponse(id, method);
  }

  async function connect() {
    disconnect();
    onConnectionChange("connecting", "", false, true);
    const socket = new WebSocket(webSocketUrl());
    ws = socket;

    socket.addEventListener("message", (event) => {
      try {
        handleFrame(JSON.parse(event.data));
      } catch (error) {
        log("invalid websocket frame", error.message);
      }
    });
    socket.addEventListener("close", () => {
      if (ws === socket) {
        ws = null;
        rejectPending(new Error("disconnected"));
        onConnectionChange("disconnected", "", false, false);
        log("socket closed");
      }
    });
    socket.addEventListener("error", () => {
      onConnectionChange("error", "error", false, false);
      log("socket error");
    });

    try {
      await waitForOpen(socket);
      const helloPromise = waitForResponse("connect", "connect", 30000);
      socket.send(JSON.stringify({
        type: "connect",
        protocol: PROTOCOL_VERSION,
        role: "operator",
        scopes: OPERATOR_SCOPES,
        auth: getToken().trim() ? { token: getToken().trim() } : {},
        client: { id: "web-main", version: CLIENT_VERSION, platform: "web" },
      }));
      const hello = await helloPromise;
      onConnectionChange("connected", "connected", true, false);
      return hello;
    } catch (error) {
      if (ws === socket) disconnect();
      throw error;
    }
  }

  function disconnect() {
    if (ws) ws.close();
    ws = null;
    rejectPending(new Error("disconnected"));
    onConnectionChange("disconnected", "", false, false);
  }

  async function pairBrowser({ clientId, displayName }) {
    const url = new URL("/api/v1/pair", gatewayHttpUrl());
    url.search = new URLSearchParams({ clientId, displayName }).toString();
    const response = await fetch(url, { method: "POST", cache: "no-store" });
    const body = await readJsonResponse(response);
    if (!response.ok) throw new Error(body.error ?? `pairing failed: ${response.status}`);
    return body;
  }

  async function uploadAttachments(files) {
    const uploaded = [];
    for (const file of files) {
      const kind = file.type.startsWith("audio/") ? "audio" : "image";
      const response = await fetch(new URL("/api/v1/attachments", gatewayHttpUrl()), {
        method: "POST",
        cache: "no-store",
        headers: {
          ...authHeaders(),
          "Content-Type": file.type || "application/octet-stream",
          "x-ownloom-attachment-kind": kind,
          "x-ownloom-filename": file.name,
        },
        body: file,
      });
      const body = await readJsonResponse(response);
      if (!response.ok) throw new Error(`upload failed: ${response.status} ${body.error?.message ?? body.error ?? JSON.stringify(body)}`);
      uploaded.push(body);
      log("uploaded attachment", body);
    }
    return uploaded;
  }

  async function copyTerminalToken() {
    const response = await fetch("/api/v1/terminal-token", { cache: "no-store" });
    const body = await readJsonResponse(response);
    if (!response.ok) throw new Error(body.error ?? `token request failed: ${response.status}`);
    if (typeof body.token !== "string" || !body.token.trim()) throw new Error("token response was empty");
    return body.token;
  }

  function authHeaders() {
    const token = getToken().trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function handleFrame(frame) {
    if (frame.type === "event") {
      if (frame.event === "agent") onAgentEvent(frame.payload ?? {});
      else onChangedEvent(frame.event, frame.payload);
      return;
    }
    if (frame.type !== "res") return;
    const waiter = pending.get(frame.id);
    if (!waiter) return;
    pending.delete(frame.id);
    if (frame.ok) waiter.resolve(frame.payload);
    else {
      const error = new Error(frame.error?.message ?? "request failed");
      error.code = frame.error?.code ?? "ERROR";
      waiter.reject(error);
    }
  }

  function waitForResponse(id, label, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`${label} timed out`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  function rejectPending(error) {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  }

  function gatewayHttpUrl() {
    return validateGatewayHttpUrl(getHttpUrl());
  }

  function webSocketUrl() {
    const url = new URL(gatewayHttpUrl());
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }

  return {
    connect,
    disconnect,
    request,
    isConnected,
    pairBrowser,
    uploadAttachments,
    copyTerminalToken,
    validateGatewayHttpUrl,
  };
}

export function validateGatewayHttpUrl(rawValue) {
  const raw = String(rawValue ?? "").trim() || window.location.origin;
  const url = new URL(raw, window.location.origin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Gateway URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("Gateway URL must not include credentials.");
  }
  if (!isAllowedGatewayHost(url)) {
    throw new Error("Gateway URL must be same-origin or loopback-only.");
  }
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function isAllowedGatewayHost(url) {
  if (url.origin === window.location.origin) return true;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("socket failed to open")), { once: true });
  });
}

async function readJsonResponse(response) {
  return response.json().catch(() => ({}));
}
