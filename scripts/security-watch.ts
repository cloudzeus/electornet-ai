/**
 * Εξωτερικός φύλακας (Task 6): τρέχει από GitHub Actions (.github/workflows/security-watch.yml), ΟΧΙ από τις υποδομές μας —
 * μια παραβιασμένη εφαρμογή δεν μπορεί να δηλώσει μόνη της «όλα καλά». Μόνο αναγνώσεις (HTTP GET, DNS, TLS). Η λογική είναι
 * στο lib/security/audit/watch-core.ts (καθαρό)· εδώ μόνο I/O. Κανένα import εφαρμογής με βάση/server-only.
 *
 *   npx tsx scripts/security-watch.ts --mode=full|light [--dry] [--site=https://euronics.dgsoft.gr] [--out=security-watch-report.json]
 *   npx tsx scripts/security-watch.ts --write-dns-baseline        (ξαναγράφει το security/dns-baseline.json από το τρέχον DNS)
 *
 * Env: SECURITY_WATCH_SECRET (heartbeat), MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_REGION (eu|us, προεπιλογή eu), MAILGUN_FROM,
 * SECURITY_REPORT_TO (λίστα με κόμματα). Full: email σύνοψης κάθε μέρα· light: email μόνο σε νέο κρίσιμο (23 ώρες dedupe,
 * κατάσταση στο .security-watch-state.json που κρατά το cache του workflow). Έξοδος 0 και με ευρήματα· 2 αν ο φύλακας δεν
 * ολοκληρώθηκε, 1 αν το email που έπρεπε να φύγει δεν έφυγε. Το repo είναι δημόσιο (logs + artifacts δημόσια): στο stdout
 * μόνο {mode, status, seconds, email.sent} και στο artifact τα ευρήματα όσων βλέπει κάθε επισκέπτης — ΧΩΡΙΣ το heartbeat
 * (ούτε στη συνολική κατάσταση: publicStatus). Το heartbeat και όλες οι λεπτομέρειες μόνο στο email.
 *
 * User agents: ο φύλακας αυτοσυστήνεται (WATCH_UA, χωρίς προσωπικά στοιχεία) ΜΟΝΟ στο δικό μας site· ο light κατεβάζει τις
 * σελίδες ως browser (ένας ενδιάμεσος που ξεχωρίζει τον φύλακα δεν τον βλέπει κάθε ώρα)· τρίτοι (crt.sh, certspotter)
 * παίρνουν ουδέτερο user agent.
 */
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import tls from "node:tls";
import { certOutcome, issuerName, type CertInfo } from "../lib/security/audit/checks/cert-core";
import { connectSrcOf, evaluatePage, mergeFindings, pickLinks, type Fetched, type PageResult } from "../lib/security/audit/checks/site-core";
import { signHeartbeat } from "../lib/security/audit/heartbeat";
import { ALLOWED_SCRIPT_HOSTS } from "../lib/security/audit/policy";
import { worst, type CheckResult, type Finding, type Severity } from "../lib/security/audit/rules";
import {
  athensDay, capFinding, chunkIntegrity, emptyCheck, isChallenge, publicChecks, publicStatus, sampleFindings, variantChunks, type ChunkSeen, chunkRefs, cloakingDiff, diffDns, DNS_NAMES, dnsKey, dnsRecords, heartbeatSummary, heartbeatVerdict, lightAlerts,
  newCerts, OVERLAP_KEYS, parseCertSpotter, parseCrtSh, PICK, renderWatchEmail, robotsVerdict, scanChunk, scriptSet, seededPick, selectPages, sitemapVerdict,
  updateSent, watchCheckOf, zarazProbe, zarazRefs, type ChunkFetch, type CtEntry, type Got, type Heartbeat, type WatchReport,
} from "../lib/security/audit/watch-core";
import { buildCsp } from "../lib/security/csp";

const VERSION = "1.0";
const WATCH_UA = `euronics-security-watch/${VERSION}`;
/** Για τρίτους (crt.sh, certspotter): χωρίς ταυτότητα του φύλακα. */
const NEUTRAL_UA = "Mozilla/5.0 (compatible)";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const GOOGLE = "https://www.google.com/";
const FETCH_MS = 15_000;
const MAX_REDIRECTS = 5;
/** ≤ 3 αιτήματα/δευτερόλεπτο προς το site (και τρίτους). */
const GAP_MS = 340;
const RECHECK_MS = 20_000;
/** Όριο λήψεων αρχείων JS ως άλλος επισκέπτης (cloaking) ανά εκτέλεση. */
const VARIANT_CHUNK_CAP = 150;
/** Όπως τα στέλνει ο browser για <script src> — ένας ενδιάμεσος που κάνει cloaking μπορεί να κοιτάζει αυτά. */
const SCRIPT_FETCH = { "Sec-Fetch-Dest": "script", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Site": "same-origin" };
const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(ROOT, "security", "dns-baseline.json");

type Args = { mode: "full" | "light"; dry: boolean; site: string; out: string; state: string; writeBaseline: boolean };
function args(): Args {
  const a = new Map(process.argv.slice(2).map((x) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(x); return m ? [m[1], m[2] ?? "true"] as [string, string] : [x, ""] as [string, string]; }));
  const mode = a.get("mode") ?? "full";
  if (mode !== "full" && mode !== "light") throw new Error(`--mode=full|light (δόθηκε «${mode}»)`);
  const site = new URL(a.get("site") ?? process.env.SECURITY_SITE_URL ?? "https://euronics.dgsoft.gr");
  if (site.protocol !== "https:") throw new Error("--site: μόνο https");
  return { mode, dry: a.get("dry") === "true", site: site.origin, out: a.get("out") ?? "security-watch-report.json", state: a.get("state") ?? ".security-watch-state.json", writeBaseline: a.get("write-dns-baseline") === "true" };
}

