import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCall, redact, isErrorResponse, isSessionExpired, storedResponse, errorSignature, errorMail, HEAD_MAX, type S1Entry } from "./log-core";

test("είδος κλήσης: υπηρεσία, αντικείμενο, κλειδί, εγγραφή ή ανάγνωση", () => {
  assert.deepEqual(describeCall({ service: "setData", OBJECT: "SALDOC", KEY: "" }), { service: "setData", object: "SALDOC", key: null, write: true, full: true });
  assert.deepEqual(describeCall({ service: "getData", object: "SALDOC", key: "5686678" }), { service: "getData", object: "SALDOC", key: "5686678", write: false, full: false });
  assert.deepEqual(describeCall({ service: "GetTable", TABLE: "FINDOC" }), { service: "GetTable", object: "FINDOC", key: null, write: false, full: false });
  assert.equal(describeCall({ service: "calculate", OBJECT: "SALDOC" }).full, true); // υπολογισμός: δεν γράφει, αλλά κρατιέται ολόκληρος
  assert.deepEqual(describeCall({ SERVICE: "Login" }), { service: "Login", object: null, key: null, write: false, full: false });
  assert.deepEqual(describeCall({ MTRL: 158997 }, "/JS/iSite/setItemSpecs"), { service: "iSite/setItemSpecs", object: "158997", key: null, write: true, full: true });
  assert.equal(describeCall({}, "/JS/iSite/getItemSpecs").write, false);
});

test("το αίτημα κρατιέται χωρίς κωδικό και χωρίς clientID", () => {
  assert.deepEqual(redact({ SERVICE: "Login", USERNAME: "web", PASSWORD: "secret" }), { SERVICE: "Login", USERNAME: "web", PASSWORD: "***" });
  assert.deepEqual(redact({ service: "getData", clientID: "9J8pHczKL4abcdWXYZ" }), { service: "getData", clientID: "…WXYZ" });
});

test("σφάλμα = success:false, όχι η λήξη σύνδεσης (-100/-101) που ξανασυνδέεται μόνη της", () => {
  assert.equal(isErrorResponse({ success: false, errorcode: 0, error: "Λάθος τιμή" }), true);
  assert.equal(isErrorResponse({ success: false, errorcode: -101 }), false);
  assert.equal(isSessionExpired({ success: false, errorcode: -100 }), true);
  assert.equal(isErrorResponse({ success: true }), false);
  assert.equal(isErrorResponse([{ MTRL: 1 }]), false); // το iSite γυρίζει και σκέτους πίνακες
});

test("απάντηση: ολόκληρη σε εγγραφές και σφάλματα, η αρχή της στις αναγνώσεις", () => {
  const big = "x".repeat(10_000);
  assert.equal(storedResponse(big, true).length, 10_000);
  assert.equal(storedResponse(big, false).length, HEAD_MAX);
});

const entry: S1Entry = { at: "2026-11-26T10:16:03.000Z", service: "setData", object: "SALDOC", key: null, write: true, full: true, ok: false, errorCode: 0, error: "Το είδος 141700 δεν έχει υπόλοιπο", http: 200, ms: 840, source: "Αποστολή παραγγελίας EUR-20261126-8883", request: { service: "setData", OBJECT: "SALDOC", data: { SALDOC: [{ SERIES: 7005 }] } }, response: '{"success":false,"error":"Το είδος 141700 δεν έχει υπόλοιπο <1000>"}', bytes: 68 };

test("ίδιο σφάλμα με άλλους αριθμούς = ίδια υπογραφή (δεν ξαναστέλνεται αμέσως)", () => {
  assert.equal(errorSignature(entry), errorSignature({ ...entry, error: "Το είδος 99 δεν έχει υπόλοιπο" }));
  assert.notEqual(errorSignature(entry), errorSignature({ ...entry, service: "getData" }));
});

test("email σφάλματος: θέμα, όλα τα στοιχεία, ολόκληρο αίτημα και απάντηση, ασφαλές HTML", () => {
  const m = errorMail(entry, { env: "παραγωγή", logUrl: "https://example.test/admin/softone/log?id=1" });
  assert.match(m.subject, /^Σφάλμα SoftOne: setData SALDOC · Το είδος 141700/);
  for (const x of ["Αποστολή παραγγελίας EUR-20261126-8883", "840 ms", "παραγωγή", "\"SERIES\": 7005", "https://example.test/admin/softone/log?id=1"]) assert.ok(m.text.includes(x), x);
  assert.ok(m.html.includes("&lt;1000&gt;") && !m.html.includes("<1000>"));
});
