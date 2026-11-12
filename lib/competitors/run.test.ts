import { test } from "node:test";
import assert from "node:assert/strict";
import { decideGone, decidePrice, ourPrice, runWindow, isOddResponse, searchPrev, type Prev } from "./run-core";

const prev = (o: Partial<Prev> = {}): Prev => ({ match: "auto", extUrl: "tv/123-x", missCount: 0, their: 100, ourPrice: 110, ...o });
const ok = (o: object = {}) => ({ title: "t", list: 120, offer: 100, buyable: true, ean: "5901234123457", ...o });
const run = (p: Partial<Prev>, parsed: object, ourEan: string | null = "5901234123457", base: "auto" | "suggested" = "auto", ours = 110) =>
  decidePrice({ prev: prev(p), base, note: "διαφέρει κατάληξη: xx", parsed: parsed as any, ourEan, ourPrice: ours });

test("ίδιο EAN αναβαθμίζει suggested σε auto", () => {
  const d = run({ match: "suggested" }, ok(), "5901234123457", "suggested");
  assert.equal(d.match, "auto"); assert.equal(d.lastError, null);
});
test("διαφορετικό EAN: auto → suggested με μήνυμα, ποτέ απόρριψη", () => {
  const d = run({ match: "auto" }, ok({ ean: "5909999999999" }));
  assert.equal(d.match, "suggested"); assert.match(d.lastError!, /διαφορετικό EAN/); assert.ok(d.prices);
  assert.ok(!("rejectedAdd" in d));
});
test("διαφορετικό EAN σε suggested μένει suggested", () => {
  assert.equal(run({ match: "suggested" }, ok({ ean: "5909999999999" }), "5901234123457", "suggested").match, "suggested");
});
test("διαφορετικό EAN σε manual: μένει manual, lastError, αλλά οι τιμές ενημερώνονται", () => {
  const d = run({ match: "manual", missCount: 1 }, ok({ ean: "5909999999999", offer: 90 }));
  assert.equal(d.match, "manual"); assert.match(d.lastError!, /διαφορετικό EAN/);
  assert.equal(d.prices!.their, 90); assert.equal(d.missCount, 0); assert.equal(d.available, true); assert.equal(d.history, true);
});
test("available ακολουθεί το buyable, οι τιμές μένουν", () => {
  const d = run({}, ok({ buyable: false })); assert.equal(d.available, false); assert.ok(d.prices);
});
test("παράθυρο σε ώρα Αθήνας (UTC server)", () => {
  const w = runWindow("cron", new Date("2026-11-11T23:00:00Z")); // 01:00 Αθήνα, χειμώνας
  assert.equal(w.idle, null); assert.equal(w.until.toISOString(), "2026-11-12T04:00:00.000Z");
  const s = runWindow("cron", new Date("2026-07-11T22:00:00Z")); // 01:00 Αθήνα, καλοκαίρι
  assert.equal(s.idle, null); assert.equal(s.until.toISOString(), "2026-07-12T03:00:00.000Z");
  assert.ok(runWindow("cron", new Date("2026-11-11T22:30:00Z")).idle); // 00:30 Αθήνα
  assert.ok(runWindow("cron", new Date("2026-11-12T05:00:00Z")).idle); // 07:00 Αθήνα
  assert.equal(runWindow("manual", new Date("2026-11-12T10:00:00Z")).idle, null);
});
test("Ruling 9: μετρούν μόνο περίεργες απαντήσεις", () => {
  assert.ok(isOddResponse("redirect") && isOddResponse("η απάντηση δεν ήταν JSON") && isOddResponse("άδεια απάντηση"));
  assert.ok(!isOddResponse("HTTP 0") && !isOddResponse("HTTP 502") && !isOddResponse("δεν βρέθηκε (404)"));
});
test("EAN που λείπει → κανόνας μοντέλου (base και note)", () => {
  const d = run({ match: null }, ok({ ean: null }), null, "suggested");
  assert.equal(d.match, "suggested"); assert.equal(d.lastError, "διαφέρει κατάληξη: xx");
  assert.equal(run({ match: null }, ok({ ean: null }), null, "auto").match, "auto");
});
test("missCount: 1η απουσία μετρά, 2η → lost και καθαρίζει το ζευγάρι", () => {
  const a = decideGone(prev({ missCount: 0 }));
  assert.equal(a.missCount, 1); assert.equal(a.match, "auto"); assert.equal(a.available, false);
  const b = decideGone(prev({ missCount: 1 }));
  assert.equal(b.match, "lost"); assert.equal(b.lastError, "χάθηκε: tv/123-x"); assert.ok(b.clearPair);
});
test("επιτυχής τιμή μηδενίζει missCount", () => {
  const d = run({ missCount: 1 }, ok()); assert.equal(d.missCount, 0); assert.equal(d.available, true);
});
test("ιστορικό μόνο όταν άλλαξε τιμή ή δική μας τιμή", () => {
  assert.equal(run({}, ok()).history, false);
  assert.equal(run({}, ok({ offer: 95 })).history, true);
  assert.equal(run({}, ok(), "5901234123457", "auto", 105).history, true);
  assert.equal(run({ their: null }, ok()).history, true);
});
test("διαφορά %: offer προτιμάται από list", () => {
  assert.equal(run({}, ok()).prices!.diff, 10); // (110-100)/100
  assert.equal(run({}, ok({ offer: null })).prices!.their, 120);
});
test("και list και offer null → σφάλμα, χωρίς τιμές/ιστορικό, available αμετάβλητο", () => {
  const d = run({}, ok({ list: null, offer: null }));
  assert.equal(d.lastError, "χωρίς τιμή"); assert.equal(d.prices, undefined); assert.equal(d.available, undefined);
});
test("ourPrice: προσφορά έναντι τιμής", () => {
  assert.equal(ourPrice({ price: 120, offer: { price: "99.9" } }), 99.9);
  assert.equal(ourPrice({ price: 120, offer: null }), 120);
  assert.equal(ourPrice({ price: null, offer: null }), null);
});

