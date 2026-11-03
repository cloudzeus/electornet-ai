import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAsapWebhook, webhookKeyOk } from "./webhook";

test("κλειδί webhook: ίδιο → ναι· διαφορετικό, κενό ή χωρίς ρύθμιση → όχι", () => {
  assert.equal(webhookKeyOk("s3cret-key", "s3cret-key"), true);
  assert.equal(webhookKeyOk("s3cret-key", "s3cret-kez"), false);
  assert.equal(webhookKeyOk("s3cret-key", "s3cret"), false);
  assert.equal(webhookKeyOk("", ""), false);
  assert.equal(webhookKeyOk(null, "x"), false);
});

test("διαδρομή: σύνδεσμος + εκτιμώμενη άφιξη ανά δέμα, όπως στα docs (items.routes[].route_items[])", () => {
  const r = parseAsapWebhook({ items: { routes: [{ route_id: "9", driver_name: "Νίκος", route_items: [
    { stop_point_id: 1, barcode: "ASP000123", client_portal_url: "https://track.lastmily.com/p/abc", is_live_tracking_available: true, estimated_arrival_time: "2026-11-04T14:30:00+02:00" },
    { stop_point_id: 2, barcode: "ASP000124", client_portal_url: "https://track.lastmily.com/p/def", is_live_tracking_available: false, estimated_arrival_time: "" },
  ] }] } });
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { kind: "route", barcodes: ["ASP000123"], liveUrl: "https://track.lastmily.com/p/abc", eta: new Date("2026-11-04T12:30:00Z") });
  // χωρίς live tracking: δεν δείχνουμε σύνδεσμο· κενή ώρα = καμία
  assert.deepEqual(r[1], { kind: "route", barcodes: ["ASP000124"], liveUrl: null, eta: null });
});

test("διαδρομή: μόνο https σύνδεσμοι", () => {
  const [x] = parseAsapWebhook({ routes: [{ route_items: [{ barcode: "B1", client_portal_url: "javascript:alert(1)" }] }] });
  assert.equal(x.kind === "route" && x.liveUrl, null);
  const [y] = parseAsapWebhook({ routes: [{ route_items: [{ barcode: "B1", client_portal_url: "http://x.gr/a" }] }] });
  assert.equal(y.kind === "route" && y.liveUrl, null);
});

test("αλλαγή κατάστασης: reason → κατάσταση, κίνηση με περιγραφή και ώρα· όλοι οι κωδικοί για ταίριασμα", () => {
  const [e] = parseAsapWebhook({ reason: 700, date_time: "2026-11-04T15:02:00+02:00", fulfillment_event_description: "Παραδόθηκε", barcode: "P-1", voucher_barcode: "ASP000123" });
  assert.deepEqual(e, { kind: "status", barcodes: ["P-1", "ASP000123"], state: "delivered", checkpoint: { code: "700", text: "Παραδόθηκε", at: "2026-11-04T15:02:00+02:00", shop: null } });
  // σε πίνακα ή μέσα σε items
  assert.equal(parseAsapWebhook([{ reason: 400, barcode: "A" }, { reason: 801, barcode: "B" }]).length, 2);
  const [w] = parseAsapWebhook({ items: { reason: 400, barcode: "A" } });
  assert.equal(w.kind === "status" && w.state, "out-for-delivery");
});

test("άκυρα ή άσχετα μηνύματα → τίποτα", () => {
  assert.deepEqual(parseAsapWebhook(null), []);
  assert.deepEqual(parseAsapWebhook("x"), []);
  assert.deepEqual(parseAsapWebhook({ reason: 700 }), []); // χωρίς κωδικό αποστολής
  assert.deepEqual(parseAsapWebhook({ foo: 1 }), []);
});
