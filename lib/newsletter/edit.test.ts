import { test } from "node:test";
import assert from "node:assert/strict";
import { athensLocal, canResume, fromForm, isNight, maskEmails, safeHref, sanitizeNewsletter, toForm, type NewsletterForm } from "./edit";
import type { Block } from "./core";

test("href: http(s), σχετικοί του site και mailto περνούν", () => {
  for (const h of ["https://euronics.gr/prosfores/x", "http://a.gr", "/prosfores/bf?x=1", "mailto:info@euronics.gr", "  /proion/abc  "]) assert.ok(safeHref(h), h);
  assert.equal(safeHref("  /proion/abc  "), "/proion/abc");
});

test("href: javascript:, data:, //άλλο-site, σχετικό χωρίς / και κενό απορρίπτονται", () => {
  for (const h of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.com/x", "prosfores", "", "  ", "vbscript:x", "https://", "/\\evil.com"]) assert.equal(safeHref(h), null, h);
});

const base: NewsletterForm = {
  title: "Newsletter · ΔΟΚΙΜΗ 2030",
  subject: "Θέμα",
  preheader: "Preheader",
  hero: { image: "", alt: "Εικόνα", href: "/prosfores/x", headline: "Τίτλος", sub: "Υπότιτλος" },
  intro: "Κείμενο",
  productIds: ["p1", "p2"],
  cta: { label: "Δείτε", href: "/prosfores/x" },
  segmentId: null,
};

test("φόρμα → blocks με σταθερή σειρά· κενά μέρη παραλείπονται", () => {
  assert.deepEqual(fromForm(base).blocks.map((b) => b.type), ["hero", "text", "products", "cta"]);
  const b = fromForm({ ...base, hero: null, intro: "  ", productIds: [], cta: null }).blocks;
  assert.deepEqual(b, []);
});

test("blocks του αυτόματου προχείρου → φόρμα → ίδια blocks (το αποτύπωμα δεν αλλάζει)", () => {
  const blocks: Block[] = [
    { type: "hero", image: null, alt: "Α", href: "/prosfores/a", headline: "Α", sub: "Ισχύει έως 31/10/2030" },
    { type: "text", body: "Εισαγωγή" },
    { type: "products", ids: ["x", "y"] },
    { type: "cta", label: "Δείτε την προσφορά", href: "/prosfores/a" },
  ];
  const form = toForm({ title: "t", subject: "s", preheader: "p", blocks, audience: {} });
  assert.deepEqual(fromForm(form).blocks, blocks);
});

test("sanitize: λάθος σύνδεσμος → ελληνικό σφάλμα, χωρίς αποθήκευση", () => {
  const r = sanitizeNewsletter({ ...base, cta: { label: "Δείτε", href: "javascript:alert(1)" } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors.join(" "), /σύνδεσμος/i);
});

test("sanitize: εικόνα hero μόνο http(s) ή σχετική", () => {
  assert.equal(sanitizeNewsletter({ ...base, hero: { ...base.hero!, image: "javascript:x" } }).ok, false);
  const ok = sanitizeNewsletter({ ...base, hero: { ...base.hero!, image: "https://cdn.x/a.jpg" } });
  assert.ok(ok.ok);
});

test("sanitize: σκληρά όρια (θέμα 150, preheader 200, εισαγωγή 2000) — τα προτεινόμενα δεν μπλοκάρουν", () => {
  assert.ok(sanitizeNewsletter({ ...base, subject: "α".repeat(100), preheader: "β".repeat(150), intro: "γ".repeat(900) }).ok);
  assert.equal(sanitizeNewsletter({ ...base, subject: "α".repeat(151) }).ok, false);
  assert.equal(sanitizeNewsletter({ ...base, preheader: "β".repeat(201) }).ok, false);
  assert.equal(sanitizeNewsletter({ ...base, intro: "γ".repeat(2001) }).ok, false);
  assert.equal(sanitizeNewsletter({ ...base, subject: "  " }).ok, false);
});

test("sanitize: έως 12 προϊόντα, χωρίς διπλά", () => {
  const r = sanitizeNewsletter({ ...base, productIds: ["a", "a", "b"] });
  assert.ok(r.ok && r.value.blocks.some((b) => b.type === "products" && b.ids.join() === "a,b"));
  assert.equal(sanitizeNewsletter({ ...base, productIds: Array.from({ length: 13 }, (_, i) => `p${i}`) }).ok, false);
});

test("sanitize: κοινό = {} ή { segmentId }", () => {
  const a = sanitizeNewsletter(base);
  assert.ok(a.ok && JSON.stringify(a.value.audience) === "{}");
  const b = sanitizeNewsletter({ ...base, segmentId: "seg1" });
  assert.ok(b.ok && JSON.stringify(b.value.audience) === '{"segmentId":"seg1"}');
});

test("ώρα Ελλάδας → UTC, και με αλλαγή ώρας (θερινή +3, χειμερινή +2)", () => {
  assert.equal(athensLocal.toDate("2030-07-20T10:00")?.toISOString(), "2030-07-20T07:00:00.000Z");
  assert.equal(athensLocal.toDate("2030-11-20T10:00")?.toISOString(), "2030-11-20T08:00:00.000Z");
  assert.equal(athensLocal.toDate("όχι"), null);
  assert.equal(athensLocal.fromDate(new Date("2030-07-20T07:00:00Z")), "2030-07-20T10:00");
  assert.equal(athensLocal.fromDate(new Date("2030-11-20T08:05:00Z")), "2030-11-20T10:05");
});

test("νύχτα = 22:00–08:00 ώρα Ελλάδας", () => {
  assert.equal(isNight(new Date("2030-07-20T19:00:00Z")), true); // 22:00
  assert.equal(isNight(new Date("2030-07-20T04:59:00Z")), true); // 07:59
  assert.equal(isNight(new Date("2030-07-20T05:00:00Z")), false); // 08:00
  assert.equal(isNight(new Date("2030-07-20T18:59:00Z")), false); // 21:59
});

test("συνέχεια: μόνο σε παύση, με παραλήπτες στην ουρά ή αν δεν ξεκίνησε", () => {
  assert.equal(canResume({ status: "paused", started: true, queued: 10 }), true);
  assert.equal(canResume({ status: "paused", started: false, queued: 0 }), true);
  assert.equal(canResume({ status: "paused", started: true, queued: 0 }), false);
  assert.equal(canResume({ status: "sending", started: true, queued: 5 }), false);
});

test("emails στο ιστορικό εμφανίζονται κρυμμένα", () => {
  assert.equal(maskEmails("Δοκιμή σε maria@euronics.gr, nikos.p@x.gr."), "Δοκιμή σε m•••@euronics.gr, n•••@x.gr.");
});
