export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element;
}

export function all(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function el(tagName, options = {}) {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.attrs) setAttributes(element, options.attrs);
  if (options.dataset) setDataset(element, options.dataset);
  if (options.children) element.append(...options.children.filter(Boolean));
  return element;
}

export function text(value) {
  return document.createTextNode(String(value ?? ""));
}

export function br() {
  return document.createElement("br");
}

export function clear(element) {
  element.replaceChildren();
}

export function setText(element, value) {
  element.textContent = String(value ?? "");
}

export function setAttributes(element, attrs) {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (value === true) element.setAttribute(name, "");
    else element.setAttribute(name, String(value));
  }
}

export function setDataset(element, dataset) {
  for (const [name, value] of Object.entries(dataset)) {
    if (value === undefined || value === null) continue;
    element.dataset[name] = String(value);
  }
}

export function setListEmpty(list, message = "None.") {
  list.className = "list empty";
  list.replaceChildren(el("li", { text: message }));
}

export function prepareList(list) {
  list.className = "list";
  list.replaceChildren();
}

export function setBusy(element, busy) {
  element.setAttribute("aria-busy", busy ? "true" : "false");
}
