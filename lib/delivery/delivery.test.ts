import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATES, chargeableKg, normalizeRates, quoteRate, zoneFor } from "./rates";
import { decideRoute, homeMode, localDeliveryFee, localRules, nextStep, normalizeDelivery, STEPS, type RouteCandidate } from "./routing";

test("ζώνη: μακρύτερο πρόθεμα, αλλιώς «υπόλοιπα», άγνωστος Τ.Κ. → null", () => {
  assert.equal(zoneFor(DEFAULT_RATES, "17456")!.id, "attica");
  assert.equal(zoneFor(DEFAULT_RATES, "71202")!.id, "islands");
  assert.equal(zoneFor(DEFAULT_RATES, "54624")!.id, "mainland");
  assert.equal(zoneFor(DEFAULT_RATES, "123"), null);
});

test("χρεώσιμο βάρος: το μεγαλύτερο από πραγματικό και ογκομετρικό", () => {
  assert.equal(chargeableKg([{ qty: 2, weightKg: 3, dimsCm: null }], 5000), 6);
  assert.equal(chargeableKg([{ qty: 1, weightKg: 2, dimsCm: [50, 40, 50] }], 5000), 20);
  assert.equal(chargeableKg([{ qty: 1, weightKg: null, dimsCm: null }], 5000), 1);
});

test("τιμή: κλίμακα, επιπλέον κιλά, δυσπρόσιτα — ποτέ δωρεάν από την αξία του καλαθιού", () => {
  const d = normalizeRates({ ...DEFAULT_RATES, remote: { prefixes: ["840"], surcharge: 300 } });
  assert.equal(quoteRate(d, { zip: "17456", kg: 4 })!.fee, 490);
  assert.equal(quoteRate(d, { zip: "54624", kg: 33 })!.fee, 1690 + 3 * 50);
  assert.equal(quoteRate(d, { zip: "84001", kg: 1 })!.fee, 590 + 300);
  // παλιός τιμοκατάλογος με «δωρεάν από 100 €»: αγνοείται, η τιμή της κλίμακας χρεώνεται
  assert.equal(quoteRate(normalizeRates({ ...DEFAULT_RATES, freeFrom: 10000 }), { zip: "17456", kg: 1 })!.fee, 390);
  assert.equal(quoteRate(d, { zip: null, kg: 1 }), null);
});

test("normalizeRates: αρνητικά → 0, κλίμακες αύξουσες, Τ.Κ. μόνο ψηφία", () => {
  const d = normalizeRates({ brackets: [10, 2, 2, -1], zones: [{ id: "a b", name: "Α", prefixes: ["1", "x"] }], prices: { ab: [-5, 300] } });
  assert.deepEqual(d.brackets, [2, 10]);
  assert.deepEqual(d.zones[0], { id: "ab", name: "Α", prefixes: ["1"] });
  assert.deepEqual(d.prices.ab, [0, 300]);
});

const del = (zips: string[], o: Partial<ReturnType<typeof normalizeDelivery>> = {}) => ({ zips, homeDelivery: true, bulkyOk: true, installs: false, eta: "", ...o });
const cand = (id: string, zips: string[], hasStock: boolean, agencyId: string | null = null, o = {}): RouteCandidate => ({ id, name: id, delivery: del(zips, o), agencyId, hasStock });

test("δρομολόγηση: courier / παραλαβή", () => {
  assert.equal(decideRoute({ fulfilment: "courier", zip: "54624", bulky: false, install: false, candidates: [] }).mode, "courier");
  assert.equal(decideRoute({ fulfilment: "click-collect", zip: null, bulky: false, install: false, candidates: [] }).mode, "pickup");
});

