import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetUse, campaignDay, liveState, nextCampaignCode, validateCampaign, CAMPAIGN_GOALS, CAMPAIGN_STATUS } from "./campaign-core";

test("κωδικός: επόμενος της χρονιάς, ξεκινά από 001", () => {
  assert.equal(nextCampaignCode([], 2026), "KAM-2026-001");
  assert.equal(nextCampaignCode(["KAM-2026-007", "KAM-2026-002", "KAM-2025-030"], 2026), "KAM-2026-008");
});

test("κατάσταση από ημερομηνίες", () => {
  const s = new Date("2026-11-20"), e = new Date("2026-11-30");
  assert.equal(liveState(s, e, new Date("2026-11-01")), "scheduled");
  assert.equal(liveState(s, e, new Date("2026-11-25")), "live");
  assert.equal(liveState(s, e, new Date("2026-12-01")), "ended");
});

test("έλεγχος: όνομα, ημερομηνίες, λήξη πριν την έναρξη", () => {
  const now = new Date("2026-10-16");
  const r = validateCampaign({ title: "", goal: "sales", startsAt: "2026-11-30", endsAt: "2026-11-20", budgetEur: null }, [], { publish: true, now });
  assert.ok(r.errors.some((e) => e.includes("όνομα")));
  assert.ok(r.errors.some((e) => e.includes("λήξη")));
});

test("έλεγχος: δημοσίευση χωρίς προσφορές = λάθος, πρόχειρο = προειδοποίηση", () => {
  const d = { title: "Black Friday 2026", goal: "sales" as const, startsAt: "2026-11-20", endsAt: "2026-11-30", budgetEur: 10000 };
  const now = new Date("2026-10-16");
  assert.ok(validateCampaign(d, [], { publish: true, now }).errors.some((e) => e.includes("προσφορά")));
  assert.ok(validateCampaign(d, [], { publish: false, now }).warnings.some((e) => e.includes("προσφορά")));
  assert.deepEqual(validateCampaign(d, [], { publish: false, now }).errors, []);
});

test("έλεγχος: προσφορά με δικές της ημερομηνίες εκτός καμπάνιας → προειδοποίηση με το όνομά της", () => {
  const d = { title: "BF 2026", goal: "sales" as const, startsAt: "2026-11-20", endsAt: "2026-11-30", budgetEur: null };
  const r = validateCampaign(d, [{ id: "p1", name: "TV −20%", startsAt: new Date("2026-11-10"), endsAt: new Date("2026-11-25") }], { publish: true, now: new Date("2026-10-16") });
  assert.ok(r.warnings.some((w) => w.includes("TV −20%")));
  assert.deepEqual(r.errors, []);
});

test("έλεγχος: λήξη στο παρελθόν μπλοκάρει τη δημοσίευση", () => {
  const r = validateCampaign({ title: "Παλιά", goal: "sales", startsAt: "2026-01-01", endsAt: "2026-01-10", budgetEur: null }, [{ id: "p", name: "x", startsAt: null, endsAt: null }], { publish: true, now: new Date("2026-10-16") });
  assert.ok(r.errors.some((e) => e.includes("παρελθόν")));
});

test("έλεγχος: χωρίς ημερομηνίες και αρνητικό budget", () => {
  const r = validateCampaign({ title: "Χωρίς", goal: "sales", startsAt: null, endsAt: null, budgetEur: -5 }, [], { publish: false, now: new Date("2026-10-16") });
  assert.ok(r.errors.some((e) => e.includes("έναρξη")));
  assert.ok(r.errors.some((e) => e.includes("budget")));
});

test("budget: χωρίς budget, κανονικό, υπέρβαση", () => {
  assert.deepEqual(budgetUse(500, null), { pct: null, over: false, left: null });
  assert.deepEqual(budgetUse(0, 0), { pct: null, over: false, left: null });
  assert.deepEqual(budgetUse(2500, 10000), { pct: 25, over: false, left: 7500 });
  assert.equal(budgetUse(12000, 10000).over, true);
});

test("στόχοι και καταστάσεις έχουν ετικέτες και εξήγηση", () => {
  for (const g of Object.values(CAMPAIGN_GOALS)) assert.ok(g.label && g.help && g.measures);
  assert.equal(CAMPAIGN_STATUS.live.tone, "good");
  assert.equal(Object.keys(CAMPAIGN_STATUS).length, 9);
});

test("έλεγχος: η λήξη μετρά ως το τέλος της ημέρας — προσφορά που λήγει το ίδιο βράδυ είναι εντός", () => {
  const d = { title: "Black Friday 2026", goal: "sales" as const, startsAt: "2026-11-20", endsAt: "2026-11-30", budgetEur: null };
  const r = validateCampaign(d, [{ id: "p1", name: "Ψυγεία −15%", startsAt: new Date("2026-11-20T08:00:00+02:00"), endsAt: new Date("2026-11-30T21:00:00+02:00") }], { publish: true, now: new Date("2026-10-16") });
  assert.deepEqual(r.warnings, []);
});

test("ημέρα καμπάνιας σε ώρα Ελλάδας (χειμερινή +2, θερινή +3)", () => {
  assert.equal(campaignDay("2026-11-30", "end")!.toISOString(), "2026-11-30T21:59:59.999Z");
  assert.equal(campaignDay("2026-07-01", "start")!.toISOString(), "2026-06-30T21:00:00.000Z");
  assert.equal(campaignDay("", "start"), null);
  assert.equal(campaignDay("όχι ημερομηνία", "start"), null);
});
