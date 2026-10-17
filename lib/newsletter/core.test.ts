import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { audienceOf, batches, contentHash, factCheck, recipientVariables, validateSchedule, verifyMailgun, type Block } from "./core";

const sub = (id: string, email: string, status = "subscribed", extra: { firstName?: string | null; customerId?: string | null } = {}) => ({ id, email, status, ...extra });
const cust = (id: string, email: string | null, allowed = true, firstName: string | null = null) => ({ id, email, firstName, allowed });

test("κοινό: διπλό email σε διαφορετικά κεφαλαία → μία γραμμή, κερδίζει ο συνδρομητής", () => {
  const rows = audienceOf({ subscribers: [sub("s1", "  Maria@Example.GR ", "subscribed", { firstName: "Μαρία" })], customers: [cust("c1", "maria@example.gr", true, "Μ.")] });
  assert.deepEqual(rows, [{ email: "maria@example.gr", subscriberId: "s1", customerId: "c1", firstName: "Μαρία" }]);
});

test("κοινό: ο συνδρομητής κρατά το δικό του customerId", () => {
  const rows = audienceOf({ subscribers: [sub("s1", "a@b.gr", "subscribed", { customerId: "c9" })], customers: [cust("c1", "a@b.gr")] });
  assert.equal(rows[0].customerId, "c9");
});

test("κοινό: pending συνδρομητής εκτός", () => {
  assert.deepEqual(audienceOf({ subscribers: [sub("s1", "a@b.gr", "pending")], customers: [] }), []);
});

test("κοινό: unsubscribed συνδρομητής + πελάτης allowed με ίδιο email → εκτός", () => {
  for (const status of ["unsubscribed", "bounced", "complained"]) {
    assert.deepEqual(audienceOf({ subscribers: [sub("s1", "A@b.gr", status)], customers: [cust("c1", "a@b.gr", true)] }), [], status);
  }
});

test("κοινό: πελάτης allowed=false εκτός, allowed=true μπαίνει χωρίς subscriberId", () => {
  const rows = audienceOf({ subscribers: [], customers: [cust("c1", "no@b.gr", false), cust("c2", "yes@b.gr", true, "Νίκος"), cust("c3", null, true)] });
  assert.deepEqual(rows, [{ email: "yes@b.gr", subscriberId: null, customerId: "c2", firstName: "Νίκος" }]);
});

test("κοινό: άκυρο email εκτός", () => {
  const rows = audienceOf({ subscribers: [sub("s1", "xxx"), sub("s2", "a@b"), sub("s3", "a b@c.gr")], customers: [cust("c1", "@b.gr")] });
  assert.deepEqual(rows, []);
});

test("κοινό με segment: μόνο όσοι έχουν customerId μέσα στο σύνολο", () => {
  const rows = audienceOf({
    subscribers: [sub("s1", "a@b.gr"), sub("s2", "b@b.gr", "subscribed", { customerId: "c2" }), sub("s3", "c@b.gr")],
    customers: [cust("c1", "a@b.gr"), cust("c3", "d@b.gr"), cust("c4", "e@b.gr")],
    segment: new Set(["c1", "c2", "c4"]),
  });
  assert.deepEqual(rows.map((r) => r.email).sort(), ["a@b.gr", "b@b.gr", "e@b.gr"]);
  // συνδρομητής χωρίς customerId εκτός
  assert.ok(!rows.some((r) => r.email === "c@b.gr"));
  // πελάτης εκτός κοινού εκτός
  assert.ok(!rows.some((r) => r.email === "d@b.gr"));
});

test("factCheck: οι αριθμοί και οι ημερομηνίες του κειμένου πρέπει να υπάρχουν στα facts", () => {
  assert.equal(factCheck("Έως −20% έως 31/10", ["20%", "31/10/2026"]), true);
  assert.equal(factCheck("−30% μόνο σήμερα", ["20%"]), false);
  assert.equal(factCheck("Μοναδική ευκαιρία για το σπίτι σας", []), true);
});

