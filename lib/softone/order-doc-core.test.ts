import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSaldoc, softoneTotals, type SaldocOrder, type SaldocSettings } from "./order-doc-core";

const S: SaldocSettings = { series: "7005", retailTrdr: "200", payment: {}, shippingMtrl: "99001" };
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

test("κεφαλίδα: σειρά, λιανική 200, αριθμός στο FINCODE, πληρωμή, ονοματεπώνυμο, email στις παρατηρήσεις", () => {
  const h = composeSaldoc(base, S).data.SALDOC[0];
  assert.equal(h.SERIES, 7005); assert.equal(h.TRDR, 200); assert.equal(h.FINCODE, "EUR-20261016-0007"); assert.equal(h.PAYMENT, 1001);
  assert.equal(h.COMMENTS1, "Μαρία Παπά");
  assert.match(String(h.COMMENTS), /e-shop EUR-20261016-0007 · Courier ACS · Κάρτα/);
  assert.match(String(h.REMARKS), /Email: a@b\.gr/);
});

test("MTRDOC: διεύθυνση αποστολής και CCCSHP*", () => {
  const m = composeSaldoc(base, S).data.MTRDOC[0];
  assert.equal(m.SHIPPINGADDR, "Ερμού 10"); assert.equal(m.SHPZIP, "10563"); assert.equal(m.SHPCITY, "Αθήνα"); assert.equal(m.SHPDISTRICT, "Αττική");
  assert.equal(m.CCCSHPNAME, "Μαρία Παπά"); assert.equal(m.CCCSHPPHONE, "6900000000"); assert.equal(m.CCCSHPADDRESS, "Ερμού 10, 10563 Αθήνα");
});

test("πληρωμές: προεπιλεγμένοι κωδικοί, υπερισχύει η ρύθμιση, άγνωστος τρόπος → λείπει", () => {
  assert.equal(composeSaldoc({ ...base, payment: "no-card" }, S).data.SALDOC[0].PAYMENT, 1004);
  assert.equal(composeSaldoc({ ...base, payment: "cod" }, S).data.SALDOC[0].PAYMENT, 1000);
  assert.equal(composeSaldoc({ ...base, payment: "iris" }, { ...S, payment: { iris: "1005" } }).data.SALDOC[0].PAYMENT, 1005);
  const d = composeSaldoc({ ...base, payment: "klarna" }, S);
  assert.equal(d.data.SALDOC[0].PAYMENT, null);
  assert.ok(d.needs.some((n) => n.includes("Klarna")));
});

test("τιμολόγιο: καρτέλα του πελάτη· χωρίς καρτέλα → λείπει (όχι λιανική)", () => {
  const inv = { ...base, invoice: { vatNumber: "123456789", doy: "Α΄ Αθηνών", company: "ΑΒΓ ΑΕ" } };
  assert.equal(composeSaldoc({ ...inv, invoiceTrdr: "3405" }, S).data.SALDOC[0].TRDR, 3405);
  const d = composeSaldoc(inv, S);
  assert.equal(d.data.SALDOC[0].TRDR, null);
  assert.ok(d.needs.some((n) => n.includes("123456789")));
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
  assert.equal(d.data.ITELINES.length, 3);
  assert.equal(d.data.ITELINES[2].MTRL, 99001);
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

test("μεταφορικά χωρίς είδος στη ρύθμιση → λείπει", () => {
  const d = composeSaldoc({ ...base, shippingFee: 3.9, total: 253.8 }, { ...S, shippingMtrl: null });
  assert.ok(d.needs.some((n) => n.includes("μεταφορικά")));
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

test("σύνολα: ΦΠΑ ανά συντελεστή, έκπτωση κεφαλίδας στον μεγαλύτερο", () => {
  assert.deepEqual(softoneTotals([{ rate: 24, net: 643.56 }], 0.01), { net: 643.55, vat: 154.45, gross: 798 });
});

const r = (n: number) => Math.round(n * 100) / 100;
