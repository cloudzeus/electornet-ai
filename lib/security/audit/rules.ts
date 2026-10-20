import { ALLOWED_CDN_CGI, ALLOWED_FRAME_HOSTS, CLICKFIX_MARKERS, SPAM_MARKERS, REQUIRED_HEADERS, type Marker } from "./policy";

/**
 * Καθαροί κανόνες του ελέγχου ασφαλείας — κοινοί για τον εσωτερικό έλεγχο (εφαρμογή) και τον εξωτερικό φύλακα
 * (scripts/security-watch.ts, μέσω lib/security/audit/watch-core.ts). ΚΑΘΑΡΟ αρχείο: κανένα import εκτός από το policy.ts
 * — ούτε Node (το sha256 του fingerprint είναι δικό μας), ούτε prisma, ούτε DOM βιβλιοθήκη (regex σε tags).
 *
 * Αρχή: ακρίβεια. Κανένα ψευδές «όλα καλά» (ό,τι δεν αναγνωρίζεται → εύρημα) και κανένα ψευδές «κρίσιμο» (λέξεις που
 * μπορεί να είναι νόμιμο κείμενο προϊόντος → warn, όχι critical). Τα τεκμήρια (evidence) δεν περιέχουν ό,τι αλλάζει σε
 * κάθε αίτημα (nonce, query του Zaraz), ώστε το ίδιο εύρημα να έχει το ίδιο fingerprint (dedupe ειδοποιήσεων 24 ωρών).
 */

export type Severity = "ok" | "warn" | "critical" | "error";
export type Finding = { severity: Exclude<Severity, "ok">; title: string; detail: string; evidence?: string };
export type CheckResult = { key: string; title: string; status: Severity; summary: string; findings: Finding[]; ms: number };
export type ParsedScript = {
  src: string | null; host: string | null; inline: boolean; nonce: string | null;
  /** το type attribute (null αν λείπει) */
  type: string | null;
  /** ο κώδικας του inline script ("" για εξωτερικά) */
  code: string;
};

const RANK: Record<Severity, number> = { ok: 0, warn: 1, error: 2, critical: 3 };
/** Η χειρότερη κατάσταση: critical > error > warn > ok (κενή λίστα → ok). */
export function worst(statuses: Severity[]): Severity {
  return statuses.reduce<Severity>((w, s) => (RANK[s] > RANK[w] ? s : w), "ok");
}
/** Κατάσταση ενός ελέγχου από τα ευρήματά του. */
export const statusOf = (findings: Finding[]): Severity => worst(findings.map((f) => f.severity));

// ── HTML χωρίς DOM ───────────────────────────────────────────────────────────────────────────────────────────────────
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/", period: "." };
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});?/gi, (m, h: string) => safeChar(parseInt(h, 16), m))
    .replace(/&#(\d{1,7});?/g, (m, d: string) => safeChar(parseInt(d, 10), m))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);
}
const safeChar = (c: number, fallback: string) => (c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : fallback);

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
/** Attributes ενός tag (ονόματα σε πεζά, η πρώτη εμφάνιση κερδίζει όπως στον browser, τιμές με αποκωδικοποιημένα entities). */
function attrs(raw: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of raw.matchAll(ATTR)) {
    const k = a[1].toLowerCase();
    if (!m.has(k)) m.set(k, decodeEntities(a[2] ?? a[3] ?? a[4] ?? ""));
  }
  return m;
}
// τα attributes ως εναλλαγές που δεν επικαλύπτονται (χωρίς catastrophic backtracking)· «>» μέσα σε εισαγωγικά επιτρέπεται
const ATTRS_PART = `((?:[^>"']|"[^"]*"|'[^']*')*)`;
const SCRIPT_RE = new RegExp(`<script\\b${ATTRS_PART}>([\\s\\S]*?)<\\/script\\s*>`, "gi");
const FRAME_RE = new RegExp(`<i?frame\\b${ATTRS_PART}>`, "gi");
const TAG_RE = new RegExp(`<([a-z][a-z0-9-]*)\\b${ATTRS_PART}>`, "gi");

const snip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

function srcHost(src: string): string | null {
  try {
    if (src.startsWith("//")) return new URL(`https:${src}`).hostname || null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return new URL(src).hostname || null;
  } catch { /* άκυρο URL */ }
  return null;
}

/** Τύποι που εκτελεί ο browser (και άρα θέλουν nonce). Το «<hex>-text/javascript» είναι του Rocket Loader του Cloudflare. */
function isExecutable(type: string | null): boolean {
  const t = (type ?? "").trim().toLowerCase();
  return !t || t === "module" || t === "importmap" || t === "speculationrules" || /(?:java|ecma|j|live)script/.test(t);
}

/** `<script>` (εξωτερικά και inline) και iframes του HTML. iframe με srcdoc → "about:srcdoc", χωρίς src → "about:blank". */
export function parseScripts(html: string): { scripts: ParsedScript[]; iframes: string[] } {
  const scripts: ParsedScript[] = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const a = attrs(m[1]);
    const src = a.get("src")?.trim() || null;
    scripts.push({ src, host: src ? srcHost(src) : null, inline: !src, nonce: a.get("nonce") || null, type: a.has("type") ? a.get("type")! : null, code: src ? "" : m[2] });
  }
  const iframes: string[] = [];
  for (const m of html.matchAll(FRAME_RE)) {
    const a = attrs(m[1]);
    iframes.push(a.has("srcdoc") ? "about:srcdoc" : a.get("src")?.trim() || "about:blank");
  }
  return { scripts, iframes };
}

// ── κατάταξη απάντησης ───────────────────────────────────────────────────────────────────────────────────────────────
const lowerKeys = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));

/**
 * «challenge» = γνήσια σελίδα ελέγχου του Cloudflare (403/503 από server cloudflare με `cf-mitigated: challenge` ή τίτλο
 * «Just a moment…»): δεν σαρώνεται — ο καλών τη δίνει ως error («δεν ελέγχθηκε»), ποτέ ως ΟΚ. «Just a moment» με 200
 * ΔΕΝ είναι έλεγχος του Cloudflare: είναι σελίδα μας και σαρώνεται (εκεί θα φαινόταν ψεύτικο CAPTCHA). Άλλο 4xx/5xx → error.
 */
