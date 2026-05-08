import { addMessage, clearMessages, clearMessagesWithNotice, renderAttachments, setChatBusy } from "../components/organisms/chat-panel.js";
import { clientSessionKey, currentChatId, currentSessionKey, makeNewSessionKey, sessionTitle } from "../state.js";

export function createChatController({
  els,
  state,
  gatewayClient,
  log,
  saveCurrentSettings,
  refreshLists,
  updateSendControls,
}) {
  function addSystemMessage(message) {
    return addMessage(els.messages, "system", message);
  }

  function updateCurrentSession() {
    const chatId = currentChatId(state, els.sessionKey.value);
    els.currentSession.textContent = `Conversation: ${sessionTitle(chatId)}`;
    els.currentSession.title = chatId;
  }

  function switchChatId(chatId, reason = "Switched conversation") {
    if (state.agentRunning) {
      addSystemMessage("Wait for the current answer before switching conversations.");
      log("conversation switch blocked while agent is running", { chatId });
      return;
    }
    state.activeChatId = chatId;
    const sessionKey = clientSessionKey(chatId);
    if (sessionKey) els.sessionKey.value = sessionKey;
    saveCurrentSettings();
    clearMessagesWithNotice(els.messages, state, `${reason}: ${sessionTitle(chatId)} (${chatId})`);
    refreshLists().catch((error) => log("refresh failed", error.message));
  }

  function switchSessionKey(sessionKey, reason = "Switched session") {
    switchChatId(`client:${sessionKey}`, reason);
  }

  function syncActiveChatFromSessionInput() {
    state.activeChatId = `client:${currentSessionKey(els.sessionKey.value)}`;
    updateCurrentSession();
  }

  function setAgentRunning(running) {
    state.agentRunning = running;
    setChatBusy(els.messages, running);
    updateSendControls();
  }

  function handleAgentEvent(payload) {
    log("agent event", payload);
    if (payload.stream === "start" || payload.status === "started") {
      state.currentRun = addMessage(els.messages, "agent", "");
      return;
    }
    if (payload.stream === "chunk" && typeof payload.text === "string") {
      if (!state.currentRun) state.currentRun = addMessage(els.messages, "agent", "");
      state.currentRun.textContent += payload.text;
      els.messages.scrollTop = els.messages.scrollHeight;
      return;
    }
    if (payload.stream === "result" && typeof payload.text === "string") {
      if (!state.currentRun) state.currentRun = addMessage(els.messages, "agent", "");
      if (!state.currentRun.textContent) state.currentRun.textContent = payload.text;
      else if (state.currentRun.textContent !== payload.text) state.currentRun.textContent += `\n${payload.text}`;
      els.messages.scrollTop = els.messages.scrollHeight;
      state.currentRun = null;
      return;
    }
    if (payload.stream === "done" || payload.status === "done") state.currentRun = null;
  }

  async function uploadAttachments(files) {
    const uploaded = await gatewayClient.uploadAttachments(files);
    state.stagedAttachments.push(...uploaded);
    renderAttachments(els.attachments, state.stagedAttachments);
  }

  async function sendMessage() {
    if (state.agentRunning) return;
    const message = els.messageInput.value.trim();
    if (!message && state.stagedAttachments.length === 0) return;
    const attachments = [...state.stagedAttachments];
    const chatId = currentChatId(state, els.sessionKey.value);
    const sessionKey = clientSessionKey(chatId) ?? currentSessionKey(els.sessionKey.value);
    setAgentRunning(true);
    els.messageInput.value = "";
    addMessage(els.messages, "user", message || "[attachments]");
    state.currentRun = addMessage(els.messages, "agent", "");
    try {
      const payload = await gatewayClient.request("agent.wait", {
        message: message || "Please inspect the attachment(s).",
        sessionKey,
        chatId,
        idempotencyKey: `web-${crypto.randomUUID()}`,
        ...(attachments.length ? { attachments } : {}),
      });
      state.stagedAttachments = state.stagedAttachments.filter((staged) => !attachments.some((sent) => sent.id === staged.id));
      renderAttachments(els.attachments, state.stagedAttachments);
      log("agent.wait response", payload);
    } finally {
      setAgentRunning(false);
    }
  }

  function handleSendError(error) {
    if (state.currentRun && !state.currentRun.textContent) state.currentRun.remove();
    state.currentRun = null;
    const code = error?.code;
    const message = code === "AGENT_BUSY"
      ? "Agent is already working on this session. Wait for the current answer, then retry."
      : `Send failed: ${error.message}`;
    addSystemMessage(message);
    log("send failed", { code: code ?? "ERROR", message: error.message });
  }

  els.sessionKey.addEventListener("input", syncActiveChatFromSessionInput);
  els.sessionKey.addEventListener("change", () => {
    syncActiveChatFromSessionInput();
    saveCurrentSettings();
  });
  els.sessions.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const switchTo = target.getAttribute("data-session-switch-chat");
    const chatId = target.getAttribute("data-session-reset");
    if (switchTo) {
      switchChatId(switchTo, switchTo.startsWith("client:") ? "Switched session" : "Attached conversation");
      return;
    }
    if (!chatId) return;
    if (!window.confirm(`Reset session ${chatId}? This clears its stored conversation history.`)) return;
    gatewayClient.request("sessions.reset", { chatId }).then(() => {
      if (chatId === currentChatId(state, els.sessionKey.value)) {
        clearMessagesWithNotice(els.messages, state, `Reset current session: ${currentSessionKey(els.sessionKey.value)}`);
      }
      return refreshLists();
    }).catch((error) => log("session reset failed", error.message));
  });
  els.sendButton.addEventListener("click", () => sendMessage().catch(handleSendError));
  els.newChatButton.addEventListener("click", () => switchSessionKey(makeNewSessionKey(), "Started new chat"));
  els.clearButton.addEventListener("click", () => clearMessages(els.messages));
  els.attachmentInput.addEventListener("change", () => {
    uploadAttachments([...els.attachmentInput.files]).catch((error) => log("upload failed", error.message));
    els.attachmentInput.value = "";
  });
  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendMessage().catch(handleSendError);
  });

  return {
    addSystemMessage,
    handleAgentEvent,
    updateCurrentSession,
    switchChatId,
    syncActiveChatFromSessionInput,
  };
}
