import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSitemap, parseCategories, norm, matchByModel, matchPhone, isBundle, parseProduct, diffPct, badgeState,
  type KotItem,
} from "./core";

const it = (u: string): KotItem => parseSitemap(`<loc>https://www.kotsovolos.gr/${u}</loc>`)[0];

test("parseSitemap: διαδρομή, τελευταίο κομμάτι, art, ελληνικά, χωρίς κατηγορία", () => {
  const xml = `<urlset>
<loc>https://www.kotsovolos.gr/household-appliances/hoods/aporrofhthres/320409-${encodeURIComponent("απορ-τηρας")}-aeg-dve5962hb-black</loc>
<loc>https://www.kotsovolos.gr/285550-es-toyotomi-ctn-356bv</loc></urlset>`;
  const r = parseSitemap(xml);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { art: "320409", path: "household-appliances/hoods/aporrofhthres", last: "320409-απορ-τηρας-aeg-dve5962hb-black" });
  assert.deepEqual(r[1], { art: "285550", path: "", last: "285550-es-toyotomi-ctn-356bv" });
});

test("parseCategories: path + label από το τελευταίο κομμάτι", () => {
  const r = parseCategories(`<loc>https://www.kotsovolos.gr/household-appliances/fridges</loc><loc>https://www.kotsovolos.gr/${encodeURIComponent("κινητά")}</loc>`);
  assert.deepEqual(r, [{ path: "household-appliances/fridges", label: "fridges" }, { path: "κινητά", label: "κινητά" }]);
});

test("norm: μικρά, a-z0-9 μόνο, και χωρίς ελληνικά", () => {
  assert.equal(norm("F4WV912P2E.ABWQPHS"), "f4wv912p2eabwqphs");
  assert.equal(norm("Απορ-τηρας AEG 1/2"), "aeg12");
});

const m = (brand: string, model: string, ...slugs: string[]) => matchByModel({ brand, model }, slugs.map(it));

test("matchByModel: matched", () => {
  const cases: [string, string, string][] = [
    ["Samsung", "QE65QN90DATXXH", "300899-tv-led-65-samsung-qe65qn90da"],
    ["LG", "F4WV912P2E.ABWQPHS", "1-lg-f4wv912p2ea-12kg"],
    ["AEG", "DVE5962HB", "household-appliances/hoods/aporrofhthres/320409-απορ-τηρας-καμι-90cm-aeg-dve5962hb-black"],
    ["Hisense", "55U7Q", "1-tv-hisense-55u7q"],
    ["Candy", "GD 49B8-S", "1-candy-gd-49b8-s-9kg"],
    ["Candy", "CSO 496TWMB6/1-S", "1-candy-cso-496twmb6-1-s"],
  ];
  for (const [b, model, slug] of cases) {
    const r = m(b, model, slug, "2-tv-led-samsung-zzz999xx");
    assert.equal(r.kind, "matched", `${b} ${model}`);
    assert.equal((r as any).item.art, slug.split("/").pop()!.split("-")[0]);
  }
});

test("matchByModel: κενά/τελείες/κάθετες = ίδιο με το σκέτο κωδικό", () => {
  const slug = "1-candy-wwg360wcs-9kg";
  for (const model of ["WWG360 WCS", "WWG360WCS", "wwg360.wcs", "WWG360/WCS"]) assert.equal(m("Candy", model, slug).kind, "matched", model);
  assert.equal(m("LG", "F4WV912P2E.ABWQPHS", "1-lg-f4wv912p2ea").kind, m("LG", "F4WV912P2EABWQPHS", "1-lg-f4wv912p2ea").kind);
});

test("matchByModel: none", () => {
  assert.equal(m("Samsung", "QE65QN85DATXXH", "300899-tv-led-65-samsung-qe65qn90da").kind, "none");
  assert.equal(m("AEG", "DVE5", "1-aeg-dve5962hb").kind, "none");
  assert.equal(m("Bosch", "QE65QN90DATXXH", "300899-tv-led-65-samsung-qe65qn90da").kind, "none");
  assert.equal(m("Samsung", "", "300899-tv-led-65-samsung-qe65qn90da").kind, "none");
  assert.equal(matchByModel({ brand: "Samsung", model: null }, [it("1-samsung-qe65qn90da")]).kind, "none");
});

test("matchByModel: alias της μάρκας", () => {
  assert.equal(matchByModel({ brand: "Ηλεκτρολουξ", alias: "Electrolux", model: "EW6F428B" }, [it("1-electrolux-ew6f428b")]).kind, "matched");
});

