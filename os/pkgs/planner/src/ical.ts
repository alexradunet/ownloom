export type PlannerKind = "task" | "reminder" | "event";
export type PlannerStatus = "open" | "done";

export type PlannerItem = {
  uid: string;
  href?: string;
  kind: PlannerKind;
  status: PlannerStatus;
  title: string;
  description?: string;
  categories: string[];
  priority?: number;
  due?: string;
  start?: string;
  end?: string;
  alarmAt?: string;
  completed?: string;
  rrule?: string;
  raw?: string;
};

export function createUid(): string {
  return `ownloom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

export function unescapeText(value: string): string {
  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\,", ",")
    .replaceAll("\\;", ";")
    .replaceAll("\\\\", "\\");
}

export function formatDateTime(input: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input.replaceAll("-", "");
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date/time: ${input}`);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function parseIcalDate(value: string): string | undefined {
  const raw = value.trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(raw);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${raw.endsWith("Z") ? "Z" : ""}`;
}

function parseIcalTrigger(value: string): string | undefined {
  const parsedDate = parseIcalDate(value);
  if (parsedDate) return parsedDate;
  const raw = value.trim();
  return /^[+-]?P(?:\d+W|(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?)$/.test(raw) ? raw : undefined;
}

export function todayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function stamp(): string {
  return formatDateTime(new Date().toISOString());
}

function line(name: string, value: string | number | undefined): string[] {
  return value === undefined || value === "" ? [] : [`${name}:${value}`];
}

function foldLine(value: string): string {
  if (value.length <= 75) return value;
  const parts = [value.slice(0, 75)];
  for (let i = 75; i < value.length; i += 74) {
    parts.push(` ${value.slice(i, i + 74)}`);
  }
  return parts.join("\r\n");
}

function serialize(lines: string[]): string {
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

function insertBeforeEnd(component: "VTODO" | "VEVENT", ics: string, lines: string[]): string {
  return ics.replace(`END:${component}`, `${lines.join("\n")}\nEND:${component}`);
}

export function todoIcs(args: {
  uid: string;
  title: string;
  description?: string;
  due?: string;
  priority?: number;
  categories?: string[];
  reminderAt?: string;
  rrule?: string;
}): string {
  const due = args.due ? formatDateTime(args.due) : undefined;
  const reminderAt = args.reminderAt ? formatDateTime(args.reminderAt) : undefined;
  const categories = args.categories?.length ? args.categories.map(escapeText).join(",") : undefined;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ownloom//Planner//EN",
    "BEGIN:VTODO",
    `UID:${escapeText(args.uid)}`,
    `DTSTAMP:${stamp()}`,
    `CREATED:${stamp()}`,
    `LAST-MODIFIED:${stamp()}`,
    "STATUS:NEEDS-ACTION",
    `SUMMARY:${escapeText(args.title)}`,
    ...line("DESCRIPTION", args.description ? escapeText(args.description) : undefined),
    ...line(due && due.length === 8 ? "DUE;VALUE=DATE" : "DUE", due),
    ...line("PRIORITY", args.priority),
    ...line("CATEGORIES", categories),
    ...line("RRULE", args.rrule),
  ];
  if (reminderAt) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(args.title)}`,
      `TRIGGER;VALUE=DATE-TIME:${reminderAt}`,
      "END:VALARM",
    );
  }
  lines.push("END:VTODO", "END:VCALENDAR");
  return serialize(lines);
}

export function eventIcs(args: {
  uid: string;
  title: string;
  start: string;
  end?: string;
  description?: string;
  categories?: string[];
  rrule?: string;
}): string {
  const start = formatDateTime(args.start);
  const end = args.end ? formatDateTime(args.end) : undefined;
  const categories = args.categories?.length ? args.categories.map(escapeText).join(",") : undefined;
  return serialize([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ownloom//Planner//EN",
    "BEGIN:VEVENT",
    `UID:${escapeText(args.uid)}`,
    `DTSTAMP:${stamp()}`,
    `CREATED:${stamp()}`,
    `LAST-MODIFIED:${stamp()}`,
    `SUMMARY:${escapeText(args.title)}`,
    `${start.length === 8 ? "DTSTART;VALUE=DATE" : "DTSTART"}:${start}`,
    ...line(end && end.length === 8 ? "DTEND;VALUE=DATE" : "DTEND", end),
    ...line("DESCRIPTION", args.description ? escapeText(args.description) : undefined),
    ...line("CATEGORIES", categories),
    ...line("RRULE", args.rrule),
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
}

function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, "\n").split("\n").reduce<string[]>((acc, current) => {
    if (/^[ \t]/.test(current) && acc.length > 0) acc[acc.length - 1] += current.slice(1);
    else acc.push(current);
    return acc;
  }, []);
}