test("factCheck: κανονικοποίηση (κενά, κόμμα/τελεία, μοναδικό πρόσημο, € )", () => {
  assert.equal(factCheck("Έκπτωση 20 %", ["20%"]), true);
  assert.equal(factCheck("-20%", ["20%"]), true);
  assert.equal(factCheck("–20%", ["20%"]), true);
  assert.equal(factCheck("20,5%", ["20.5%"]), true);
  assert.equal(factCheck("20.5%", ["20,5%"]), true);
  assert.equal(factCheck("20,0%", ["20%"]), true);
  assert.equal(factCheck("Από 199 €", ["199€"]), true);
  assert.equal(factCheck("Από 199€", ["199 €"]), true);
  assert.equal(factCheck("Από 299€", ["199€"]), false);
  assert.equal(factCheck("20€", ["20%"]), false);
  assert.equal(factCheck("έως 5/11", ["31/10/2026"]), false);
  assert.equal(factCheck("έως 05/11", ["5/11/2026"]), true);
  // το fact μπορεί να είναι ολόκληρη φράση
  assert.equal(factCheck("−20%", ["Έκπτωση έως 20% στα πλυντήρια"]), true);
});

test("validateSchedule: όρια 5 λεπτά – 30 ημέρες", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const r4 = validateSchedule(new Date(now.getTime() + 4 * 60_000), now);
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.ok(r4.error.length > 0);
  assert.equal(validateSchedule(new Date(now.getTime() + 31 * 86_400_000), now).ok, false);
  assert.equal(validateSchedule(new Date(now.getTime() + 5 * 60_000), now).ok, true);
  assert.equal(validateSchedule(new Date(now.getTime() + 30 * 86_400_000), now).ok, true);
  assert.equal(validateSchedule(new Date(now.getTime() - 60_000), now).ok, false);
});

test("validateSchedule: νύχτα = 22:00–08:00 ώρα Ελλάδας (καλοκαίρι UTC+3, χειμώνας UTC+2)", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  // 23:30 Αθήνα (EEST) = 20:30Z
  assert.deepEqual(validateSchedule(new Date("2026-10-21T20:30:00Z"), now), { ok: true, night: true });
  // 12:00 Αθήνα = 09:00Z
  assert.deepEqual(validateSchedule(new Date("2026-10-21T09:00:00Z"), now), { ok: true, night: false });
  // 07:59 Αθήνα = 04:59Z → νύχτα· 08:00 Αθήνα = 05:00Z → μέρα
  assert.deepEqual(validateSchedule(new Date("2026-10-21T04:59:00Z"), now), { ok: true, night: true });
  assert.deepEqual(validateSchedule(new Date("2026-10-21T05:00:00Z"), now), { ok: true, night: false });
  // 22:00 Αθήνα = 19:00Z → νύχτα· 21:59 = 18:59Z → μέρα
  assert.deepEqual(validateSchedule(new Date("2026-10-21T19:00:00Z"), now), { ok: true, night: true });
  assert.deepEqual(validateSchedule(new Date("2026-10-21T18:59:00Z"), now), { ok: true, night: false });
  // χειμώνας (EET, UTC+2): 22:30 Αθήνα = 20:30Z
  assert.deepEqual(validateSchedule(new Date("2026-11-10T20:30:00Z"), new Date("2026-11-01T00:00:00Z")), { ok: true, night: true });
});

test("batches: 2.500 σε πακέτα των 1.000", () => {
  const rows = Array.from({ length: 2500 }, (_, i) => i);
  assert.deepEqual(batches(rows, 1000).map((b) => b.length), [1000, 1000, 500]);
  assert.deepEqual(batches([], 1000), []);
  assert.deepEqual(batches([1, 2, 3], 2), [[1, 2], [3]]);
  assert.throws(() => batches([1], 0));
});

test("recipientVariables: σύνδεσμος διαγραφής ανά email και όνομα", () => {
  const v = recipientVariables(
    [{ email: "a@b.gr", token: "tok1", firstName: "Άννα" }, { email: "c@d.gr", token: "tok2", firstName: null }],
    "https://shop.gr/",
  );
  assert.deepEqual(v, {
    "a@b.gr": { unsub: "https://shop.gr/api/newsletter/u/tok1", name: "Άννα" },
    "c@d.gr": { unsub: "https://shop.gr/api/newsletter/u/tok2", name: "" },
  });
});

