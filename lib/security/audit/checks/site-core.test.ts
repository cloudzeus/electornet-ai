import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp } from "../../csp";
import { buildIdOf, connectSrcOf, evaluatePage, mergeFindings, mismatchFinding, pickLinks, pickOne, prevSiteSnapshot, siteOutcome, siteSnapshot, type Fetched, type PageCtx, type SiteSnapshot } from "./site-core";

const NOW = new Date("2026-10-20T07:00:00Z");

const ORIGIN = "https://euronics.dgsoft.gr";
const N = "TjE=";
const CSP = buildCsp({ nonce: N, dev: false });
const HEADERS = { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "strict-transport-security": "max-age=63072000", "x-content-type-options": "nosniff", server: "cloudflare" };
const page = (body: string, buildId = "BUILD_A") =>
  `<!DOCTYPE html><html><head><script src="/_next/static/chunks/main-1.js" async="" nonce="${N}"></script></head><body>${body}<script nonce="${N}">self.__next_f.push([1,"0:{\\"P\\":null,\\"b\\":\\"${buildId}\\",\\"c\\":[]}"])</script></body></html>`;
const ctx = (over: Partial<PageCtx> = {}): PageCtx => ({ origin: ORIGIN, build: { id: "BUILD_A", files: new Set(["/_next/static/chunks/main-1.js"]) }, allowedScriptHosts: [], expectedConnectSrc: connectSrcOf(CSP), now: NOW, ...over });
const ok = (path: string, html: string, headers: Record<string, string> = HEADERS, status = 200): Fetched => ({ path, status, headers, html });

test("connectSrcOf: οι πηγές του connect-src του buildCsp (αυτές περιμένει ο έλεγχος headers)", () => {
  const src = connectSrcOf(CSP);
  assert.equal(src[0], "'self'");
  assert.ok(src.includes("https://*.googletagmanager.com"));
  assert.ok(!src.includes("ws:"));
});

test("buildIdOf: από τα δεδομένα του Next ή το _buildManifest· πολλά διαφορετικά → null", () => {
  assert.equal(buildIdOf(page("")), "BUILD_A");
  assert.equal(buildIdOf('<script src="/_next/static/abcDEF123/_buildManifest.js"></script>'), "abcDEF123");
  assert.equal(buildIdOf("<p>τίποτα</p>"), null);
  assert.equal(buildIdOf(`${page("", "AAAAAA1")}${page("", "BBBBBB2")}`), null);
});

test("evaluatePage: καθαρή σελίδα → καμία παρατήρηση· αρχείο εκτός build → critical", () => {
  const r = evaluatePage(ok("/", page("<p>Καλώς ήρθατε</p>")), ctx());
  assert.equal(r.scanned, true);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.scripts, { external: 1, inline: 1 });
  const bad = evaluatePage(ok("/", page(`<script src="/_next/static/chunks/evil.js" nonce="${N}"></script>`)), ctx());
  assert.ok(bad.findings.some((f) => f.severity === "critical" && /δεν υπάρχει στο build/.test(f.title)));
});

test("evaluatePage: άλλο build στο site, όλα τα αρχεία υπάρχουν (παράθυρο deploy) → warn, χωρίς recheck", () => {
  const r = evaluatePage(ok("/", page("", "BUILD_B")), ctx());
  assert.deepEqual(r.findings.map((f) => [f.severity, f.evidence]), [["warn", "site BUILD_B · server BUILD_A"]]);
  assert.equal(r.recheck, undefined);
});

const EVIL = page(`<script src="/_next/static/chunks/evil.js" nonce="${N}"></script>`, "FAKE_BUILD");
const SNAP_SAME: SiteSnapshot = { at: "2026-10-20T06:00:00.000Z", serverBuild: "BUILD_A", pages: [{ path: "/", pageBuild: "FAKE_BUILD", missing: true }] };

test("evaluatePage: άλλο build + αρχεία που λείπουν → recheck (warn, όχι critical) πριν από τη δεύτερη λήψη", () => {
  const first = evaluatePage(ok("/", EVIL), ctx({ previous: SNAP_SAME }));
  assert.equal(first.recheck, true);
  assert.ok(!first.findings.some((f) => f.severity === "critical"));
});

test("mismatchFinding / evaluatePage (ruling J): πρώτη εμφάνιση → warn «Πιθανό deploy», με τις διαδρομές στη λεπτομέρεια", () => {
  const r = evaluatePage(ok("/", EVIL), ctx({ previous: null }), { confirmed: true });
  const f = r.findings.find((x) => x.evidence === "site FAKE_BUILD · server BUILD_A")!;
  assert.equal(f.severity, "warn");
  assert.equal(f.title, "Πιθανό deploy σε εξέλιξη — αρχεία που λείπουν από το build· επανέλεγχος στην επόμενη εκτέλεση");
  assert.match(f.detail, /1 αρχεία.*\/_next\/static\/chunks\/evil\.js/);
  assert.equal(r.recheck, undefined);
  assert.deepEqual(r.build, { page: "FAKE_BUILD", missing: ["/_next/static/chunks/evil.js"] });
});

