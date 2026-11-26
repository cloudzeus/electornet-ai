import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSaldoc, orderDocFilter, orderNum01, softoneTotals, type SaldocOrder, type SaldocSettings, erpDocNo } from "./order-doc-core";

const S: SaldocSettings = { series: "7005", retailTrdr: "200" };
const base: SaldocOrder = {
  number: "EUR-20261016-0007", fulfilment: "courier", payment: "card", email: "a@b.gr",
  contact: { firstName: "Μαρία", lastName: "Παπά", phone: "6900000000" },
  address: { street: "Ερμού", number: "10", zip: "10563", city: "Αθήνα", region: "Αττική" }, carrierName: "ACS",
  lines: [{ erpCode: "150066", title: "Redmi Note 15", qty: 1, listPrice: 249.9, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24 }],
  shippingFee: 0, total: 249.9,
};

test("τιμή χωρίς ΦΠΑ, όπως στο σημερινό eshop (249,90 → 201,54) και σύνολο ακριβώς ίδιο", () => {
  const d = composeSaldoc(base, S);
  assert.equal(d.data.ITELINES[0].PRICE, 201.54);
  assert.equal(d.totals.gross, 249.9);
  assert.deepEqual(d.needs, []);
});

test("κεφαλίδα: σειρά, λιανική 200, αριθμός στο FINCODE, κωδικός πληρωμής, ονοματεπώνυμο, email στις παρατηρήσεις· χωρίς SHIPMENT", () => {
  const h = composeSaldoc(base, S).data.SALDOC[0];
  assert.equal(h.SERIES, 7005); assert.equal(h.TRDR, 200); assert.equal(h.FINCODE, "EUR-20261016-0007"); assert.equal(h.NUM01, 202610160007);
  assert.equal(h.PAYMENT, 1001); assert.ok(!("SHIPMENT" in h), "ο πίνακας «Τρόποι αποστολής» του SoftOne δεν στέλνεται");
  assert.equal(h.COMMENTS1, "Μαρία Παπά");
  assert.match(String(h.COMMENTS), /e-shop EUR-20261016-0007 · Courier ACS · Κάρτα/);
  assert.match(String(h.REMARKS), /Email: a@b\.gr/);
});

test("MTRDOC: διεύθυνση αποστολής και CCCSHP*", () => {
  const m = composeSaldoc(base, S).data.MTRDOC[0];
  assert.equal(m.SHIPPINGADDR, "Ερμού 10"); assert.equal(m.SHPZIP, "10563"); assert.equal(m.SHPCITY, "Αθήνα"); assert.equal(m.SHPDISTRICT, "Αττική");
  assert.equal(m.CCCSHPNAME, "Μαρία Παπά"); assert.equal(m.CCCSHPPHONE, "6900000000"); assert.equal(m.CCCSHPADDRESS, "Ερμού 10, 10563 Αθήνα");
});

test("σειρά: κενή ρύθμιση → 7005 (όπου πέφτει το σημερινό eshop), η ρύθμιση υπερισχύει", () => {
  const d = composeSaldoc(base, { ...S, series: null });
  assert.equal(d.data.SALDOC[0].SERIES, 7005);
  assert.deepEqual(d.needs, []);
  assert.equal(composeSaldoc(base, { ...S, series: "7049" }).data.SALDOC[0].SERIES, 7049);
});