// ── HTTP με όριο ρυθμού ─────────────────────────────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let nextSlot = 0;
async function slot() { const now = Date.now(), at = Math.max(now, nextSlot); nextSlot = at + GAP_MS; if (at > now) await sleep(at - now); }
let requests = 0;
/** Το origin του site — μόνο εκεί πηγαίνει ο WATCH_UA. */
let siteOrigin = "";
const headersOf = (h: Headers) => { const o: Record<string, string> = {}; h.forEach((v, k) => { o[k.toLowerCase()] = v; }); return o; };
const errText = (e: unknown) => (e instanceof Error ? (e.cause instanceof Error ? `${e.message} (${e.cause.message})` : e.message) : String(e)).slice(0, 200);

type Raw = { status: number; headers: Record<string, string>; bytes: Buffer; url: URL };
async function get(url: URL, o: { ua?: string; referer?: string; accept?: string; timeout?: number; extra?: Record<string, string> } = {}): Promise<Raw> {
  await slot();
  requests++;
  const res = await fetch(url, {
    redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(o.timeout ?? FETCH_MS),
    headers: { "User-Agent": o.ua ?? (url.origin === siteOrigin ? WATCH_UA : NEUTRAL_UA), Accept: o.accept ?? "*/*", "Accept-Language": "el-GR,el;q=0.9,en;q=0.8", ...(o.referer ? { Referer: o.referer } : {}), ...(o.extra ?? {}) },
  });
  return { status: res.status, headers: headersOf(res.headers), bytes: Buffer.from(await res.arrayBuffer()), url };
}
/** GET με ανακατευθύνσεις μόνο μέσα στο ίδιο origin· ανακατεύθυνση αλλού → redirectTo (δεν ακολουθείται). */
async function getFollow(origin: string, p: string, o: Parameters<typeof get>[1] = {}): Promise<Raw & { redirectTo?: string }> {
  let url = new URL(p, origin);
  for (let hop = 0; ; hop++) {
    const r = await get(url, o);
    const loc = r.status >= 300 && r.status < 400 ? r.headers.location : undefined;
    if (!loc) return r;
    const next = new URL(loc, url);
    if (next.origin !== new URL(origin).origin) return { ...r, redirectTo: next.href };
    if (hop >= MAX_REDIRECTS) throw new Error(`πάνω από ${MAX_REDIRECTS} ανακατευθύνσεις`);
    url = next;
  }
}
/** Σελίδα όπως τη θέλει το evaluatePage: 2 επαναλήψεις σε σφάλμα δικτύου / 5xx (όχι σε έλεγχο Cloudflare). */
async function fetchPage(origin: string, p: string, o: { ua?: string; referer?: string } = {}): Promise<Fetched> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await getFollow(origin, p, { ...o, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" });
      if (r.redirectTo) return { path: p, status: r.status, headers: r.headers, html: "", redirectTo: r.redirectTo };
      const html = r.bytes.toString("utf8");
      if (r.status >= 500 && !r.headers["cf-mitigated"] && attempt < 2) { last = `HTTP ${r.status}`; await sleep(1000 * (attempt + 1)); continue; }
      return { path: p, status: r.status, headers: r.headers, html, finalPath: r.url.pathname + r.url.search };
    } catch (e) { last = errText(e); await sleep(1000 * (attempt + 1)); }
  }
  return { path: p, error: last || "άγνωστο σφάλμα" };
}
async function fetchGot(origin: string, p: string, o: Parameters<typeof get>[1] = {}): Promise<Got> {
  try { const r = await getFollow(origin, p, o); return { status: r.status, headers: r.headers, body: r.bytes.toString("utf8") }; } catch (e) { return { error: errText(e) }; }
}
async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]); } }));
  return out;
}
const html = (f: Fetched) => ("html" in f ? f.html : "");
const okPage = (f: Fetched) => "html" in f && f.status === 200 && !f.redirectTo;

// ── έλεγχοι ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const timed = async (key: string, title: string, fn: () => Promise<{ summary: string; findings: Finding[] }>): Promise<CheckResult> => {
  const t0 = Date.now();
  try { const r = await fn(); return watchCheckOf(key, title, r.summary, r.findings, Date.now() - t0); } catch (e) {
    return watchCheckOf(key, title, `Ο έλεγχος δεν ολοκληρώθηκε: ${errText(e)}`, [{ severity: "error", title: `${title}: ο έλεγχος δεν ολοκληρώθηκε`, detail: errText(e), evidence: key }], Date.now() - t0);
  }
};

