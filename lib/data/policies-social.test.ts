import { test } from "node:test";
import assert from "node:assert/strict";
import { localizeText, sitePolicy } from "./policies-social";

test("διευθύνσεις του παλιού site → του domain που ανοίγει τη σελίδα· τα email μένουν", () => {
  const o = "https://euronics.dgsoft.gr";
  assert.equal(localizeText("Δείτε https://www.euronics.gr/privacy-notice για λεπτομέρειες.", o), "Δείτε https://euronics.dgsoft.gr/aporrito για λεπτομέρειες.");
  assert.equal(localizeText("ηλεκτρονικού καταστήματος www.euronics.gr της MEGA ELECTRICS", o), "ηλεκτρονικού καταστήματος euronics.dgsoft.gr της MEGA ELECTRICS");
  assert.equal(localizeText("στο euronics.gr.", "http://localhost:3111"), "στο localhost:3111.");
  assert.equal(localizeText("γράψτε στο info@euronics.gr", o), "γράψτε στο info@euronics.gr");
  assert.equal(localizeText("https://www.euronics.gr/euronics-cookies", o), "https://euronics.dgsoft.gr/cookies");
});

test("πολιτική απορρήτου και όροι: ενότητες social login στη σωστή θέση", () => {
  const p = sitePolicy({ slug: "aporrito", title: "Πολιτική απορρήτου", sections: [{ title: "", body: ["www.euronics.gr"] }, { title: "Υπεύθυνοι επικοινωνίας, πρόσβαση", body: ["x"] }] }, "https://demo.example.gr");
  assert.equal(p.sections.length, 4);
  assert.match(p.sections[1].title, /Google, Microsoft, Facebook ή Apple/);
  assert.match(p.sections[3].title, /Υπεύθυνοι επικοινωνίας/);
  assert.equal(p.sections[0].body[0], "demo.example.gr");
  assert.ok(p.sections[2].body.some((b) => b.includes("https://demo.example.gr/diagrafi-dedomenon")));
  const t = sitePolicy({ slug: "oroi-chrisis", title: "Όροι", sections: [{ title: "ΑΛΛΟ", body: [] }, { title: "ΠΡΟΣΤΑΣΙΑ ΔΕΔΟΜΕΝΩΝ -", body: [] }] }, "https://demo.example.gr");
  assert.match(t.sections[1].title, /ΣΥΝΔΕΣΗ ΜΕΣΩ ΤΡΙΤΩΝ/);
});
