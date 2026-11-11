import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATES, chargeableKg, normalizeRates, quoteRate, zoneFor } from "./rates";
import { decideRoute, nextStep, normalizeDelivery, STEPS, type RouteCandidate } from "./routing";

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

test("τιμή: κλίμακα, επιπλέον κιλά, δυσπρόσιτα, δωρεάν από (όχι για ογκώδη)", () => {
  const d = normalizeRates({ ...DEFAULT_RATES, remote: { prefixes: ["840"], surcharge: 300 } });
  assert.equal(quoteRate(d, { zip: "17456", goods: 5000, kg: 4 })!.fee, 490);
  assert.equal(quoteRate(d, { zip: "54624", goods: 5000, kg: 33 })!.fee, 1690 + 3 * 50);
  assert.equal(quoteRate(d, { zip: "84001", goods: 5000, kg: 1 })!.fee, 590 + 300);
  assert.equal(quoteRate(d, { zip: "17456", goods: 20000, kg: 1 })!.fee, 0);
  assert.equal(quoteRate(d, { zip: "17456", goods: 20000, kg: 1, bulky: true })!.fee, 390);
  assert.equal(quoteRate(d, { zip: null, goods: 0, kg: 1 }), null);
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
