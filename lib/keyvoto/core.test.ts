import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl, documentFields, flattenDocument, sharedContentQuery, tokenExpiry, tokenForm } from "./core";

test("tokenForm: το σώμα του OAuth client credentials", () => {
  const body = tokenForm({ grantType: "client_credentials", clientId: "company-1", clientSecret: "s3cr3t", scope: "keyvoto-core-services" });
  assert.equal(body, "grant_type=client_credentials&client_id=company-1&client_secret=s3cr3t&scope=keyvoto-core-services");
});

test("tokenForm: χωρίς scope δεν στέλνεται άδειο πεδίο", () => {
  assert.equal(tokenForm({ grantType: "client_credentials", clientId: "a", clientSecret: "b", scope: "" }), "grant_type=client_credentials&client_id=a&client_secret=b");
});

test("tokenExpiry: το token λήγει λίγο νωρίτερα απ' ό,τι λέει ο server", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  assert.deepEqual(tokenExpiry(now, 86399), new Date("2026-11-03T09:58:59Z")); // 86.399΄΄ − 60΄΄ περιθώριο
  // πολύ μικρό ή άκυρο expires_in: τουλάχιστον ένα λεπτό ζωής
  assert.deepEqual(tokenExpiry(now, 10), new Date("2026-11-02T10:01:00Z"));
  assert.deepEqual(tokenExpiry(now, 0), new Date("2026-11-02T10:01:00Z"));
});

test("sharedContentQuery: μόνο ό,τι δόθηκε, οι λίστες με κόμμα", () => {
  const q = sharedContentQuery({ page: 2, pageSize: 50, gtinCodes: ["5201", "5202"], contentTypes: ["Product"], updatedAfter: "2026-10-01" });
  assert.equal(q, "includeDocument=true&page=2&pageSize=50&contentTypes=Product&gtinCodes=5201%2C5202&effectiveUpdatedAfter=2026-10-01");
});

test("sharedContentQuery: χωρίς έγγραφο όταν ζητηθεί σύνοψη", () => {
  assert.equal(sharedContentQuery({ includeDocument: false, pageSize: 1 }), "includeDocument=false&page=1&pageSize=1");
});

test("flattenDocument: το φωλιασμένο έγγραφο γίνεται ζεύγη διαδρομή → τιμή", () => {
  const doc = { name: "Ψυγείο", main: { color: "Λευκό", energy: null }, images: [{ path: "a.png" }, { path: "b.png" }], gtins: ["5201", "5202"], active: true, score: 4.5 };
  assert.deepEqual(flattenDocument(doc), [
    ["name", "Ψυγείο"], ["main.color", "Λευκό"],
    ["images[0].path", "a.png"], ["images[1].path", "b.png"],
    ["gtins[0]", "5201"], ["gtins[1]", "5202"],
    ["active", "true"], ["score", "4.5"],
  ]);
});

test("flattenDocument: κενό έγγραφο δεν σκάει", () => {
  assert.deepEqual(flattenDocument(null), []);
  assert.deepEqual(flattenDocument({ a: {}, b: [] }), []);
});

test("documentFields: τα πεδία όλων των προϊόντων με κάλυψη και δείγματα", () => {
  const out = documentFields([{ name: "A", main: { color: "Λευκό" } }, { name: "B" }, { name: "C", main: { color: "Μαύρο" } }]);
  assert.deepEqual(out, [
    { path: "name", n: 3, samples: ["A", "B", "C"] },
    { path: "main.color", n: 2, samples: ["Λευκό", "Μαύρο"] },
  ]);
});

test("documentFields: οι δείκτες των πινάκων ενώνονται σε ένα πεδίο", () => {
  const out = documentFields([{ images: [{ path: "a.png" }, { path: "b.png" }] }]);
  assert.deepEqual(out, [{ path: "images[].path", n: 1, samples: ["a.png", "b.png"] }]);
});

test("apiUrl: ενώνει χωρίς διπλές καθέτους", () => {
  assert.equal(apiUrl("https://core-api.keyvoto.com/", "/v1.1-alpha/x/sharedContent"), "https://core-api.keyvoto.com/v1.1-alpha/x/sharedContent");
  assert.equal(apiUrl("https://core-api.keyvoto.com", "v1.1-alpha/x"), "https://core-api.keyvoto.com/v1.1-alpha/x");
});