test("matchByModel: ambiguous", () => {
  const r = m("Samsung", "100U7SE", "1-samsung-100u7sea", "2-samsung-100u7seb");
  assert.equal(r.kind, "ambiguous");
  assert.equal((r as any).items.length, 2);
});

const FOLD = "MOBILE SAMSUNG SM-F971 GALAXY Z FOLD 8 5G 12GB / 512GB GRAPHITE";
const phones = [
  "338132-θηκη-samsung-fold-8-wide-carbon-stnd-blk",
  "340216-smartphone-samsung-fold-8-ult-256g-5g-ee",
  "340217-smartphone-samsung-fold-8-ult-512g-5g-ee",
  "339347-smartphone-samsung-fold-8-256gb-graph-5g",
  "339348-smartphone-samsung-fold-8-512gb-graph-5g",
  "339349-smartphone-samsung-fold-8-512gb-blue-5g",
  "339350-set-samsung-fold-8-512gb-graph",
].map(it);

test("matchPhone: μνήμη, χρώμα, όχι θήκες/Ultra", () => {
  assert.equal(matchPhone({ brand: "Samsung", title: FOLD }, phones)?.art, "339348");
  assert.equal(matchPhone({ brand: "Samsung", title: FOLD.replace("FOLD 8", "FOLD 8 ULTRA").replace("GRAPHITE", "") }, phones)?.art, "340217");
  assert.equal(matchPhone({ brand: "Samsung", title: "MOBILE SAMSUNG GALAXY Z FOLD 7 12GB / 512GB" }, phones), null);
  assert.equal(matchPhone({ brand: "Apple", title: FOLD }, phones), null);
});

test("isBundle", () => {
  assert.equal(isBundle("LG F4WV912P2E + ΔΩΡΟ Σύστημα Ατμού", "product"), true);
  assert.equal(isBundle("LG F4WV912P2E", "set"), true);
  assert.equal(isBundle("LG F4WV912P2E", "product"), false);
});

test("parseProduct: τιμές", () => {
  const p = (price: unknown, extra = {}) => parseProduct({ catalogEntryView: [{ name: "X", buyable: true, price, ...extra }] });
  assert.deepEqual(p([{ usage: "Display", value: "749.99" }, { usage: "Offer", value: "649.99" }]), { title: "X", list: 749.99, offer: 649.99, buyable: true });
  assert.deepEqual(p([{ usage: "Display", value: "749.99" }]), { title: "X", list: 749.99, offer: null, buyable: true });
  assert.deepEqual(p([]), { title: "X", list: null, offer: null, buyable: true });
  assert.deepEqual(p([{ usage: "Display", value: "1299.9" }, { usage: "Offer", value: "1.199,90" }]), { title: "X", list: 1299.9, offer: null, buyable: true });
  assert.deepEqual(p([{ usage: "Offer", value: 99 }, { usage: "Display", value: "" }]), { title: "X", list: null, offer: 99, buyable: true });
  assert.equal((p(undefined) as any).offer, null);
  assert.equal((p("zzz") as any).list, null);
  assert.equal((p([null, 3, { usage: "Offer" }]) as any).offer, null);
  assert.equal((p([], { buyable: "true" }) as any).buyable, true);
  assert.equal((p([], { buyable: "false" }) as any).buyable, false);
  assert.equal((p([], { buyable: undefined }) as any).buyable, false);
});

test("parseProduct: μη JSON / άδεια απάντηση → error, ποτέ throw", () => {
  for (const bad of ["<html>302 Found</html>", {}, null, undefined, 42, [], { catalogEntryView: [] }, { catalogEntryView: "x" }, { catalogEntryView: [null] }]) {
    assert.ok("error" in (parseProduct(bad) as any), JSON.stringify(bad));
  }
});

test("diffPct, badgeState", () => {
  assert.equal(diffPct(829, 649.99), 27.5);
  assert.equal(diffPct(90, 100), -10);
  assert.equal(badgeState(0.4, true), "eq");
  assert.equal(badgeState(-0.5, true), "eq");
  assert.equal(badgeState(-7.7, true), "down");
  assert.equal(badgeState(27.5, true), "up");
  assert.equal(badgeState(5, false), "gone");
  assert.equal(badgeState(null, false), "gone");
  assert.equal(badgeState(null, true), "none");
});