test("searchPrev: μετά από «Λάθος ζευγάρι» το νέο ψάξιμο ξεκινά καθαρό και δεν κουβαλά rejected", () => {
  assert.equal(searchPrev("rejected"), null);
  assert.equal(searchPrev("lost"), null);
  assert.equal(searchPrev(undefined), null);
  assert.equal(searchPrev("suggested"), "suggested");
  // νέο ταίριασμα μετά την απόρριψη: auto με ίδιο EAN, όχι rejected
  assert.equal(run({ match: searchPrev("rejected"), their: null }, ok()).match, "auto");
  assert.equal(run({ match: searchPrev("rejected"), their: null }, ok(), null, "suggested").match, "suggested");
});

test("runWindow: πρώτο scanning μετά το deploy τρέχει αμέσως, έως 6 ώρες (Ruling 10)", () => {
  const now = new Date("2026-11-12T10:00:00Z"); // 12:00 Αθήνα, εκτός παραθύρου
  assert.ok(runWindow("cron", now).idle);
  const f = runWindow("cron", now, true);
  assert.equal(f.idle, null);
  assert.equal(f.until.getTime(), now.getTime() + 6 * 3600_000);
  assert.equal(runWindow("manual", now, true).until.getTime(), runWindow("manual", now).until.getTime());
});

test("επιλογή AI: ίδιο EAN → auto, χωρίς/διαφορετικό EAN → πάντα suggested", () => {
  const ai = (ean: string | null) => decidePrice({ prev: prev({ match: null }), base: "suggested", note: "AI: ίδιο μοντέλο", parsed: ok({ ean }) as any, ourEan: "5901234123457", ourPrice: 110 });
  assert.equal(ai("5901234123457").match, "auto");
  const none = ai(null); assert.equal(none.match, "suggested"); assert.equal(none.lastError, "AI: ίδιο μοντέλο");
  const diff = ai("5909999999999"); assert.equal(diff.match, "suggested"); assert.match(diff.lastError!, /διαφορετικό EAN/);
});

test("search: ταίριασμα από κωδικό τίτλου = πρόταση, από modelCode = auto", async () => {
  const { search } = await import("./run-core");
  const { parseSitemap } = await import("./kotsovolos/core");
  const pool = parseSitemap("<loc>https://www.kotsovolos.gr/a/1-smartphone-samsung-a17-256gb-blue</loc><loc>https://www.kotsovolos.gr/a/2-lg-oled55c46la</loc>");
  const t = search("Samsung", null, null, "SAMSUNG GALAXY A17 8GB/256GB BLUE", false, [pool]);
  assert.equal(t, null); // 8GB/256GB δεν είναι κωδικός
  const fromTitle = search("LG", null, null, "LG OLED55C46LA 55\"", false, [pool]);
  assert.equal(fromTitle?.base, "suggested"); assert.match(fromTitle!.note!, /τίτλο/);
  assert.equal(search("LG", null, "OLED55C46LA", "LG τηλεόραση", false, [pool])?.base, "auto");
});