function valueFor(lines: string[], name: string): string | undefined {
  const prefix = `${name}:`;
  const lineValue = lines.find((entry) => entry.startsWith(prefix) || entry.startsWith(`${name};`));
  return lineValue?.slice(lineValue.indexOf(":") + 1);
}

function topLevelComponentLines(lines: string[], component: "VTODO" | "VEVENT"): string[] {
  const begin = lines.indexOf(`BEGIN:${component}`);
  if (begin < 0) return [];
  const result: string[] = [];
  let nestedDepth = 0;
  for (let i = begin + 1; i < lines.length; i += 1) {
    const entry = lines[i];
    if (entry === `END:${component}` && nestedDepth === 0) break;
    if (entry.startsWith("BEGIN:")) {
      nestedDepth += 1;
      continue;
    }
    if (entry.startsWith("END:") && nestedDepth > 0) {
      nestedDepth -= 1;
      continue;
    }
    if (nestedDepth === 0) result.push(entry);
  }
  return result;
}

function findTopLevelPropertyIndex(lines: string[], component: "VTODO" | "VEVENT", name: string): number {
  const begin = lines.indexOf(`BEGIN:${component}`);
  if (begin < 0) return -1;
  let nestedDepth = 0;
  for (let i = begin + 1; i < lines.length; i += 1) {
    const entry = lines[i];
    if (entry === `END:${component}` && nestedDepth === 0) return -1;
    if (entry.startsWith("BEGIN:")) {
      nestedDepth += 1;
      continue;
    }
    if (entry.startsWith("END:") && nestedDepth > 0) {
      nestedDepth -= 1;
      continue;
    }
    if (nestedDepth === 0 && (entry.startsWith(`${name}:`) || entry.startsWith(`${name};`))) return i;
  }
  return -1;
}

function setTopLevelProperty(ics: string, component: "VTODO" | "VEVENT", name: string, lineValue: string): string {
  const lines = unfold(ics);
  const propertyIndex = findTopLevelPropertyIndex(lines, component, name);
  if (propertyIndex >= 0) {
    lines[propertyIndex] = lineValue;
    return lines.join("\n");
  }

  const endIndex = lines.indexOf(`END:${component}`);
  if (endIndex >= 0) {
    lines.splice(endIndex, 0, lineValue);
    return lines.join("\n");
  }

  return insertBeforeEnd(component, ics, [lineValue]);
}

function removeTopLevelProperty(ics: string, component: "VTODO" | "VEVENT", name: string): string {
  const lines = unfold(ics);
  const propertyIndex = findTopLevelPropertyIndex(lines, component, name);
  if (propertyIndex >= 0) lines.splice(propertyIndex, 1);
  return lines.join("\n");
}

export function parsePlannerItem(ics: string, href?: string): PlannerItem | undefined {
  const lines = unfold(ics);
  const isTodo = lines.includes("BEGIN:VTODO");
  const isEvent = lines.includes("BEGIN:VEVENT");
  if (!isTodo && !isEvent) return undefined;
  const componentLines = topLevelComponentLines(lines, isEvent ? "VEVENT" : "VTODO");
  const uid = valueFor(componentLines, "UID");
  const title = valueFor(componentLines, "SUMMARY");
  if (!uid || !title) return undefined;
  const categories = (valueFor(componentLines, "CATEGORIES") ?? "")
    .split(",")
    .map((value) => unescapeText(value.trim()))
    .filter(Boolean);
  const status = valueFor(componentLines, "STATUS") === "COMPLETED" ? "done" : "open";
  const alarmAt = valueFor(lines, "TRIGGER") ? parseIcalTrigger(valueFor(lines, "TRIGGER")!) : undefined;
  const kind: PlannerKind = isEvent ? "event" : (alarmAt || categories.includes("reminder")) ? "reminder" : "task";
  const priorityRaw = valueFor(componentLines, "PRIORITY");
  const rruleRaw = valueFor(componentLines, "RRULE");
  return {
    uid: unescapeText(uid),
    href,
    kind,
    status,
    title: unescapeText(title),
    description: valueFor(componentLines, "DESCRIPTION") ? unescapeText(valueFor(componentLines, "DESCRIPTION")!) : undefined,
    categories,
    priority: priorityRaw ? Number(priorityRaw) : undefined,
    due: valueFor(componentLines, "DUE") ? parseIcalDate(valueFor(componentLines, "DUE")!) : undefined,
    start: valueFor(componentLines, "DTSTART") ? parseIcalDate(valueFor(componentLines, "DTSTART")!) : undefined,
    end: valueFor(componentLines, "DTEND") ? parseIcalDate(valueFor(componentLines, "DTEND")!) : undefined,
    alarmAt,
    completed: valueFor(componentLines, "COMPLETED") ? parseIcalDate(valueFor(componentLines, "COMPLETED")!) : undefined,
    rrule: rruleRaw,
    raw: ics,
  };
}

