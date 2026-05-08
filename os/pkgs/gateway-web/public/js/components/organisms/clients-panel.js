import { prepareList, setListEmpty } from "../../dom.js";
import { actionButton } from "../atoms.js";
import { actionRow, titleMetaItem } from "../molecules.js";

export function renderClients(target, payload) {
  const rows = normalizeClientRows(payload);
  if (!rows.length) {
    setListEmpty(target);
    return;
  }

  const admin = (payload.current?.scopes ?? []).includes("admin");
  prepareList(target);
  for (const client of rows) {
    const name = client.identity?.displayName ?? client.displayName ?? client.clientId ?? client.id ?? client.connId ?? "client";
    const scopes = (client.identity?.scopes ?? client.scopes ?? []).join(", ");
    const rotateButton = admin && !client.current && client.canRotate
      ? actionButton("Rotate token", { clientRotate: client.id }, { class: "button-small button-secondary", "aria-label": `Rotate token for ${name}` })
      : null;
    const revokeButton = admin && !client.current && client.canRevoke
      ? actionButton("Revoke", { clientRevoke: client.id }, { class: "button-small button-danger", "aria-label": `Revoke ${name}` })
      : null;
    target.append(titleMetaItem(name, `${clientStatus(client)} · ${scopes}`, actionRow([rotateButton, revokeButton])));
  }
}

function normalizeClientRows(payload) {
  const rows = (payload.clients ?? []).map((client) => ({ ...client }));
  const currentScopes = payload.current?.scopes ?? [];
  const currentIdentityId = payload.current?.identity?.id ?? null;
  const currentClientId = payload.current?.clientId ?? null;
  let markedCurrent = false;

  for (const row of rows) {
    if ((currentIdentityId && row.id === currentIdentityId) || (!currentIdentityId && currentClientId && row.id === currentClientId)) {
      row.current = true;
      markedCurrent = true;
      break;
    }
  }

  if (payload.current && !markedCurrent) {
    rows.unshift({
      id: currentIdentityId ?? currentClientId ?? payload.current.connId,
      displayName: payload.current.identity?.displayName ?? currentClientId ?? "Current connection",
      scopes: currentScopes,
      managedBy: "connection",
      current: true,
      connId: payload.current.connId,
    });
  }

  return rows;
}

function clientStatus(client) {
  const parts = [];
  if (client.current) parts.push("Current");
  if (client.revokedAt) parts.push("Revoked");
  else if (client.managedBy === "runtime") parts.push("Paired browser");
  else if (client.managedBy === "config") parts.push("Config-managed");
  else parts.push("Connection");
  if (client.tokenPreview && !client.revokedAt) parts.push(client.tokenPreview);
  return parts.join(" · ");
}
