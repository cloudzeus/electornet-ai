import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNewsletter } from "./render";
import type { Block } from "./core";
import type { EmailCtx } from "../email/layout-core";

const ctx: EmailCtx = { baseUrl: "https://www.euronics.gr", assetUrl: "https://app.euronics.gr", logoUrl: "https://cdn.example/logo.png", siteName: "Euronics", phone: "210 483 5143", email: "info@euronics.gr", address: "Δαμάσκου 2, Αχαρνές", legalName: "MEGA ELECTRICS ΑΕΒΕ", year: 2026 };
const utm = "utm_source=newsletter&utm_medium=email&utm_campaign=BF26";
const prod = (o: Partial<{ title: string; brand: string; image: string | null; href: string; price: number; listPrice: number | null }> = {}) => ({ title: "Τηλεόραση 55\"", brand: "Samsung", image: "/img/tv.jpg", href: "/p/tv-55", price: 499, listPrice: null, ...o });
const base = (blocks: Block[], products = new Map<string, ReturnType<typeof prod>>(), over: Partial<Parameters<typeof renderNewsletter>[0]> = {}) =>
  renderNewsletter({ subject: "Black Friday", preheader: "Κρυφό κείμενο προεπισκόπησης", blocks, products, ctx, utm, unsubscribe: "https://www.euronics.gr/api/newsletter/u/tok", viewUrl: null, ...over });
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

test("τίτλος προϊόντος: το HTML escape-άρεται", () => {
  const { html } = base([{ type: "products", ids: ["a"] }], new Map([["a", prod({ title: "<script>&" })]]));
  assert.ok(html.includes("&lt;script&gt;&amp;"));
  assert.ok(!html.includes("<script>&"));
});

test("κάθε σύνδεσμος προς το site έχει utm και utm_content = τύπος block", () => {
  const blocks: Block[] = [
    { type: "hero", image: "/img/h.jpg", alt: "Προσφορές", href: "/prosfores?x=1", headline: "Μεγάλες εκπτώσεις", sub: "Μόνο σήμερα" },
    { type: "products", ids: ["a"] },
    { type: "cta", label: "Δες όλα", href: "https://www.euronics.gr/prosfores" },
  ];
  const { html } = base(blocks, new Map([["a", prod()]]));
  const links = hrefs(html);
  const find = (frag: string) => links.find((l) => l.includes(frag))!;
  assert.match(find("/prosfores?x=1"), /^https:\/\/www\.euronics\.gr\/prosfores\?x=1&utm_source=newsletter&utm_medium=email&utm_campaign=BF26&utm_content=hero$/);
  assert.match(find("/p/tv-55"), /utm_campaign=BF26&utm_content=products$/);
  assert.ok(links.some((l) => /\/prosfores\?utm_source=newsletter.*&utm_content=cta$/.test(l)));
  for (const l of links) {
    if (l.startsWith("https://www.euronics.gr") && !l.includes("/api/newsletter/u/")) assert.ok(l.includes("utm_source=newsletter"), l);
  }
});

test("το unsubscribe δεν παίρνει utm και φαίνεται σε HTML και text", () => {
  const r = base([{ type: "text", body: "γεια" }]);
  assert.ok(hrefs(r.html).includes("https://www.euronics.gr/api/newsletter/u/tok"));
  assert.ok(r.text.includes("https://www.euronics.gr/api/newsletter/u/tok"));
});

test("το placeholder %recipient.unsub% μένει αυτούσιο", () => {
  const r = base([{ type: "text", body: "γεια" }], new Map(), { unsubscribe: "%recipient.unsub%" });
  assert.ok(hrefs(r.html).includes("%recipient.unsub%"));
  assert.ok(r.text.includes("%recipient.unsub%"));
});

test("προβολή στον browser: μόνο όταν δοθεί viewUrl, χωρίς utm", () => {
  assert.ok(!base([{ type: "text", body: "x" }]).html.includes("Προβολή στον browser"));
  const r = base([{ type: "text", body: "x" }], new Map(), { viewUrl: "https://www.euronics.gr/newsletter/abc" });
  assert.ok(r.html.includes("Προβολή στον browser"));
  assert.ok(hrefs(r.html).includes("https://www.euronics.gr/newsletter/abc"));
  assert.ok(r.text.includes("https://www.euronics.gr/newsletter/abc"));
});

test("υποσέλιδο: ο λόγος που λαμβάνουν το email", () => {
  const r = base([{ type: "text", body: "x" }]);
  assert.ok(r.html.includes("Το λαμβάνετε γιατί έχετε εγγραφεί στο newsletter ή δώσει συναίνεση για προσφορές του euronics.gr."));
  assert.ok(r.text.includes("Το λαμβάνετε γιατί"));
});

