import { test } from "node:test";
import assert from "node:assert/strict";
import { canMove, customerStep, customerTimeline, emailFor, nextTicketNumber, openRescheduleRequest, parseAttachments, type TimelineEntry } from "./core";

test("αρίθμηση: ο μεγαλύτερος + 1, όχι το πλήθος", () => {
  assert.equal(nextTicketNumber([]), "SRV-10001");
  assert.equal(nextTicketNumber(["SRV-10001", "SRV-10007", "SRV-10003"]), "SRV-10008");
  assert.equal(nextTicketNumber(["SRV-abc", null, "X-99999"]), "SRV-10001");
});

test("μεταβάσεις: τα κλειστά ξανανοίγουν μόνο προς συγκεκριμένη κατάσταση", () => {
  assert.ok(canMove("new", "scheduled"));
  assert.ok(canMove("scheduled", "scheduled"));
  assert.ok(!canMove("new", "done"));
  assert.ok(!canMove("done", "cancelled"));
  assert.ok(canMove("done", "in-progress"));
  assert.ok(canMove("cancelled", "new"));
  assert.ok(!canMove("new", "κάτι"));
});

test("email: ραντεβού μόνο όταν αλλάζει ημέρα / ζώνη / τεχνικός", () => {
  const base = { status: "new", scheduledAt: null, slot: null, technician: null };
  assert.equal(emailFor(base, { ...base, status: "scheduled", scheduledAt: "2026-11-05T09:00:00Z" }), "appointment-confirmed");
  const s = { status: "scheduled", scheduledAt: "2026-11-05T09:00:00Z", slot: "Πρωί 9–13", technician: "Κ. Δ." };
  assert.equal(emailFor(s, { ...s }), null);
  assert.equal(emailFor(s, { ...s, status: "in-progress" }), null);
  assert.equal(emailFor(s, { ...s, slot: "Απόγευμα 17–21" }), "appointment-confirmed");
  assert.equal(emailFor(s, { ...s, status: "done" }), "service-done");
  assert.equal(emailFor(s, { ...s, status: "cancelled" }), "service-cancelled");
  assert.equal(emailFor({ ...s, status: "cancelled" }, { ...s, status: "cancelled" }), null);
});

test("εκκρεμές αίτημα αλλαγής ώρας: κλείνει με την πρώτη ενέργεια του προσωπικού", () => {
  const req: TimelineEntry = { at: "2026-11-02T10:00:00Z", status: "scheduled", by: "customer", kind: "reschedule-request", request: { date: "2026-11-06", slot: "Πρωί 9–13" } };
  assert.equal(openRescheduleRequest([{ at: "1", status: "new" }, req]), req);
  assert.equal(openRescheduleRequest([req, { at: "3", status: "scheduled", by: "system", kind: "email", template: "x" }]), req);
  assert.equal(openRescheduleRequest([req, { at: "3", status: "scheduled", by: "Γιάννης" }]), null);
  assert.equal(openRescheduleRequest([]), null);
});

test("πορεία για τον πελάτη: χωρίς εσωτερικές σημειώσεις και email", () => {
  const tl: TimelineEntry[] = [
    { at: "1", status: "new", note: "Αίτημα από τον λογαριασμό", by: "customer" },
    { at: "2", status: "new", note: "Τηλ. — δεν απάντησε", by: "Γιάννης" },
    { at: "3", status: "scheduled", note: "εσωτερικό", by: "Γιάννης" },
    { at: "4", status: "scheduled", by: "system", kind: "email", template: "appointment-confirmed" },
    { at: "5", status: "in-progress", note: "Παραγγέλθηκε αντλία", by: "Γιάννης", public: true },
  ];
  assert.deepEqual(customerTimeline(tl).map((x) => x.text), ["Νέο — Αίτημα από τον λογαριασμό", "Με ραντεβού", "Σε εξέλιξη — Παραγγέλθηκε αντλία"]);
});

test("βήματα πελάτη και συνημμένα", () => {
  assert.equal(customerStep("new", false), 0);
  assert.equal(customerStep("new", true), 1);
  assert.equal(customerStep("waiting-parts", true), 2);
  assert.equal(customerStep("done", true), 3);
  assert.equal(customerStep("cancelled", true), -1);
  assert.deepEqual(parseAttachments(["/a.jpg", { url: "/b.mp4", kind: "video" }, 3, null]).map((a) => a.kind), ["image", "video"]);
});