type ChunkRow = ChunkFetch & { sha256?: string; bytes?: number };
async function fetchChunk(origin: string, p: string, o: { ua?: string; referer?: string; extra?: Record<string, string> } = {}): Promise<{ row: ChunkRow; text: string }> {
  try {
    const r = await getFollow(origin, p, { ...o, accept: "*/*" });
    if (r.redirectTo) return { row: { path: p, status: r.status, redirectTo: r.redirectTo }, text: "" };
    const text = r.bytes.toString("utf8");
    return { row: { path: p, status: r.status, contentType: r.headers["content-type"] ?? "", sha256: createHash("sha256").update(r.bytes).digest("hex"), bytes: r.bytes.length, ...(isChallenge(r.status, r.headers, text) ? { challenge: true } : {}) }, text };
  } catch (e) { return { row: { path: p, error: errText(e) }, text: "" }; }
}
const chunkOk = (r: ChunkRow) => r.error === undefined && !r.redirectTo && r.status === 200;

function peerCert(host: string): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: FETCH_MS });
    const done = (fn: () => void) => { sock.destroy(); fn(); };
    sock.once("secureConnect", () => {
      const c = sock.getPeerCertificate();
      if (!c || !c.valid_to) return done(() => reject(new Error(`ο ${host} δεν έδωσε πιστοποιητικό`)));
      const err = sock.authorizationError;
      done(() => resolve({ host, validTo: c.valid_to, validFrom: c.valid_from, issuer: issuerName(c.issuer as unknown as Record<string, string>), subject: c.subject?.CN ? String(c.subject.CN) : undefined, authorized: sock.authorized, authError: err ? String((err as Error & { code?: string }).code ?? err) : null }));
    });
    sock.once("timeout", () => done(() => reject(new Error(`ο ${host}:443 δεν απάντησε σε 15″`))));
    sock.once("error", (e) => done(() => reject(e)));
  });
}

async function queryDns(): Promise<{ current: Record<string, string[]>; failures: Record<string, string> }> {
  const r = new Resolver({ timeout: 5000, tries: 2 });
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  const q: Record<string, (n: string) => Promise<unknown>> = {
    A: (n) => r.resolve4(n), AAAA: (n) => r.resolve6(n), CNAME: (n) => r.resolveCname(n), MX: (n) => r.resolveMx(n), TXT: (n) => r.resolveTxt(n), CAA: (n) => r.resolveCaa(n), NS: (n) => r.resolveNs(n),
  };
  const current: Record<string, string[]> = {}, failures: Record<string, string> = {};
  for (const { name, types } of DNS_NAMES) for (const type of types) {
    const key = dnsKey(name, type);
    try { current[key] = dnsRecords(type, await q[type](name)); } catch (e) {
      const code = (e as { code?: string }).code ?? "ERROR";
      if (code === "ENODATA") current[key] = [];
      else failures[key] = code === "ENOTFOUND" ? "NXDOMAIN" : code;
    }
  }
  return { current, failures };
}

type Baseline = { records: Record<string, string[]>; knownCertNames: string[]; generatedAt?: string };
async function loadBaseline(): Promise<Baseline> {
  const j = JSON.parse(await readFile(BASELINE, "utf8")) as Partial<Baseline>;
  if (!j.records || typeof j.records !== "object") throw new Error("security/dns-baseline.json: λείπει το records");
  return { records: j.records, knownCertNames: Array.isArray(j.knownCertNames) ? j.knownCertNames : [], generatedAt: j.generatedAt };
}

/** Certificate Transparency: crt.sh (συχνά εκτός — 502), εφεδρεία certspotter (τρέχοντα πιστοποιητικά, σελιδοποίηση). */
async function ctEntries(): Promise<{ entries: CtEntry[]; source: string; notes: string[] }> {
  const notes: string[] = [];
  try {
    const r = await get(new URL("https://crt.sh/?q=%25.dgsoft.gr&output=json&exclude=expired"), { ua: NEUTRAL_UA, accept: "application/json", timeout: 45_000 });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return { entries: parseCrtSh(JSON.parse(r.bytes.toString("utf8"))), source: "crt.sh", notes };
  } catch (e) { notes.push(`crt.sh μη διαθέσιμο (${errText(e)}) — εφεδρεία certspotter`); }
  const entries: CtEntry[] = [];
  let after = "";
  for (let page = 0; page < 5; page++) {
    const r = await get(new URL(`https://api.certspotter.com/v1/issuances?domain=dgsoft.gr&include_subdomains=true&expand=dns_names&expand=issuer${after ? `&after=${encodeURIComponent(after)}` : ""}`), { ua: NEUTRAL_UA, accept: "application/json" });
    if (r.status !== 200) throw new Error(`certspotter HTTP ${r.status}`);
    const json = JSON.parse(r.bytes.toString("utf8")) as { id?: string }[];
    entries.push(...parseCertSpotter(json));
    if (!/rel="next"/.test(r.headers.link ?? "") || !json.length) break;
    after = String(json[json.length - 1].id ?? "");
  }
  return { entries, source: "certspotter", notes };
}

