export function ensureTerminalLoaded(state, frame) {
  if (state.terminalLoaded) return;
  frame.src = frame.dataset.src;
  state.terminalLoaded = true;
}

export function setTerminalTokenStatus(statusElement, text) {
  statusElement.textContent = text;
}