export function classifyPage(status: number, headers: Record<string, string>, html: string): "page" | "challenge" | "error" {
  const h = lowerKeys(headers);
  if ((status === 403 || status === 503) && /cloudflare/i.test(h.server ?? "")
    && (/^\s*challenge\s*$/i.test(h["cf-mitigated"] ?? "") || /<title>\s*Just a moment(?:\.\.\.|…)?\s*<\/title>/i.test(html))) return "challenge";
  return status < 200 || status >= 400 ? "error" : "page";
}

// ── δείκτες ClickFix ─────────────────────────────────────────────────────────────────────────────────────────────────
type Hit = { label: string; kind: Marker["kind"]; match: string };
function markerHits(text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of CLICKFIX_MARKERS) { const x = m.re.exec(text); if (x) out.push({ label: m.label, kind: m.kind, match: x[0] }); }
  return out;
}
/**
 * strong → critical. Συντόμευση (keys) μαζί με εργαλείο (tool) ή φράση δολώματος (lure), φράση δολώματος + εργαλείο, ή
 * το ζεύγος του δολώματος Win+R + Ctrl+V → critical. Οτιδήποτε άλλο (π.χ. «Win+X, Ctrl+C / Ctrl+V, Win+D» σε
 * περιγραφή πληκτρολογίου, «PowerShell + Windows Terminal» σε περιγραφή λογισμικού) → warn.
 */
function markerSeverity(hits: Hit[]): "critical" | "warn" | null {
  if (!hits.length) return null;
  const kinds = new Set(hits.map((h) => h.kind)), labels = new Set(hits.map((h) => h.label));
  if (kinds.has("strong")) return "critical";
  if (kinds.has("keys") && (kinds.has("tool") || kinds.has("lure"))) return "critical";
  if (kinds.has("lure") && kinds.has("tool")) return "critical";
  return labels.has("Win+R") && labels.has("Ctrl+V") ? "critical" : "warn"; // ετικέτες του CLICKFIX_MARKERS
}
const hitsEvidence = (hits: Hit[]) => hits.map((h) => (h.match.trim() ? `${h.label}: «${snip(h.match, 60)}»` : h.label)).join(" · ");

// ── σελίδα όπως τη βλέπει ο επισκέπτης ───────────────────────────────────────────────────────────────────────────────
const hostIn = (host: string, list: readonly string[]) => {
  const h = host.toLowerCase().replace(/\.$/, "");
  return list.some((x) => { const a = x.toLowerCase(); return h === a || h.endsWith(`.${a}`); });
};

/**
 * Λειτουργίες του Cloudflare κάτω από /cdn-cgi/. warn = γνωστή λειτουργία που ΔΕΝ εκτελεί περιεχόμενο τρίτων (Email
 * Obfuscation, Bot Fight Mode / JS detections) — όχι επίθεση. critical = Zaraz (εκτελεί οποιοδήποτε «Custom HTML» — έτσι
 * έγινε η επίθεση), Rocket Loader (ξαναγράφει τα scripts μας) και κάθε άλλη/άγνωστη διαδρομή.
 */