test("κωδικοί SoftOne της Euronics: πληρωμή ανά τρόπο, μεταφορέας μόνο σε courier με κωδικό", () => {
  const pay = (p: string) => composeSaldoc({ ...base, payment: p }, S).data.SALDOC[0].PAYMENT;
  assert.deepEqual(["cod", "card", "no-card", "bank", "iris", "paypal", "apple", "google"].map(pay), [1000, 1001, 1004, 1005, 1006, 1007, 1008, 1009]);
  // χωρίς κωδικό: ρητά κενό (όχι να λείπει — τότε το SoftOne βάζει την προεπιλογή του πελάτη) και τίποτα δεν μπλοκάρει
  for (const p of ["klarna", "tbi", "revolut", "store", "later", ""]) { const d = composeSaldoc({ ...base, payment: p }, S); assert.equal(d.data.SALDOC[0].PAYMENT, null, p); assert.ok("PAYMENT" in d.data.SALDOC[0]); assert.deepEqual(d.needs, []); }
  const car = (o: Partial<SaldocOrder>) => composeSaldoc({ ...base, ...o }, S).data.MTRDOC[0].SOCARRIER;
  assert.deepEqual(["elta", "geniki", "speedex", "acs", "asap"].map((c) => car({ carrier: c })), [2001, 2002, 2003, 2004, 2006]);
  assert.equal(car({ carrier: "boxnow", locker: { name: "Θ", zip: "11111" } }), undefined);
  assert.equal(car({ carrier: null }), undefined);
  assert.equal(car({ fulfilment: "click-collect", carrier: "acs", store: { name: "Euronics Πειραιά" } }), undefined);
  assert.equal(car({ fulfilment: "appointment", carrier: "acs" }), undefined);
});

test("παρατηρήσεις: πλήρης ανάλυση πληρωμής και αποστολής, κανένας τρόπος πληρωμής δεν μπλοκάρει", () => {
  const rm = (o: Partial<SaldocOrder>) => { const d = composeSaldoc({ ...base, ...o }, S); assert.deepEqual(d.needs, []); return String(d.data.SALDOC[0].REMARKS); };
  const card = rm({ pay: { instalments: 6, status: "paid", psp: "viva", ref: "ABC123" } });
  for (const want of ["ΠΛΗΡΩΜΗ", "Τρόπος: Κάρτα σε 6 δόσεις", "Κατάσταση: ΕΞΟΦΛΗΜΕΝΗ", "Συναλλαγή: viva ABC123", "Σύνολο παραγγελίας με ΦΠΑ: 249,90 €", "ΑΠΟΣΤΟΛΗ", "Τρόπος: Courier — ACS", "Παραλήπτης: Μαρία Παπά, τηλ. 6900000000", "Παράδοση: Ερμού 10, 10563 Αθήνα, Αττική", "Μεταφορικά: δωρεάν", "Παραστατικό: απόδειξη λιανικής"]) assert.ok(card.includes(want), `${want}\n---\n${card}`);
  const cod = rm({ payment: "cod", shippingFee: 3.9, total: 253.8, pay: { status: "pending" } });
  assert.match(cod, /ΕΙΣΠΡΑΞΗ από τον πελάτη στην παράδοση: 253,80 €/);
  assert.match(cod, /Μεταφορικά και χρέωση αντικαταβολής: 3,90 €/);
  assert.match(rm({ payment: "bank", pay: { status: "pending" } }), /σε αναμονή πληρωμής — αναμένεται κατάθεση 249,90 €/);
  assert.match(rm({ payment: "klarna" }), /Τρόπος: Klarna/); // πριν: «λείπει κωδικός πληρωμής»
  const cc = rm({ payment: "store", fulfilment: "click-collect", carrierName: null, store: { name: "Euronics Πειραιά", address: "Γρ. Λαμπράκη 1", zip: "18533", city: "Πειραιάς" } });
  assert.match(cc, /ΕΙΣΠΡΑΞΗ στο κατάστημα κατά την παραλαβή: 249,90 €/);
  assert.match(cc, /Τρόπος: Παραλαβή από κατάστημα — Euronics Πειραιά/);
  assert.ok(!cc.includes("Μεταφορικά"));
  const ap = rm({ fulfilment: "appointment", carrierName: "Κανονική παράδοση euronics", slots: ["09:00–10:00", "12:00–13:00"], address: { ...base.address, floor: "3", notes: "Κουδούνι Παπά" } });
  assert.match(ap, /Τρόπος: Παράδοση με ραντεβού — Κανονική παράδοση euronics/);
  assert.match(ap, /Ώρες που βολεύουν τον πελάτη για τηλέφωνο: 09:00–10:00, 12:00–13:00/);
  assert.match(ap, /3ος όροφος/);
  assert.ok(ap.trimEnd().endsWith("Σημειώσεις πελάτη: Κουδούνι Παπά"), "οι σημειώσεις τελευταίες");
  assert.ok(rm({ address: { ...base.address, notes: "ν".repeat(5000) } }).length <= 2000);
});