test("mismatchFinding (ruling J): το ίδιο ζεύγος build με αρχεία που λείπουν και στον προηγούμενο έλεγχο → critical", () => {
  const r = evaluatePage(ok("/", EVIL), ctx({ previous: SNAP_SAME }), { confirmed: true });
  const c = r.findings.find((f) => f.severity === "critical");
  assert.equal(c?.title, "Το site σερβίρει αρχεία που δεν υπάρχουν στο build του server");
  assert.equal(c?.evidence, "site FAKE_BUILD · server BUILD_A");
  assert.match(c!.detail, /evil\.js/);
});

const MF = (previous: SiteSnapshot | null | "unavailable", over: { path?: string; pageBuild?: string; now?: Date } = {}) =>
  mismatchFinding({ path: over.path ?? "/", pageBuild: over.pageBuild ?? "FAKE_BUILD", serverBuild: "BUILD_A", missing: ["/_next/static/chunks/evil.js"], previous, now: over.now ?? NOW });

test("mismatchFinding (ruling J): εναλλασσόμενο ψεύτικο buildId σελίδας ανά εκτέλεση → critical στη 2η (κλειδί: ίδια σελίδα + ίδιο build server)", () => {
  const run1 = MF(null, { pageBuild: "FORGED_1" });
  assert.equal(run1.severity, "warn");
  const snap1: SiteSnapshot = { at: "2026-10-20T06:00:00.000Z", serverBuild: "BUILD_A", pages: [{ path: "/", pageBuild: "FORGED_1", missing: true }] };
  assert.equal(MF(snap1, { pageBuild: "FORGED_2" }).severity, "critical");
});

test("mismatchFinding (ruling J): προηγούμενος με άλλο build server (νέο deploy) / άλλη σελίδα / χωρίς αρχεία που λείπουν → warn", () => {
  for (const prev of [
    { ...SNAP_SAME, serverBuild: "OLD_SERVER" },
    { ...SNAP_SAME, pages: [{ path: "/kalathi", pageBuild: "FAKE_BUILD", missing: true }] },
    { ...SNAP_SAME, pages: [{ path: "/", pageBuild: "FAKE_BUILD", missing: false }] },
    { ...SNAP_SAME, pages: [{ path: "/", pageBuild: "BUILD_A", missing: true }] },
  ] as SiteSnapshot[]) assert.equal(MF(prev).severity, "warn", JSON.stringify(prev));
});

test("mismatchFinding (ruling J): προηγούμενος < 10′ πριν (δύο εκτελέσεις μέσα στο ίδιο deploy) → warn· ≥ 10′ → critical", () => {
  assert.equal(MF({ ...SNAP_SAME, at: "2026-10-20T06:55:00.000Z" }).severity, "warn");
  assert.equal(MF({ ...SNAP_SAME, at: "2026-10-20T06:50:00.000Z" }).severity, "critical");
  assert.equal(MF({ ...SNAP_SAME, at: "όχι ημερομηνία" }).severity, "warn");
});

test("mismatchFinding (ruling J): ο προηγούμενος έλεγχος δεν διαβάστηκε → warn που το λέει (ποτέ ok)", () => {
  const f = MF("unavailable");
  assert.equal(f.severity, "warn");
  assert.match(f.detail, /προηγούμενος έλεγχος δεν διαβάστηκε/);
});

test("siteSnapshot / prevSiteSnapshot: buildIds σελίδων + αν έλειπαν αρχεία· ανάγνωση από τα αποθηκευμένα checks", () => {
  const b = { id: "BUILD_A", files: new Set(["/_next/static/chunks/main-1.js"]) };
  const pages = [evaluatePage(ok("/", page("")), ctx()), evaluatePage(ok("/admin/login", EVIL), ctx({ previous: null }), { confirmed: true })];
  const snap = siteSnapshot(pages, b, NOW);
  assert.deepEqual(snap, { at: NOW.toISOString(), serverBuild: "BUILD_A", pages: [{ path: "/", pageBuild: "BUILD_A", missing: false }, { path: "/admin/login", pageBuild: "FAKE_BUILD", missing: true }] });
  assert.deepEqual(prevSiteSnapshot([{ key: "staff", snapshot: {} }, { key: "site", status: "warn", snapshot: snap }]), snap);
  assert.equal(prevSiteSnapshot([{ key: "site", status: "error" }]), null);
  assert.equal(prevSiteSnapshot("x"), null);
  const out = siteOutcome({ mode: "light", origin: ORIGIN, originSource: "AUTH_URL", pages, build: b, analytics: { keys: [], hosts: [] }, now: NOW });
  assert.deepEqual(out.snapshot, snap);
});

