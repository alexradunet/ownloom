import { browserDisplayName, forgetSettings, getBrowserClientId } from "../storage.js";

export function createConfigController({
  els,
  gatewayClient,
  log,
  addSystemMessage,
  saveCurrentSettings,
  refreshLists,
  setConnectionError,
}) {
  async function connect() {
    try {
      const hello = await gatewayClient.connect();
      saveCurrentSettings();
      log("connected", hello);
      addSystemMessage("Connected to Ownloom Gateway.");
      await refreshLists();
    } catch (error) {
      setConnectionError();
      log("connect failed", error.message);
    }
  }

  async function pairBrowser() {
    if (gatewayClient.isConnected()) return;
    els.pairButton.disabled = true;
    try {
      const body = await gatewayClient.pairBrowser({
        clientId: getBrowserClientId(),
        displayName: browserDisplayName(),
      });
      els.token.value = body.token;
      saveCurrentSettings();
      log("paired browser", { id: body.client?.id, scopes: body.client?.scopes });
      addSystemMessage(`Paired this browser as ${body.client?.id ?? "runtime client"}.`);
      await connect();
    } catch (error) {
      setConnectionError();
      addSystemMessage(`Pairing failed: ${error.message}`);
      log("pairing failed", error.message);
    }
  }

  async function health() {
    log("health", await gatewayClient.request("health"));
  }

  async function handleOneShotRuntimeToken(clientId, token) {
    if (!token) {
      addSystemMessage(`Token rotated for ${clientId}, but no token was returned by the gateway.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      addSystemMessage(`New token for ${clientId} copied to clipboard. Copy it now; it will not be shown again.`);
    } catch {
      window.prompt(`Copy new token for ${clientId}:`, token);
      addSystemMessage(`New token for ${clientId} was shown in a one-time copy prompt. It will not be shown again.`);
    }
  }

  els.connectButton.addEventListener("click", () => connect());
  els.pairButton.addEventListener("click", () => pairBrowser());
  els.disconnectButton.addEventListener("click", gatewayClient.disconnect);
  els.clearSettingsButton.addEventListener("click", () => {
    if (!confirmAction("Forget local browser settings? This removes the remembered gateway URL and token from this browser.")) return;
    forgetSettings();
    els.token.value = "";
    log("forgot local settings");
  });
  els.httpUrl.addEventListener("change", saveCurrentSettings);
  els.token.addEventListener("change", saveCurrentSettings);
  els.rememberSettings.addEventListener("change", () => {
    if (els.rememberSettings.checked) saveCurrentSettings();
    else forgetSettings();
  });
  els.healthButton.addEventListener("click", () => health().catch((error) => log("health failed", error.message)));
  els.refreshButton.addEventListener("click", () => refreshLists().catch((error) => log("refresh failed", error.message)));

  els.clients.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const rotateId = target.getAttribute("data-client-rotate");
    const revokeId = target.getAttribute("data-client-revoke");
    if (rotateId) {
      if (!confirmAction(`Rotate token for ${rotateId}? The old runtime token will stop working.`)) return;
      gatewayClient.request("clients.rotateToken", { id: rotateId }).then(async (payload) => {
        log("client token rotated", { id: rotateId, tokenReturnedOnce: Boolean(payload.token) });
        await handleOneShotRuntimeToken(rotateId, payload.token);
        return refreshLists();
      }).catch((error) => log("client token rotate failed", error.message));
    } else if (revokeId) {
      if (!confirmAction(`Revoke client ${revokeId}? It will be disconnected and unable to reconnect.`)) return;
      gatewayClient.request("clients.revoke", { id: revokeId }).then(refreshLists).catch((error) => log("client revoke failed", error.message));
    }
  });

  els.deliveries.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const retryId = target.getAttribute("data-delivery-retry");
    const deleteId = target.getAttribute("data-delivery-delete");
    if (retryId) {
      gatewayClient.request("deliveries.retry", { id: retryId }).then(refreshLists).catch((error) => log("delivery retry failed", error.message));
    } else if (deleteId) {
      if (!confirmAction(`Delete delivery ${deleteId}? This removes it from the retry queue.`)) return;
      gatewayClient.request("deliveries.delete", { id: deleteId }).then(refreshLists).catch((error) => log("delivery delete failed", error.message));
    }
  });

  return { connect, pairBrowser, health };
}

function confirmAction(message) {
  return window.confirm(message);
}
