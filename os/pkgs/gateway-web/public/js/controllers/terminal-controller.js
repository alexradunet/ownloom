import { setTerminalTokenStatus } from "../components/organisms/terminal-panel.js";

export function createTerminalController({ els, gatewayClient }) {
  async function copyTerminalToken() {
    els.copyTerminalTokenButton.disabled = true;
    setTerminalTokenStatus(els.terminalTokenStatus, "Reading token…");
    try {
      const token = await gatewayClient.copyTerminalToken();
      try {
        await navigator.clipboard.writeText(token);
        setTerminalTokenStatus(els.terminalTokenStatus, "Copied. Paste into Zellij login.");
      } catch {
        window.prompt("Copy Zellij login token:", token);
        setTerminalTokenStatus(els.terminalTokenStatus, "Token shown in copy prompt.");
      }
    } catch (error) {
      setTerminalTokenStatus(els.terminalTokenStatus, `Token unavailable: ${error.message}`);
    } finally {
      els.copyTerminalTokenButton.disabled = false;
    }
  }

  els.copyTerminalTokenButton.addEventListener("click", () => copyTerminalToken());
  return { copyTerminalToken };
}