async function heartbeat(origin: string): Promise<Heartbeat> {
  const secret = process.env.SECURITY_WATCH_SECRET;
  if (!secret) return { kind: "nosecret" };
  const ts = Math.floor(Date.now() / 1000);
  try {
    const r = await get(new URL(`/api/security/heartbeat?ts=${ts}&sig=${signHeartbeat(secret, ts)}`, origin), { ua: WATCH_UA, accept: "application/json" });
    if (isChallenge(r.status, r.headers, r.bytes.toString("utf8"))) return { kind: "unreachable", error: `σελίδα ελέγχου του Cloudflare / όριο αιτημάτων (HTTP ${r.status})` };
    if (r.status !== 200) return { kind: "http", status: r.status };
    try { return { kind: "ok", body: JSON.parse(r.bytes.toString("utf8")) }; } catch { return { kind: "ok", body: null }; }
  } catch (e) { return { kind: "unreachable", error: errText(e) }; }
}

// ── email (Mailgun REST) ────────────────────────────────────────────────────────────────────────────────────────────
async function mailgun(m: { subject: string; html: string; text: string }): Promise<{ ok: boolean; info: string }> {
  const key = process.env.MAILGUN_API_KEY, domain = process.env.MAILGUN_DOMAIN;
  const to = (process.env.SECURITY_REPORT_TO ?? "").split(",").map((x) => x.trim()).filter((x) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x));
  if (!key || !domain || !to.length) return { ok: false, info: `λείπουν ρυθμίσεις: ${[!key && "MAILGUN_API_KEY", !domain && "MAILGUN_DOMAIN", !to.length && "SECURITY_REPORT_TO"].filter(Boolean).join(", ")}` };
  const base = (process.env.MAILGUN_REGION || "eu").toLowerCase() === "us" ? "https://api.mailgun.net" : "https://api.eu.mailgun.net";
  const body = new URLSearchParams({ from: process.env.MAILGUN_FROM || `Euronics security watch <security-watch@${domain}>`, subject: m.subject, text: m.text, html: m.html, "o:tag": "security-watch" });
  for (const x of to) body.append("to", x);
  try {
    const res = await fetch(`${base}/v3/${encodeURIComponent(domain)}/messages`, { method: "POST", body, signal: AbortSignal.timeout(30_000), headers: { Authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}` } });
    await res.body?.cancel();
    // χωρίς το σώμα της απάντησης: τα logs δημόσιου repo τα βλέπει οποιοσδήποτε
    return res.ok ? { ok: true, info: `Mailgun ${res.status}` } : { ok: false, info: `Mailgun HTTP ${res.status}` };
  } catch (e) { return { ok: false, info: `Mailgun: ${errText(e)}` }; }
}

// ── κύρια ροή ───────────────────────────────────────────────────────────────────────────────────────────────────────
async function writeBaseline() {
  const { current, failures } = await queryDns();
  const bad = Object.entries(failures).filter(([, c]) => c !== "NXDOMAIN");
  if (bad.length) throw new Error(`DNS: ${bad.map(([k, c]) => `${k} ${c}`).join(", ")} — η εικόνα δεν γράφτηκε`);
  for (const k of Object.keys(failures)) current[k] = []; // NXDOMAIN = καμία εγγραφή (π.χ. _dmarc)
  const prev = await loadBaseline().catch(() => null);
  const ct = await ctEntries();
  const names = [...new Set([...(prev?.knownCertNames ?? []), ...ct.entries.flatMap((e) => e.names)])].sort();
  const out = {
    note: "Εικόνα αναφοράς DNS για τον εξωτερικό φύλακα (scripts/security-watch.ts). Αλλάζει ΜΟΝΟ με commit: npx tsx scripts/security-watch.ts --write-dns-baseline (μετά από αλλαγή που κάναμε εμείς). knownCertNames: ονόματα με πιστοποιητικά στο Certificate Transparency.",
    generatedAt: new Date().toISOString(), records: current, knownCertNames: names,
  };
  await writeFile(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ wrote: path.relative(ROOT, BASELINE), records: Object.keys(current).length, knownCertNames: names.length, ct: ct.source, notes: ct.notes }, null, 2));
}

async function main() {
  const a = args();
  if (a.writeBaseline) return writeBaseline();
  const startedAt = new Date();
  const origin = a.site;
  siteOrigin = origin;
  const seed = athensDay(startedAt);
  const allowedScriptHosts = [...new Set(Object.values(ALLOWED_SCRIPT_HOSTS).flat())].sort();
  const ctx = { origin, build: null, allowedScriptHosts, expectedConnectSrc: connectSrcOf(buildCsp({ nonce: "x", dev: false })) };
  const notes = [
    "Σύγκριση των αρχείων JS με build του master: παραλείπεται — εκκρεμεί επιβεβαίωση αναπαραγώγιμου build. Κάθε αρχείο που αναφέρουν οι σελίδες κατέβηκε και σαρώθηκε· τα sha256 τους είναι στο artifact.",
    "Script hosts: ο φύλακας δεν βλέπει τις ρυθμίσεις της εφαρμογής — δεκτοί οι hosts όλων των pixels του policy (ο εσωτερικός έλεγχος δέχεται μόνο τα ρυθμισμένα).",
  ];
  const checks: CheckResult[] = [];
  const pageLog: { path: string; ua: string; label: string }[] = [];
  const chunkLog: ChunkRow[] = [];
  let ctSource = "—";
  const watchChunks: Record<string, ChunkSeen> = {};
  let dnsCurrent: Record<string, string[]> = {};

  // σελίδες: full με τον UA του φύλακα (+ παραλλαγές browser παρακάτω)· light ως browser (Windows Chrome)
  const tPages = Date.now();
  const pageUa = a.mode === "light" ? WIN_UA : undefined;
  const pageUaLabel = a.mode === "light" ? "Windows Chrome" : "φύλακας";
  const fixed = await Promise.all(["/", "/admin/login"].map((p) => fetchPage(origin, p, { ua: pageUa })));
  const pages: Fetched[] = [...fixed];
  let robotsF: Finding[] = [], sitemapNote = "";
  let picked = { categories: [] as string[], products: [] as string[] };
  if (a.mode === "full") {
    const [robots, sitemap] = await Promise.all([fetchGot(origin, "/robots.txt", { accept: "text/plain,*/*" }), fetchGot(origin, "/sitemap.xml", { accept: "application/xml,*/*" })]);
    const sm = sitemapVerdict(sitemap, origin);
    robotsF = [...robotsVerdict(robots, origin), ...sm.findings];
    sitemapNote = sm.note;
    const home = okPage(fixed[0]) ? pickLinks(html(fixed[0]), origin) : { categories: [], products: [] };
    const cats = selectPages(home, seed).categories;
    let catPages = await Promise.all(cats.map((p) => fetchPage(origin, p)));
    const fromCats = catPages.filter(okPage).map((f) => pickLinks(html(f), origin));
    if (cats.length < PICK.categories) {
      // λίγες κατηγορίες στην αρχική: συμπλήρωση από υποκατηγορίες των σελίδων κατηγορίας
      const more = seededPick(fromCats.flatMap((x) => x.categories).filter((c) => !cats.includes(c)), PICK.categories - cats.length, `${seed}|k2`);
      const extra = await Promise.all(more.map((p) => fetchPage(origin, p)));
      catPages = [...catPages, ...extra];
      fromCats.push(...extra.filter(okPage).map((f) => pickLinks(html(f), origin)));
    }
    const prods = seededPick([...home.products, ...fromCats.flatMap((x) => x.products)], PICK.products, `${seed}|p`);
    picked = { categories: catPages.map((f) => f.path), products: prods };
    pages.push(...catPages, ...(await Promise.all(prods.map((p) => fetchPage(origin, p)))));
  }
  const results: PageResult[] = pages.map((p) => evaluatePage(p, ctx));
  const fkey = (f: Finding) => `${f.severity}\n${f.title}\n${f.evidence ?? ""}`;
  const seen = new Set(results.flatMap((r) => r.findings.map(fkey)));
  pages.forEach((p, i) => pageLog.push({ path: p.path, ua: pageUaLabel, label: results[i].label }));

  // cloaking: η ίδια σελίδα ως Windows Chrome και iPhone Safari, με Referer Google (full)
  const cloakF: Finding[] = [];
  const cloakPages: Fetched[] = [];
  let cloakSummary = "";
  /** κάθε παραλλαγή (σελίδα × user agent): τα αρχεία JS που αναφέρει, και όσα ΔΕΝ αναφέρει η λήψη του φύλακα */
  const variantsSeen: { path: string; ua: string; label: string; refs: string[]; only: string[] }[] = [];
  if (a.mode === "full") {
    const targets = [pages[0], pages.find((p) => p.path.startsWith("/k/")), pages.find((p) => p.path.startsWith("/proion/"))].filter((p): p is Fetched => !!p && okPage(p));
    const variants = [{ ua: WIN_UA, label: "Windows Chrome + Google" }, { ua: IPHONE_UA, label: "iPhone Safari + Google" }];
    for (const t of targets) {
      for (const v of variants) {
        const f = await fetchPage(origin, t.path, { ua: v.ua, referer: GOOGLE });
        cloakPages.push(f);
        const r = evaluatePage(f, ctx);
        pageLog.push({ path: t.path, ua: v.label, label: r.label });
        // μόνο ό,τι ΔΕΝ βρήκε ήδη η λήψη του φύλακα (το ίδιο εύρημα δεν διπλασιάζεται)
        cloakF.push(...r.findings.filter((x) => !seen.has(fkey(x))).map((x) => ({ ...x, detail: `${x.detail} (μόνο ως ${v.label}, ${t.path})` })));
        if (okPage(f)) {
          cloakF.push(...cloakingDiff(scriptSet(html(t), origin), scriptSet(html(f), origin), ["φύλακας", v.label]).map((x) => ({ ...x, detail: `${t.path}: ${x.detail}` })));
          const refs = chunkRefs(html(f), origin), mine = new Set(chunkRefs(html(t), origin));
          variantsSeen.push({ path: t.path, ua: v.ua, label: v.label, refs, only: refs.filter((x) => !mine.has(x)) });
        }
      }
    }
    const ok = cloakPages.filter(okPage).length;
    cloakSummary = `${targets.map((t) => t.path).join(", ")} ως ${variants.map((v) => v.label).join(" και ")}: ${ok} από ${cloakPages.length} λήψεις, σύγκριση των scripts (εκτός /_next/static — η εφαρμογή αποδίδει άλλα components σε κινητό/υπολογιστή) με τη λήψη του φύλακα και σάρωση με τους ίδιους κανόνες`;
  }
  checks.push(watchCheckOf("pages", "Σελίδες και headers (όπως ο επισκέπτης)", [
    `${results.filter((r) => r.scanned).length} από ${results.length} σελίδες σαρώθηκαν μέσω ${origin}: ${results.map((r) => `${r.path} (${r.label})`).join(", ")}`,
    `${results.reduce((s, r) => s + r.scripts.external, 0)} εξωτερικά / ${results.reduce((s, r) => s + r.scripts.inline, 0)} inline scripts, iframes, δείκτες ClickFix, headers (CSP/HSTS/nosniff/frame-ancestors, connect-src όπως το lib/security/csp.ts)`,
    ...(a.mode === "full" ? [`δείγμα της ${seed}: ${picked.categories.length} κατηγορίες + ${picked.products.length} προϊόντα από συνδέσμους της αρχικής/κατηγοριών (το sitemap.xml δεν υπάρχει)`] : []),
    "build: χωρίς σύγκριση αρχείων (ο φύλακας δεν έχει build)",
  ].join(" · "), [...mergeFindings(results), ...(a.mode === "full" ? sampleFindings({ categories: picked.categories.length, products: picked.products.length }) : [])], Date.now() - tPages));

  // Zaraz: στην άκρη (GET s.js) + ό,τι αναφέρει η σελίδα (loader με το z όπως γράφεται)
  checks.push(await timed("zaraz", "Cloudflare Zaraz στην άκρη", async () => {
    const probe = await fetchGot(origin, "/cdn-cgi/zaraz/s.js", { ua: pageUa, accept: "*/*" });
    const findings = zarazProbe(probe);
    if (!("error" in probe) && probe.status >= 200 && probe.status < 300) findings.push(...scanChunk(probe.body).map((f) => ({ ...f, detail: `${f.detail} (/cdn-cgi/zaraz/s.js)` })));
    const refs = [...new Set([...pages, ...cloakPages].flatMap((p) => zarazRefs(html(p), origin)))].sort();
    if (refs.length) findings.push({ severity: "critical", title: "Οι σελίδες αναφέρουν το Cloudflare Zaraz", detail: `Αναφορές σε /cdn-cgi/zaraz/ στο HTML: ${refs.slice(0, 5).join(", ")} — το Zaraz εκτελεί «Custom HTML» σε κάθε σελίδα (ο τρόπος της επίθεσης). Cloudflare → Zaraz → απενεργοποίηση.`, evidence: [...new Set(refs.map((r) => r.replace(/\?.*$/, "")))].join(", ") });
    for (const ref of refs.slice(0, 5)) {
      const g = await fetchGot(origin, ref, { ua: pageUa, accept: "*/*" });
      if (!("error" in g) && g.status === 200) findings.push(...scanChunk(g.body).map((f) => ({ ...f, detail: `${f.detail} (loader ${ref.replace(/\?.*$/, "")})` })));
    }
    const pst = "error" in probe ? probe.error : `HTTP ${probe.status}`;
    return { summary: `GET /cdn-cgi/zaraz/s.js: ${pst}${"error" in probe || probe.status !== 404 ? "" : " (ανενεργό)"} · αναφορές στις σελίδες: ${refs.length}${refs.length ? " (ο loader κατέβηκε και σαρώθηκε)" : ""}`, findings };
  }));

  if (a.mode === "full") {
    // αρχεία JS: όλα όσα αναφέρουν οι σελίδες (και του cloaking), ακεραιότητα + σάρωση
    checks.push(await timed("chunks", "Αρχεία JavaScript του site", async () => {
      const refs = [...new Set([...pages, ...cloakPages].filter(okPage).flatMap((p) => chunkRefs(html(p), origin)))].sort();
      let got = await pool(refs, 3, (p) => fetchChunk(origin, p));
      const failed = got.filter((g) => !chunkOk(g.row) && !g.row.redirectTo);
      if (failed.length) {
        await sleep(RECHECK_MS); // σύντομο παράθυρο deploy: δεύτερη προσπάθεια
        const again = new Map((await pool(failed.map((g) => g.row.path), 3, (p) => fetchChunk(origin, p))).map((g) => [g.row.path, g]));
        got = got.map((g) => again.get(g.row.path) ?? g);
      }
      chunkLog.push(...got.map((g) => g.row));
      const scans = got.filter((g) => chunkOk(g.row) && /\b(?:java|ecma)script\b/i.test(g.row.contentType ?? "")).map((g) => ({ path: g.row.path, findings: scanChunk(g.text) }));
      const findings = [...chunkIntegrity(got.map((g) => g.row)), ...mergeFindings(scans), ...emptyCheck("αρχεία JS", scans.length)];
      for (const g of got) watchChunks[g.row.path] = { status: g.row.status, sha256: g.row.sha256, error: g.row.error, ...(g.row.challenge ? { challenge: true } : {}) };
      const bytes = got.reduce((s, g) => s + (g.row.bytes ?? 0), 0);
      return { summary: `${refs.length} αρχεία /_next/static (scripts + RSC payload) από ${pages.length + cloakPages.length} λήψεις σελίδων: ${got.filter((g) => chunkOk(g.row)).length} απάντησαν 200, ${scans.length} σαρώθηκαν (${Math.round(bytes / 1024)} KB — άγνωστα domains, φιλοξενία περιεχομένου χρηστών, base64 > 20 KB, eval/new Function, συγκάλυψη, δείκτες της επίθεσης) · δυναμικά φορτωμένα αρχεία που δεν αναφέρονται στο HTML δεν ελέγχονται · σύγκριση με build: παραλείπεται`, findings };
    }));

    // cloaking των αρχείων JS: κάθε παραλλαγή κατεβάζει τα δικά της αρχεία με τον ίδιο user agent και Referer τη σελίδα
    // (όπως ο browser) — ένα αρχείο ανά user agent· σύγκριση sha256 με το αντίγραφο του φύλακα
    checks.push(await timed("cloaking", "Cloaking (άλλο περιεχόμενο ανά επισκέπτη)", async () => {
      const t0 = Date.now();
      const jobs = new Map<string, { ua: string; path: string; referer: string }>();
      for (const v of variantsSeen) for (const p of v.refs) { const k = `${v.ua}\n${p}`; if (!jobs.has(k)) jobs.set(k, { ua: v.ua, path: p, referer: new URL(v.path, origin).href }); }
      const all = [...jobs.values()];
      const todo = all.slice(0, VARIANT_CHUNK_CAP);
      const res = await pool(todo, 3, (j) => fetchChunk(origin, j.path, { ua: j.ua, referer: j.referer, extra: SCRIPT_FETCH }));
      const byUa = new Map<string, Record<string, ChunkSeen>>();
      todo.forEach((j, i) => { const m = byUa.get(j.ua) ?? {}; m[j.path] = { status: res[i].row.status, sha256: res[i].row.sha256, error: res[i].row.error, ...(res[i].row.challenge ? { challenge: true } : {}) }; byUa.set(j.ua, m); });
      const findings = [...cloakF];
      let compared = 0;
      for (const v of variantsSeen) {
        const m = byUa.get(v.ua) ?? {};
        const mine = Object.fromEntries(v.refs.filter((p) => m[p]).map((p) => [p, m[p]]));
        compared += Object.values(mine).filter((c) => c.status === 200 && c.sha256).length;
        findings.push(...variantChunks(watchChunks, mine, v.only, `${v.label}, ${v.path}`));
      }
      findings.push(...capFinding(all.length - todo.length, VARIANT_CHUNK_CAP), ...emptyCheck("σελίδες ως άλλος επισκέπτης", cloakPages.filter(okPage).length), ...emptyCheck("αρχεία JS ως άλλος επισκέπτης", compared));
      return { summary: `${cloakSummary} · αρχεία JS: ${todo.length} λήψεις ως Windows Chrome / iPhone Safari (Referer τη σελίδα, Sec-Fetch-Dest: script), ${compared} συγκρίσεις sha256 με το αντίγραφο του φύλακα, ${variantsSeen.reduce((s, v) => s + v.only.length, 0)} αρχεία που αναφέρει μόνο άλλος επισκέπτης (${Math.round((Date.now() - t0) / 1000)}″)`, findings: mergeFindings([{ path: "cloaking", findings }]) };
    }));

    checks.push(await timed("robots", "robots.txt και sitemap.xml", async () => ({ summary: `robots.txt + ${sitemapNote}`, findings: robotsF })));

    checks.push(await timed("cert", "Πιστοποιητικό HTTPS", async () => {
      const host = new URL(origin).hostname;
      const r = certOutcome(await peerCert(host), startedAt);
      return { summary: r.summary, findings: r.findings };
    }));

    checks.push(await timed("dns", "DNS (σε σύγκριση με την εικόνα αναφοράς)", async () => {
      const base = await loadBaseline();
      const { current, failures } = await queryDns();
      dnsCurrent = current;
      const findings = diffDns(base.records, current, failures);
      return { summary: `${Object.keys(current).length + Object.keys(failures).length} εγγραφές (${DNS_NAMES.map((n) => n.name).join(", ")}: A/AAAA/CNAME/MX/TXT/CAA/NS, _dmarc TXT) μέσω 1.1.1.1/8.8.8.8 σε σύγκριση με security/dns-baseline.json (${base.generatedAt?.slice(0, 10) ?? "—"})`, findings };
    }));

    checks.push(await timed("ct", "Νέα πιστοποιητικά *.dgsoft.gr (Certificate Transparency)", async () => {
      const base = await loadBaseline();
      let ct: Awaited<ReturnType<typeof ctEntries>>;
      try { ct = await ctEntries(); } catch (e) {
        return { summary: "crt.sh και certspotter μη διαθέσιμα — δεν ελέγχθηκε", findings: [{ severity: "error", title: "Certificate Transparency: δεν ελέγχθηκε", detail: `crt.sh και certspotter δεν απάντησαν (${errText(e)}). Δεν είναι εύρημα ασφαλείας — θα ξαναδοκιμαστεί αύριο.`, evidence: "ct unavailable" }] };
      }
      ctSource = ct.source;
      notes.push(...ct.notes);
      return { summary: `${ct.entries.length} πιστοποιητικά από ${ct.source}${ct.notes.length ? ` (${ct.notes.join("; ")})` : ""}· νέα των τελευταίων 2 ημερών σε σύγκριση με ${base.knownCertNames.length} γνωστά ονόματα`, findings: newCerts(ct.entries, base.knownCertNames, startedAt) };
    }));
  }

  // heartbeat: τελευταίο, γιατί κρίνει και το «εσωτερικό ΟΚ ενώ ο φύλακας βρίσκει κρίσιμο»
  const watchStatus = worst(checks.filter((c) => OVERLAP_KEYS.includes(c.key)).map((c) => c.status));
  checks.push(await timed("heartbeat", "Ο εσωτερικός έλεγχος τρέχει; (heartbeat)", async () => {
    const hb = await heartbeat(origin);
    return { summary: `GET /api/security/heartbeat (υπογεγραμμένο): ${heartbeatSummary(hb)}`, findings: heartbeatVerdict(hb, new Date(), watchStatus) };
  }));

  const finishedAt = new Date();
  const status: Severity = worst(checks.map((c) => c.status));
  /** για stdout / artifact (δημόσια): χωρίς το heartbeat */
  const pubStatus = publicStatus(checks);
  const report: WatchReport = { mode: a.mode, status, startedAt, finishedAt, site: origin, checks, notes };
  const run = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;

  // email: full πάντα· light μόνο σε κρίσιμο που δεν στάλθηκε τις τελευταίες 23 ώρες
  let state: { sent: Record<string, string> } = { sent: {} };
  try { const s = JSON.parse(await readFile(a.state, "utf8")); if (s && typeof s.sent === "object") state = { sent: s.sent }; } catch { /* πρώτη εκτέλεση */ }
  const crit = lightAlerts(checks, state.sent, finishedAt);
  const send = a.mode === "full" || crit.length > 0;
  let email: { required: boolean; sent: boolean; info: string } = { required: send, sent: false, info: send ? "" : "light χωρίς νέο κρίσιμο — χωρίς email" };
  if (send && a.dry) email.info = "--dry: δεν στάλθηκε";
  else if (send) {
    const r = await mailgun(renderWatchEmail(report, run));
    email = { required: true, sent: r.ok, info: r.info };
    if (r.ok) state.sent = updateSent(state.sent, crit.map((c) => c.fp), finishedAt);
  }
  if (!a.dry) await writeFile(a.state, `${JSON.stringify(state)}\n`).catch(() => undefined);

  const out = {
    watcher: VERSION, mode: a.mode, site: origin, status: pubStatus, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), seed, requests, run, email: { required: email.required, sent: email.sent }, notes,
    checks: publicChecks(checks), pages: pageLog, chunks: chunkLog.map((c) => ({ path: c.path, status: c.status ?? null, sha256: c.sha256 ?? null, bytes: c.bytes ?? null, ...(c.error ? { error: c.error } : {}), ...(c.redirectTo ? { redirectTo: c.redirectTo } : {}) })),
    dns: dnsCurrent, ct: ctSource,
  };
  await writeFile(a.out, `${JSON.stringify(out, null, 2)}\n`);
  // stdout = log του Actions, δημόσιο: μόνο η συνολική κατάσταση χωρίς το heartbeat (λεπτομέρειες στο email)
  console.log(JSON.stringify({ mode: a.mode, status: pubStatus, seconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000), email: { sent: email.sent } }));
  if (email.required && !email.sent && !a.dry) { console.error(`[security-watch] το email δεν στάλθηκε (${email.info})`); process.exitCode = 1; }
}

main().catch((e) => { console.error("[security-watch] ο φύλακας δεν ολοκληρώθηκε:", e instanceof Error ? e.stack ?? e.message : e); process.exit(2); });
