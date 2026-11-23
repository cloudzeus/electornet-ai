import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_SEO, DEFAULT_DESCRIPTION, DEFAULT_TITLE, brandMeta, categoryMeta, homeJsonLd, infoMeta } from "./pages";

const t = (m: { title?: unknown }) => String(m.title), d = (m: { description?: unknown }) => String(m.description);

test("κατηγορία: ίδιο όνομα σε δύο επίπεδα μετρά μία φορά, η γονική μόνο όταν χωράει", () => {
  const dup = categoryMeta([{ name: "Κλιματισμός & Θέρμανση", slug: "a" }, { name: "Ιονιστές - Υγραντήρες - Καθαριστές Αέρα", slug: "b" }, { name: "Ιονιστές - Υγραντήρες - Καθαριστές Αέρα", slug: "c" }]);
  assert.equal((t(dup).match(/Ιονιστές/g) ?? []).length, 1);
  assert.deepEqual(dup.alternates, { canonical: "/k/a/b/c" });
  assert.equal(t(categoryMeta([{ name: "Τηλεοράσεις", slug: "tv" }])), "Τηλεοράσεις – τιμές & προσφορές");
  assert.equal(t(categoryMeta([{ name: "Εικόνα & Ήχος", slug: "x" }, { name: "Τηλεοράσεις", slug: "tv" }])), "Τηλεοράσεις – τιμές & προσφορές · Εικόνα & Ήχος");
  assert.match(d(categoryMeta([{ name: "Εικόνα & Ήχος", slug: "x" }, { name: "Τηλεοράσεις", slug: "tv" }])), /^Τηλεοράσεις \(Εικόνα & Ήχος\) στη Euronics: τιμές, προσφορές/);
});

test("μήκη: τίτλος ως 60 χαρακτήρες με το « · euronics», περιγραφή ως 160", () => {
  const long = "Πολύ μεγάλο όνομα κατηγορίας με αρκετές λέξεις για να ξεπεράσει κάθε όριο τίτλου";
  for (const m of [categoryMeta([{ name: long, slug: "l" }]), categoryMeta([{ name: long, slug: "p" }, { name: "Ψυγεία", slug: "l" }]), brandMeta(long), brandMeta("LG"), infoMeta({ title: "Όροι χρήσης" }), infoMeta({ title: "Α", intro: "ε".repeat(400) })]) {
    assert.ok(`${t(m)} · euronics`.length <= 60, `τίτλος ${t(m).length}: ${t(m)}`);
    assert.ok(d(m).length <= 160 && d(m).length >= 50, `περιγραφή ${d(m).length}`);
  }
  assert.ok(DEFAULT_TITLE.length <= 60 && DEFAULT_DESCRIPTION.length <= 160, `${DEFAULT_TITLE.length} / ${DEFAULT_DESCRIPTION.length}`);
});

test("πληροφοριακή σελίδα: η εισαγωγή του CMS όταν υπάρχει, αλλιώς περιγραφή με τον τίτλο — ποτέ κενή", () => {
  assert.equal(d(infoMeta({ title: "Τρόποι αποστολής", intro: " Δική μας εισαγωγή. " })), "Δική μας εισαγωγή.");
  assert.match(d(infoMeta({ title: "Όροι χρήσης", intro: "" })), /^Όροι χρήσης: /);
});

test("κοινά meta: canonical και og:url ως προς τη σελίδα, εικόνα με διαστάσεις, δομημένα δεδομένα αρχικής", () => {
  assert.deepEqual(BASE_SEO.alternates, { canonical: "./" });
  const og = BASE_SEO.openGraph as { url: string; images: { width: number; height: number }[]; siteName: string; locale: string };
  assert.equal(og.url, "./"); assert.equal(og.siteName, "Euronics"); assert.equal(og.locale, "el_GR");
  assert.deepEqual([og.images[0].width, og.images[0].height], [1200, 630]);
  const g = homeJsonLd(["https://www.facebook.com/euronicsgreece"])["@graph"];
  assert.deepEqual(g.map((x) => x["@type"]), ["Organization", "WebSite"]);
  assert.equal((g[1] as { publisher: { "@id": string } }).publisher["@id"], g[0]["@id"]);
});