test("evaluatePage: άλλο build + script από ξένο host → critical (οι υπόλοιποι κανόνες ισχύουν)", () => {
  const r = evaluatePage(ok("/", page(`<script src="https://evil.example/x.js" nonce="${N}"></script>`, "FAKE_BUILD")), ctx());
  assert.ok(r.findings.some((f) => f.severity === "critical" && f.title === "Script από άγνωστο host"));
});

test("evaluatePage: απάντηση που δεν είναι σελίδα της εφαρμογής (κενή, 204, 3xx χωρίς Location, JSON) → error, όχι ok", () => {
  for (const [name, f] of [
    ["κενή 200", ok("/", "")],
    ["204", ok("/", "", HEADERS, 204)],
    ["302 χωρίς Location", ok("/", "", HEADERS, 302)],
    ["JSON", ok("/", '{"ok":true}', { ...HEADERS, "content-type": "application/json" })],
    ["χωρίς content-type", ok("/", page(""), Object.fromEntries(Object.entries(HEADERS).filter(([k]) => k !== "content-type")))],
  ] as [string, Fetched][]) {
    const r = evaluatePage(f, ctx());
    assert.equal(r.scanned, false, name);
    assert.deepEqual(r.findings.map((x) => [x.severity, x.title]), [["error", "Η απάντηση δεν είναι σελίδα της εφαρμογής — δεν ελέγχθηκε"]], name);
  }
});

test("evaluatePage: HTML 200 χωρίς σημάδια της εφαρμογής (στατική σελίδα) → critical defacement", () => {
  const r = evaluatePage(ok("/", "<html><body><h1>Hacked</h1><a href='https://phish.example'>login</a></body></html>"), ctx());
  assert.equal(r.scanned, false);
  assert.ok(r.findings.some((f) => f.severity === "critical" && f.title === "Η σελίδα δεν είναι της εφαρμογής (πιθανή αντικατάσταση/defacement)"));
});

test("evaluatePage: build άγνωστο (null) → οι υπόλοιποι κανόνες ισχύουν (Zaraz → critical)", () => {
  const r = evaluatePage(ok("/admin/login", page(`<script src="/cdn-cgi/zaraz/s.js?z=abc" nonce="${N}"></script>`)), ctx({ build: null }));
  assert.ok(r.findings.some((f) => f.severity === "critical" && /Zaraz/.test(f.title)));
});

test("evaluatePage: headers — connect-src με ξένη πηγή → critical· λείπει HSTS → warn", () => {
  const extra = { ...HEADERS, "content-security-policy": CSP.replace("connect-src 'self'", "connect-src 'self' https://evil.example") };
  assert.ok(evaluatePage(ok("/", page(""), extra), ctx()).findings.some((f) => f.severity === "critical" && /connect-src/.test(f.title)));
  const noHsts = Object.fromEntries(Object.entries(HEADERS).filter(([k]) => k !== "strict-transport-security"));
  assert.ok(evaluatePage(ok("/", page(""), noHsts), ctx()).findings.some((f) => f.severity === "warn" && /HSTS/.test(f.title)));
});

test("evaluatePage: έλεγχος Cloudflare / HTTP σφάλμα / αποτυχία → error (ποτέ ok, ποτέ critical)", () => {
  const ch = evaluatePage(ok("/", "<html><title>Just a moment...</title></html>", { server: "cloudflare", "cf-mitigated": "challenge" }, 403), ctx());
  assert.equal(ch.scanned, false);
  assert.deepEqual(ch.findings.map((f) => f.severity), ["error"]);
  assert.match(ch.findings[0].title, /ελέγχου του Cloudflare/);
  assert.deepEqual(evaluatePage(ok("/kalathi", "oops", HEADERS, 502), ctx()).findings.map((f) => f.severity), ["error"]);
  assert.deepEqual(evaluatePage({ path: "/", error: "ECONNRESET" }, ctx()).findings.map((f) => f.severity), ["error"]);
});

test("evaluatePage: ανακατεύθυνση σε ξένο site → critical· Cloudflare Access → error", () => {
  const r = evaluatePage({ path: "/admin/login", status: 302, headers: {}, html: "", redirectTo: "https://evil.example/login" }, ctx());
  assert.deepEqual(r.findings.map((f) => [f.severity, f.evidence]), [["critical", "/admin/login → evil.example"]]);
  const a = evaluatePage({ path: "/admin/login", status: 302, headers: {}, html: "", redirectTo: "https://team.cloudflareaccess.com/cdn-cgi/access/login" }, ctx());
  assert.deepEqual(a.findings.map((f) => f.severity), ["error"]);
});

