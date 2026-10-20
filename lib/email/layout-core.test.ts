import { test } from "node:test";
import assert from "node:assert/strict";
import { bankAccountsBlock, type EmailCtx } from "./layout-core";

const ctx: EmailCtx = { baseUrl: "https://shop.example", assetUrl: "https://shop.example", logoUrl: "", siteName: "Euronics", phone: "", email: "", address: "", legalName: "", year: 2026 };
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