type CdnFeature = { name: string; severity: "warn" | "critical"; off?: string };
const CDN_FEATURES: (CdnFeature & { re: RegExp })[] = [
  { re: /^\/cdn-cgi\/zaraz\//, name: "Cloudflare Zaraz (εργαλεία τρίτων / «Custom HTML» — ο τρόπος της επίθεσης)", severity: "critical" },
  { re: /rocket-loader/, name: "Cloudflare Rocket Loader", severity: "critical" },
  { re: /^\/cdn-cgi\/scripts\/[0-9a-f]+\/cloudflare-static\/email-decode\.min\.js$/, name: "Cloudflare Email Obfuscation (Scrape Shield)", severity: "warn", off: "Scrape Shield → Email Address Obfuscation" },
  { re: /^\/cdn-cgi\/challenge-platform\//, name: "Cloudflare Bot Fight Mode / JavaScript detections", severity: "warn", off: "Security → Bots → Bot Fight Mode / JavaScript detections" },
  { re: /^\/cdn-cgi\/apps\//, name: "Cloudflare Apps", severity: "critical" },
  { re: /^\/cdn-cgi\/rum/, name: "Cloudflare Web Analytics (RUM)", severity: "critical" },
];
const UNKNOWN_CDN: CdnFeature = { name: "λειτουργία του Cloudflare (/cdn-cgi/)", severity: "critical" };
/**
 * Η διαδρομή αποκωδικοποιημένη (%2f, %2e, %63…) — ή null αν είναι ύποπτη (.., \\, //, διπλή κωδικοποίηση): τότε καμία
 * γνωστή λειτουργία δεν αναγνωρίζεται («/cdn-cgi/challenge-platform/..%2fzaraz/s.js» δεν είναι Bot Fight Mode).
 */
function cleanPath(p: string): string | null {
  let d: string;
  try { d = decodeURIComponent(p); } catch { return null; }
  return /(?:^|\/)\.\.?(?:\/|$)|\\|\/\/|%/.test(d) ? null : d;
}
const cdnFeature = (path: string | null): CdnFeature => (path === null ? UNKNOWN_CDN : CDN_FEATURES.find((f) => f.re.test(path)) ?? UNKNOWN_CDN);
/** Η μόνη διαδρομή που φορτώνει ο loader του Cloudflare JavaScript detections. */
const JSD_PATH = /^\/cdn-cgi\/challenge-platform\/(?:h\/[a-z]\/)?scripts\/jsd\/(?:[0-9a-f]+\/)?main\.js$/;
/**
 * Inline loader του Cloudflare JavaScript detections (Bot Fight Mode) — ΜΟΝΟ το γνωστό του σχήμα: μικρός (< 2 KB), με
 * `__CF$cv$params`, κάθε /cdn-cgi/ και κάθε `.src =` είναι ακριβώς ο main.js του JSD, κανένα απόλυτο URL προς άλλο host,
 * χωρίς cookies / fetch / XMLHttpRequest / Image / sendBeacon / eval / Function / atob / zaraz / δείκτες ClickFix.
 */
function isJsdLoader(code: string, origin: URL): boolean {
  if (code.length >= 2048 || !code.includes("__CF$cv$params")) return false;
  const cdn = [...code.matchAll(/\/cdn-cgi\/[^\s"'`\\)<>?#;]*/g)].map((m) => m[0]);
  if (!cdn.length || !cdn.every((p) => JSD_PATH.test(p))) return false;
  const srcs = [...code.matchAll(/\.src\s*=\s*([^;,)}]+)/g)].map((m) => m[1].trim());
  if (!srcs.length || !srcs.every((v) => /^(['"])([^'"]*)\1$/.test(v) && JSD_PATH.test(v.slice(1, -1)))) return false;
  for (const m of code.matchAll(/(?:[a-z][a-z0-9+.-]*:)?\/\/([^\s"'`\\/?#)]+)/gi)) if (m[1].toLowerCase() !== origin.host) return false;
  // case-sensitive: το «function(){» του loader δεν είναι «Function»
  return !/\bcookie\b|\bfetch\b|XMLHttpRequest|\bImage\b|sendBeacon|\beval\b|\bFunction\b|\batob\b|\bimportScripts\b|WebSocket|\blocalStorage\b/.test(code) && !/\bzaraz\b/i.test(code)
    && !markerHits(code).length;
}
const CDN_DETAIL = "Το προσθέτει το Cloudflare στις σελίδες μας — δεν το βάζει η εφαρμογή, και δεν χρησιμοποιούμε καμία λειτουργία /cdn-cgi/. "
  + "Αν δεν το ενεργοποιήσατε εσείς, ελέγξτε αμέσως τον λογαριασμό Cloudflare (Zaraz → Tools/Custom HTML, Rules, Speed → Optimization). "
  + "Αν είναι γνωστή και επιθυμητή λειτουργία, η διαδρομή μπαίνει ρητά στο ALLOWED_CDN_CGI (lib/security/audit/policy.ts).";
const cdnDetail = (f: CdnFeature) => (f.severity === "warn"
  ? `Λειτουργία του Cloudflare — όχι επίθεση: το Cloudflare προσθέτει αυτό το script για τη λειτουργία «${f.name}» (δεν εκτελεί περιεχόμενο τρίτων). Αν δεν τη θέλετε, κλείστε τη στο Cloudflare (${f.off}). Αν την κρατάτε, η διαδρομή μπαίνει στο ALLOWED_CDN_CGI (lib/security/audit/policy.ts).`
  : CDN_DETAIL);

export type ScanPageCtx = {
  /** η βάση του site, π.χ. https://euronics.dgsoft.gr */
  origin: string;
  /**
   * Τα αρχεία του build (`.next/static` στον δίσκο), ως διαδρομές σχετικές με το `.next/static` — π.χ.
   * "chunks/app/[slug]/page-abc.js" (γίνεται δεκτό και το πλήρες "/_next/static/…"). Να περιέχει ΟΛΟ το .next/static, όχι
   * μόνο το chunks/ (π.χ. "<buildId>/_buildManifest.js"). null = άγνωστο (εξωτερικός φύλακας) → τα /_next/static γίνονται δεκτά.
   */
  buildChunks: Set<string> | null;
  /** hostnames επιτρεπτών scripts (allowedScriptHosts() του policy — μόνο ρυθμισμένα pixels) */
  allowedScriptHosts: string[];
  /** προθέματα /cdn-cgi/ που επιτρέπονται (προεπιλογή ALLOWED_CDN_CGI — κενή) */
  allowedCdnCgi?: readonly string[];
};

function inBuild(pathname: string, chunks: Set<string>): boolean {
  const rel = pathname.slice("/_next/static/".length);
  let dec: string;
  try { dec = decodeURIComponent(rel); } catch { return false; }
  return chunks.has(dec) || chunks.has(rel) || chunks.has(`/_next/static/${dec}`) || chunks.has(pathname);
}

/**
 * Κανόνες για μια σελίδα (classifyPage === "page"): κάθε script πρέπει να είναι αρχείο /_next/static του build ή από host
 * της λίστας· κανένα inline script χωρίς nonce· ένα μόνο nonce σε όλη τη σελίδα· τίποτα από /cdn-cgi/ (Cloudflare Zaraz
 * κ.λπ.)· iframes μόνο της λίστας· δείκτες ClickFix/συγκάλυψης παντού — και μέσα σε inline scripts ΜΕ nonce, γιατί το
 * Cloudflare προσθέτει δικό του nonce στο CSP μας για ό,τι εισάγει.
 */
export function scanPage(html: string, ctx: ScanPageCtx): Finding[] {
  const base = new URL(ctx.origin);
  const cdnOk = (path: string) => (ctx.allowedCdnCgi ?? ALLOWED_CDN_CGI).some((p) => path.startsWith(p));
  const out: Finding[] = [];
  const add = (f: Finding) => { if (!out.some((o) => o.severity === f.severity && o.title === f.title && o.evidence === f.evidence)) out.push(f); };
  const crit = (title: string, detail: string, evidence?: string) => add({ severity: "critical", title, detail, ...(evidence !== undefined ? { evidence } : {}) });

  const { scripts, iframes } = parseScripts(html);
  const byNonce = new Map<string, ParsedScript[]>();
  // αθώα scripts του Cloudflare: εξωτερικά /cdn-cgi/ του ΔΙΚΟΥ μας origin επιπέδου warn (ή εγκεκριμένα) και inline ΜΟΝΟ
  // ο γνήσιος loader του JSD (isJsdLoader)· χωρίς nonce / με δικό τους nonce δεν δίνουν critical (τα αναφέρει το εύρημα της λειτουργίας)
  const benign = new Set<ParsedScript>();
  for (const s of scripts) {
    if (s.nonce) byNonce.set(s.nonce, [...(byNonce.get(s.nonce) ?? []), s]);
    if (s.type && /^[0-9a-f]+-text\/javascript$/i.test(s.type.trim())) {
      crit("Cloudflare Rocket Loader άλλαξε τα scripts της σελίδας", `Script με type «…-text/javascript»: το Rocket Loader του Cloudflare ξαναγράφει και εκτελεί τα scripts μας. ${CDN_DETAIL}`, "type=…-text/javascript");
    }
    if (s.inline) {
      if (!isExecutable(s.type)) continue;
      const paths = [...new Set([...s.code.matchAll(/\/cdn-cgi\/[^\s"'`\\)<>?#]*/g)].map((m) => m[0]))].filter((p) => { const c = cleanPath(p); return !c || !cdnOk(c); }).sort();
      const zaraz = /\bzaraz\b/i.test(s.code) && !cdnOk("/cdn-cgi/zaraz/");
      const jsd = isJsdLoader(s.code, base);
      if (jsd) benign.add(s);
      if (!s.nonce && !jsd) crit("Inline script χωρίς nonce", "Η εφαρμογή βάζει nonce σε κάθε inline script· αυτό δεν το έβαλε η εφαρμογή (ένεση στο HTML ή από ενδιάμεσο).", snip(s.code, 120));
      if (paths.length || zaraz) {
        // warn μόνο για τον γνήσιο loader του JSD· ό,τι άλλο αναφέρει /cdn-cgi/ (ακόμη και «challenge-platform») → critical
        const known = cdnFeature(zaraz ? "/cdn-cgi/zaraz/" : cleanPath(paths.find((p) => cdnFeature(cleanPath(p)).severity === "critical") ?? paths[0]));
        const f: CdnFeature = jsd ? known : { ...known, severity: "critical" };
        add({ severity: f.severity, title: `Inline script του Cloudflare: ${f.name}`,
          detail: `${s.nonce ? "Έχει nonce — το Cloudflare προσθέτει δικό του nonce στο CSP μας, οπότε ο browser το εκτελεί. " : "Χωρίς nonce (το CSP μας το μπλοκάρει). "}${jsd || known.severity === "critical" ? cdnDetail(f) : `Αναφέρει «${known.name}» αλλά ΔΕΝ έχει το γνωστό σχήμα του loader του Cloudflare — αντιμετωπίστε το ως ένεση. ${CDN_DETAIL}`}`,
          evidence: paths.length ? paths.join(", ") : "zaraz" });
      }
      continue;
    }
    let u: URL;
    try { u = new URL(s.src!, base); } catch { crit("Script με άκυρη διεύθυνση", "Το src δεν είναι έγκυρο URL.", snip(s.src!, 120)); continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") { crit(`Script από ${u.protocol} (όχι αρχείο)`, "Κώδικας μέσα στη διεύθυνση του script — δεν το κάνει ποτέ η εφαρμογή.", snip(s.src!, 80)); continue; }
    const same = u.origin === base.origin;
    const dp = cleanPath(u.pathname); // null = ύποπτη κωδικοποίηση (..%2f, %2e, \\, διπλή κωδικοποίηση)
    let loose = u.pathname;
    try { loose = decodeURIComponent(u.pathname); } catch { /* μένει η ακατέργαστη */ }
    if (dp !== null ? dp.startsWith("/cdn-cgi/") : /\/cdn-cgi\//i.test(loose)) {
      // γνωστή λειτουργία (warn / εγκεκριμένη) ΜΟΝΟ από το δικό μας origin με καθαρή διαδρομή· αλλιώς → critical
      const known = cdnFeature(dp);
      const ours = same && dp !== null;
      if (ours && (cdnOk(dp) || known.severity === "warn")) benign.add(s);
      if (ours && cdnOk(dp)) continue;
      const f: CdnFeature = ours ? known : { ...known, severity: "critical" };
      add({ severity: f.severity, title: `Script του Cloudflare: ${f.name}${same ? "" : " — από ξένο host"}`,
        detail: same ? cdnDetail(f) : `Διαδρομή /cdn-cgi/ σε host που δεν είναι το site μας — δεν είναι λειτουργία του δικού μας Cloudflare. ${CDN_DETAIL}`,
        evidence: same ? u.pathname : `${u.host}${u.pathname}` });
      if (same) continue;
    } else if (same && dp === null) {
      crit("Script από το δικό μας domain με ύποπτη διαδρομή", "Κωδικοποιημένα «..», «/» ή «\\» στη διαδρομή — δεν τα παράγει ποτέ η εφαρμογή.", u.pathname);
      continue;
    }
    if (same) {
      if (u.pathname.startsWith("/_next/static/")) {
        if (ctx.buildChunks && !inBuild(u.pathname, ctx.buildChunks)) crit("Αρχείο /_next/static που δεν υπάρχει στο build", "Το site σερβίρει script που δεν παρήγαγε το build του server — αντικατεστάθη/προστέθηκε αρχείο ή το σερβίρει άλλος (cache/ενδιάμεσος).", u.pathname);
      } else if (!u.pathname.startsWith("/cdn-cgi/")) {
        crit("Script από το δικό μας domain εκτός /_next/static", "Η εφαρμογή φορτώνει scripts μόνο από /_next/static· αυτό το αρχείο δεν ανήκει στο build.", u.pathname);
      }
      continue;
    }
    if (!hostIn(u.hostname, ctx.allowedScriptHosts)) crit("Script από άγνωστο host", "Ο host δεν είναι στη λίστα επιτρεπτών (μόνο τα ρυθμισμένα analytics/pixels).", `${u.host}${u.pathname}`);
    else if (u.protocol !== "https:") crit("Script χωρίς https", "Επιτρεπτός host αλλά χωρίς κρυπτογράφηση.", `${u.host}${u.pathname}`);
  }

  // ένα nonce ανά αίτημα: δεύτερο nonce = κάποιος άλλος (π.χ. Cloudflare Zaraz) πρόσθεσε δικά του scripts
  if (byNonce.size > 1) {
    // «δικό μας» nonce = αυτό των chunks του Next (/_next/static) και του RSC payload (__next_f)· ισοπαλία → το συχνότερο
    const ours = (s: ParsedScript) => (s.src ? /^\/_next\/static\//.test(s.src) || (srcHost(s.src) === base.hostname && /\/_next\/static\//.test(s.src)) : /__next_[fs]\b/.test(s.code));
    const score = (l: ParsedScript[]) => l.filter(ours).length * 1e6 + l.length;
    const [, ...minority] = [...byNonce.values()].sort((a, b) => score(b) - score(a));
    const ev = [...new Set(minority.flat().map((s) => (s.src ? s.src.replace(/[?#].*$/, "") : snip(s.code, 80))))].sort().join(" | ");
    const onlyCf = minority.flat().every((s) => benign.has(s));
    add({ severity: onlyCf ? "warn" : "critical", title: "Scripts με διαφορετικά nonce στην ίδια σελίδα",
      detail: `Βρέθηκαν ${byNonce.size} διαφορετικά nonce· η εφαρμογή βάζει ένα ανά αίτημα. ${onlyCf
        ? "Το δεύτερο το έχουν μόνο scripts γνωστής λειτουργίας του Cloudflare (βλ. το αντίστοιχο εύρημα) — όχι επίθεση, αλλά δείχνει ότι το Cloudflare προσθέτει scripts στις σελίδες μας."
        : "Κάτι άλλο (π.χ. Cloudflare Zaraz) πρόσθεσε δικά του scripts με δικό του nonce. Τα scripts με το «ξένο» nonce φαίνονται στο τεκμήριο."}`,
      evidence: ev });
  }

  for (const src of iframes) {
    if (src === "about:blank") continue;
    if (src === "about:srcdoc") { crit("iframe με srcdoc", "iframe με ενσωματωμένο HTML (srcdoc) — δεν το παράγει η εφαρμογή.", "srcdoc"); continue; }
    let u: URL;
    try { u = new URL(src, base); } catch { crit("iframe με άκυρη διεύθυνση", "Το src δεν είναι έγκυρο URL.", snip(src, 120)); continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") crit(`iframe από ${u.protocol}`, "Κώδικας μέσα στη διεύθυνση του iframe.", snip(src, 80));
    else if (u.origin !== base.origin && !hostIn(u.hostname, ALLOWED_FRAME_HOSTS)) crit("iframe από άγνωστο host", "Επιτρέπονται μόνο YouTube, Vimeo και Google Tag Manager.", `${u.host}${u.pathname}`);
  }

  // δείκτες ClickFix: σε κάθε εκτελέσιμο inline script (με ή χωρίς nonce) και στο υπόλοιπο HTML· η σοβαρότητα κρίνεται
  // από όλους μαζί (το δόλωμα στο κείμενο + η εντολή στο script είναι το ίδιο περιστατικό)
  const regions: { inline: boolean; nonce: string | null; text: string }[] = [];
  const rest = html.replace(SCRIPT_RE, (m, a: string, code: string) => {
    const at = attrs(a);
    if (at.get("src")?.trim() || !isExecutable(at.has("type") ? at.get("type")! : null)) return m;
    regions.push({ inline: true, nonce: at.get("nonce") || null, text: code });
    return "<script></script>";
  });
  regions.push({ inline: false, nonce: null, text: rest });
  const hit = regions.map((r) => ({ r, hits: markerHits(r.text) })).filter((x) => x.hits.length);
  const all = hit.flatMap((x) => x.hits);
  const sev = markerSeverity(all);
  if (sev === "warn") {
    // ένα εύρημα για όλη τη σελίδα: η ίδια λέξη εμφανίζεται και στο κείμενο και στα δεδομένα του Next (__next_f)
    const uniq = all.filter((h, i) => all.findIndex((x) => x.label === h.label) === i);
    add({ severity: "warn", title: "Ύποπτη λέξη στη σελίδα", detail: "Λέξη που χρησιμοποιούν τα δολώματα ClickFix, χωρίς το μοτίβο τους (οδηγία πληκτρολογίου + εντολή) — συνήθως νόμιμο κείμενο προϊόντος (λογισμικό, πληκτρολόγιο). Ελέγξτε το.", evidence: hitsEvidence(uniq) });
  } else if (sev) for (const { r, hits } of hit) {
    add({
      severity: sev,
      title: r.inline ? "Inline script με ύποπτο / συγκαλυμμένο κώδικα" : "Σημάδια ClickFix στη σελίδα",
      detail: r.inline
        ? `Δείκτες ClickFix / συγκαλυμμένου κώδικα μέσα σε inline script${r.nonce ? " που ΕΧΕΙ nonce — το nonce δεν αρκεί: ό,τι προσθέτει scripts με δικό του nonce (π.χ. Cloudflare Zaraz) εκτελείται κανονικά" : ""}. Αρχή του script: «${snip(r.text, 100)}».`
        : "Δείκτες ClickFix (ψεύτικο «επαληθεύστε ότι είστε άνθρωπος» που ζητά εκτέλεση εντολής) στο HTML της σελίδας.",
      evidence: hitsEvidence(hits),
    });
  }

  // ετικέτες HTML εκτός scripts / σχολίων (το React δεν βγάζει ποτέ on…= attributes)
  const markup = html.replace(SCRIPT_RE, "").replace(/<!--[\s\S]*?-->/g, "");
  const open = /<script\b/i.exec(markup);
  if (open) crit("<script> χωρίς κλείσιμο", "Ετικέτα <script> που δεν κλείνει — ο browser την εκτελεί ως το τέλος της σελίδας· δεν την παράγει η εφαρμογή.", snip(markup.slice(open.index, open.index + 120), 120));
  scanTags(markup, { page: base, own: [] }, crit);
  return out;
}

// ── headers ──────────────────────────────────────────────────────────────────────────────────────────────────────────
type Policy = Map<string, string[]>;
/** Οι πολιτικές του CSP (πολλά headers ενώνονται με «,» — εφαρμόζονται όλες). */
function parseCsp(csp: string): Policy[] {
  return csp.split(",").map((p) => {
    const m: Policy = new Map();
    for (const d of p.split(";")) {
      const [name, ...v] = d.trim().split(/\s+/);
      if (name && !m.has(name.toLowerCase())) m.set(name.toLowerCase(), v);
    }
    return m;
  }).filter((m) => m.size);
}
const NONCE = /^'nonce-[^']*'$/i;
const norm = (name: string, tokens: string[]) => [name, ...tokens.map((t) => (NONCE.test(t) ? "'nonce-…'" : t))].join(" ");

/**
 * Headers ασφαλείας μιας σελίδας. Critical: CSP λείπει / μόνο report-only, 'unsafe-inline' σε scripts ή styles, eval,
 * ευρείες πηγές scripts, δεύτερο nonce (κάτι προσθέτει scripts — π.χ. Cloudflare Zaraz), connect-src εκτός
 * `expectedConnectSrc` (αν δοθεί). Warn: λείπουν HSTS / nosniff / frame-ancestors, CSP χωρίς nonce.
 */
export function checkHeaders(headers: Record<string, string>, opts: { expectedConnectSrc?: string[] } = {}): Finding[] {
  const h = lowerKeys(headers);
  const out: Finding[] = [];
  const csp = h["content-security-policy"]?.trim();
  if (!csp) {
    out.push(h["content-security-policy-report-only"]
      ? { severity: "critical", title: "Το CSP είναι μόνο report-only", detail: "Content-Security-Policy-Report-Only χωρίς Content-Security-Policy: ο browser δεν μπλοκάρει τίποτα.", evidence: "content-security-policy-report-only" }
      : { severity: "critical", title: "Λείπει το Content-Security-Policy", detail: "Χωρίς CSP ο browser εκτελεί οποιοδήποτε script μπει στη σελίδα.", evidence: "content-security-policy" });
  } else {
    const policies = parseCsp(csp);
    const group = (names: string[]) => policies.flatMap((p) => names.flatMap((n, i) => {
      const v = p.get(n) ?? (i === 0 ? p.get("default-src") : undefined);
      return v ? [{ name: p.has(n) ? n : "default-src", v }] : [];
    }));
    const script = group(["script-src", "script-src-elem", "script-src-attr"]);
    const style = group(["style-src", "style-src-elem", "style-src-attr"]);
    const ev = (ds: { name: string; v: string[] }[], pred: (t: string) => boolean) => ds.filter((d) => d.v.some(pred)).map((d) => norm(d.name, d.v)).join(" | ");
    const has = (ds: { v: string[] }[], pred: (t: string) => boolean) => ds.some((d) => d.v.some(pred));
    const lc = (t: string) => t.toLowerCase();

    if (!script.length) out.push({ severity: "critical", title: "Το CSP δεν ορίζει πηγές scripts", detail: "Ούτε script-src ούτε default-src: επιτρέπεται κάθε script.", evidence: csp.replace(/'nonce-[^']*'/gi, "'nonce-…'").slice(0, 200) });
    const inl = (t: string) => lc(t) === "'unsafe-inline'";
    if (has(script, inl)) out.push({ severity: "critical", title: "CSP: 'unsafe-inline' στα scripts", detail: "Επιτρέπει σε οποιοδήποτε inline script (και ενέσεις) να εκτελεστεί.", evidence: ev(script, inl) });
    if (has(style, inl)) out.push({ severity: "critical", title: "CSP: 'unsafe-inline' στα styles", detail: "Η εφαρμογή δεν το χρειάζεται σε παραγωγή (styles μόνο με nonce) — κάποιος χαλάρωσε το CSP.", evidence: ev(style, inl) });
    const evl = (t: string) => lc(t) === "'unsafe-eval'";
    if (has(script, evl)) out.push({ severity: "critical", title: "CSP: 'unsafe-eval' στα scripts", detail: "Επιτρέπει eval / new Function — έτσι εκτελείται συγκαλυμμένος κώδικας.", evidence: ev(script, evl) });
    const wasm = (t: string) => lc(t) === "'wasm-unsafe-eval'";
    if (has(script, wasm)) out.push({ severity: "warn", title: "CSP: 'wasm-unsafe-eval' στα scripts", detail: "Η εφαρμογή δεν το ορίζει σε παραγωγή.", evidence: ev(script, wasm) });
    const wide = (t: string) => ["*", "http:", "https:", "data:", "blob:"].includes(lc(t));
    if (has(script, wide)) out.push({ severity: "critical", title: "CSP: πολύ ευρείες πηγές scripts", detail: "Πηγές όπως *, https:, data: επιτρέπουν scripts από οπουδήποτε.", evidence: ev(script, wide) });

    const nonces = new Set(script.flatMap((d) => d.v.filter((t) => NONCE.test(t))));
    if (nonces.size > 1) out.push({ severity: "critical", title: "Δεύτερο nonce στο CSP — κάτι προσθέτει scripts στη σελίδα (π.χ. Cloudflare Zaraz)", detail: `Το CSP έχει ${nonces.size} διαφορετικά nonce· η εφαρμογή βάζει ένα. Το επιπλέον το προσθέτει ενδιάμεσος (Cloudflare) για να εκτελεστούν δικά του scripts.`, evidence: ev(script, (t) => NONCE.test(t)) });
    else if (!nonces.size && !has(script, (t) => /^'sha(?:256|384|512)-/i.test(t))) out.push({ severity: "warn", title: "CSP χωρίς nonce για τα scripts", detail: "Διαφορετικό από αυτό που ορίζει η εφαρμογή (lib/security/csp.ts).", evidence: ev(script, () => true) });

    if (!policies.some((p) => p.has("frame-ancestors"))) out.push({ severity: "warn", title: "Λείπει το frame-ancestors από το CSP", detail: `Προστασία από clickjacking.${h["x-frame-options"] ? ` Υπάρχει X-Frame-Options: ${h["x-frame-options"]}.` : ""}`, evidence: "frame-ancestors" });

    if (opts.expectedConnectSrc && !policies.some((p) => p.has("connect-src") || p.has("default-src"))) {
      out.push({ severity: "critical", title: "CSP χωρίς connect-src / default-src", detail: "Ο browser επιτρέπεται να στέλνει δεδομένα οπουδήποτε (π.χ. σε διακομιστή επιτιθέμενου).", evidence: "connect-src" });
    } else if (opts.expectedConnectSrc) {
      const exp = new Set(opts.expectedConnectSrc.map(lc));
      const extra = [...new Set(policies.flatMap((p) => p.get("connect-src") ?? p.get("default-src") ?? []).filter((t) => !exp.has(lc(t))))].sort();
      if (extra.length) out.push({ severity: "critical", title: "CSP: connect-src με πηγές που δεν ορίζει η εφαρμογή", detail: "Ο browser επιτρέπεται να στέλνει δεδομένα σε διευθύνσεις που δεν έβαλε η εφαρμογή (π.χ. διακομιστής επιτιθέμενου).", evidence: extra.join(" ") });
    }
  }
  for (const r of REQUIRED_HEADERS) {
    const v = h[r.name];
    if (!v || !r.re.test(v)) out.push({ severity: "warn", title: `Λείπει / άκυρο: ${r.label}`, detail: v ? `Τιμή: ${snip(v, 100)}` : "Το header λείπει.", evidence: r.name });
  }
  return out;
}

// ── κανόνες ετικετών (κοινοί για περιεχόμενο και σελίδα) ────────────────────────────────────────────────────────────
/**
 * on…= χειριστές, javascript:/vbscript: σε attribute, object/embed/applet, meta refresh, base· στο περιεχόμενο επιπλέον
 * srcdoc και φόρμες προς ξένο host. `page` (σελίδα): meta refresh / base μόνο όταν δείχνουν σε ξένο origin (το Next
 * βγάζει `<meta http-equiv="refresh">` για τα redirect), και ο «μπλοκαρισμένος» σύνδεσμος του React αγνοείται.
 */
function scanTags(text: string, o: { page?: URL; own: string[] }, crit: (title: string, detail: string, evidence: string) => void): void {
  const foreignForm = (v: string) => {
    if (!/^(?:https?:)?\/\//i.test(v)) return null;
    try { const u = new URL(v, "https://relative.invalid"); return o.own.some((x) => hostIn(u.hostname, [x])) ? null : u; } catch { return null; }
  };
  const foreignPage = (v: string) => { try { return new URL(v, o.page).origin !== o.page!.origin; } catch { return true; } };
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase();
    const a = attrs(m[2]);
    const where = snip(m[0], 120);
    for (const [k, v] of a) {
      if (/^on[a-z]+$/.test(k)) crit("Χειριστής συμβάντος (on…=) σε ετικέτα", "Π.χ. onerror= / onload=: εκτελεί κώδικα χωρίς <script>.", where);
      const flat = v.replace(/[\x00-\x20]+/g, "").toLowerCase();
      const reactBlocked = !!o.page && flat.startsWith("javascript:thrownewerror(") && flat.includes("reacthasblocked");
      if (!reactBlocked && (/^(?:javascript|vbscript):/.test(flat) || (k === "style" && /javascript:|expression\(/.test(flat)))) crit("javascript: σε σύνδεσμο / attribute", "Κώδικας που εκτελείται με το κλικ ή τη φόρτωση.", where);
      if (o.page) continue; // srcdoc / φόρμες: η σελίδα τα ελέγχει αλλού (iframes) ή τα έχει νόμιμα (πληρωμές)
      if (k === "srcdoc") crit("srcdoc σε ετικέτα", "iframe με ενσωματωμένο HTML.", where);
      if ((tag === "form" && k === "action") || k === "formaction") {
        const u = foreignForm(v.trim());
        if (u) crit("Φόρμα που στέλνει σε ξένο host", "Τα στοιχεία που θα πληκτρολογήσει ο επισκέπτης πάνε εκτός site.", `${u.host}${u.pathname}`);
      }
    }
    if (tag === "object" || tag === "embed" || tag === "applet") crit(`Ενσωματωμένο αντικείμενο <${tag}>`, "Φορτώνει εξωτερικό εκτελέσιμο περιεχόμενο.", where);
    if (tag === "meta" && /refresh/i.test(a.get("http-equiv") ?? "")) {
      const url = /url\s*=\s*['"]?([^'"]+)/i.exec(a.get("content") ?? "")?.[1]?.trim();
      if (!o.page || (url && foreignPage(url))) crit("Ανακατεύθυνση <meta refresh>", "Στέλνει τον επισκέπτη σε άλλη σελίδα.", where);
    }
    if (tag === "base" && (!o.page || foreignPage(a.get("href") ?? ""))) crit("Ετικέτα <base>", "Αλλάζει πού δείχνουν όλοι οι σχετικοί σύνδεσμοι της σελίδας.", where);
  }
}

// ── περιεχόμενο (CMS, περιγραφές, newsletter…) ───────────────────────────────────────────────────────────────────────
/**
 * Ένεση σε πεδίο που αποδίδεται ως HTML. Critical: `<script`, χειριστές on…=, javascript:/vbscript: σε attribute,
 * srcdoc, data:text/html, iframe εκτός ALLOWED_FRAME_HOSTS, φόρμα προς ξένο host (`ownHosts` = τα δικά μας),
 * object/embed, meta refresh, base, ClickFix. Warn: spam, μοναχική λέξη ClickFix, iframe χωρίς src.
 */
export function scanContent(text: string, opts: { ownHosts?: string[] } = {}): Finding[] {
  if (!text) return [];
  const out: Finding[] = [];
  const add = (f: Finding) => { if (!out.some((o) => o.title === f.title && o.evidence === f.evidence)) out.push(f); };
  const crit = (title: string, detail: string, evidence: string) => add({ severity: "critical", title, detail, evidence });
  const own = opts.ownHosts ?? [];
  const dec = decodeEntities(text);

  const sc = /<\s*script\b/i.exec(text);
  if (sc) crit("Ετικέτα <script> στο περιεχόμενο", "Κώδικας μέσα σε πεδίο που αποδίδεται ως HTML.", snip(text.slice(sc.index, sc.index + 120), 120));

  scanTags(text, { own }, crit);
  const di = /data:\s*text\/html/i.exec(dec);
  if (di) crit("data:text/html στο περιεχόμενο", "Ολόκληρη σελίδα HTML κρυμμένη σε διεύθυνση.", snip(dec.slice(di.index, di.index + 80), 80));

  for (const src of parseScripts(text).iframes) {
    if (src === "about:srcdoc") continue; // πιάστηκε παραπάνω
    if (src === "about:blank") { add({ severity: "warn", title: "iframe χωρίς src", detail: "Κενό iframe στο περιεχόμενο — ελέγξτε το.", evidence: "iframe" }); continue; }
    if (src.startsWith("/") && !src.startsWith("//")) continue; // δική μας σελίδα
    let u: URL | null = null;
    try { u = new URL(src.startsWith("//") ? `https:${src}` : src); } catch { /* άκυρο */ }
    if (!u || (u.protocol !== "https:" && u.protocol !== "http:")) crit("iframe με άκυρη / μη-http διεύθυνση", "Επιτρέπονται μόνο YouTube, Vimeo και Google Tag Manager.", snip(src, 120));
    else if (!hostIn(u.hostname, [...ALLOWED_FRAME_HOSTS, ...own])) crit("iframe από άγνωστο host", "Επιτρέπονται μόνο YouTube, Vimeo και Google Tag Manager.", `${u.host}${u.pathname}`);
  }

  const hits = markerHits(dec);
  const sev = markerSeverity(hits);
  if (sev) add({
    severity: sev,
    title: sev === "critical" ? "Σημάδια ClickFix στο περιεχόμενο" : "Ύποπτη λέξη στο περιεχόμενο",
    detail: sev === "critical" ? "Οδηγίες τύπου «πατήστε Win+R και επικολλήστε» ή συγκαλυμμένος κώδικας." : "Μία μόνο ύποπτη λέξη — μπορεί να είναι νόμιμο κείμενο προϊόντος· ελέγξτε το.",
    evidence: hitsEvidence(hits),
  });

  const spam = SPAM_MARKERS.flatMap((s) => { const x = s.re.exec(dec); return x ? [`${s.label}: «${snip(x[0].replace(/^[^\p{L}\p{N}]/u, ""), 40)}»`] : []; });
  if (spam.length) add({ severity: "warn", title: "Λέξεις spam στο περιεχόμενο", detail: "Πιθανή ένεση SEO spam (καζίνο, φάρμακα, δάνεια…).", evidence: spam.join(" · ") });
  return out;
}

// ── νέες IP / χώρες συνδέσεων ────────────────────────────────────────────────────────────────────────────────────────
type Login = { staffId: string; ip: string | null; country: string | null; at: Date };

/**
 * Πρόσφατες συνδέσεις από IP που ο ίδιος χρήστης δεν είχε ξαναχρησιμοποιήσει. Ως «γνωστό» μετρά μόνο το ιστορικό ΠΡΙΝ
 * από την πρώτη πρόσφατη σύνδεση (αν το ιστορικό περιέχει και τις πρόσφατες, δεν τις «ξεπλένει»). Γνωστή IP → τίποτα
 * (ακόμη κι αν η βάση γεωεντοπισμού δώσει άλλη χώρα). Χωρίς IP: μόνο αν η χώρα είναι νέα. Χρήστης χωρίς ιστορικό →
 * όλα νέα (newCountry όταν η χώρα είναι γνωστή). Διπλές (ίδιος χρήστης/IP/χώρα) → μία.
 */
export function newOrigins(history: Login[], recent: Login[]): { staffId: string; ip: string | null; country: string | null; newCountry: boolean }[] {
  if (!recent.length) return [];
  const since = recent.reduce((m, r) => Math.min(m, r.at.getTime()), Infinity);
  const ips = new Map<string, Set<string>>(), countries = new Map<string, Set<string>>();
  const put = (m: Map<string, Set<string>>, k: string, v: string) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(v); };
  const cc = (c: string | null) => c?.trim().toUpperCase() || null;
  for (const x of history) {
    if (x.at.getTime() >= since) continue;
    if (x.ip) put(ips, x.staffId, x.ip);
    const c = cc(x.country);
    if (c) put(countries, x.staffId, c);
  }
  const seen = new Set<string>();
  const out: { staffId: string; ip: string | null; country: string | null; newCountry: boolean }[] = [];
  for (const r of [...recent].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (r.ip && ips.get(r.staffId)?.has(r.ip)) continue;
    const c = cc(r.country);
    const newCountry = !!c && !countries.get(r.staffId)?.has(c);
    if (!r.ip && !newCountry) continue;
    const key = `${r.staffId}|${r.ip}|${c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ staffId: r.staffId, ip: r.ip, country: r.country, newCountry });
  }
  return out;
}

// ── fingerprint (sha256 χωρίς node:crypto, ώστε το αρχείο να μένει καθαρό) ───────────────────────────────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** SHA-256 (hex) ενός κειμένου σε UTF-8. */
export function sha256Hex(s: string): string {
  const msg = new TextEncoder().encode(s);
  const n = ((msg.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(n);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = msg.length * 8;
  dv.setUint32(n - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(n - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, r: number) => (x >>> r) | (x << (32 - r));
  for (let i = 0; i < n; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15], b = w[t - 2];
      w[t] = w[t - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[t - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}

/** Ταυτότητα ευρήματος για το dedupe των ειδοποιήσεων: sha256(έλεγχος, τίτλος, τεκμήριο) — η λεπτομέρεια δεν μετρά. */
export function fingerprint(checkKey: string, f: Finding): string {
  return sha256Hex(`${checkKey}\n${f.title}\n${f.evidence ?? ""}`);
}