export function markTodoDone(ics: string): string {
  const completed = stamp();
  let updated = ics.replace(/\r\n/g, "\n");
  if (/^STATUS:/m.test(updated)) updated = updated.replace(/^STATUS:.*$/m, "STATUS:COMPLETED");
  else updated = updated.replace("END:VTODO", "STATUS:COMPLETED\nEND:VTODO");
  if (/^COMPLETED:/m.test(updated)) updated = updated.replace(/^COMPLETED:.*$/m, `COMPLETED:${completed}`);
  else updated = updated.replace("END:VTODO", `COMPLETED:${completed}\nEND:VTODO`);
  if (/^LAST-MODIFIED:/m.test(updated)) updated = updated.replace(/^LAST-MODIFIED:.*$/m, `LAST-MODIFIED:${completed}`);
  return updated.replace(/\n/g, "\r\n");
}

export function updateTodoDates(ics: string, args: { due?: string; reminderAt?: string }): string {
  let updated = ics.replace(/\r\n/g, "\n");
  const now = stamp();
  if (args.due) {
    const due = formatDateTime(args.due);
    const dueLine = due.length === 8 ? `DUE;VALUE=DATE:${due}` : `DUE:${due}`;
    if (/^DUE[;:]/m.test(updated)) updated = updated.replace(/^DUE.*$/m, dueLine);
    else updated = insertBeforeEnd("VTODO", updated, [dueLine]);
  }
  if (args.reminderAt) {
    const triggerLine = `TRIGGER;VALUE=DATE-TIME:${formatDateTime(args.reminderAt)}`;
    if (/^TRIGGER/m.test(updated)) updated = updated.replace(/^TRIGGER.*$/m, triggerLine);
    else if (/^BEGIN:VALARM$/m.test(updated)) updated = updated.replace("END:VALARM", `${triggerLine}\nEND:VALARM`);
    else updated = insertBeforeEnd("VTODO", updated, [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      triggerLine,
      "END:VALARM",
    ]);
  }
  if (/^LAST-MODIFIED:/m.test(updated)) updated = updated.replace(/^LAST-MODIFIED:.*$/m, `LAST-MODIFIED:${now}`);
  return updated.replace(/\n/g, "\r\n");
}

export function updateEventDates(ics: string, args: { start?: string; end?: string }): string {
  let updated = ics.replace(/\r\n/g, "\n");
  const now = stamp();
  if (args.start) {
    const start = formatDateTime(args.start);
    const line = start.length === 8 ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`;
    if (/^DTSTART/m.test(updated)) updated = updated.replace(/^DTSTART.*$/m, line);
  }
  if (args.end) {
    const end = formatDateTime(args.end);
    const line = end.length === 8 ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`;
    if (/^DTEND/m.test(updated)) updated = updated.replace(/^DTEND.*$/m, line);
    else updated = insertBeforeEnd("VEVENT", updated, [line]);
  }
  if (/^LAST-MODIFIED:/m.test(updated)) updated = updated.replace(/^LAST-MODIFIED:.*$/m, `LAST-MODIFIED:${now}`);
  return updated.replace(/\n/g, "\r\n");
}

// ---------- Phase 1: field editing helpers ----------

export type EditTodoArgs = {
  title?: string;
  description?: string;
  /** 0 = remove PRIORITY line entirely; 1-9 = set */
  priority?: number;
  /** replace all categories */
  categories?: string[];
  /** add to existing category list */
  addCategories?: string[];
  /** remove from existing category list */
  removeCategories?: string[];
  /** remove all categories */
  clearCategories?: boolean;
};

