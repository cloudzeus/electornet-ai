import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedCdnUrl, cdnHosts, safeAdHref } from "./url-allow";

const hosts = cdnHosts("https://euronics.b-cdn.net", "https://cdn.euronics.gr/", "not a url", "");

test("cdnHosts: hostnames από τις ρυθμισμένες διευθύνσεις CDN, χωρίς άκυρες / κενές", () => {
  assert.deepEqual(hosts, ["euronics.b-cdn.net", "cdn.euronics.gr"]);
});

test("allowedCdnUrl: δέχεται μόνο https στο ακριβές host του CDN", () => {
  assert.equal(allowedCdnUrl("https://euronics.b-cdn.net/media/x.webp", hosts)?.href, "https://euronics.b-cdn.net/media/x.webp");
  assert.equal(allowedCdnUrl("https://EURONICS.B-CDN.NET/a.png?width=360", hosts)?.hostname, "euronics.b-cdn.net");
  assert.ok(allowedCdnUrl("https://cdn.euronics.gr:443/a.png", hosts));
});

test("allowedCdnUrl: απορρίπτει τις παρακάμψεις του startsWith (userinfo, υπο-domain, άλλο σχήμα/θύρα)", () => {
  const bad = [
    "https://euronics.b-cdn.net@other-host/", "https://euronics.b-cdn.net@169.254.169.254/latest/meta-data",
    "https://euronics.b-cdn.net.evil.com/", "https://euronics.b-cdn.net:8080/x", "http://euronics.b-cdn.net/x",
    "https://user:pass@euronics.b-cdn.net/x", "https://evil.com/https://euronics.b-cdn.net/", "file:///etc/passwd",
    "//euronics.b-cdn.net/x", "/media/x.webp", "javascript:alert(1)", "", "https://b-cdn.net/x", "https://xeuronics.b-cdn.net/",
  ];
  for (const u of bad) assert.equal(allowedCdnUrl(u, hosts), null, `πέρασε: ${u}`);
  assert.equal(allowedCdnUrl("https://euronics.b-cdn.net/x", []), null);
});

test("safeAdHref: εσωτερικές διαδρομές και http(s) σύνδεσμοι του διαχειριστή", () => {
  assert.equal(safeAdHref("/prosfores/black-friday"), "/prosfores/black-friday");
  assert.equal(safeAdHref("https://www.lg.com/gr/promo?utm=1"), "https://www.lg.com/gr/promo?utm=1");
  assert.equal(safeAdHref("http://partner.gr/x"), "http://partner.gr/x");
  assert.equal(safeAdHref("  https://www.lg.com/gr  "), "https://www.lg.com/gr");
});

test("safeAdHref: όχι javascript:/data:/vbscript:, protocol-relative, backslash ή κωδικοί στο URL", () => {
  const bad = ["javascript:alert(document.cookie)", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox", "//evil.com", "/\\evil.com", "\\\\evil.com", "https://user:pw@evil.com/", "ftp://x.gr/a", "mailto:a@b.gr", "", null, undefined, 5];
  for (const h of bad) assert.equal(safeAdHref(h), null, `πέρασε: ${JSON.stringify(h)}`);
});
