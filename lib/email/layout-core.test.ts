import { test } from "node:test";
import assert from "node:assert/strict";
import { bankAccountsBlock, emailImg, type EmailCtx } from "./layout-core";
import { relOfCdnUrl } from "../media/cdn-path";

const ctx: EmailCtx = { baseUrl: "https://shop.example", assetUrl: "https://shop.example", logoUrl: "", advisorUrl: "https://cdn.example/ermis.email.jpg", siteName: "Euronics", phone: "", email: "", address: "", legalName: "", year: 2026 };
const NBG = "GR1601101250000000012300695";

test("bankAccountsBlock: τράπεζα, δικαιούχος, IBAN σε ομάδες και αιτιολογία — σε HTML και σε απλό κείμενο", () => {
  const b = bankAccountsBlock(ctx, [{ logo: "", bank: "Εθνική <Τράπεζα>", holder: "ΕΥΡΩΝΙΚΣ Α.Ε.", iban: NBG }], { reference: "EUR-20261020-0001", amount: 517 });
  assert.match(b.html, /GR16 0110 1250 0000 0001 2300 695/);
  assert.match(b.html, /Εθνική &lt;Τράπεζα&gt;/, "το όνομα περνά από escape");
  assert.match(b.html, /ΕΥΡΩΝΙΚΣ Α\.Ε\./);
  assert.match(b.html, /EUR-20261020-0001/);
  assert.match(b.html, /517,00 €/);
  assert.match(b.text, /GR16 0110 1250 0000 0001 2300 695/);
  assert.match(b.text, /Αιτιολογία: EUR-20261020-0001/);
});

test("bankAccountsBlock: το λογότυπο περνά από τη μετατροπή για email (SVG → εικόνα)· χωρίς λογαριασμούς, τίποτα", () => {
  const b = bankAccountsBlock(ctx, [{ logo: "https://cdn.example/nbg.svg", bank: "Εθνική", holder: "Χ", iban: NBG }], { reference: "R", amount: 1 });
  assert.match(b.html, /\/api\/img\/email\?src=/);
  assert.deepEqual(bankAccountsBlock(ctx, [], { reference: "R", amount: 1 }), { html: "", text: "" });
});

test("emailImg: κάθε εικόνα γίνεται JPEG μικρογραφία, εκτός από τις έτοιμες", () => {
  // WebP/AVIF και μεγάλες JPEG/PNG → μέσα από τον μετατροπέα
  for (const u of ["/img/cutouts/x.webp", "/media/p.avif", "https://cdn.example/products/x-01.webp", "https://cdn.example/products/x-01.jpg", "/img/p.PNG"]) {
    assert.match(emailImg(ctx, u), /\/api\/img\/email\?src=/, u);
  }
  // έτοιμη μικρογραφία email → ως έχει, χωρίς δεύτερη μετατροπή
  assert.equal(emailImg(ctx, "https://cdn.example/products/x-01.email.jpg"), "https://cdn.example/products/x-01.email.jpg");
  assert.match(emailImg(ctx, "/uploads/ab/c.email.jpg"), /\/uploads\/ab\/c\.email\.jpg$/);
  // GIF (θα έχανε την κίνηση) και ενσωματωμένες εικόνες → ως έχουν
  assert.match(emailImg(ctx, "/img/a.gif"), /\/img\/a\.gif$/);
  assert.equal(emailImg(ctx, "cid:logo"), "cid:logo");
  assert.equal(emailImg(ctx, "data:image/png;base64,AAA"), "data:image/png;base64,AAA");
  assert.equal(emailImg(ctx, null), "");
});

test("relOfCdnUrl: η μικρογραφία μπαίνει δίπλα στην εικόνα, με ή χωρίς basePath", () => {
  assert.equal(relOfCdnUrl("https://cdn.example/euronics/products/x/y-01.webp", "https://cdn.example", "/euronics"), "products/x/y-01.webp");
  assert.equal(relOfCdnUrl("https://cdn.example/products/x/y-01.webp", "https://cdn.example", ""), "products/x/y-01.webp");
  assert.equal(relOfCdnUrl("https://cdn.example/products/%CE%B1-01.webp", "https://cdn.example", ""), "products/α-01.webp");
  assert.throws(() => relOfCdnUrl("https://evil.example/x.webp", "https://cdn.example", ""), /CDN/);
});