export function updateTodoFields(ics: string, args: EditTodoArgs): string {
  let updated = ics.replace(/\r\n/g, "\n");
  const now = stamp();

  if (args.title !== undefined) {
    updated = setTopLevelProperty(updated, "VTODO", "SUMMARY", `SUMMARY:${escapeText(args.title)}`);
  }

  if (args.description !== undefined) {
    updated = setTopLevelProperty(updated, "VTODO", "DESCRIPTION", `DESCRIPTION:${escapeText(args.description)}`);
  }

  if (args.priority !== undefined) {
    if (args.priority === 0) {
      updated = removeTopLevelProperty(updated, "VTODO", "PRIORITY");
    } else {
      updated = setTopLevelProperty(updated, "VTODO", "PRIORITY", `PRIORITY:${args.priority}`);
    }
  }

  const hasCatArgs =
    args.clearCategories ||
    args.categories !== undefined ||
    (args.addCategories?.length ?? 0) > 0 ||
    (args.removeCategories?.length ?? 0) > 0;
  if (hasCatArgs) {
    let cats: string[];
    if (args.clearCategories) {
      cats = [];
    } else if (args.categories !== undefined) {
      cats = args.categories;
    } else {
      cats = (valueFor(topLevelComponentLines(unfold(updated), "VTODO"), "CATEGORIES") ?? "")
        .split(",").map((c) => unescapeText(c.trim())).filter(Boolean);
      if (args.addCategories?.length) cats = [...new Set([...cats, ...args.addCategories])];
      if (args.removeCategories?.length) cats = cats.filter((c) => !args.removeCategories!.includes(c));
    }
    const catLine = cats.length ? `CATEGORIES:${cats.map(escapeText).join(",")}` : null;
    if (catLine) updated = setTopLevelProperty(updated, "VTODO", "CATEGORIES", catLine);
    else updated = removeTopLevelProperty(updated, "VTODO", "CATEGORIES");
  }

  if (/^LAST-MODIFIED:/m.test(updated)) updated = setTopLevelProperty(updated, "VTODO", "LAST-MODIFIED", `LAST-MODIFIED:${now}`);
  return updated.replace(/\n/g, "\r\n");
}

export type EditEventArgs = {
  title?: string;
  description?: string;
  categories?: string[];
  addCategories?: string[];
  removeCategories?: string[];
  clearCategories?: boolean;
};

export function updateEventFields(ics: string, args: EditEventArgs): string {
  let updated = ics.replace(/\r\n/g, "\n");
  const now = stamp();

  if (args.title !== undefined) {
    updated = setTopLevelProperty(updated, "VEVENT", "SUMMARY", `SUMMARY:${escapeText(args.title)}`);
  }

  if (args.description !== undefined) {
    updated = setTopLevelProperty(updated, "VEVENT", "DESCRIPTION", `DESCRIPTION:${escapeText(args.description)}`);
  }

  const hasCatArgs =
    args.clearCategories ||
    args.categories !== undefined ||
    (args.addCategories?.length ?? 0) > 0 ||
    (args.removeCategories?.length ?? 0) > 0;
  if (hasCatArgs) {
    let cats: string[];
    if (args.clearCategories) {
      cats = [];
    } else if (args.categories !== undefined) {
      cats = args.categories;
    } else {
      cats = (valueFor(topLevelComponentLines(unfold(updated), "VEVENT"), "CATEGORIES") ?? "")
        .split(",").map((c) => unescapeText(c.trim())).filter(Boolean);
      if (args.addCategories?.length) cats = [...new Set([...cats, ...args.addCategories])];
      if (args.removeCategories?.length) cats = cats.filter((c) => !args.removeCategories!.includes(c));
    }
    const catLine = cats.length ? `CATEGORIES:${cats.map(escapeText).join(",")}` : null;
    if (catLine) updated = setTopLevelProperty(updated, "VEVENT", "CATEGORIES", catLine);
    else updated = removeTopLevelProperty(updated, "VEVENT", "CATEGORIES");
  }

  if (/^LAST-MODIFIED:/m.test(updated)) updated = setTopLevelProperty(updated, "VEVENT", "LAST-MODIFIED", `LAST-MODIFIED:${now}`);
  return updated.replace(/\n/g, "\r\n");
}

