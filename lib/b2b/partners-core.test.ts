import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStores, normEmail, normWebsite, s1Date, toPartner, virtualBranch, type S1Member } from "./partners-core";

test("email: πρώτο έγκυρο, πεζά", () => {
  assert.equal(normEmail(" Info@Shop.GR; sales@shop.gr"), "info@shop.gr");
  assert.equal(normEmail("6944123456"), null);
  assert.equal(normEmail(""), null);
});

test("website: κινητό στο WEBPAGE αγνοείται", () => {
  assert.equal(normWebsite("6944 123 456"), null);
  assert.equal(normWebsite("www.shop.gr"), "https://www.shop.gr");
  assert.equal(normWebsite("https://shop.gr/"), "https://shop.gr/");
});

test("ημερομηνία SoftOne σε ώρα Ελλάδας", () => {
  assert.equal(s1Date("2026-07-02 15:55:00")?.toISOString(), "2026-07-02T13:55:00.000Z");
  assert.equal(s1Date(""), null);
});

test("μέλος → Partner με ονόματα κατηγορίας/ομάδας· χωρίς υποκατάστημα → εικονικό", () => {
  const m = { TRDR: "42", CODE: "C0042", NAME: "ΚΑΤΑΣΤΗΜΑ ΑΕ", AFM: "099999999", IRSDATA: "ΧΑΛΚΙΔΑΣ", ADDRESS: "Οδός 1", ZIP: "34100", CITY: "ΧΑΛΚΙΔΑ", DISTRICT: "", PHONE01: "2221000000", PHONE02: "", EMAIL: "X@euronics.gr", WEBPAGE: "6944000000", TRDBUSINESS: "1", TRDPGROUP: "100", ISACTIVE: "1", UPDDATE: "" } as S1Member;
  const p = toPartner(m, { business: new Map([[1, "ΜΕΛΟΣ Α"]]), group: new Map([[100, "Φυσικό Κατάστημα"]]) });
  assert.equal(p.s1Trdr, 42);
  assert.equal(p.category, "ΜΕΛΟΣ Α");
  assert.equal(p.groupName, "Φυσικό Κατάστημα");
  assert.equal(p.email, "x@euronics.gr");
  assert.equal(p.website, null);
  assert.equal(p.district, null);
  const v = virtualBranch(p);
  assert.equal(v.s1BranchId, null);
  assert.equal(v.isCenter, true);
  assert.equal(v.city, "ΧΑΛΚΙΔΑ");
});

test("ίδιο email σε πολλά: ζευγάρωμα με ΤΚ, μετά με πόλη", () => {
  const branches = [
    { key: "x1", partnerKey: "p", email: "m@x.gr", isCenter: true, storeId: null, matchedBy: null, zip: "671 00", city: "ΞΑΝΘΗ" },
    { key: "x2", partnerKey: "p", email: "m@x.gr", isCenter: false, storeId: null, matchedBy: null, zip: "67100", city: "ΠΤΟΛΕΜΑ'Ι'ΔΑ" },
  ];
  const stores = [{ id: "a", email: "m@x.gr", zip: "67100", city: "Ξάνθη" }, { id: "b", email: "m@x.gr", zip: "67100", city: "Πτολεμαΐδα" }];
  assert.deepEqual(matchStores(branches, [], stores), [
    { branchKey: "x1", storeId: "a", matchedBy: "email-branch" },
    { branchKey: "x2", storeId: "b", matchedBy: "email-branch" },
  ]);
});

test("αντιστοίχιση: email υποκαταστήματος, μετά email μέλους στην έδρα, όχι αμφίσημα, όχι συνδεδεμένα", () => {
  const branches = [
    { key: "b1", partnerKey: "p1", email: "a@x.gr", isCenter: true, storeId: null, matchedBy: null },
    { key: "b2", partnerKey: "p1", email: "b@x.gr", isCenter: false, storeId: null, matchedBy: null },
    { key: "b3", partnerKey: "p2", email: null, isCenter: true, storeId: null, matchedBy: null },
    { key: "b4", partnerKey: "p2", email: null, isCenter: false, storeId: null, matchedBy: null },
    { key: "b5", partnerKey: "p3", email: "dup@x.gr", isCenter: true, storeId: null, matchedBy: null },
    { key: "b6", partnerKey: "p3", email: "dup@x.gr", isCenter: false, storeId: null, matchedBy: null },
    { key: "b7", partnerKey: "p4", email: "kept@x.gr", isCenter: true, storeId: "sKept", matchedBy: "manual" },
    { key: "b8", partnerKey: "p5", email: "off@x.gr", isCenter: true, storeId: null, matchedBy: "manual" },
  ];
  const partners = [{ key: "p1", email: "a@x.gr" }, { key: "p2", email: "hq@p2.gr" }, { key: "p3", email: null }, { key: "p4", email: null }];
  const stores = [
    { id: "s1", email: "A@x.gr" }, { id: "s2", email: "b@x.gr" }, { id: "s3", email: "hq@p2.gr" },
    { id: "s4", email: "dup@x.gr" }, { id: "s5", email: "nobody@x.gr" }, { id: "sKept", email: "kept@x.gr" }, { id: "s6", email: "kept@x.gr" }, { id: "s7", email: "off@x.gr" },
  ];
  const m = matchStores(branches, partners, stores);
  assert.deepEqual(m, [
    { branchKey: "b1", storeId: "s1", matchedBy: "email-branch" },
    { branchKey: "b2", storeId: "s2", matchedBy: "email-branch" },
    { branchKey: "b3", storeId: "s3", matchedBy: "email-partner" },
  ]);
});
