import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { audienceOf, audienceSpec, batches, classifySendError, contentHash, factCheck, failRatio, finalStatus, isEmail, isTestMode, recipientVariables, startCheck, validateSchedule, verifyMailgun, type Block } from "./core";

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

test("startCheck: προσφορά ended / held / ληγμένη → λόγος· active ή scheduled → null", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const future = new Date("2026-10-31T21:00:00Z");
  assert.match(startCheck({ promotion: { status: "ended", held: false, endsAt: future } }, now) ?? "", /προσφορά/i);
  assert.match(startCheck({ promotion: { status: "active", held: true, endsAt: future } }, now) ?? "", /αναμονή/);
  assert.match(startCheck({ promotion: { status: "active", held: false, endsAt: new Date("2026-10-20T09:59:00Z") } }, now) ?? "", /έληξε/);
  assert.equal(startCheck({ promotion: { status: "active", held: false, endsAt: future } }, now), null);
  assert.equal(startCheck({ promotion: { status: "scheduled", held: false, endsAt: null } }, now), null);
});

test("startCheck: καμπάνια paused → λόγος· scheduled / live → null· χωρίς προσφορά και καμπάνια → null", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  assert.match(startCheck({ campaign: { status: "paused" } }, now) ?? "", /καμπάνια/i);
  assert.equal(startCheck({ campaign: { status: "live" } }, now), null);
  assert.equal(startCheck({ campaign: { status: "scheduled" } }, now), null);
  assert.equal(startCheck({ promotion: null, campaign: null }, now), null);
  assert.equal(startCheck({}, now), null);
  // και τα δύο: αρκεί ένα πρόβλημα
  assert.match(startCheck({ promotion: { status: "active", held: false, endsAt: null }, campaign: { status: "ended" } }, now) ?? "", /καμπάνια/i);
});

test("failRatio: > 20 % αποτυχίες με τουλάχιστον 50 προσπάθειες", () => {
  assert.equal(failRatio(100, 30), true);
  assert.equal(failRatio(10, 5), false);
  assert.equal(failRatio(40, 9), false); // 49 προσπάθειες: λίγες ακόμη
  assert.equal(failRatio(40, 10), false); // ακριβώς 20 %
  assert.equal(failRatio(39, 11), true); // 22 % σε 50
  assert.equal(failRatio(0, 0), false);
});

test("κοινό: λίστα επιτρεπόμενων (emails) κρατά μόνο αυτές, αλλά οι κανόνες συναίνεσης ισχύουν ακόμη", () => {
  const input = {
    subscribers: [sub("s1", "a@b.gr"), sub("s2", "blocked@b.gr", "unsubscribed")],
    customers: [cust("c1", "c@b.gr", true), cust("c2", "noconsent@b.gr", false), cust("c3", "blocked@b.gr", true)],
  };
  const rows = audienceOf({ ...input, emails: [" A@B.gr ", "noconsent@b.gr", "blocked@b.gr", "missing@b.gr"] });
  assert.deepEqual(rows.map((r) => r.email), ["a@b.gr"]);
  // κενή λίστα = κανείς· null/undefined = χωρίς περιορισμό
  assert.deepEqual(audienceOf({ ...input, emails: [] }), []);
  assert.deepEqual(audienceOf({ ...input, emails: null }).map((r) => r.email), ["a@b.gr", "c@b.gr"]);
});

