import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFacets, type FacetDef } from "./facet-values";

/**
 * Τα φίλτρα και τα χαρακτηριστικά είναι τα πραγματικά του είδους LAM021615 (action camera): το SoftOne ορίζει τα
 * φίλτρα του τύπου, οι τιμές τους όμως λέγονται αλλιώς στην περιγραφή και στις εξωτερικές πηγές.
 */
const f = (label: string): FacetDef => ({ id: label, label });
const p = (specs: { key: string; value: string }[]) => ({
  title: "LAMTECH 4K ACTION CAMERA DUO WITH Wi-Fi & 2.4G REMOTE CONTROL",
  summary: null, description: null, specs, typeName: "Action cameras",
});
const val = (facets: FacetDef[], specs: { key: string; value: string }[], label: string) =>
  resolveFacets(facets, p(specs)).find((v) => v.facetId === label)?.value ?? null;

test("Εταιρία: γεμίζει από «Κατασκευαστής» ή «Μάρκα»", () => {
  assert.equal(val([f("Εταιρία")], [{ key: "ΚΑΤΑΣΚΕΥΑΣΤΗΣ", value: "LAMTECH" }], "Εταιρία"), "LAMTECH");
  assert.equal(val([f("Εταιρία")], [{ key: "Μάρκα", value: "Lamtech" }], "Εταιρία"), "Lamtech");
});

test("Τύπος Σύνδεσης στον Η/Υ: γεμίζει από «Θύρες» ή «USB»", () => {
  const v = val([f("Τύπος Σύνδεσης στον Η/Υ")], [{ key: "Θύρες", value: "USB 2.0, HDMI" }], "Τύπος Σύνδεσης στον Η/Υ");
  assert.ok(v && /USB/i.test(v), `περίμενα USB, πήρα ${v}`);
  const u = val([f("Τύπος Σύνδεσης στον Η/Υ")], [{ key: "USB", value: "USB 2.0" }], "Τύπος Σύνδεσης στον Η/Υ");
  assert.ok(u && /USB/i.test(u), `περίμενα USB, πήρα ${u}`);
});

test("Φορμά εγγραφής: γεμίζει από «Μορφή βίντεο»", () => {
  assert.equal(val([f("Φορμά εγγραφής")], [{ key: "Μορφή βίντεο", value: "MP4 (H.264)" }], "Φορμά εγγραφής"), "MP4 (H.264)");
});

test("Χρώμα: δουλεύει ήδη με το ίδιο όνομα — δεν το χαλάμε", () => {
  assert.equal(val([f("Χρώμα")], [{ key: "Χρώμα", value: "Μαύρο" }], "Χρώμα"), "Μαύρο");
});

test("το χαρακτηριστικό του ERP προηγείται της εξωτερικής πηγής", () => {
  // Η σειρά των specs είναι η σειρά προτεραιότητας: πρώτα το s1-desc, μετά οι εξωτερικές.
  const v = val([f("Εταιρία")], [{ key: "ΚΑΤΑΣΚΕΥΑΣΤΗΣ", value: "LAMTECH" }, { key: "Μάρκα", value: "Άλλη" }], "Εταιρία");
  assert.equal(v, "LAMTECH");
});
