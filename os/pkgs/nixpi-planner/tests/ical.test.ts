import assert from "node:assert/strict";
import test from "node:test";
import { eventIcs, markTodoDone, parsePlannerItem, todoIcs, updateEventDates, updateEventFields, updateTodoFields, updateTodoDates } from "../src/ical.js";

test("creates and parses VTODO task", () => {
  const ics = todoIcs({ uid: "task-1", title: "Buy milk", due: "2026-05-07", categories: ["home"], priority: 3 });
  const item = parsePlannerItem(ics, "/alex/planner/task-1.ics");
  assert.equal(item?.uid, "task-1");
  assert.equal(item?.kind, "task");
  assert.equal(item?.title, "Buy milk");
  assert.equal(item?.due, "2026-05-07");
  assert.deepEqual(item?.categories, ["home"]);
  assert.equal(item?.priority, 3);
});

test("creates and parses reminder VTODO", () => {
  const ics = todoIcs({ uid: "rem-1", title: "Call mom", due: "2026-05-07T08:30:00Z", reminderAt: "2026-05-07T08:30:00Z", categories: ["reminder"] });
  const item = parsePlannerItem(ics);
  assert.equal(item?.kind, "reminder");
  assert.equal(item?.due, "2026-05-07T08:30:00Z");
  assert.equal(item?.alarmAt, "2026-05-07T08:30:00Z");
});

test("classifies VTODO with VALARM as reminder without custom category", () => {
  const ics = todoIcs({ uid: "rem-2", title: "Call mom", reminderAt: "2026-05-07T08:30:00Z" });
  const item = parsePlannerItem(ics);
  assert.equal(item?.kind, "reminder");
  assert.equal(item?.alarmAt, "2026-05-07T08:30:00Z");
});

test("classifies relative VALARM trigger as reminder", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VTODO",
    "UID:rem-relative",
    "SUMMARY:Prepare",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VTODO",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const item = parsePlannerItem(ics);
  assert.equal(item?.kind, "reminder");
  assert.equal(item?.alarmAt, "-PT15M");
});

test("creates and parses VEVENT", () => {
  const ics = eventIcs({ uid: "event-1", title: "Standup", start: "2026-05-07T09:00:00Z", end: "2026-05-07T09:15:00Z" });
  const item = parsePlannerItem(ics);
  assert.equal(item?.kind, "event");
  assert.equal(item?.start, "2026-05-07T09:00:00Z");
  assert.equal(item?.end, "2026-05-07T09:15:00Z");
});

test("marks VTODO done", () => {
  const ics = todoIcs({ uid: "task-2", title: "Done task" });
  const done = markTodoDone(ics);
  const item = parsePlannerItem(done);
  assert.equal(item?.status, "done");
  assert.match(done, /COMPLETED:/);
});

test("reschedule inserts missing VTODO and VEVENT date fields", () => {
  const todo = updateTodoDates(todoIcs({ uid: "task-3", title: "No date" }), {
    due: "2026-05-08",
    reminderAt: "2026-05-08T09:00:00Z",
  });
  const todoItem = parsePlannerItem(todo);
  assert.equal(todoItem?.due, "2026-05-08");
  assert.equal(todoItem?.alarmAt, "2026-05-08T09:00:00Z");

  const event = updateEventDates(eventIcs({ uid: "event-2", title: "Open-ended", start: "2026-05-07" }), {
    end: "2026-05-08",
  });
  const eventItem = parsePlannerItem(event);
  assert.equal(eventItem?.end, "2026-05-08");
});

// ---------- Phase 2: RRULE ----------

test("todoIcs serialises RRULE and parsePlannerItem reads it back", () => {
  const ics = todoIcs({ uid: "rec-1", title: "Weekly cleaning", due: "2026-05-10", rrule: "FREQ=WEEKLY;BYDAY=SA" });
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=SA/);
  const item = parsePlannerItem(ics);
  assert.equal(item?.rrule, "FREQ=WEEKLY;BYDAY=SA");
});

test("eventIcs serialises RRULE and parsePlannerItem reads it back", () => {
  const ics = eventIcs({ uid: "rec-ev-1", title: "Standup", start: "2026-05-07T09:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR/);
  const item = parsePlannerItem(ics);
  assert.equal(item?.rrule, "FREQ=WEEKLY;BYDAY=MO,WE,FR");
});

test("non-recurring item has no rrule field", () => {
  const ics = todoIcs({ uid: "plain-1", title: "One-off", due: "2026-05-10" });
  const item = parsePlannerItem(ics);
  assert.equal(item?.rrule, undefined);
});

// ---------- Phase 1: updateTodoFields ----------

test("updateTodoFields: rename title", () => {
  const ics = todoIcs({ uid: "edit-1", title: "Old title" });
  const updated = updateTodoFields(ics, { title: "New title" });
  const item = parsePlannerItem(updated);
  assert.equal(item?.title, "New title");
});

test("updateTodoFields: set and replace priority", () => {
  const ics = todoIcs({ uid: "edit-2", title: "Task" });
  const withPrio = updateTodoFields(ics, { priority: 3 });
  assert.equal(parsePlannerItem(withPrio)?.priority, 3);
  const updatedPrio = updateTodoFields(withPrio, { priority: 1 });
  assert.equal(parsePlannerItem(updatedPrio)?.priority, 1);
  const noPrio = updateTodoFields(updatedPrio, { priority: 0 });
  assert.equal(parsePlannerItem(noPrio)?.priority, undefined);
});

test("updateTodoFields: add and remove categories", () => {
  const ics = todoIcs({ uid: "edit-3", title: "Task", categories: ["home"] });
  const added = updateTodoFields(ics, { addCategories: ["work"] });
  assert.deepEqual(parsePlannerItem(added)?.categories.sort(), ["home", "work"]);
  const removed = updateTodoFields(added, { removeCategories: ["home"] });
  assert.deepEqual(parsePlannerItem(removed)?.categories, ["work"]);
  const cleared = updateTodoFields(removed, { clearCategories: true });
  assert.deepEqual(parsePlannerItem(cleared)?.categories, []);
});

test("updateTodoFields: replace categories", () => {
  const ics = todoIcs({ uid: "edit-4", title: "Task", categories: ["a", "b"] });
  const replaced = updateTodoFields(ics, { categories: ["c"] });
  assert.deepEqual(parsePlannerItem(replaced)?.categories, ["c"]);
});

test("updateTodoFields: add description to task without one", () => {
  const ics = todoIcs({ uid: "edit-5", title: "Task" });
  const withDesc = updateTodoFields(ics, { description: "Some details" });
  assert.equal(parsePlannerItem(withDesc)?.description, "Some details");
});

// ---------- Phase 1: updateEventFields ----------

test("updateEventFields: rename title and add description", () => {
  const ics = eventIcs({ uid: "ev-edit-1", title: "Old event", start: "2026-05-10T09:00:00Z" });
  const updated = updateEventFields(ics, { title: "New event", description: "Details" });
  const item = parsePlannerItem(updated);
  assert.equal(item?.title, "New event");
  assert.equal(item?.description, "Details");
});

test("updateEventFields: category manipulation", () => {
  const ics = eventIcs({ uid: "ev-edit-2", title: "Event", start: "2026-05-10", categories: ["personal"] });
  const added = updateEventFields(ics, { addCategories: ["work"] });
  assert.deepEqual(parsePlannerItem(added)?.categories.sort(), ["personal", "work"]);
  const cleared = updateEventFields(added, { clearCategories: true });
  assert.deepEqual(parsePlannerItem(cleared)?.categories, []);
});