test("mergeFindings: το ίδιο εύρημα σε πολλές σελίδες → ένα, με τις σελίδες στη λεπτομέρεια (τεκμήριο αμετάβλητο)", () => {
  const f = { severity: "warn" as const, title: "Script του Cloudflare: Email Obfuscation", detail: "Λειτουργία.", evidence: "/cdn-cgi/scripts/x/cloudflare-static/email-decode.min.js" };
  const m = mergeFindings([{ path: "/", findings: [f] }, { path: "/k/tv", findings: [f] }]);
  assert.equal(m.length, 1);
  assert.equal(m[0].evidence, f.evidence);
  assert.match(m[0].detail, /Σελίδες: \/, \/k\/tv\./);
});

test("pickLinks / pickOne: κατηγορίες και προϊόντα του ίδιου origin από sitemap ή αρχική", () => {
  const html = '<a href="/k/tileoraseis">TV</a><a href="/proion/lg-oled-55">LG</a><a href="https://evil.example/proion/x">x</a><a href="/proion/a/b">y</a>';
  assert.deepEqual(pickLinks(html, ORIGIN), { categories: ["/k/tileoraseis"], products: ["/proion/lg-oled-55"] });
  const xml = `<urlset><url><loc>${ORIGIN}/k/klimatismos/inverter</loc></url><url><loc>${ORIGIN}/proion/daikin-1</loc></url></urlset>`;
  assert.deepEqual(pickLinks(xml, ORIGIN), { categories: ["/k/klimatismos/inverter"], products: ["/proion/daikin-1"] });
  assert.equal(pickOne(["a", "b", "c"], () => 0.99), "c");
  assert.equal(pickOne([], () => 0), null);
});

test("siteOutcome: χωρίς build → warn «δεν βρέθηκε το build»· σελίδα που λείπει → error· σύνοψη λέει τι εξετάστηκε", () => {
  const pages = [evaluatePage(ok("/", page("")), ctx({ build: null })), evaluatePage({ path: "/admin/login", error: "timeout" }, ctx({ build: null }))];
  const r = siteOutcome({ mode: "full", origin: ORIGIN, originSource: "AUTH_URL", pages, build: null, analytics: null, pick: { source: "home", note: "η βάση δεν απάντησε" }, missing: ["προϊόντος"] });
  assert.ok(!r.findings.some((f) => /SECURITY_SITE_URL/.test(f.title)));
  assert.equal(r.status, "error");
  assert.equal(r.complete, false);
  assert.ok(r.findings.some((f) => f.severity === "warn" && f.title === "Δεν βρέθηκε το build — ο έλεγχος αρχείων παραλείπεται"));
  assert.ok(r.findings.some((f) => f.severity === "error" && /προϊόντος/.test(f.title)));
  assert.match(r.summary, /1 από 2 σελίδες ελέγχθηκαν μέσω https:\/\/euronics\.dgsoft\.gr \(πηγή URL: AUTH_URL\)/);
  assert.match(r.summary, /build: δεν βρέθηκε/);
  assert.match(r.summary, /ρυθμίσεις Analytics δεν διαβάστηκαν/);
  assert.match(r.summary, /από συνδέσμους της αρχικής \(η βάση δεν απάντησε\)/);
});

test("siteOutcome: όλα καθαρά → ok και complete", () => {
  const b = { id: "BUILD_A", files: new Set(["/_next/static/chunks/main-1.js"]) };
  const r = siteOutcome({ mode: "light", origin: ORIGIN, originSource: "AUTH_URL", pages: [evaluatePage(ok("/", page("")), ctx())], build: b, analytics: { keys: [], hosts: [] } });
  assert.equal(r.status, "ok");
  assert.equal(r.complete, true);
  assert.match(r.summary, /build BUILD_A: 1 αρχεία/);
});

test("siteOutcome: προεπιλεγμένο URL (χωρίς SECURITY_SITE_URL/AUTH_URL) → warn εύρημα, όχι μόνο στη σύνοψη", () => {
  const b = { id: "BUILD_A", files: new Set(["/_next/static/chunks/main-1.js"]) };
  const r = siteOutcome({ mode: "light", origin: ORIGIN, originSource: "προεπιλογή", originDefault: true, pages: [evaluatePage(ok("/", page("")), ctx())], build: b, analytics: { keys: [], hosts: [] } });
  assert.equal(r.status, "warn");
  assert.deepEqual(r.findings.map((f) => f.title), ["Δεν έχει οριστεί SECURITY_SITE_URL/AUTH_URL — ελέγχεται η προεπιλογή https://euronics.dgsoft.gr"]);
});