test("τιμολόγιο: καρτέλα του πελάτη· χωρίς καρτέλα → ανοίγει στην αποστολή, δεν μπλοκάρει (και ποτέ λιανική)", () => {
  const inv = { ...base, invoice: { vatNumber: "EL 123456789", doy: "Α΄ Αθηνών", company: "ΑΒΓ ΑΕ", activity: "Εμπόριο" } };
  const linked = composeSaldoc({ ...inv, invoiceTrdr: "3405" }, S);
  assert.equal(linked.data.SALDOC[0].TRDR, 3405);
  assert.equal(linked.newCustomer, undefined);
  const d = composeSaldoc(inv, S);
  assert.equal(d.data.SALDOC[0].TRDR, null);
  assert.deepEqual(d.needs, []);
  assert.deepEqual({ afm: d.newCustomer?.afm, name: d.newCustomer?.name, doy: d.newCustomer?.doy, activity: d.newCustomer?.activity, order: d.newCustomer?.order }, { afm: "123456789", name: "ΑΒΓ ΑΕ", doy: "Α΄ Αθηνών", activity: "Εμπόριο", order: base.number });
  assert.ok(d.warnings.some((w) => w.includes("123456789")));
  // χωρίς επωνυμία ή με ΑΦΜ που δεν είναι 9 ψηφία δεν ανοίγει καρτέλα στα τυφλά: μένει «λείπει»
  for (const bad of [{ vatNumber: "123456789" }, { vatNumber: "DE123", company: "ACME GmbH" }]) {
    const b = composeSaldoc({ ...base, invoice: bad }, S);
    assert.equal(b.newCustomer, undefined);
    assert.equal(b.needs.length, 1);
  }
  assert.equal(d.data.MTRDOC[0].CCCSHPIRSDATA, "Α΄ Αθηνών");
});

test("εκπτώσεις χωρίς ΦΠΑ και κλείσιμο στρογγυλέματος με έκπτωση κεφαλίδας", () => {
  const o: SaldocOrder = { ...base, lines: [
    { erpCode: "1", title: "A", qty: 3, listPrice: 19.99, discPrice: 6, discCoupon: 2.5, discPayment: 0, vatRate: 24, promo: "CMP-1 v2" },
    { erpCode: "2", title: "B", qty: 2, listPrice: 7.49, discPrice: 0, discCoupon: 0.75, discPayment: 0, vatRate: 13 },
  ], shippingFee: 3.9, total: r(19.99 * 3 - 6 - 2.5 + 7.49 * 2 - 0.75 + 3.9) };
  const d = composeSaldoc(o, S);
  assert.ok(Math.abs(d.totals.gross - o.total) <= 0.011, `${d.totals.gross} vs ${o.total}`);
  assert.deepEqual(d.needs, []);
  assert.equal(d.data.ITELINES.length, 2);
  assert.equal(d.data.EXPANAL?.length, 1);
  assert.equal(d.data.ITELINES[0].COMMENTS, "CMP-1 v2");
});

test("δώρο: γραμμή με την αξία και έκπτωση ίση με αυτήν", () => {
  const o = { ...base, lines: [...base.lines, { erpCode: "9", title: "Δώρο", qty: 1, listPrice: 29.9, discPrice: 29.9, discCoupon: 0, discPayment: 0, vatRate: 24 }] };
  const d = composeSaldoc(o, S);
  const g = d.data.ITELINES[1];
  assert.equal(g.DISC1VAL, g.PRICE);
  assert.equal(d.totals.gross, 249.9);
});

