import { test } from "node:test";
import assert from "node:assert/strict";
import { publishMissing, isPublishable, normalizeGate, type PublishInput } from "./publish-ready";

const full: PublishInput = { webExcluded: false, hasWebCategory: true, photos: 2, specs: 5, dims: true, weight: true, shipExempt: false, avail: { label: "Άμεσα διαθέσιμο", publish: true } };

test("πλήρες προϊόν: τίποτα δεν λείπει", () => assert.deepEqual(publishMissing(full), []));

test("κάθε κριτήριο ξεχωριστά", () => {
  assert.deepEqual(publishMissing({ ...full, webExcluded: true }), ["web"]);
  assert.deepEqual(publishMissing({ ...full, hasWebCategory: false }), ["category"]);
  assert.deepEqual(publishMissing({ ...full, photos: 0 }), ["photo"]);
  assert.deepEqual(publishMissing({ ...full, specs: 0 }), ["specs"]);
  assert.deepEqual(publishMissing({ ...full, weight: false }), ["dims"]);
  assert.deepEqual(publishMissing({ ...full, avail: { label: " ", publish: true } }), ["avail"]);
  assert.deepEqual(publishMissing({ ...full, avail: { label: "Εξαντλήθηκε", publish: false } }), ["avail"]);
});

test("κατάστημα / μεταφορική: διαστάσεις και βάρος δεν χρειάζονται", () => {
  assert.deepEqual(publishMissing({ ...full, dims: false, weight: false, shipExempt: true }), []);
});

test("ο διακόπτης και τα ενεργά κριτήρια", () => {
  const miss = publishMissing({ ...full, photos: 0, dims: false });
  assert.equal(isPublishable(miss, { enabled: false, criteria: ["photo"] }), true);
  assert.equal(isPublishable(miss, { enabled: true, criteria: ["photo"] }), false);
  assert.equal(isPublishable(miss, { enabled: true, criteria: ["specs", "web"] }), true);
});

test("normalizeGate: ξεκινά κλειστός με όλα τα κριτήρια, πετά άγνωστα", () => {
  assert.deepEqual(normalizeGate(null), { enabled: false, criteria: ["web", "category", "photo", "specs", "dims", "avail"] });
  assert.deepEqual(normalizeGate({ enabled: true, criteria: ["photo", "x", "photo"] }), { enabled: true, criteria: ["photo"] });
  assert.equal(normalizeGate({ enabled: "yes" }).enabled, false);
});