test("decideVariant: τιμή χωρίς σημείωση EAN· ίδιο EAN → auto· σφάλμα/χωρίς τιμή κρατούν το μήνυμα", async () => {
  const { decideVariant } = await import("./run-core");
  const v = (parsed: object, ourEan: string | null = "5901234123457") => decideVariant({ prev: prev({ match: "variant" as any }), parsed: parsed as any, ourEan, ourPrice: 110 });
  const d = v(ok({ ean: "5909999999999" }));
  assert.equal(d.match, "variant"); assert.equal(d.lastError, null); assert.equal(d.prices!.their, 100);
  assert.equal(v(ok()).match, "auto");
  assert.equal(v({ error: "HTTP 500" }).lastError, "HTTP 500");
  assert.equal(v(ok({ list: null, offer: null })).lastError, "χωρίς τιμή");
});
test("researchDue: μία νύχτα στις 7 ανά προϊόν", async () => {
  const { researchDue } = await import("./run-core");
  const days = Array.from({ length: 14 }, (_, i) => researchDue("cmabc123", new Date(Date.UTC(2026, 10, 1 + i, 23))));
  assert.equal(days.filter(Boolean).length, 2);
  assert.equal(searchPrev("variant"), null);
});

test("strongMatch: ίσος κωδικός προμηθευτή, όχι πρόθεμα/υπο-συμβολοσειρά, ίδια κλάση", async () => {
  const { strongMatch } = await import("./run-core");
  const tv = (o: object = {}) => strongMatch({ ourModel: "75NU8E0B3LA", ourTitle: "LG 75NU8E0B3LA.API LED LCD TV 75 (UD)", ourEnergyClass: "E", parsed: { supplierCodes: ["75NU8E0B3LA.API"], energyClass: "E" }, ...o });
  assert.equal(tv().ok, true); // μέσω του κωδικού του τίτλου μας
  assert.match(tv().why, /75NU8E0B3LA\.API/);
  // μόνο το modelCode (χωρίς .API στον τίτλο): «75NU8E0B3LA» ≠ «75NU8E0B3LAAPI» — όχι πρόθεμα
  assert.equal(tv({ ourTitle: "LG τηλεόραση 75" }).ok, false);
  assert.equal(tv({ ourTitle: "LG τηλεόραση 75", parsed: { supplierCodes: ["75-NU8E0B3LA"], energyClass: null } }).ok, true); // κανονικοποίηση
  assert.equal(tv({ parsed: { supplierCodes: ["NU8E0B3L"], energyClass: "E" } }).ok, false); // υπο-συμβολοσειρά
  const cls = tv({ parsed: { supplierCodes: ["75NU8E0B3LA.API"], energyClass: "F" } });
  assert.equal(cls.ok, false); assert.match(cls.why, /ενεργειακή κλάση/);
  assert.equal(tv({ ourEnergyClass: null }).ok, true); // μία κλάση λείπει: δεν μετρά
  assert.equal(strongMatch({ ourModel: "X", ourTitle: "A+++ κλάση", ourEnergyClass: "A+++", parsed: { supplierCodes: [], energyClass: "Α+++" } }).ok, false);
  assert.equal(strongMatch({ ourModel: "EMPVI24WFI", ourTitle: "", ourEnergyClass: "A+++", parsed: { supplierCodes: ["EMPVI-24WFI"], energyClass: "Α+++" } }).ok, true); // ελληνικό Α
});

