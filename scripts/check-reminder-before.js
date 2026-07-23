import assert from "node:assert/strict";

import { reminderTime } from "../src/modules/reminders/reminder.service.js";

const timing = reminderTime.normalizeTiming({
  reminderDate: "2026-07-24",
  reminderTime: "18:00",
  timezone: "UTC",
  reminderBefore: 15
});

assert.equal(timing.dueAt.toISOString(), "2026-07-24T18:00:00.000Z");
assert.equal(timing.nextTriggerAt.toISOString(), "2026-07-24T17:45:00.000Z");
assert.equal(timing.reminderBefore, 15);

console.log("Reminder-before scheduling check passed.");