test("verifyMailgun: υπογραφή HMAC-SHA256, timing-safe, ανοχή 900 s", () => {
  const key = "key-test";
  const now = 1_800_000_000;
  const sign = (ts: string, token: string) => createHmac("sha256", key).update(ts + token).digest("hex");
  const ts = String(now);
  assert.equal(verifyMailgun({ timestamp: ts, token: "abc", signature: sign(ts, "abc") }, key, now), true);
  assert.equal(verifyMailgun({ timestamp: ts, token: "abc", signature: sign(ts, "abd") }, key, now), false);
  assert.equal(verifyMailgun({ timestamp: ts, token: "abc", signature: sign(ts, "abc") }, "other", now), false);
  assert.equal(verifyMailgun({ timestamp: ts, token: "abc", signature: "abc" }, key, now), false);
  assert.equal(verifyMailgun({ timestamp: ts, token: "abc", signature: "" }, key, now), false);
  const old = String(now - 1000);
  assert.equal(verifyMailgun({ timestamp: old, token: "abc", signature: sign(old, "abc") }, key, now), false);
  const edge = String(now - 900);
  assert.equal(verifyMailgun({ timestamp: edge, token: "abc", signature: sign(edge, "abc") }, key, now), true);
  const future = String(now + 1000);
  assert.equal(verifyMailgun({ timestamp: future, token: "abc", signature: sign(future, "abc") }, key, now), false);
  assert.equal(verifyMailgun({ timestamp: "x", token: "abc", signature: sign("x", "abc") }, key, now), false);
});

test("contentHash: σταθερό για ίδια είσοδο, αλλάζει όταν αλλάζει ένα block", () => {
  const blocks: Block[] = [
    { type: "hero", image: null, alt: "a", href: "/x", headline: "H", sub: "S" },
    { type: "products", ids: ["1", "2"] },
    { type: "cta", label: "Δες", href: "/y" },
  ];
  const a = contentHash({ subject: "Θέμα", preheader: "P", blocks });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(contentHash({ subject: "Θέμα", preheader: "P", blocks: structuredClone(blocks) }), a);
  // η σειρά των κλειδιών δεν παίζει ρόλο
  const reordered = blocks.map((b) => Object.fromEntries(Object.entries(b).reverse())) as Block[];
  assert.equal(contentHash({ preheader: "P", blocks: reordered, subject: "Θέμα" }), a);
  const changed = structuredClone(blocks);
  (changed[1] as { ids: string[] }).ids = ["1", "3"];
  assert.notEqual(contentHash({ subject: "Θέμα", preheader: "P", blocks: changed }), a);
  assert.notEqual(contentHash({ subject: "Άλλο", preheader: "P", blocks }), a);
});

test("factCheck: ελληνική μορφή τιμών ≥ 1.000 € (τελεία χιλιάδων, κόμμα δεκαδικών)", () => {
  assert.equal(factCheck("Μόνο 1.299,90€", ["1299,90€"]), true);
  assert.equal(factCheck("Μόνο 1.299,90€", []), false);
  assert.equal(factCheck("Μόνο 1.299,90€", ["1.299,90 €"]), true);
  assert.equal(factCheck("Μόνο 1.299,90€", ["1.299€"]), false);
  assert.equal(factCheck("1.200€", ["1,2€"]), false);
  assert.equal(factCheck("από 1.299 €", ["1.299€"]), true);
  assert.equal(factCheck("από 1.299 €", ["1299€"]), true);
});

test("κοινό: πελάτης με τελευταία συναίνεση «όχι» (optedOut) αποκλείει το email ακόμη και με subscribed συνδρομητή", () => {
  assert.deepEqual(audienceOf({ subscribers: [sub("s1", "a@b.gr")], customers: [{ id: "c1", email: "A@b.gr", allowed: false, optedOut: true }] }), []);
  // allowed=false χωρίς optedOut δεν αποκλείει συνδρομητή
  const rows = audienceOf({ subscribers: [sub("s1", "a@b.gr")], customers: [{ id: "c1", email: "a@b.gr", allowed: false }] });
  assert.deepEqual(rows.map((r) => r.subscriberId), ["s1"]);
});