const me = { model: "75NU8E0B3LA", title: "LG 75NU8E0B3LA.API LED TV", energyClass: "E" };
const strong = (o: object = {}) => ok({ ean: "5909999999999", supplierCodes: ["75NU8E0B3LA.API"], energyClass: "E", ...o });
test("decidePrice: strongMatch δίνει auto με διαφορετικό ή χωρίς EAN (AI, τίτλος, πολλά υποψήφια)", () => {
  const d = (o: object, base: "auto" | "suggested" = "suggested", note = "AI: ίδιο μοντέλο") => decidePrice({ prev: prev({ match: "suggested" }), base, note, parsed: strong(o) as any, ourEan: "5901234123457", ourPrice: 110, ours: me });
  assert.equal(d({}).match, "auto"); assert.equal(d({}).lastError, null);
  assert.equal(d({ ean: null }).match, "auto");
  assert.equal(d({ ean: null }, "suggested", "πολλά υποψήφια (3)").match, "auto");
  const no = d({ supplierCodes: ["OTHER123"] }); assert.equal(no.match, "suggested"); assert.match(no.lastError!, /διαφορετικό EAN/);
  assert.equal(d({ energyClass: "G" }).match, "suggested");
  // χωρίς ours (π.χ. ενδεικτικά): ο παλιός κανόνας
  assert.equal(decidePrice({ prev: prev({ match: null }), base: "suggested", note: null, parsed: strong() as any, ourEan: "5901234123457", ourPrice: 110 }).match, "suggested");
});
test("μοναδικότητα: είδος που είναι ήδη ζευγάρι άλλου προϊόντος μένει πρόταση", async () => {
  const { TAKEN } = await import("./run-core");
  const t = (p: Partial<Prev>, parsed: object) => decidePrice({ prev: prev(p), base: "auto", note: null, parsed: parsed as any, ourEan: "5901234123457", ourPrice: 110, ours: me, taken: true });
  const a = t({ match: "suggested" }, ok()); assert.equal(a.match, "suggested"); assert.equal(a.lastError, TAKEN);
  assert.equal(t({ match: "suggested" }, strong()).lastError, TAKEN);
  assert.equal(t({ match: "manual" }, ok()).match, "manual"); // ο άνθρωπος αποφάσισε
});
test("SANITY_PCT: auto με |διαφορά| > 40% πάει για έλεγχο, το manual ποτέ", async () => {
  const { SANITY_PCT } = await import("./run-core");
  assert.equal(SANITY_PCT, 40);
  const up = run({ match: "auto" }, ok({ offer: 70 }), "5901234123457", "auto", 110); // +57,1%
  assert.equal(up.match, "suggested"); assert.equal(up.lastError, "μεγάλη διαφορά τιμής (+57,1%) — έλεγξε (σετ; άλλη συσκευασία;)"); assert.ok(up.prices);
  assert.equal(run({ match: "auto" }, ok({ offer: 200 }), "5901234123457", "auto", 110).match, "suggested"); // −45%
  assert.equal(run({ match: "auto" }, ok({ offer: 80 }), "5901234123457", "auto", 112).match, "auto"); // +40% ακριβώς
  assert.equal(run({ match: "manual" }, ok({ offer: 50 })).match, "manual");
  assert.equal(run({ match: "auto" }, ok({ offer: 70 }), "5901234123457", "auto", null as any).match, "auto"); // χωρίς δική μας τιμή
});
test("τιμή-σύμβολο: μένει το ζευγάρι με εξήγηση", () => {
  const d = run({ match: "auto" }, ok({ list: null, offer: null, symbolic: true }));
  assert.equal(d.match, "auto"); assert.match(d.lastError!, /0,01/); assert.equal(d.prices, undefined);
});
test("deadGroups: ≥5 «δεν βρέθηκε» και κανένα ζευγάρι στη μάρκα×κατηγορία", async () => {
  const { deadGroups, NOT_FOUND } = await import("./run-core");
  type R = Parameters<typeof deadGroups>[0][number];
  const nf = (b: string, c = "c1"): R => ({ brandId: b, categoryId: c, match: "lost", extId: null, lastError: NOT_FOUND });
  const rows = [...Array(5)].map(() => nf("b1")).concat([...Array(5)].map(() => nf("b2")), [{ brandId: "b2", categoryId: "c1", match: "variant", extId: "9", lastError: null }],
    [...Array(4)].map(() => nf("b3")), [...Array(6)].map(() => nf("b4", "c2")), [{ brandId: "b4", categoryId: "c2", match: "rejected", extId: null, lastError: "απορρίφθηκε: x" }]);
  assert.deepEqual([...deadGroups(rows)].sort(), ["b1|c1", "b4|c2"]);
});
test("reasonOf: φίλτρο προτάσεων", async () => {
  const { reasonOf, TAKEN, sanityMsg } = await import("./run-core");
  assert.equal(reasonOf("διαφορετικό EAN (δικό μας 1, Κωτσόβολου 2) — έλεγξε"), "ean");
  assert.equal(reasonOf("AI: ίδιο μοντέλο"), "ai");
  assert.equal(reasonOf("πολλά υποψήφια (3)"), "many");
  assert.equal(reasonOf(sanityMsg(-45.2)), "price");
  assert.equal(reasonOf(TAKEN), "taken");
  assert.equal(reasonOf("κωδικός από τον τίτλο (X) — έλεγξε"), "other");
  assert.equal(reasonOf(null), "other");
});
