import { prepareList, setListEmpty } from "../../dom.js";
import { titleMetaItem } from "../molecules.js";

export function renderCommands(target, commands) {
  if (!commands.length) {
    setListEmpty(target);
    return;
  }
  prepareList(target);
  for (const command of commands) {
    const name = typeof command === "string" ? command : command.name;
    const description = typeof command === "string" ? "" : command.description;
    target.append(titleMetaItem(`/${name ?? "command"}`, description ?? ""));
  }
}