test("finalStatus: ουρά / σε πτήση / αποτυχίες → sending, sent ή paused", () => {
  const c = (o: Partial<{ queued: number; inflight: number; stale: number; sent: number; failed: number }>) => ({ queued: 0, inflight: 0, stale: 0, sent: 0, failed: 0, ...o });
  assert.deepEqual(finalStatus(c({ sent: 10 })), { status: "sent" });
  assert.deepEqual(finalStatus(c({ queued: 5, sent: 10 })), { status: "sending" });
  // σε πτήση πρόσφατα (άλλη διεργασία στέλνει) → περιμένουμε
  assert.deepEqual(finalStatus(c({ inflight: 3, sent: 10 })), { status: "sending" });
  // σε πτήση πολύ ώρα (κόπηκε μετά την κλήση;) → παύση για έλεγχο, ποτέ ξανά στην ουρά
  const st = finalStatus(c({ inflight: 3, stale: 3, sent: 10 }));
  assert.equal(st.status, "paused");
  assert.match((st as { reason: string }).reason, /3/);
  // > 20 % αποτυχίες με ≥ 50 προσπάθειες: παύση πριν από το sent, ακόμη κι αν άδειασε η ουρά
  assert.equal(finalStatus(c({ sent: 100, failed: 30 })).status, "paused");
  assert.equal(finalStatus(c({ queued: 10, sent: 100, failed: 30 })).status, "paused");
  // όλες απέτυχαν (λίγες) → όχι «sent»
  assert.equal(finalStatus(c({ failed: 1 })).status, "paused");
  assert.deepEqual(finalStatus(c({ sent: 9, failed: 1 })), { status: "sent" });
  // τίποτα (π.χ. όλοι skipped) → sent
  assert.deepEqual(finalStatus(c({})), { status: "sent" });
});

test("factCheck: ελληνικές διατυπώσεις (μήνες, ευρώ, τοις εκατό, ημερομηνίες με . και -)", () => {
  const facts = ["20%", "31/10/2026", "499,00 €"];
  for (const t of ["Ισχύει έως 15 Νοεμβρίου", "Έκπτωση 30 τοις εκατό", "Από 399 ευρώ", "Από €399", "Έως 15.11", "Έως 15-11-2026"]) {
    assert.equal(factCheck(t, facts), false, t);
  }
  for (const t of ["Έως 31 Οκτωβρίου", "Έκπτωση 20 τοις εκατό", "Από 499 ευρώ", "Από €499", "Έως 31.10"]) {
    assert.equal(factCheck(t, facts), true, t);
  }
});

test("factCheck: μήνες σε ονομαστική / γενική / κεφαλαία, «1η», EUR, «τοις %», € με κενό", () => {
  assert.equal(factCheck("από 1η Δεκεμβρίου", ["1/12/2026"]), true);
  assert.equal(factCheck("από 1η Δεκεμβρίου", ["2/12/2026"]), false);
  assert.equal(factCheck("ΕΩΣ 31 ΟΚΤΩΒΡΙΟΥ", ["31/10"]), true);
  assert.equal(factCheck("Μάιος: 5 Μαΐου", ["5/5"]), true);
  assert.equal(factCheck("Μάιος: 6 Μαΐου", ["5/5"]), false);
  assert.equal(factCheck("μόνο 499 EUR", ["499€"]), true);
  assert.equal(factCheck("μόνο 499 EUR", ["399€"]), false);
  assert.equal(factCheck("20 τοις %", ["20%"]), true);
  assert.equal(factCheck("από € 499", ["499 ευρώ"]), true);
  assert.equal(factCheck("έως 31-10", ["31/10/2026"]), true);
  assert.equal(factCheck("έως 31.10.2026", ["31/10/2026"]), true);
  // όχι ημερομηνία: εύρος ποσοστού, δεκαδικά με μονάδα, ποσότητες
  assert.equal(factCheck("έκπτωση 10-20%", ["20%", "10%"]), true);
  assert.equal(factCheck("Παράδοση σε 2-3 ημέρες", []), true);
});

test("isEmail: αυστηρός έλεγχος διεύθυνσης", () => {
  for (const ok of ["a@b.gr", "maria.p+promo@shop-1.example.com", "x_y@sub.domain.gr"]) assert.equal(isEmail(ok), true, ok);
  for (const bad of ["a@x.gr,b", "a@b..gr", "a@b", "a b@c.gr", "@b.gr", "xxx", "a@-b.gr", "a@b-.gr", "a@b.g", "a@b.1r", "a,b@c.gr", "a;b@c.gr", "<a@b.gr>", "\"a\"@b.gr", "a(b)@c.gr", "a[b]@c.gr", "a\\b@c.gr", "a@b.gr;c@d.gr", ".a@b.gr", "a.@b.gr", "a..b@c.gr", "a@.b.gr", "a@b.gr.", ""]) {
    assert.equal(isEmail(bad), false, bad);
  }
});

