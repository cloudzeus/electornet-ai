import { test } from "node:test";
import assert from "node:assert/strict";
import { brandSites } from "./brand-sites";

test("brandSites: η μάρκα δίνει το ΠΡΑΓΜΑΤΙΚΟ site, που δεν βγαίνει με μάντεμα", () => {
  // Το μάντεμα «www.<μάρκα>.gr» θα έδινε inventor.gr — το site είναι αλλού.
  assert.deepEqual(brandSites("INVENTOR"), ["https://www.inventoraircondition.gr", "https://ac.inv-static.com"]);
  assert.deepEqual(brandSites("METZ"), ["https://www.metzblue.com"]);
});

test("brandSites: πεζά, κενά και τόνοι δεν χαλάνε το ταίριασμα", () => {
  const want = brandSites("TOYOTOMI");
  assert.ok(want.length > 0);
  assert.deepEqual(brandSites("  toyotomi "), want);
  assert.deepEqual(brandSites("Toyotomi"), want);
});

test("brandSites: πρώτο το ελληνικό site όπου υπάρχει", () => {
  assert.equal(brandSites("TOYOTOMI")[0], "https://www.toyotomi.gr");
  assert.equal(brandSites("AEG")[0], "https://www.aeg.com.gr");
});

test("brandSites: άγνωστη μάρκα δεν δίνει τίποτα — μένει το μάντεμα του καλούντα", () => {
  assert.deepEqual(brandSites("ΚΑΠΟΙΑ ΑΓΝΩΣΤΗ"), []);
  assert.deepEqual(brandSites(""), []);
  assert.deepEqual(brandSites(null as unknown as string), []);
});

test("brandSites: κανένα site μεταπωλητή ή συγκεντρωτή στον πίνακα", () => {
  // Ο πίνακας υπάρχει για να βρίσκουμε τη σελίδα του ΚΑΤΑΣΚΕΥΑΣΤΗ· τα καταστήματα τα καλύπτει άλλο βήμα.
  const bad = /kotsovolos|skroutz|bestprice|ekupi|displayspecifications|gzhls|manuals\.co\.uk|bechtle|public\.gr|plaisio/i;
  for (const b of ["TOYOTOMI", "INVENTOR", "METZ", "LG", "WINSTAR", "HISENSE", "MIDEA", "FUJITSU", "AEG", "SAMSUNG", "AUX", "NOBU", "HAIER", "PITSOS", "GREE", "TESLA"]) {
    for (const u of brandSites(b)) assert.ok(!bad.test(u), `${b}: ${u}`);
  }
});

test("brandSites: κάθε διεύθυνση είναι σκέτο origin, χωρίς διαδρομή", () => {
  for (const b of ["TOYOTOMI", "INVENTOR", "LG", "SAMSUNG"]) {
    for (const u of brandSites(b)) assert.match(u, /^https:\/\/[a-z0-9.-]+$/, `${b}: ${u}`);
  }
});