test("παραλαβή από κατάστημα και θυρίδα", () => {
  const cc = composeSaldoc({ ...base, fulfilment: "click-collect", carrierName: null, store: { name: "Euronics Πειραιά", address: "Γρ. Λαμπράκη 1", zip: "18533", city: "Πειραιάς" } }, S);
  assert.match(String(cc.data.MTRDOC[0].CCCSHPADDRESS), /^Παραλαβή από κατάστημα Euronics Πειραιά/);
  assert.match(String(cc.data.SALDOC[0].COMMENTS), /Παραλαβή από κατάστημα Euronics Πειραιά/);
  const lk = composeSaldoc({ ...base, carrierName: "BOX NOW", locker: { name: "Σκλαβενίτης", address: "Οδός 1", zip: "11111" } }, S);
  assert.match(String(lk.data.MTRDOC[0].CCCSHPADDRESS), /^Θυρίδα BOX NOW: Σκλαβενίτης/);
});

test("μεταφορικά: επιβάρυνση «2 Μεταφορικά» (EXPANAL), όχι γραμμή είδους, και το σύνολο κλείνει", () => {
  const d = composeSaldoc({ ...base, shippingFee: 3.9, total: 253.8 }, S);
  assert.deepEqual(d.needs, []);
  assert.deepEqual(d.data.EXPANAL, [{ EXPN: 2, EXPVAL: 3.15 }]);
  assert.ok(d.data.ITELINES.every((l) => l.MTRL != null));
  assert.equal(d.totals.gross, 253.8);
  // χωρίς μεταφορικά ο πίνακας δεν στέλνεται καθόλου
  assert.equal(composeSaldoc(base, S).data.EXPANAL, undefined);
});

test("ένας συντελεστής: σύνολα από πολλά είδη κλείνουν ακριβώς", () => {
  for (const prices of [[19.99, 5.49, 3.9], [99.9, 0.5], [1299, 49.9, 12.99, 4.9], [7.77, 7.77, 7.77]]) {
    const o = { ...base, lines: prices.map((p, i) => ({ erpCode: String(i + 1), title: `x${i}`, qty: 1 + (i % 2), listPrice: p, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24 })) };
    o.total = r(o.lines.reduce((a, l) => a + l.listPrice * l.qty, 0));
    const d = composeSaldoc(o, S);
    assert.ok(Math.abs(d.totals.gross - o.total) <= 0.011, `${prices}: ${d.totals.gross} vs ${o.total}`);
    assert.deepEqual(d.needs, []);
  }
});

test("1 λεπτό που δεν κλείνει με τιμές: το σύνολο δίνεται ρητά (SUMAMNT) και ο ΦΠΑ είναι σύνολο − καθαρή", () => {
  // 89,00 € δεν προκύπτει από κανένα καθαρό ποσό δύο δεκαδικών στο 24 % (71,77 → 88,99 · 71,78 → 89,01)
  const one = (price: number, extra: Partial<SaldocOrder> = {}) => composeSaldoc({ ...base, total: price, lines: [{ ...base.lines[0], listPrice: price }], ...extra }, S);
  for (const price of [89, 399, 29.99, 17.9, 159]) {
    const d = one(price);
    assert.equal(d.data.SALDOC[0].SUMAMNT, price, String(price));
    assert.equal(d.totals.gross, price); assert.equal(r(d.totals.net + d.totals.vat), price);
    assert.deepEqual([d.needs, d.warnings], [[], []], String(price));
  }
  // ποσό που βγαίνει κανονικά: δεν στέλνεται σύνολο — ο υπολογισμός μένει του SoftOne
  for (const price of [249.9, 129, 499]) assert.ok(!("SUMAMNT" in one(price).data.SALDOC[0]), String(price));
  // δύο γραμμές (49,00 + 7,60 = 56,60)
  const two = composeSaldoc({ ...base, total: 56.6, lines: [{ ...base.lines[0], listPrice: 49 }, { ...base.lines[0], erpCode: "103682", listPrice: 7.6 }] }, S);
  assert.equal(two.data.SALDOC[0].SUMAMNT, 56.6); assert.equal(two.totals.gross, 56.6);
  // μεγαλύτερη διαφορά δεν σκεπάζεται: λείπει / δεν στέλνεται
  const bad = one(89, { total: 95 });
  assert.ok(!("SUMAMNT" in bad.data.SALDOC[0])); assert.ok(bad.needs.some((n) => n.includes("95.00")), bad.needs.join(" | "));
});

