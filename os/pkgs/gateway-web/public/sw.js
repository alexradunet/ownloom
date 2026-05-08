const CACHE_VERSION = "ownloom-gateway-web-static-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/styles/tokens.css",
  "/styles/base.css",
  "/styles/layout.css",
  "/styles/components.css",
  "/styles/utilities.css",
  "/styles/responsive.css",
  "/app.js",
  "/js/app.js",
  "/js/constants.js",
  "/js/state.js",
  "/js/storage.js",
  "/js/dom.js",
  "/js/gateway-client.js",
  "/js/pwa.js",
  "/js/a11y.js",
  "/js/controllers/chat-controller.js",
  "/js/controllers/config-controller.js",
  "/js/controllers/terminal-controller.js",
  "/js/controllers/organizer-controller.js",
  "/js/controllers/log-controller.js",
  "/js/components/atoms.js",
  "/js/components/molecules.js",
  "/js/components/organisms/chat-panel.js",
  "/js/components/organisms/sessions-panel.js",
  "/js/components/organisms/clients-panel.js",
  "/js/components/organisms/deliveries-panel.js",
  "/js/components/organisms/commands-panel.js",
  "/js/components/organisms/terminal-panel.js",
  "/js/components/organisms/settings-panel.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
];

const STATIC_PATHS = new Set(STATIC_ASSETS);
const API_PREFIX = "/api/";
const TERMINAL_PREFIX = "/terminal/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names
      .filter((name) => name.startsWith("ownloom-gateway-web-") && name !== CACHE_VERSION)
      .map((name) => caches.delete(name)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (shouldBypass(request)) return;

  const url = new URL(request.url);
  if (request.mode === "navigate" && isShellNavigation(url)) {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(request, url.pathname));
  }
});

function shouldBypass(request) {
  if (request.method !== "GET") return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith(API_PREFIX)) return true;
  if (url.pathname === "/api/v1/terminal-token") return true;
  if (url.pathname === "/terminal" || url.pathname.startsWith(TERMINAL_PREFIX)) return true;
  if (request.headers.has("Authorization")) return true;
  if (request.cache === "no-store") return true;
  return false;
}

function isShellNavigation(url) {
  return url.origin === self.location.origin && (url.pathname === "/" || url.pathname === "/index.html");
}

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(cacheKey(request, fallbackPath), response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackPath ? new Request(fallbackPath) : request);
    if (cached) return cached;
    throw error;
  }
}

function cacheKey(request, fallbackPath) {
  if (fallbackPath && request.mode === "navigate") return new Request(fallbackPath);
  return request;
}
