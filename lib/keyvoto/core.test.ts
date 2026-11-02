import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl, catalogueOptions, galleryFileUrl, heroImagePath, documentFields, publisherOptions, flattenDocument, sharedContentQuery, tokenExpiry, tokenForm } from "./core";

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

test("publisherOptions: ο κωδικός του εκδότη είναι το «id» — όχι κενός", () => {
  // Πραγματική απάντηση του Keyvoto (/sharedContent/publishers)
  const out = publisherOptions([{ id: "BusinessAccount-4b69f48f", title: "Inventor", image: "x.webp", email: "a@b.gr" }]);
  assert.deepEqual(out, [{ id: "BusinessAccount-4b69f48f", title: "Inventor" }]);
});

test("publisherOptions: εκδότης χωρίς id παραλείπεται — δεν γίνεται επιλογή που δεν σώζεται", () => {
  assert.deepEqual(publisherOptions([{ title: "Χωρίς κωδικό" }, { id: "  ", title: "Κενό" }]), []);
});

test("publisherOptions: χωρίς τίτλο δείχνει τον κωδικό", () => {
  assert.deepEqual(publisherOptions([{ id: "BA-1" }]), [{ id: "BA-1", title: "BA-1" }]);
});

test("catalogueOptions: κωδικός, όνομα και ο εκδότης του", () => {
  const out = catalogueOptions([{ id: "CatalogueV2-9bc8", name: "Catalogue Inventor x Euronics", publisher: "BusinessAccount-4b69f48f", products: 124 }]);
  assert.deepEqual(out, [{ id: "CatalogueV2-9bc8", name: "Catalogue Inventor x Euronics", publisher: "BusinessAccount-4b69f48f", products: 124 }]);
});

test("catalogueOptions: διαγραμμένος κατάλογος ή χωρίς id δεν εμφανίζεται", () => {
  const out = catalogueOptions([{ id: "C-1", name: "Παλιός", publisher: "BA-1", isDeleted: true }, { name: "Χωρίς κωδικό", publisher: "BA-1" }]);
  assert.deepEqual(out, []);
});

test("galleryFileUrl: ΟΛΗ η διαδρομή είναι ΕΝΑ τμήμα — η κάθετος κωδικοποιείται", () => {
  // Δοκιμασμένο ζωντανά: με σκέτη κάθετο το Keyvoto γυρίζει 404· με %2F γυρίζει την εικόνα.
  assert.equal(
    galleryFileUrl("https://gallery-api.keyvoto.com", "BusinessAccount-4b69/01_Sera_white-6a97.png"),
    "https://gallery-api.keyvoto.com/v1/files/BusinessAccount-4b69%2F01_Sera_white-6a97.png",
  );
});

test("galleryFileUrl: το πλάτος μπαίνει ως παράμετρος", () => {
  assert.equal(galleryFileUrl("https://g.keyvoto.com/", "a/b.png", 1600), "https://g.keyvoto.com/v1/files/a%2Fb.png?width=1600");
});

test("galleryFileUrl: κενή διαδρομή δεν δίνει διεύθυνση", () => {
  assert.equal(galleryFileUrl("https://g.keyvoto.com", "   "), "");
});

test("galleryFileUrl: ό,τι είναι ήδη διεύθυνση μένει ως έχει", () => {
  assert.equal(galleryFileUrl("https://g.keyvoto.com", "https://cdn.inventor.gr/a.png"), "https://cdn.inventor.gr/a.png");
});

test("heroImagePath: η κύρια φωτογραφία είναι η σημασμένη «Hero Image»", () => {
  const doc = { media: { images: [
    { path: "BA/02_plain.png", mimeType: "image/png" },
    { path: "BA/01_hero.png", mimeType: "image/png", viewAttributes: ["Hero Image"] },
  ] } };
  assert.equal(heroImagePath(doc), "BA/01_hero.png");
});

test("heroImagePath: χωρίς σήμανση παίρνει την πρώτη εικόνα — όχι το pdf", () => {
  const doc = { media: { documents: [{ path: "BA/manual.pdf" }], images: [{ path: "BA/a.png" }, { path: "BA/b.png" }] } };
  assert.equal(heroImagePath(doc), "BA/a.png");
});

test("heroImagePath: έγγραφο χωρίς εικόνες δίνει κενό", () => {
  assert.equal(heroImagePath({ main: { Χρώμα: "Λευκό" } }), "");
  assert.equal(heroImagePath(null), "");
});
