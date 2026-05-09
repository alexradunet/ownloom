import { el, prepareList, setListEmpty } from "../../dom.js";

export function renderCommands(target, commands) {
  if (!commands.length) {
    setListEmpty(target);
    return;
  }
  prepareList(target);
  for (const command of commands) {
    const name = typeof command === "string" ? command : command.name;
    const description = typeof command === "string" ? "" : command.description;
    target.append(el("li", {
      className: "item queue-item command-item",
      children: [
        el("div", {
          className: "item-header",
          children: [
            el("div", {
              className: "item-title",
              children: [
                el("strong", { text: `/${name ?? "command"}` }),
                el("small", { text: description ?? "gateway command" }),
              ],
            }),
            el("span", { className: "chip status-chip status-chip-system", text: "command" }),
          ],
        }),
      ],
    }));
  }
}
