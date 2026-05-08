import { br, el, text } from "../dom.js";
import { smallText, strongText } from "./atoms.js";

export function messageBubble(role, body) {
  return el("div", {
    className: `message ${role}`,
    children: [
      el("span", { className: "sr-only", text: `${role} message: ` }),
      text(body),
    ],
  });
}

export function listItem(children) {
  return el("li", { className: "item", children });
}

export function titleMetaItem(title, meta, actions = null) {
  return listItem([
    strongText(title),
    br(),
    smallText(meta),
    actions,
  ]);
}

export function actionRow(buttons) {
  const visibleButtons = buttons.filter(Boolean);
  if (!visibleButtons.length) return null;
  return el("div", { className: "row item-actions", children: visibleButtons });
}
