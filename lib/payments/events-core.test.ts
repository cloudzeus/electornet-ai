import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptsOf, cardText, failureRows, payTimeline, payTrouble, reasonCounts, reasonOf, spikeOf, type PayEvent } from "./events-core";

const T = (m: number) => new Date(Date.UTC(2026, 10, 24, 12, m));
const NOW = +T(240);
const ev = (m: number, kind: string, o: Partial<PayEvent> = {}): PayEvent => ({ at: T(m), kind, source: "return", ...o });

test("κωδικός Viva → αιτία σε απλά ελληνικά· άγνωστος κωδικός δείχνει τον αριθμό", () => {
  assert.equal(reasonOf(10051).key, "funds");
  assert.equal(reasonOf(2062).key, "sca-wrong");
  assert.equal(reasonOf(null).key, "unknown");
  assert.equal(reasonOf(0).key, "unknown");
  assert.match(reasonOf(99999).label, /99999/);
});

test("δύο απορρίψεις και μία αποχώρηση: τρεις προσπάθειες, καμία δεν πέρασε", () => {
  const events = [
    ev(0, "started", { source: "checkout", method: "card", pspOrder: "A" }),
    ev(3, "failed", { pspOrder: "A", txId: "t1", eventId: 10051 }),
    ev(5, "started", { source: "retry", method: "card", pspOrder: "B" }),
    ev(7, "failed", { pspOrder: "B", txId: "t2", eventId: 10051 }),
    ev(60, "started", { source: "retry", method: "iris", pspOrder: "C" }),
  ];
  assert.deepEqual(attemptsOf(events, NOW).map((a) => a.outcome), ["failed", "failed", "abandoned"]);
  const t = payTrouble(events, NOW)!;
  assert.deepEqual([t.attempts, t.missed, t.reason.key], [3, 3, "abandoned"]);
  assert.equal(+t.lastAt, +T(90));
  const rows = payTimeline(events, (m) => m ?? "", NOW);
  assert.deepEqual(rows.map((r) => r.icon), ["open", "x", "retry", "x", "retry", "left"]);
});

test("ανοιχτή προσπάθεια κάτω από 30′ δεν μετρά ως αποχώρηση· πληρωμένη δεν είναι πρόβλημα", () => {
  assert.equal(payTrouble([ev(230, "started", { pspOrder: "A" })], NOW), null);
  assert.equal(payTrouble([ev(0, "started", { pspOrder: "A" }), ev(2, "paid", { pspOrder: "A", txId: "t" })], NOW), null);
});

test("πολλές κάρτες στο ίδιο payment order: μία προσπάθεια, μετρά η τελευταία αιτία· η ίδια συναλλαγή από επιστροφή και webhook φαίνεται μία φορά", () => {
  const events = [
    ev(0, "started", { pspOrder: "A" }),
    ev(2, "failed", { pspOrder: "A", txId: "t1", eventId: 10054 }),
    ev(2, "failed", { pspOrder: "A", txId: "t1", eventId: 10054, source: "webhook" }),
    ev(4, "failed", { pspOrder: "A", txId: "t2", eventId: 10005 }),
  ];
  const [a] = attemptsOf(events, NOW);
  assert.equal(a.reason?.key, "declined");
  assert.equal(payTimeline(events, () => "Κάρτα", NOW).filter((r) => r.icon === "x").length, 2);
});

test("αποτέλεσμα χωρίς «started» (παραγγελία πριν από την καταγραφή) γίνεται δική του προσπάθεια", () => {
  assert.deepEqual(attemptsOf([ev(1, "failed", { pspOrder: "Z", eventId: 2061 })], NOW).map((a) => [a.outcome, a.reason?.key]), [["failed", "sca-left"]]);
});

test("σελίδα: μόνο οι παραγγελίες με χαμένη προσπάθεια, με τελικό αποτέλεσμα και αιτίες που αθροίζουν στις γραμμές", () => {
  const order = (n: string, status: string, payStatus: string, events: PayEvent[]) => ({ id: n, number: n, total: 100, status, payStatus, payMethod: "card", events });
  const fail = [ev(0, "started", { pspOrder: "A" }), ev(1, "failed", { pspOrder: "A", eventId: 10051 })];
  const { tried, rows } = failureRows([
    order("1", "pending", "failed", fail),
    order("2", "paid", "paid", [...fail, ev(9, "started", { pspOrder: "B" }), ev(10, "paid", { pspOrder: "B" })]),
    order("3", "paid", "paid", [ev(0, "started", { pspOrder: "A" }), ev(1, "paid", { pspOrder: "A" })]),
    order("4", "cancelled", "cancelled", [ev(0, "started", { pspOrder: "A" })]),
  ], NOW);
  assert.equal(tried, 4);
  assert.deepEqual(rows.map((r) => [r.number, r.outcome]).sort(), [["1", "unpaid"], ["2", "paid"], ["4", "cancelled"]]);
  assert.deepEqual(reasonCounts(rows), [{ key: "funds", label: "Ανεπαρκές υπόλοιπο", count: 2 }, { key: "abandoned", label: "Έφυγε χωρίς να πληρώσει", count: 1 }]);
});

test("ειδοποίηση μόνο όταν μαζευτούν 5 ίδιες απορρίψεις μέσα σε μία ώρα", () => {
  const five = [200, 205, 210, 220, 235].map((m) => ev(m, "failed", { eventId: 2062 }));
  assert.equal(spikeOf(five.slice(1), NOW), null);
  assert.deepEqual([spikeOf(five, NOW)?.reason.key, spikeOf(five, NOW)?.count], ["sca-wrong", 5]);
  assert.equal(spikeOf(five.map((e) => ({ ...e, at: T(10) })), NOW), null);
});

test("κάρτα: μόνο τα 4 τελευταία ψηφία", () => {
  assert.equal(cardText("414746XXXXXX4821", "Eurobank"), "•••• 4821 · Eurobank");
  assert.equal(cardText(null, null), null);
});