test("preheader στο κρυφό div", () => {
  const { html } = base([{ type: "text", body: "x" }]);
  assert.match(html, /<div style="display:none[^"]*">Κρυφό κείμενο προεπισκόπησης/);
});

test("προϊόν με listPrice > price: διαγραμμένη τιμή· χωρίς: όχι", () => {
  const withOld = base([{ type: "products", ids: ["a"] }], new Map([["a", prod({ price: 399, listPrice: 499 })]])).html;
  assert.match(withOld, /line-through[^>]*>499,00 €/);
  const noOld = base([{ type: "products", ids: ["a"] }], new Map([["a", prod({ price: 399, listPrice: 399 })]])).html;
  assert.ok(!noOld.includes("line-through"));
});

test("id προϊόντος που λείπει από το map παραλείπεται· άδειο block δεν δίνει τίποτα", () => {
  const r = base([{ type: "products", ids: ["a", "ghost"] }], new Map([["a", prod()]]));
  assert.equal((r.html.match(/class="nl-col"/g) ?? []).length, 2); // 1 κάρτα + 1 κενή στήλη
  assert.ok(!r.html.includes("ghost"));
  const empty = base([{ type: "products", ids: ["ghost"] }]);
  assert.ok(!empty.html.includes("nl-col\""));
  assert.ok(!empty.html.includes("Δες το"));
});

test("προϊόντα: 2 στήλες με @media 1 στήλη σε στενή οθόνη", () => {
  const ids = ["a", "b", "c"];
  const m = new Map(ids.map((i) => [i, prod({ title: `T${i}` })]));
  const { html } = base([{ type: "products", ids }], m);
  assert.match(html, /@media \(max-width:480px\)\{[^}]*\.nl-col/);
  assert.equal((html.match(/<td class="nl-col"/g) ?? []).length, 4); // 2 γραμμές × 2
  assert.equal((html.match(/Δες το/g) ?? []).length, 3);
});

test("hero χωρίς εικόνα: navy band· με εικόνα: συνδεδεμένη εικόνα με alt", () => {
  const noImg = base([{ type: "hero", image: null, alt: "x", href: "/a", headline: "Τίτλος", sub: "Υπότιτλος" }]).html;
  assert.ok(noImg.includes("#122A58") && noImg.includes("Τίτλος") && noImg.includes("Υπότιτλος"));
  assert.ok(!/<img[^>]*alt="x"/.test(noImg));
  const img = base([{ type: "hero", image: "/img/h.jpg", alt: "Εναλλακτικό", href: "/a", headline: "Τίτλος", sub: "Υπότιτλος" }]).html;
  assert.match(img, /<a href="[^"]*"[^>]*><img src="[^"]*h\.jpg"[^>]*alt="Εναλλακτικό"/);
});

test("text block: παράγραφοι, escape (καθόλου ωμό HTML)", () => {
  const { html } = base([{ type: "text", body: "Πρώτη <b>παράγραφος</b>\n\nΔεύτερη & τελευταία" }]);
  assert.ok(html.includes("Πρώτη &lt;b&gt;παράγραφος&lt;/b&gt;"));
  assert.ok(html.includes("Δεύτερη &amp; τελευταία"));
  assert.ok(!html.includes("<b>παράγραφος"));
});

test("cta: κουμπί με ετικέτα και σύνδεσμο", () => {
  const r = base([{ type: "cta", label: "Αγόρασε τώρα", href: "/prosfores" }]);
  assert.ok(r.html.includes("Αγόρασε τώρα"));
  assert.ok(r.text.includes("Αγόρασε τώρα: https://www.euronics.gr/prosfores?"));
});

test("text: χωρίς HTML tags, με συνδέσμους", () => {
  const blocks: Block[] = [
    { type: "hero", image: "/img/h.jpg", alt: "a", href: "/a", headline: "Τίτλος", sub: "Υπότιτλος" },
    { type: "text", body: "Κείμενο\n\nΑκόμα" },
    { type: "products", ids: ["a"] },
    { type: "cta", label: "Δες", href: "/c" },
  ];
  const { text } = base(blocks, new Map([["a", prod({ title: "<script>&" })]]), { viewUrl: "https://www.euronics.gr/newsletter/abc" });
  assert.ok(!/<[^>]+>/.test(text), text);
  assert.ok(text.includes("https://www.euronics.gr/p/tv-55?utm_source=newsletter"));
  assert.ok(text.includes("Κείμενο"));
});
