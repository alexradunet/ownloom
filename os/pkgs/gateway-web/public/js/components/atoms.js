import { el } from "../dom.js";

export function strongText(value) {
  return el("strong", { text: value });
}

export function smallText(value) {
  return el("small", { text: value });
}

export function chip(value, attrs = {}) {
  return el("span", { className: "chip", text: value, attrs });
}

export function actionButton(label, dataset = {}, attrs = {}) {
  return el("button", {
    text: label,
    dataset,
    attrs: { type: "button", ...attrs },
  });
}