test("σύνολα: ΦΠΑ ανά συντελεστή, έκπτωση κεφαλίδας στον μεγαλύτερο", () => {
  assert.deepEqual(softoneTotals([{ rate: 24, net: 643.56 }], 0.01), { net: 643.55, vat: 154.45, gross: 798 });
});

const r = (n: number) => Math.round(n * 100) / 100;

test("σετ: κύριο με όλη την τιμή + μέλη με 0, όλα με SPCS (όπως το σημερινό eshop)", () => {
  const o: SaldocOrder = { ...base, total: 798, lines: [{ erpCode: "SET-594", title: "Κλιματιστικό TOYOTOMI", qty: 2, listPrice: 399, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24,
    setSpcs: 594, setParts: [{ mtrl: 142219, qty: 1, name: "TAN-09IG", main: true }, { mtrl: 142220, qty: 1, name: "TAG-09IG", main: false }] }] };
  const d = composeSaldoc(o, S);
  assert.equal(d.data.ITELINES.length, 2);
  assert.deepEqual([d.data.ITELINES[0].MTRL, d.data.ITELINES[0].QTY1, d.data.ITELINES[0].PRICE, d.data.ITELINES[0].SPCS], [142219, 2, 321.78, 594]);
  assert.deepEqual([d.data.ITELINES[1].MTRL, d.data.ITELINES[1].QTY1, d.data.ITELINES[1].PRICE, d.data.ITELINES[1].SPCS], [142220, 2, 0, 594]);
  assert.equal(d.totals.gross, 798);
  assert.deepEqual(d.needs, []);
});

test("σετ χωρίς στιγμιότυπο μελών → λείπει (δεν στέλνεται κωδικός SET-)", () => {
  const d = composeSaldoc({ ...base, lines: [{ erpCode: "SET-594", title: "Σετ", qty: 1, listPrice: 249.9, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24, setSpcs: 594 }] }, S);
  assert.ok(d.needs.some((n) => n.includes("μέλη")));
});

test("γραμμή SET- χωρίς setSpcs (π.χ. δώρο ή χωρίς ορισμό) → λείπει, ποτέ MTRL NaN/null σιωπηλά", () => {
  const d = composeSaldoc({ ...base, lines: [{ erpCode: "SET-594", title: "Σετ", qty: 1, listPrice: 249.9, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24 }] }, S);
  assert.ok(d.needs.some((n) => n.includes("μέλη")), d.needs.join(" | "));
  assert.ok(d.data.ITELINES.every((l) => l.MTRL === null || Number.isInteger(l.MTRL)));
});

test("γραμμή με μη αριθμητικό κωδικό είδους → λείπει «Κωδικός είδους SoftOne»", () => {
  const d = composeSaldoc({ ...base, lines: [{ erpCode: "ABC-1", title: "Κάτι", qty: 1, listPrice: 10, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24 }] }, S);
  assert.ok(d.needs.some((n) => n.includes("Κωδικός είδους")), d.needs.join(" | "));
});

test("αριθμός παραγγελίας στο SoftOne: NUM01 από τα ψηφία, αναζήτηση με σειρά + NUM01 (το FINCODE δεν το κρατά το SoftOne)", () => {
  assert.equal(orderNum01("EUR-20261123-9970"), 202611239970);
  assert.equal(orderNum01(" 8697 "), 8697);
  for (const bad of ["", "EUR-", "ΑΒΓ", "0000", "9".repeat(16)]) assert.equal(orderNum01(bad), null, bad);
  assert.equal(orderDocFilter("EUR-20261123-9970", null), "SOSOURCE=1351 AND SERIES=7005 AND NUM01=202611239970");
  assert.equal(orderDocFilter("EUR-20261123-9970", " 7049 "), "SOSOURCE=1351 AND SERIES=7049 AND NUM01=202611239970");
  // στο φίλτρο μπαίνουν μόνο αριθμοί: ό,τι άλλο έχει ο αριθμός παραγγελίας ή η σειρά δεν φτάνει στο SQL
  assert.equal(orderDocFilter("EU'1 OR 1=1", null), "SOSOURCE=1351 AND SERIES=7005 AND NUM01=111");
  assert.equal(orderDocFilter("EUR-1", "7005 OR 1=1"), null);
  assert.equal(orderDocFilter("χωρίς ψηφία", null), null);
  assert.ok(!("NUM01" in composeSaldoc({ ...base, number: "ΧΩΡΙΣ-ΑΡΙΘΜΟ" }, S).data.SALDOC[0]));
});

