import { test } from "node:test";
import assert from "node:assert/strict";
import { stylesToClasses } from "./inline-styles";

test("προεπισκόπηση email: τα style attributes γίνονται κλάσεις σε <style nonce> (μετά τα υπάρχοντα, για ίδια προτεραιότητα)", () => {
  const html = `<html><head><style>.nl-col{display:block!important}</style></head><body><td class="nl-col" style="padding:4px;color:red">a</td><p style="color:red;padding:4px">b</p><span>c</span></body></html>`;
  const out = stylesToClasses(html, "N1");
  assert.ok(!/\sstyle="/.test(out), out);
  const m = out.match(/<td class="nl-col (e-[a-z0-9]+)">/);
  assert.ok(m, out);
  // ίδιο style με άλλη σειρά → ίδια κλάση
  assert.ok(out.includes(`<p class="${m![1]}">`), out);
  assert.ok(out.includes(`<style nonce="N1">.${m![1]}{color:red;padding:4px}</style></head>`), out);
  // ο υπάρχων κανόνας (με !important) μένει και παίρνει το nonce
  assert.ok(out.includes(`<style nonce="N1">.nl-col{display:block!important}</style>`), out);
});

test("προεπισκόπηση email: χωρίς nonce επιστρέφεται ως έχει· HTML entities στο style διατηρούνται σωστά", () => {
  const html = `<head></head><div style="font-family:Manrope, &quot;Segoe UI&quot;">x</div>`;
  assert.equal(stylesToClasses(html, null), html);
  const out = stylesToClasses(html, "N");
  assert.ok(out.includes(`font-family:Manrope, "Segoe UI"`), out);
  assert.ok(!out.includes("</style><script"), out);
});