test("κοινό: αυστηρό email — «a@x.gr,b» και «a@b..gr» εκτός", () => {
  assert.deepEqual(audienceOf({ subscribers: [sub("s1", "a@x.gr,b"), sub("s2", "a@b..gr")], customers: [cust("c1", "c@d.gr;e@f.gr")] }), []);
});

test("classifySendError: retry μόνο αν το αίτημα δεν έφτασε / 429 / 5xx· timeout και κοπή μετά την αποστολή → uncertain", () => {
  const net = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code), { code }) });
  for (const code of ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN"]) assert.equal(classifySendError(net(code)), "retry", code);
  assert.equal(classifySendError(net("ECONNRESET")), "uncertain");
  assert.equal(classifySendError(net("UND_ERR_SOCKET")), "uncertain");
  assert.equal(classifySendError(new DOMException("The operation was aborted due to timeout", "TimeoutError")), "uncertain");
  assert.equal(classifySendError(new DOMException("aborted", "AbortError")), "uncertain");
  assert.equal(classifySendError(new Error("κάτι άγνωστο")), "uncertain");
  assert.equal(classifySendError("x"), "uncertain");
  // Happy Eyeballs: AggregateError με όλες τις συνδέσεις απορριφθείσες → δεν έφτασε
  const agg = Object.assign(new TypeError("fetch failed"), { cause: new AggregateError([Object.assign(new Error("a"), { code: "ECONNREFUSED" }), Object.assign(new Error("b"), { code: "ENETUNREACH" })]) });
  assert.equal(classifySendError(agg), "retry");
  // απάντηση HTTP
  assert.equal(classifySendError({ status: 429 }), "retry");
  assert.equal(classifySendError({ status: 500 }), "retry");
  assert.equal(classifySendError({ status: 503 }), "retry");
  assert.equal(classifySendError({ status: 400 }), "fatal");
  assert.equal(classifySendError({ status: 401 }), "fatal");
  assert.equal(classifySendError({ status: 404 }), "fatal");
  // SMTP: ο server απάντησε (4xx προσωρινό, 5xx οριστικό)
  assert.equal(classifySendError(Object.assign(new Error("x"), { responseCode: 451 })), "retry");
  assert.equal(classifySendError(Object.assign(new Error("x"), { responseCode: 550 })), "fatal");
});

test("audienceSpec: emails που δεν είναι πίνακας → [] (κανείς)· segmentId μόνο string", () => {
  assert.deepEqual(audienceSpec({}), {});
  assert.deepEqual(audienceSpec(null), {});
  assert.deepEqual(audienceSpec([]), {});
  assert.deepEqual(audienceSpec({ segmentId: "s1" }), { segmentId: "s1" });
  assert.deepEqual(audienceSpec({ segmentId: 5 }), {});
  assert.deepEqual(audienceSpec({ emails: [" A@B.gr ", 3, null] }), { emails: ["a@b.gr"] });
  assert.deepEqual(audienceSpec({ emails: "a@b.gr" }), { emails: [] });
  assert.deepEqual(audienceSpec({ emails: { a: 1 } }), { emails: [] });
  assert.deepEqual(audienceSpec({ emails: null }), { emails: [] });
});

test("isTestMode: env NEWSLETTER_TESTMODE=1 ή σημαία της γραμμής", () => {
  assert.equal(isTestMode(null, {}), false);
  assert.equal(isTestMode({ testMode: false }, { NEWSLETTER_TESTMODE: "0" }), false);
  assert.equal(isTestMode({ testMode: true }, {}), true);
  assert.equal(isTestMode(null, { NEWSLETTER_TESTMODE: "1" }), true);
});
