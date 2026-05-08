export function setConnectionState(els, status, className = "", connected = false, connecting = false) {
  els.connectionState.textContent = status;
  els.connectionState.className = `pill ${className}`.trim();
  els.connectButton.disabled = connected;
  els.pairButton.disabled = connected || connecting;
  els.disconnectButton.disabled = !connected;
  els.healthButton.disabled = !connected;
  els.refreshButton.disabled = !connected;
}

export function updateSendControls(els, { connected, agentRunning }) {
  els.sendButton.disabled = !connected || agentRunning;
  els.sendButton.textContent = agentRunning ? "Waiting…" : "Send";
  els.newChatButton.disabled = agentRunning;
  els.sessionKey.disabled = agentRunning;
}
