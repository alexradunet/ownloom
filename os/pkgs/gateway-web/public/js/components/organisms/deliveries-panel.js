import { prepareList, setListEmpty } from "../../dom.js";
import { actionButton } from "../atoms.js";
import { actionRow, titleMetaItem } from "../molecules.js";

export function renderDeliveries(target, deliveries, { admin }) {
  if (!deliveries.length) {
    setListEmpty(target);
    return;
  }
  prepareList(target);
  for (const delivery of deliveries) {
    const id = delivery.id ?? "";
    const status = delivery.deadAt ? "dead" : delivery.nextAttemptAt ? "waiting" : "queued";
    const recipient = delivery.recipientId ?? delivery.target ?? delivery.recipient ?? "";
    const retryButton = admin ? actionButton("Retry", { deliveryRetry: id }, { class: "button-small button-secondary", "aria-label": `Retry delivery ${id}` }) : null;
    const deleteButton = admin ? actionButton("Delete", { deliveryDelete: id }, { class: "button-small button-danger", "aria-label": `Delete delivery ${id}` }) : null;
    target.append(titleMetaItem(`${status} ${id}`.trim(), recipient, actionRow([retryButton, deleteButton])));
  }
}
