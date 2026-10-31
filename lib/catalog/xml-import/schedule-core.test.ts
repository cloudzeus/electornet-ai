import { test } from "node:test";
import assert from "node:assert/strict";
import { normSchedule, feedDue, feedNext, describeSchedule } from "./schedule-core";

test("normSchedule σέβεται το όριο λήψης του προμηθευτή και τα 15′", () => {
  assert.deepEqual(normSchedule({ mode: "every", min: 10 }, 30), { mode: "every", min: 30 });
  assert.deepEqual(normSchedule({ mode: "every", min: 5 }, 0), { mode: "every", min: 15 });
  assert.deepEqual(normSchedule({ mode: "every", min: 120 }, 30), { mode: "every", min: 120 });
  assert.deepEqual(normSchedule({ mode: "daily", at: [6, 30] }, 30), { mode: "daily", at: [6, 30] });
  assert.deepEqual(normSchedule({ mode: "daily", at: [25, 0] }, 30), { mode: "manual" });
  assert.deepEqual(normSchedule({ mode: "every", min: "x" }, 30), { mode: "manual" });
  assert.deepEqual(normSchedule(null, 30), { mode: "manual" });
});

test("feedDue / feedNext", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const hourly = { mode: "every", min: 60 } as const;
  assert.equal(feedDue(hourly, null, now), true);
  assert.equal(feedDue(hourly, new Date("2026-10-30T11:30:00Z"), now), false);
  assert.equal(feedDue(hourly, new Date("2026-10-30T11:00:00Z"), now), true);
  assert.equal(feedDue({ mode: "manual" }, null, now), false);
  assert.equal(feedNext({ mode: "manual" }, null, now), null);
  assert.equal(feedNext(hourly, new Date("2026-10-30T11:30:00Z"), now)?.toISOString(), "2026-10-30T12:30:00.000Z");
});

test("describeSchedule", () => {
  assert.equal(describeSchedule({ mode: "manual" }), "χειροκίνητα");
  assert.equal(describeSchedule({ mode: "every", min: 60 }), "κάθε 1 ώρα");
  assert.equal(describeSchedule({ mode: "daily", at: [7, 5] }), "καθημερινά 07:05");
});