test("δρομολόγηση: απόθεμα πρώτα, μετά πρακτορείο, αλλιώς χωρίς δρομολόγηση", () => {
  const base = { fulfilment: "freight", zip: "52100", bulky: true, install: false };
  assert.deepEqual(decideRoute({ ...base, candidates: [cand("A", ["52"], false, "ag1"), cand("B", ["521"], true)] }).partnerId, "B");
  const ag = decideRoute({ ...base, candidates: [cand("A", ["521"], false, "ag1")] });
  assert.equal(ag.mode, "agency"); assert.equal(ag.agencyId, "ag1");
  assert.equal(decideRoute({ ...base, candidates: [cand("A", ["521"], false)] }).mode, "unrouted");
  assert.equal(decideRoute({ ...base, candidates: [cand("A", ["60"], true)] }).partnerId, null);
  // ογκώδη μόνο σε όποιον τα παραδίδει, εγκατάσταση μόνο σε όποιον την κάνει
  assert.equal(decideRoute({ ...base, candidates: [cand("A", ["52"], true, null, { bulkyOk: false })] }).mode, "unrouted");
  assert.equal(decideRoute({ ...base, install: true, candidates: [cand("A", ["52"], true)] }).mode, "unrouted");
});

test("βήματα και επόμενο βήμα", () => {
  assert.deepEqual(STEPS.agency, ["load", "agency", "partner", "customer"]);
  const now = new Date();
  assert.equal(nextStep([{ key: "load", sort: 0, doneAt: now }, { key: "agency", sort: 1, doneAt: null }]), "agency");
  assert.equal(nextStep([{ key: "customer", sort: 0, doneAt: now }]), null);
});

test("normalizeDelivery: Τ.Κ. από κείμενο, χωρίς διπλά", () => {
  assert.deepEqual(normalizeDelivery({ zips: "521, 52100 x 521;64", homeDelivery: true }).zips, ["521", "52100", "64"]);
});

import { suggestRole } from "./routing";
test("πρόταση ρόλου μεταφορέα", () => {
  assert.equal(suggestRole({ s1Id: "1002", name: "ΧΡΗΣΤΟΣ ΦΑΝΑΡΙΩΤΗΣ" }, []), "driver");
  assert.equal(suggestRole({ s1Id: "2004", name: "ACS" }, []), "courier");
  assert.equal(suggestRole({ s1Id: "5044", name: "ΑΝΘΟΥΛΗΣ ΠΡΑΚΤΟΡΕΙΟ" }, []), "agency");
  assert.equal(suggestRole({ s1Id: "3010", name: "ΡΟΔΗ ΕΥΑΓΓΕΛΙΑ-ΡΟΔΗ ΑΘΗΝΑ ΟΕ" }, ["ΡΟΔΗ ΕΥΑΓΓΕΛΙΑ - ΡΟΔΗ ΑΘΗΝΑ ΟΕ"]), "partner-vehicle");
  assert.equal(suggestRole({ s1Id: "3011", name: "ΚΑΠΟΙΟΣ" }, ["ΑΛΛΟΣ"]), "other");
});

test("παράδοση από κατάστημα: δωρεάν έως το όριο οδικών χλμ, πιο μακριά σταθερό ποσό + ανά ξεκινημένο χλμ", () => {
  const d = localRules({}, 2500);
  assert.deepEqual(d, { freeKm: 15, maxKm: 40, extraFee: 2500, perKm: 0, courierKm: 25 }); // χωρίς ρυθμίσεις: 15 χλμ, μετά το κόστος της μεταφορικής
  assert.equal(localDeliveryFee(15, d), 0);
  assert.equal(localDeliveryFee(15.1, d), 2500);
  const r = localRules({ localFreeKm: "10", localMaxKm: 25, localExtraFee: "5", localExtraPerKm: "1.5" }, 2500);
  assert.equal(localDeliveryFee(10, r), 0);
  assert.equal(localDeliveryFee(12.3, r), 500 + 3 * 150);
  assert.equal(localDeliveryFee(20, localRules({ localExtraPerKm: 2 }, 2500)), 5 * 200); // μόνο ανά χλμ: χωρίς σταθερό ποσό
});

test("παράδοση στο σπίτι: έως 15 χλμ δωρεάν από το κατάστημα, έως 25 courier από το κατάστημα, αλλιώς από τα κεντρικά", () => {
  const r = localRules({}, 2500);
  assert.equal(r.courierKm, 25);
  assert.equal(homeMode(3, r), "store");
  assert.equal(homeMode(15, r), "store");
  assert.equal(homeMode(15.1, r), "courier-store");
  assert.equal(homeMode(25, r), "courier-store");
  assert.equal(homeMode(25.4, r), "courier-hq");
  assert.equal(homeMode(null, r), "courier-hq");
  assert.equal(localRules({ localCourierKm: 30 }, 0).courierKm, 30);
});