test("τιμολόγιο: Επωνυμία/ΑΦΜ/ΔΟΥ στο MTRDOC, ΑΦΜ μόνο ψηφία", () => {
  const d = composeSaldoc({ ...base, invoice: { vatNumber: "EL 094019245", doy: "ΦΑΕ ΠΕΙΡΑΙΑ", company: "ΔΟΚΙΜΗ Α.Ε." }, invoiceTrdr: "1234" }, S);
  const m = d.data.MTRDOC[0];
  assert.equal(m.CCCSHPAFM, "094019245");
  assert.equal(m.CCCSHPNAME, "ΔΟΚΙΜΗ Α.Ε.");
  assert.equal(m.CCCSHPIRSDATA, "ΦΑΕ ΠΕΙΡΑΙΑ");
  assert.equal(d.data.SALDOC[0].COMMENTS1, "Μαρία Παπά"); // ο αγοραστής δεν χάνεται
  assert.deepEqual(d.needs, []);
});

test("απόδειξη: κανένα ΑΦΜ στο παραστατικό, Επωνυμία = ο αγοραστής", () => {
  const m = composeSaldoc(base, S).data.MTRDOC[0];
  assert.ok(!("CCCSHPAFM" in m), "δεν στέλνεται ΑΦΜ σε απόδειξη");
  assert.equal(m.CCCSHPNAME, "Μαρία Παπά");
});

test("μήκη πεδίων MTRDOC: ποτέ πάνω από τα όρια του SoftOne", () => {
  const long = "Χ".repeat(300);
  const d = composeSaldoc({ ...base, contact: { firstName: long, lastName: long, phone: "6900000000" },
    address: { street: long, number: "1", zip: "10563", city: long, region: long },
    invoice: { vatNumber: "094019245", doy: long, company: long } }, S);
  const m = d.data.MTRDOC[0];
  const max: Record<string, number> = { CCCSHPNAME: 128, CCCSHPAFM: 30, CCCSHPIRSDATA: 64, CCCSHPPHONE: 64, CCCSHPADDRESS: 128, SHIPPINGADDR: 255 };
  for (const [k, n] of Object.entries(max)) assert.ok(String(m[k] ?? "").length <= n, `${k}: ${String(m[k] ?? "").length} > ${n}`);
});

test("κάθε γραμμή έχει LINENUM από 9000001, με τη σειρά (αλλιώς το SoftOne μπερδεύει τις γραμμές όταν ανοίγει μόνο του ένα σετ)", () => {
  const d = composeSaldoc({ ...base, lines: [1, 2, 3].map((i) => ({ erpCode: String(i), title: `x${i}`, qty: 1, listPrice: 10, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24 })), total: 30 }, S);
  assert.deepEqual(d.data.ITELINES.map((l) => l.LINENUM), [9000001, 9000002, 9000003]);
});

test("αριθμός παραστατικού όπως φαίνεται στο SoftOne: κωδικός + αύξων της σειράς, όχι το FINDOC", () => {
  assert.equal(erpDocNo("PES", "83"), "PES 83"); // σειρά 7005: το FINCODE είναι σκέτο «PES» σε όλα
  assert.equal(erpDocNo("ΑΠΛ0000083", "83"), "ΑΠΛ0000083"); // ο αύξων είναι ήδη μέσα
  assert.equal(erpDocNo("PES", null), "PES");
  assert.equal(erpDocNo("", 83), "83");
  assert.equal(erpDocNo(undefined, undefined), null);
});
