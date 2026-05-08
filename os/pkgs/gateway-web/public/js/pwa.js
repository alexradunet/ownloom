export function registerPwa({ log = () => {}, setStatus = () => {} } = {}) {
  setStatus(navigator.onLine ? "Online" : "Offline");

  window.addEventListener("online", () => setStatus("Online"));
  window.addEventListener("offline", () => setStatus("Offline shell only"));

  if (!("serviceWorker" in navigator)) {
    log("pwa unavailable", "service worker not supported");
    return;
  }
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    log("pwa skipped", "service worker requires http(s)");
    return;
  }

  navigator.serviceWorker.register("./sw.js").then((registration) => {
    log("pwa registered", { scope: registration.scope });
    registration.addEventListener("updatefound", () => {
      setStatus("Update available");
      log("pwa update available");
    });
  }).catch((error) => {
    log("pwa registration failed", error.message);
  });
}
