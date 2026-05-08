import { clear, setBusy } from "../../dom.js";
import { chip } from "../atoms.js";
import { messageBubble } from "../molecules.js";

export function addMessage(messages, role, body) {
  const node = messageBubble(role, body);
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

export function clearMessages(messages) {
  clear(messages);
}

export function clearMessagesWithNotice(messages, state, notice) {
  clearMessages(messages);
  state.currentRun = null;
  addMessage(messages, "system", notice);
}

export function renderAttachments(target, attachments) {
  clear(target);
  for (const attachment of attachments) {
    target.append(chip(`${attachment.kind}: ${attachment.fileName ?? attachment.id}`, { role: "listitem" }));
  }
}

export function setChatBusy(messages, busy) {
  setBusy(messages, busy);
}
