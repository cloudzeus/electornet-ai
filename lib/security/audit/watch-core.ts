import { buildCsp } from "../csp";
import { alertsToSend, athensDateTime, escapeHtml } from "./notify-core";
import { ALLOWED_FRAME_HOSTS, ALLOWED_SCRIPT_HOSTS } from "./policy";
import { classifyPage, parseScripts, sha256Hex, statusOf, type CheckResult, type Finding, type Severity } from "./rules";

/**
 * Εξωτερικός φύλακας — καθαρή λογική (ruling D). Το I/O είναι στο scripts/security-watch.ts, που τρέχει από GitHub Actions
 * (όχι από τις υποδομές μας): σαρώνει το δημόσιο site απ' έξω, ελέγχει DNS / πιστοποιητικά / heartbeat του εσωτερικού
 * ελέγχου και στέλνει email απευθείας (Mailgun). ΚΑΘΑΡΟ αρχείο: μόνο policy / rules / notify-core / csp — κανένα import
 * Node, prisma ή server-only, ώστε να τρέχει έξω από την εφαρμογή.
 *
 * Αρχή: ακρίβεια. Ό,τι δεν ελέγχθηκε → «error» (ποτέ σιωπηλό ΟΚ)· ό,τι μπορεί να είναι νόμιμο (deploy, Cloudflare,
 * λειτουργίες του browser) → warn, όχι critical. Τα τεκμήρια (evidence) είναι σταθερά ανά εκτέλεση (dedupe ειδοποιήσεων).
 */

const DAY = 86_400_000;
const uniqSorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
const clipList = (xs: string[], n = 10) => `${xs.slice(0, n).join(", ")}${xs.length > n ? ` … (+${xs.length - n})` : ""}`;
const lowerKeys = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));

// ── ώρα Ελλάδας ──────────────────────────────────────────────────────────────────────────────────────────────────────
const ATH = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
const athParts = (d: Date) => Object.fromEntries(ATH.formatToParts(d).map((x) => [x.type, x.value]));
/** «2026-10-20» σε ώρα Ελλάδας (με θερινή/χειμερινή ώρα). */
export function athensDay(d: Date): string { const p = athParts(d); return `${p.year}-${p.month}-${p.day}`; }
export function athensHour(d: Date): number { return Number(athParts(d).hour); }

// ── επιλογή σελίδων ─────────────────────────────────────────────────────────────────────────────────────────────────
/** PRNG (mulberry32) με σπόρο από το sha256 του seed. */
function rng(seed: string): () => number {
  let a = parseInt(sha256Hex(seed).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * n στοιχεία με σπόρο (π.χ. η ημερομηνία): ίδια επιλογή μέσα στη μέρα, άλλη την επόμενη. Ανεξάρτητο από τη σειρά και
 * τα διπλά της εισόδου (ταξινόμηση + μοναδικά πριν το ανακάτεμα).
 */
export function seededPick<T extends string>(items: T[], n: number, seed: string): T[] {
  const xs = uniqSorted(items) as T[];
  const r = rng(seed);
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs.slice(0, Math.max(0, n));
}
export const PICK = { categories: 10, products: 20 } as const;
/** Οι κατηγορίες και τα προϊόντα του δείγματος (το sitemap.xml δεν υπάρχει — pool από συνδέσμους της αρχικής/κατηγοριών). */
export function selectPages(pool: { categories: string[]; products: string[] }, seed: string, n: { categories: number; products: number } = PICK) {
  return { categories: seededPick(pool.categories, n.categories, `${seed}|k`), products: seededPick(pool.products, n.products, `${seed}|p`) };
}

// ── chunks ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const STATIC_JS = /(?:(https?:)?\/\/([^/"'\\\s<>]+))?(\/_next\/static\/[^"'\\\s?#<>)`]+?\.js)(?![\w.-])/gi;
/**
 * Τα αρχεία JS /_next/static του ίδιου origin που αναφέρει η σελίδα: τα `<script src>` ΚΑΙ όσα γράφει το RSC payload
 * (client components που φορτώνει ο browser). Χωρίς query, μοναδικά, ταξινομημένα.
 */
export function chunkRefs(html: string, origin: string): string[] {
  const host = new URL(origin).host.toLowerCase();
  const out: string[] = [];
  for (const m of html.matchAll(STATIC_JS)) {
    if (m[2] && m[2].toLowerCase() !== host) continue;
    out.push(m[3]);
  }
  return uniqSorted(out);
}

export type ChunkFetch = { path: string; status?: number; contentType?: string; /** ανακατεύθυνση σε άλλο origin */ redirectTo?: string; error?: string };
/**
 * Ακεραιότητα των αρχείων JS που αναφέρουν οι σελίδες (χωρίς build για σύγκριση): κάθε αρχείο πρέπει να απαντά 200, με
 * Content-Type JavaScript, από το ίδιο origin. Ένα εύρημα ανά είδος, με όλα τα αρχεία στο τεκμήριο (σταθερό).
 *   critical: ανακατεύθυνση εκτός site · warn: δεν σερβίρεται (π.χ. deploy ανάμεσα σε σελίδα και αρχείο) / λάθος τύπος ·
 *   error: δεν φορτώθηκε (δίκτυο) — δεν ελέγχθηκε.
 */
export function chunkIntegrity(rows: ChunkFetch[]): Finding[] {
  const groups = new Map<string, { f: Omit<Finding, "evidence">; paths: string[]; extra: string[] }>();
  const put = (k: string, f: Omit<Finding, "evidence">, path: string, extra = "") => {
    const g = groups.get(k) ?? { f, paths: [], extra: [] };
    g.paths.push(path);
    if (extra) g.extra.push(extra);
    groups.set(k, g);
  };
  for (const r of rows) {
    if (r.error !== undefined) put("err", { severity: "error", title: "Αρχείο JS δεν φορτώθηκε — δεν ελέγχθηκε", detail: "Αρχεία που αναφέρει η σελίδα και δεν κατέβηκαν (δίκτυο / χρονικό όριο) — δεν σαρώθηκαν." }, r.path, `${r.path}: ${r.error}`);
    else if (r.redirectTo) put("redir", { severity: "critical", title: "Αρχείο JS ανακατευθύνει εκτός site", detail: "Αρχείο /_next/static του site στέλνει τον browser σε άλλο host — η εφαρμογή σερβίρει τα αρχεία της μόνη της. Κάποιος ενδιάμεσος (Cloudflare Rules / Worker) αντικαθιστά τον κώδικα." }, r.path, `${r.path} → ${r.redirectTo.slice(0, 120)}`);
    else if (r.status !== 200) put("status", { severity: "warn", title: "Αρχείο JS που αναφέρει η σελίδα δεν σερβίρεται", detail: "Η σελίδα φορτώνει αρχείο που ο server δεν δίνει (και μετά από δεύτερη προσπάθεια). Συνήθως deploy ανάμεσα στη λήψη της σελίδας και του αρχείου· αν επιμένει, η σελίδα σερβίρεται από άλλο αντίγραφο της εφαρμογής." }, r.path, `${r.path}: HTTP ${r.status}`);
    else if (!/\b(?:java|ecma)script\b/i.test(r.contentType ?? "")) put("ctype", { severity: "warn", title: "Αρχείο JS με λάθος Content-Type", detail: "Αρχείο /_next/static που απαντά 200 αλλά όχι ως JavaScript (π.χ. σελίδα HTML στη θέση του) — με nosniff ο browser δεν το εκτελεί, αλλά δεν είναι αυτό που σερβίρει η εφαρμογή." }, r.path, `${r.path}: ${r.contentType || "—"}`);
  }
  return [...groups.values()].map(({ f, paths, extra }) => ({ ...f, detail: `${f.detail} ${clipList(uniqSorted(extra), 8)}.`, evidence: clipList(uniqSorted(paths), 20) }));
}

/** Το ίδιο αρχείο (ίδιο URL — τα ονόματα είναι hash του περιεχομένου) με άλλο περιεχόμενο για άλλον user agent → critical. */
export function chunkHashDiff(base: Record<string, string>, other: Record<string, string>, label = "άλλος user agent"): Finding[] {
  const diff = Object.keys(other).filter((p) => base[p] !== undefined && base[p] !== other[p]).sort();
  return diff.length ? [{ severity: "critical", title: "Αρχείο JS με διαφορετικό περιεχόμενο ανά επισκέπτη (cloaking)", detail: `${diff.length} αρχεία /_next/static έδωσαν άλλο περιεχόμενο (sha256) στον φύλακα και στον ${label}. Τα ονόματα των αρχείων είναι hash του περιεχομένου τους — το ίδιο URL δίνει πάντα τα ίδια bytes. Κάποιος ενδιάμεσος σερβίρει άλλον κώδικα σε επισκέπτες.`, evidence: clipList(diff, 20) }] : [];
}

export type ChunkSeen = { status?: number; sha256?: string; error?: string };
const got200 = (c: ChunkSeen | undefined) => !!c && c.error === undefined && c.status === 200 && !!c.sha256;
/**
 * Τα αρχεία JS μιας παραλλαγής (σελίδα × user agent, με Referer τη σελίδα) σε σύγκριση με το αντίγραφο του φύλακα:
 *   critical: ίδιο URL με άλλο sha256 · αρχείο που αναφέρει ΜΟΝΟ η παραλλαγή (π.χ. μόνο σε κινητό) και ο server δεν το
 *             δίνει στον φύλακα (μη-200 / σφάλμα) — κώδικας που σερβίρεται μόνο σε «θύματα»
 *   warn: αρχεία που δεν κατέβηκαν ως παραλλαγή ενώ ο φύλακας τα πήρε — δεν συγκρίθηκαν
 */
export function variantChunks(watch: Record<string, ChunkSeen>, variant: Record<string, ChunkSeen>, onlyInVariant: string[], label: string): Finding[] {
  const sha = (m: Record<string, ChunkSeen>) => Object.fromEntries(Object.entries(m).filter(([, c]) => got200(c)).map(([p, c]) => [p, c.sha256!]));
  const out = chunkHashDiff(sha(watch), sha(variant), label);
  const hidden = uniqSorted(onlyInVariant.filter((p) => !got200(watch[p])));
  if (hidden.length) out.push({ severity: "critical", title: "Αρχείο JS μόνο για ορισμένους επισκέπτες που ο server δεν δίνει στον φύλακα", detail: `Η σελίδα ως «${label}» φορτώνει ${hidden.length} αρχεία /_next/static που δεν αναφέρει στον φύλακα και που ο server δεν δίνει στον φύλακα (${hidden.map((p) => `${p}: ${watch[p]?.error ?? (watch[p]?.status !== undefined ? `HTTP ${watch[p]!.status}` : "δεν ζητήθηκε")}`).slice(0, 5).join(", ")}). Κώδικας που σερβίρεται μόνο σε συγκεκριμένους επισκέπτες — το μοτίβο του cloaking.`, evidence: clipList(hidden, 20) });
  const unchecked = uniqSorted(Object.keys(variant).filter((p) => got200(watch[p]) && !got200(variant[p])));
  if (unchecked.length) out.push({ severity: "warn", title: "Αρχεία JS που δεν κατέβηκαν ως άλλος επισκέπτης — δεν συγκρίθηκαν", detail: `${unchecked.length} αρχεία δεν δόθηκαν ως «${label}» (${unchecked.slice(0, 5).map((p) => `${p}: ${variant[p].error ?? `HTTP ${variant[p].status}`}`).join(", ")}) — η σύγκριση sha256 τους παραλείφθηκε.`, evidence: clipList(unchecked, 20) });
  return out;
}
/** Όριο λήψεων αρχείων ανά εκτέλεση: ό,τι έμεινε εκτός → warn «μερικός έλεγχος» (ποτέ σιωπηλό ΟΚ). */
export function capFinding(skipped: number, cap: number): Finding[] {
  return skipped > 0 ? [{ severity: "warn", title: "Μερικός έλεγχος: όριο λήψεων αρχείων JS", detail: `Ο φύλακας κατεβάζει έως ${cap} αρχεία ανά εκτέλεση για τη σύγκριση ανά επισκέπτη· ${skipped} δεν ελέγχθηκαν σε αυτή την εκτέλεση.`, evidence: "chunk cap" }] : [];
}
/** Το δείγμα σελίδων: λιγότερες κατηγορίες/προϊόντα από τον στόχο → warn· καμία → error (δεν ελέγχθηκε). */
export function sampleFindings(n: { categories: number; products: number }, want: { categories: number; products: number } = PICK): Finding[] {
  const out: Finding[] = [];
  for (const [k, label] of [["categories", "κατηγορίες"], ["products", "προϊόντα"]] as const) {
    if (n[k] === 0) out.push({ severity: "error", title: `Δεν βρέθηκαν ${label} για έλεγχο`, detail: `Οι σύνδεσμοι της αρχικής/των κατηγοριών δεν έδωσαν ${label} — δεν ελέγχθηκαν.`, evidence: `sample ${k} 0` });
    else if (n[k] < want[k]) out.push({ severity: "warn", title: `Μικρότερο δείγμα: ${label}`, detail: `Ελέγχθηκαν ${n[k]} από ${want[k]} ${label} — βρέθηκαν λιγότεροι σύνδεσμοι από τον στόχο.`, evidence: `sample ${k}` });
  }
  return out;
}
/** Έλεγχος που δεν εξέτασε τίποτα → error, ποτέ ok. */
export function emptyCheck(what: string, n: number): Finding[] {
  return n > 0 ? [] : [{ severity: "error", title: `Τίποτα δεν ελέγχθηκε: ${what}`, detail: `Ο φύλακας δεν βρήκε/δεν κατέβασε κανένα στοιχείο για «${what}» — ο έλεγχος δεν έγινε.`, evidence: `empty ${what}` }];
}

// ── σάρωση αρχείων JS ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Διευθύνσεις που εμφανίζονται νόμιμα μέσα στα bundles της εφαρμογής — ΑΚΡΙΒΕΙΣ hosts (ή «host/πρόθεμα διαδρομής»), όπως
 * τις αναφέρει πράγματι το build (.next/static, 10/2026): σύνδεσμοι τεκμηρίωσης, namespaces, embeds, κοινωνικά δίκτυα,
 * εργαλεία της διαχείρισης. ΠΟΤΕ υποτομείς ή ολόκληρα CDN: ένα «jsdelivr.net» θα άφηνε περάσει κάθε cdn.jsdelivr.net/gh/<επιτιθέμενος>.
 * Άγνωστη διεύθυνση σε bundle → warn: ελέγξτε τη και, αν είναι νόμιμη, προσθέστε τη εδώ (ακριβώς).
 */
export const KNOWN_BUNDLE_URLS: readonly string[] = [
  "www.w3.org", "nextjs.org", "react.dev", "github.com", "schema.org", "leafletjs.com", "gsap.com", "base-ui.com", "jcgt.org", "opencollective.com",
  "euronics.dgsoft.gr", "www.euronics.gr", "euronics.b-cdn.net", "www.google.com", "maps.google.com", "console.cloud.google.com", "www.gstatic.com",
  "fonts.googleapis.com", "fonts.gstatic.com", "www.youtube.com", "www.youtube-nocookie.com", "i.ytimg.com", "vimeo.com", "player.vimeo.com",
  "www.facebook.com", "developers.facebook.com", "www.instagram.com", "www.tiktok.com", "www.linkedin.com", "x.com", "www.openstreetmap.org", "developer.apple.com",
  // διαχείριση / ταμείο: SoftOne (παράδειγμα serial), ΑΑΔΕ, VIES, EPREL, LastMily, BoxNow, κατασκευαστές, Microsoft Entra / Azure
  "123456.oncloud.gr", "www1.gsis.gr", "vat.wwa.gr", "eprel.ec.europa.eu", "apps.lastmily.com", "widget-cdn.boxnow.gr", "www.lg.com", "entra.microsoft.com", "portal.azure.com",
  // βιβλιοθήκες που φορτώνουν δικά τους αρχεία από CDN — μόνο το συγκεκριμένο πακέτο npm
  "cdn.jsdelivr.net/npm/tesseract.js@", "cdn.jsdelivr.net/npm/three@",
  // placeholders βιβλιοθηκών
  "example.com", "example.org", "example.net", "foo.bar", "localhost",
];
/** Δεσμευμένα TLD (RFC 2606/6761) που δεν επιλύονται ποτέ — placeholders κώδικα. */
const RESERVED_TLD = /\.(?:invalid|localhost)$/;
/**
 * Φιλοξενία περιεχομένου χρηστών (CDN αποθετηρίων, gists, Apps Script, static hosting, pastebins, buckets): οποιοσδήποτε
 * ανεβάζει εκεί κώδικα — μετρά ΠΑΝΤΑ ως άγνωστη διεύθυνση (και για τον κανόνα eval/new Function), ακόμη κι αν ο host
 * είναι γνωστός. Ταιριάζει σε «host/διαδρομή».
 */
export const USER_CONTENT: readonly RegExp[] = [
  /^cdn\.jsdelivr\.net\/(?!npm\/(?:tesseract\.js|three)@)/, /^(?:[\w-]+\.)?unpkg\.com\//, /^esm\.sh\//, /^cdn\.skypack\.dev\//, /^(?:raw|rawcdn)\.githack\.com\//, /^cdn\.statically\.io\//,
  /^(?:raw|gist|objects|media|camo)\.githubusercontent\.com\//, /^gist\.github\.com\//, /^github\.com\/[^/]+\/[^/]+\/(?:raw|releases\/download)\//, /^[^/]+\.github\.io\//, /^gitlab\.com\/[^/]+\/[^/]+\/-\/raw\//, /^bitbucket\.org\/[^/]+\/[^/]+\/raw\//,
  /^(?:script|sites|docs|drive)\.google\.com\//, /^[^/]*\.googleusercontent\.com\//, /^(?:storage|firebasestorage)\.googleapis\.com\//,
  /^[^/]+\.(?:web\.app|firebaseapp\.com|pages\.dev|workers\.dev|netlify\.app|vercel\.app|herokuapp\.com|glitch\.me|replit\.dev|repl\.co|ngrok\.io|ngrok-free\.app|onrender\.com|fly\.dev|surge\.sh|r2\.dev|trycloudflare\.com)\//,
  /^(?:www\.)?(?:pastebin\.com|paste\.ee|hastebin\.com|rentry\.co|telegra\.ph|transfer\.sh|dpaste\.org|pastes\.io|0x0\.st)\//,
  /^(?:[^/]+\.)?(?:dropbox\.com|dropboxusercontent\.com|discordapp\.com|discordapp\.net|discord\.com)\//,
  /^[^/]+\.(?:blob\.core\.windows\.net|amazonaws\.com)\//, /^s3[.-][^/]*amazonaws\.com\//,
  /^(?!euronics\.b-cdn\.net\/)[^/]+\.b-cdn\.net\//,
];
/**
 * sha256 γνωστών μεγάλων base64 μέσα σε βιβλιοθήκες: WebAssembly του αποσυμπιεστή ZSTD (three.js zstddec, μέσω
 * @google/model-viewer). Αλλαγή έκδοσης → warn ξανά· ελέγξτε το και προσθέστε το νέο hash.
 */
export const KNOWN_BASE64_SHA256: readonly string[] = ["3f152d4cd75d123d2c7e495060782336bb8e956981300aa8a474f1eedfc15349"];
/**
 * Hosts του CSP: ακριβείς για τις κανονικές πηγές, ως υποτομείς για τα «https://*.x» — εκτός από το *.b-cdn.net (κάθε
 * πελάτης της Bunny) που δεν είναι δικό μας.
 */
function cspHosts(): { exact: string[]; suffix: string[] } {
  const exact: string[] = [], suffix: string[] = [];
  for (const t of buildCsp({ nonce: "x", dev: false }).split(/[\s;]+/)) {
    const m = /^(?:https?|wss?):\/\/(\*\.)?([^/:]+)/i.exec(t);
    if (!m) continue;
    const h = m[2].toLowerCase();
    if (!m[1]) exact.push(h); else if (h !== "b-cdn.net") suffix.push(h);
  }
  return { exact, suffix };
}
type Known = { exact: Set<string>; suffix: string[]; prefixes: string[] };
let knownCache: Known | null = null;
/** Γνωστές διευθύνσεις: ακριβείς (KNOWN_BUNDLE_URLS, CSP) + υποτομείς μόνο για τους παρόχους του policy (pixels, iframes) και τα *. του CSP. */
function known(): Known {
  if (knownCache) return knownCache;
  const csp = cspHosts();
  return (knownCache = {
    exact: new Set([...KNOWN_BUNDLE_URLS.filter((x) => !x.includes("/")), ...csp.exact]),
    suffix: uniqSorted([...Object.values(ALLOWED_SCRIPT_HOSTS).flat(), ...ALLOWED_FRAME_HOSTS, ...csp.suffix]),
    prefixes: KNOWN_BUNDLE_URLS.filter((x) => x.includes("/")),
  });
}
const hostIn = (host: string, list: readonly string[]) => {
  const h = host.toLowerCase().replace(/\.$/, "");
  return list.some((x) => { const a = x.toLowerCase(); return h === a || h.endsWith(`.${a}`); });
};
/**
 * Η διαδρομή όπως θα την ζητούσε ο browser: «\» → «/», μετά επίλυση των «.» / «..» (και των %2e) από τον parser URL.
 * Χωρίς αυτό, «npm/three@1/../../gh/<επιτιθέμενος>/…» θα περνούσε ως «npm/three@».
 */
function normPath(host: string, raw: string): string {
  const p = raw.replace(/\\/g, "/");
  try { return new URL(`https://${host}${p}`).pathname; } catch { return p; }
}
/** Σημάδια παράκαμψης σε διαδρομή: «..», %2e, «\», %5c, «,» (combine του jsDelivr). */
const SUSPECT_PATH = /\.\.|%2e|\\|%5c|,/i;

/** Η διεύθυνση (host + διαδρομή) → null αν είναι γνωστή, αλλιώς το τεκμήριο: host, ή «host/τμήμα» για φιλοξενία χρηστών. */
function unknownRef(host: string, rawPath0: string): string | null {
  const rawPath = rawPath0.replace(/\\+$/, ""); // «\» στο τέλος = escape του εισαγωγικού (JSON μέσα σε string), όχι διαδρομή
  const pathPart = rawPath ? normPath(host, rawPath) : "";
  const ref = `${host}${pathPart || "/"}`;
  const seg = () => `${host}/${pathPart.split("/")[1] ?? ""}`;
  if (USER_CONTENT.some((re) => re.test(ref))) return seg();
  const k = known();
  const prefixed = k.prefixes.filter((p) => p.startsWith(`${host}/`));
  // εξαίρεση με πρόθεμα διαδρομής: κάθε ύποπτη διαδρομή (ακόμη κι αν κανονικοποιείται σε επιτρεπτή) μετρά ως άγνωστη
  if (prefixed.length) return !SUSPECT_PATH.test(rawPath) && prefixed.some((p) => ref.startsWith(p)) ? null : seg();
  if (RESERVED_TLD.test(host) || k.exact.has(host) || hostIn(host, k.suffix)) return null;
  return host;
}

/** Απόλυτες διευθύνσεις (http/https/ws/wss) και πρωτόκολλο-σχετικές μέσα σε string («//host/…»): host + διαδρομή (και με «\», για την κανονικοποίηση). */
const URL_RE = /(?:\b(?:https?|wss?):|(?<=["'`]))\/\/((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59}))(?![a-z0-9-])(?::\d+)?(\/[^\s"'`)<>]*)?/gi;
const DYN_EVAL = /(?:(?<![\w$.])|\b(?:window|self|globalThis|top|parent)\s*\.\s*)eval\s*\(\s*(?![\s"'`)])|\(\s*0\s*,\s*eval\s*\)\s*\(/;
const FN_CALL = /(?<![\w$.])(?:new\s+)?Function\s*\(([^)]{0,400})\)/g;
const CONST_ARGS = /^\s*(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.|\$(?!\{))*`)\s*(?:,\s*|$))*$/;
const CODES = /\[\s*\d{2,3}(?:\s*,\s*\d{2,3}){29,}\s*\]/g;
const CODES_ARGS = /fromCharCode\s*\(\s*\d{2,3}(?:\s*,\s*\d{2,3}){29,}/;

/** Συγκάλυψη τύπου javascript-obfuscator: πολλά ονόματα _0x…, μακριές σειρές \x.., διπλό atob. Δεν τα παράγει ποτέ το Next. */
function obfuscation(js: string): string | null {
  const ox = new Set(js.match(/\b_0x[0-9a-f]{4,6}\b/g) ?? []);
  if (ox.size >= 10) return `${ox.size} ονόματα _0x…`;
  if (/(?:\\x[0-9a-fA-F]{2}){30,}/.test(js)) return "μακριά σειρά \\x..";
  if (/\batob\s*\(\s*atob\s*\(/.test(js)) return "atob(atob(…))";
  return null;
}
function dynamicCode(js: string): boolean {
  if (DYN_EVAL.test(js)) return true;
  for (const m of js.matchAll(FN_CALL)) if (!CONST_ARGS.test(m[1])) return true;
  return false;
}
function charCodeChain(js: string): boolean {
  if (CODES_ARGS.test(js)) return true;
  for (const m of js.matchAll(CODES)) {
    const i = m.index ?? 0;
    if (/fromCharCode/.test(js.slice(Math.max(0, i - 300), i + m[0].length + 300))) return true;
  }
  return false;
}

/**
 * Κανόνες για αρχεία JS (bundles) — ΟΧΙ τα CLICKFIX_MARKERS του policy: τα νόμιμα bundles έχουν new Function + fetch,
 * οδηγίες πληκτρολογίου κ.λπ. Εδώ μόνο ό,τι δεν εμφανίζεται σε νόμιμο bundle:
 *   critical: CapEmbed, posthoganalytics.com, localStorage 'verified' + fetch, πίνακας ≥30 char codes → fromCharCode,
 *             eval / new Function με δυναμικό όρισμα ΜΑΖΙ με άγνωστο domain ή συγκάλυψη
 *   warn: άγνωστο domain (ένα ανά host), base64 > 20 KB, συγκάλυψη μόνη της
 */
export function scanChunk(js: string, opts: { knownBase64?: readonly string[] } = {}): Finding[] {
  const out: Finding[] = [];
  const crit = (title: string, detail: string, evidence: string) => out.push({ severity: "critical", title, detail, evidence });
  if (/\bCapEmbed\b/.test(js)) crit("CapEmbed (ψεύτικο CAPTCHA) σε αρχείο JS", "Το όνομα του ψεύτικου CAPTCHA της επίθεσης ClickFix μέσα σε κώδικα που σερβίρει το site.", "CapEmbed");
  if (/\bposthoganalytics\.com\b/i.test(js)) crit("posthoganalytics.com σε αρχείο JS", "Ο διακομιστής της επίθεσης (όχι το PostHog) μέσα σε κώδικα που σερβίρει το site.", "posthoganalytics.com");
  if (/localStorage\s*\.\s*(?:getItem|setItem)\s*\(\s*\\?["'`]verified\\?["'`]/.test(js) && /\bfetch\s*\(/.test(js)) crit("localStorage 'verified' + fetch σε αρχείο JS", "Το μοτίβο του δολώματος ClickFix (θυμάται ποιος «επαληθεύτηκε» και φέρνει την εντολή από διακομιστή).", "localStorage 'verified' + fetch");
  if (charCodeChain(js)) crit("Πίνακας char codes → String.fromCharCode σε αρχείο JS", "Κείμενο κρυμμένο ως ≥30 αριθμοί που μετατρέπονται σε χαρακτήρες — τεχνική συγκάλυψης, δεν την παράγει το build.", "char codes ≥30 → fromCharCode");

  const unknown = uniqSorted([...js.matchAll(URL_RE)].flatMap((m) => { const r = unknownRef(m[1].toLowerCase(), m[2] ?? ""); return r ? [r] : []; }));
  for (const h of unknown) {
    out.push(h.includes("/")
      ? { severity: "warn", title: "Διεύθυνση σε φιλοξενία περιεχομένου χρηστών σε αρχείο JS", detail: "CDN αποθετηρίων / gist / Apps Script / static hosting / bucket: εκεί ο καθένας ανεβάζει κώδικα — τέτοιες διευθύνσεις χρησιμοποιούν οι loaders κακόβουλου κώδικα. Ελέγξτε τι είναι.", evidence: h }
      : { severity: "warn", title: "Άγνωστο domain σε αρχείο JS", detail: "Διεύθυνση σε host που δεν είναι στο policy, στο CSP ή στη λίστα γνωστών διευθύνσεων του build (KNOWN_BUNDLE_URLS στο lib/security/audit/watch-core.ts). Ελέγξτε τι είναι· αν είναι νόμιμη, προσθέστε τη στη λίστα (ακριβώς).", evidence: h });
  }

  const big = [...js.matchAll(/[A-Za-z0-9+/]{20480,}={0,2}/g)].map((m) => m[0]).filter((b) => !(opts.knownBase64 ?? KNOWN_BASE64_SHA256).includes(sha256Hex(b)));
  if (big.length) out.push({ severity: "warn", title: "Μεγάλο base64 (> 20 KB) σε αρχείο JS", detail: `Συνεχές base64 ${big.map((b) => `${Math.round(b.length / 1024)} KB${b.startsWith("AGFzbQ") ? " (WebAssembly)" : ""} sha256 ${sha256Hex(b).slice(0, 16)}…`).join(", ")} — μπορεί να είναι ενσωματωμένη εικόνα/γραμματοσειρά/WebAssembly βιβλιοθήκης, αλλά και κρυμμένος κώδικας. Ελέγξτε το· αν είναι νόμιμο, προσθέστε το sha256 στο KNOWN_BASE64_SHA256 (lib/security/audit/watch-core.ts).`, evidence: "base64 > 20 KB" });

  const obf = obfuscation(js);
  if (dynamicCode(js) && (unknown.length || obf)) crit("eval / new Function με δυναμικό κώδικα σε αρχείο JS, μαζί με άγνωστο domain ή συγκάλυψη", `Εκτέλεση κώδικα που φτιάχνεται την ώρα της εκτέλεσης${unknown.length ? ` και διεύθυνση σε άγνωστο host (${clipList(unknown, 5)})` : ""}${obf ? ` σε συγκαλυμμένο κώδικα (${obf})` : ""} — το μοτίβο φόρτωσης κακόβουλου κώδικα.`, "eval/new Function δυναμικό");
  if (obf) out.push({ severity: "warn", title: "Συγκαλυμμένος κώδικας σε αρχείο JS", detail: `Σημάδια obfuscator (${obf}) — το build της εφαρμογής δεν βγάζει τέτοιο κώδικα.`, evidence: obf.replace(/\d+/g, "N") });
  return out;
}

// ── cloaking ────────────────────────────────────────────────────────────────────────────────────────────────────────
const NON_EXEC = (t: string | null) => !!t && !/^\s*(?:module|importmap|speculationrules|text\/(?:java|ecma|j|live)script|application\/(?:java|ecma)script)\s*$/i.test(t) && !/^[0-9a-f]+-text\/javascript$/i.test(t.trim());
/**
 * Η «υπογραφή» των scripts μιας σελίδας για σύγκριση μεταξύ user agents: εξωτερικά (host + διαδρομή, χωρίς query),
 * inline που αναφέρουν /cdn-cgi/ ή Zaraz, inline χωρίς nonce, iframes. Το περιεχόμενο των inline (nonce, δεδομένα) δεν μπαίνει.
 */
export function scriptSet(html: string, origin: string): string[] {
  const base = new URL(origin);
  const out: string[] = [];
  const { scripts, iframes } = parseScripts(html);
  for (const s of scripts) {
    if (s.src) {
      try { const u = new URL(s.src, base); out.push(u.origin === base.origin ? `self:${u.pathname}` : `${u.host.toLowerCase()}${u.pathname}`); } catch { out.push(`invalid:${s.src.slice(0, 80)}`); }
      continue;
    }
    if (NON_EXEC(s.type)) continue;
    const cdn = [...s.code.matchAll(/\/cdn-cgi\/[^\s"'`\\)<>?#]*/g)].map((m) => `inline:${m[0]}`);
    const zaraz = /\bzaraz\b/i.test(s.code);
    out.push(...cdn, ...(zaraz ? ["inline:zaraz"] : []));
    // ο loader του JS detections (Bot Fight Mode) μπαίνει χωρίς nonce, ίσως μόνο για browsers: τον δείχνει η διαδρομή του
    // (αθώα διαφορά)· αν δεν είναι ο γνήσιος, τον πιάνει η σάρωση της σελίδας (scanPage → critical)
    if (!s.nonce && !(cdn.length && !zaraz && cdn.every((x) => BENIGN.test(x)))) out.push("inline:no-nonce");
  }
  for (const f of iframes) {
    try { const u = new URL(f, base); out.push(`iframe:${u.protocol === "about:" ? f : `${u.host}${u.pathname}`}`); } catch { out.push(`iframe:${f.slice(0, 80)}`); }
  }
  return uniqSorted(out);
}
/** Αθώα διαφορά: γνωστά scripts του Cloudflare από το δικό μας origin (Email Obfuscation, JS detections). */
const BENIGN = /^(?:self|inline):\/cdn-cgi\/(?:scripts\/[0-9a-f]+\/cloudflare-static\/email-decode\.min\.js|challenge-platform\/(?:h\/[a-z]\/)?scripts\/jsd\/(?:[0-9a-f]+\/)?main\.js)$/;
/**
 * Η ίδια σελίδα για δύο επισκέπτες (π.χ. φύλακας vs Windows Chrome με Referer Google): διαφορετικό σύνολο scripts εκτός
 * /_next/static → critical (cloaking: τα δολώματα ClickFix εμφανίζονται μόνο σε «θύματα»). Τα /_next/static αγνοούνται:
 * η εφαρμογή αποδίδει νόμιμα άλλα components σε κινητό/υπολογιστή (lib/device.ts). Μόνο Email Obfuscation / JSD → warn.
 */
export function cloakingDiff(a: string[], b: string[], labels: [string, string] = ["Α", "Β"]): Finding[] {
  const skip = (x: string) => x.startsWith("self:/_next/static/");
  const A = new Set(a.filter((x) => !skip(x))), B = new Set(b.filter((x) => !skip(x)));
  const onlyA = [...A].filter((x) => !B.has(x)).sort(), onlyB = [...B].filter((x) => !A.has(x)).sort();
  if (!onlyA.length && !onlyB.length) return [];
  const benign = [...onlyA, ...onlyB].every((x) => BENIGN.test(x));
  return [{
    severity: benign ? "warn" : "critical",
    title: benign ? "Διαφορετικά scripts του Cloudflare ανά επισκέπτη" : "Διαφορετικά scripts ανά επισκέπτη (cloaking)",
    detail: `${benign ? "Η διαφορά αφορά μόνο γνωστή λειτουργία του Cloudflare (Email Obfuscation / JS detections) — όχι επίθεση. " : "Η ίδια σελίδα φορτώνει άλλα scripts ανάλογα με τον επισκέπτη (user agent / Referer) — έτσι κρύβονται τα δολώματα ClickFix από τους ελέγχους. "}`
      + `Μόνο στον «${labels[0]}»: ${onlyA.length ? clipList(onlyA) : "—"}. Μόνο στον «${labels[1]}»: ${onlyB.length ? clipList(onlyB) : "—"}.`,
    evidence: [...onlyA.map((x) => `−${x}`), ...onlyB.map((x) => `+${x}`)].join(" "),
  }];
}

// ── Zaraz ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Οι διευθύνσεις του loader του Zaraz όπως γράφονται στη σελίδα (src ή μέσα σε inline κώδικα, με το query `z`) — μόνο του ίδιου origin. */
export function zarazRefs(html: string, origin: string): string[] {
  const host = new URL(origin).host.toLowerCase();
  const out: string[] = [];
  for (const m of html.matchAll(/(?:(?:https?:)?\/\/([^/"'\\\s<>]+))?(\/cdn-cgi\/zaraz\/[^"'\\\s<>)`]*)/gi)) {
    if (m[1] && m[1].toLowerCase() !== host) continue;
    out.push(m[2].replace(/&amp;/g, "&"));
  }
  return uniqSorted(out);
}

export type Got = { status: number; headers: Record<string, string>; body: string } | { error: string };
/**
 * Το Zaraz στην άκρη, ανεξάρτητα από το αν το αναφέρει η σελίδα: GET /cdn-cgi/zaraz/s.js. Ανενεργό → 404 του Cloudflare.
 * 2xx → critical (ενεργό: τα «Custom HTML» του εκτελούνται σε κάθε σελίδα — έτσι έγινε η επίθεση)· έλεγχος Cloudflare /
 * σφάλμα → error (δεν κρίθηκε)· άλλη απάντηση → warn.
 */
export function zarazProbe(r: Got): Finding[] {
  if ("error" in r) return [{ severity: "error", title: "Ο έλεγχος του Zaraz στην άκρη δεν έγινε", detail: `GET /cdn-cgi/zaraz/s.js: ${r.error}`, evidence: "/cdn-cgi/zaraz/s.js" }];
  if (r.status === 404) return [];
  if (classifyPage(r.status, r.headers, r.body) === "challenge") return [{ severity: "error", title: "Ο έλεγχος του Zaraz στην άκρη δεν έγινε", detail: `Το Cloudflare έδειξε σελίδα ελέγχου (HTTP ${r.status}) αντί για απάντηση.`, evidence: "/cdn-cgi/zaraz/s.js" }];
  if (r.status >= 200 && r.status < 300) return [{ severity: "critical", title: "Το Cloudflare Zaraz είναι ενεργό στην άκρη", detail: `Το /cdn-cgi/zaraz/s.js απαντά HTTP ${r.status} (${lowerKeys(r.headers)["content-type"] ?? "—"}, ${r.body.length} bytes) — το Zaraz είναι ενεργό στη ζώνη του Cloudflare. Τα εργαλεία του («Custom HTML») εκτελούν κώδικα σε κάθε σελίδα με δικό τους nonce — ο τρόπος της επίθεσης του 10/2026. Αν δεν το ενεργοποιήσατε εσείς: Cloudflare → Zaraz → απενεργοποίηση, και έλεγχος Tools / Custom HTML / Triggers.`, evidence: "/cdn-cgi/zaraz/s.js" }];
  return [{ severity: "warn", title: "Απρόσμενη απάντηση από /cdn-cgi/zaraz/s.js", detail: `HTTP ${r.status} (περιμέναμε 404 «ανενεργό»). Ελέγξτε στο Cloudflare αν το Zaraz είναι ενεργό.`, evidence: `/cdn-cgi/zaraz/s.js HTTP ${r.status}` }];
}

// ── robots / sitemap ───────────────────────────────────────────────────────────────────────────────────────────────
/** robots.txt: 200 text/plain από την εφαρμογή (app/robots.ts)· Sitemap προς ξένο host ή HTML μέσα → warn. */
export function robotsVerdict(r: Got, origin: string): Finding[] {
  if ("error" in r) return [{ severity: "error", title: "Το robots.txt δεν φορτώθηκε — δεν ελέγχθηκε", detail: r.error, evidence: "/robots.txt" }];
  const out: Finding[] = [];
  const ctype = lowerKeys(r.headers)["content-type"] ?? "";
  if (r.status !== 200) return [{ severity: "warn", title: `Το robots.txt απάντησε HTTP ${r.status}`, detail: "Η εφαρμογή το σερβίρει πάντα (app/robots.ts).", evidence: "/robots.txt" }];
  if (!/^\s*text\/plain\b/i.test(ctype)) out.push({ severity: "warn", title: "Το robots.txt δεν είναι text/plain", detail: `Content-Type «${ctype || "—"}» — η εφαρμογή το σερβίρει ως text/plain.`, evidence: "/robots.txt content-type" });
  if (/<\s*(?:script|html|iframe|a\s)/i.test(r.body)) out.push({ severity: "warn", title: "HTML στο robots.txt", detail: "Το robots.txt περιέχει HTML — δεν το παράγει η εφαρμογή (αντικατάσταση / ενδιάμεσος).", evidence: "/robots.txt html" });
  const host = new URL(origin).host.toLowerCase();
  const foreign = uniqSorted([...r.body.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].flatMap((m) => { try { const u = new URL(m[1]); return u.host.toLowerCase() === host ? [] : [u.host.toLowerCase()]; } catch { return [m[1].slice(0, 80)]; } }));
  if (foreign.length) out.push({ severity: "warn", title: "Το robots.txt δείχνει sitemap άλλου site", detail: "Γραμμή «Sitemap:» προς ξένο host — τρόπος ένεσης SEO spam.", evidence: foreign.join(", ") });
  return out;
}

/**
 * sitemap.xml: η εφαρμογή ΔΕΝ παράγει sitemap (404). Αν εμφανιστεί (200) δεν είναι δικό μας → warn· URLs άλλων sites → warn.
 */
export function sitemapVerdict(r: Got, origin: string): { count: number; findings: Finding[]; note: string } {
  if ("error" in r) return { count: 0, findings: [{ severity: "error", title: "Το sitemap.xml δεν φορτώθηκε — δεν ελέγχθηκε", detail: r.error, evidence: "/sitemap.xml" }], note: `sitemap.xml: ${r.error}` };
  if (r.status === 404) return { count: 0, findings: [], note: "sitemap.xml: 404 (η εφαρμογή δεν παράγει sitemap)" };
  if (r.status !== 200) return { count: 0, findings: [{ severity: "warn", title: `Απρόσμενη απάντηση από το sitemap.xml (HTTP ${r.status})`, detail: "Περιμέναμε 404 — η εφαρμογή δεν παράγει sitemap.", evidence: `/sitemap.xml HTTP ${r.status}` }], note: `sitemap.xml: HTTP ${r.status}` };
  const base = new URL(origin);
  const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const foreign = uniqSorted(locs.flatMap((l) => { try { const u = new URL(l, base); return u.origin === base.origin ? [] : [u.host.toLowerCase()]; } catch { return [l.slice(0, 80)]; } }));
  const findings: Finding[] = [{ severity: "warn", title: "Υπάρχει sitemap.xml που δεν παράγει η εφαρμογή", detail: `Το /sitemap.xml απαντά 200 με ${locs.length} URLs, ενώ η εφαρμογή δεν έχει sitemap (app/sitemap.ts δεν υπάρχει). Κάτι άλλο το σερβίρει (ενδιάμεσος, αντικατάσταση) — ή προστέθηκε sitemap και ο φύλακας θέλει ενημέρωση.`, evidence: "/sitemap.xml 200" }];
  if (foreign.length) findings.push({ severity: "warn", title: "Το sitemap.xml περιέχει URLs άλλων sites", detail: "Ένεση SEO spam: URLs εκτός του site μας στο sitemap.", evidence: clipList(foreign) });
  return { count: locs.length, findings, note: `sitemap.xml: 200, ${locs.length} URLs` };
}

// ── DNS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DNS_NAMES: readonly { name: string; types: readonly string[] }[] = [
  { name: "euronics.dgsoft.gr", types: ["A", "AAAA", "CNAME", "MX", "TXT", "CAA", "NS"] },
  { name: "dgsoft.gr", types: ["A", "AAAA", "CNAME", "MX", "TXT", "CAA", "NS"] },
  { name: "_dmarc.dgsoft.gr", types: ["TXT"] },
];
export const dnsKey = (name: string, type: string) => `${name} ${type}`;
const strip = (s: string) => s.toLowerCase().replace(/\.$/, "");
/** Απάντηση του node:dns/promises → ταξινομημένες συμβολοσειρές (TXT ενωμένα, MX «prio host», CAA «flags tag "value"»). */
export function dnsRecords(type: string, raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  switch (type) {
    case "TXT": return uniqSorted(arr.map((r) => (Array.isArray(r) ? r.join("") : String(r))));
    case "MX": return uniqSorted(arr.map((r: { priority: number; exchange: string }) => `${r.priority} ${strip(r.exchange)}`));
    case "CAA": return uniqSorted(arr.map((r: Record<string, unknown>) => {
      const tag = Object.keys(r).find((k) => k !== "critical") ?? "?";
      return `${Number(r.critical) || 0} ${tag} "${String(r[tag] ?? "")}"`;
    }));
    default: return uniqSorted(arr.map((r) => strip(String(r))));
  }
}

/** Οι δημοσιευμένες περιοχές IP του Cloudflare (cloudflare.com/ips) — anycast των proxied εγγραφών. */
const CF_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"];
const CF_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];
const v4 = (ip: string) => { const p = ip.split(".").map(Number); return p.length === 4 && p.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : null; };
function v6(ip: string): number[] | null {
  const [head, tail] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [], t = tail !== undefined && tail ? tail.split(":") : [];
  if (tail === undefined && h.length !== 8) return null;
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}
function inCidr(ip: string, cidr: string): boolean {
  const [net, bits] = cidr.split("/"), n = Number(bits);
  if (net.includes(":")) {
    const a = v6(ip), b = v6(net);
    if (!a || !b) return false;
    for (let i = 0; i < 8; i++) {
      const take = Math.max(0, Math.min(16, n - i * 16));
      const mask = take === 0 ? 0 : (0xffff << (16 - take)) & 0xffff;
      if ((a[i] & mask) !== (b[i] & mask)) return false;
    }
    return true;
  }
  const a = v4(ip), b = v4(net);
  if (a === null || b === null) return false;
  const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}
export const isCloudflareIp = (ip: string) => (ip.includes(":") ? CF_V6 : CF_V4).some((c) => inCidr(ip, c));

const CRIT_TYPES = new Set(["A", "AAAA", "CNAME", "NS", "MX"]);
/**
 * Σύγκριση με την αποθηκευμένη εικόνα (security/dns-baseline.json). Κλειδί «όνομα ΤΥΠΟΣ», τιμή οι εγγραφές ([] = καμία).
 *   critical: αλλαγή A / AAAA / CNAME / NS / MX (εκτός: A/AAAA που πριν και μετά είναι όλες IP του Cloudflare → warn —
 *             proxied εγγραφή, το Cloudflare άλλαξε anycast IPs, η κίνηση περνά ακόμη από τη ζώνη μας)
 *   warn: αλλαγή TXT / CAA · απρόσμενο NXDOMAIN (υπήρχαν εγγραφές)
 *   error: η εγγραφή δεν διαβάστηκε (timeout / SERVFAIL) — δεν ελέγχθηκε
 * `failures`: κλειδί → κωδικός σφάλματος του resolver (ENOTFOUND/NXDOMAIN, ETIMEOUT…)· ENODATA ο καλών το δίνει ως [].
 */
export function diffDns(baseline: Record<string, string[]>, current: Record<string, string[]>, failures: Record<string, string> = {}): Finding[] {
  const out: Finding[] = [];
  for (const key of uniqSorted([...Object.keys(baseline), ...Object.keys(current), ...Object.keys(failures)])) {
    const type = key.split(" ").pop()!.toUpperCase();
    const b = uniqSorted(baseline[key] ?? []);
    const fail = failures[key];
    if (fail) {
      if (/^(?:NXDOMAIN|ENOTFOUND)$/i.test(fail)) {
        if (b.length) out.push({ severity: "warn", title: `Απρόσμενο NXDOMAIN: ${key}`, detail: `Ο resolver απάντησε ότι το όνομα δεν υπάρχει, ενώ η εικόνα αναφοράς έχει: ${b.join(", ")}. Αν επιμένει, ελέγξτε τη ζώνη DNS στο Cloudflare.`, evidence: `${key}: NXDOMAIN` });
      } else out.push({ severity: "error", title: `Η εγγραφή DNS δεν διαβάστηκε: ${key}`, detail: `Σφάλμα resolver ${fail} — δεν ελέγχθηκε.`, evidence: `${key}: ${fail}` });
      continue;
    }
    if (!(key in current)) continue;
    const c = uniqSorted(current[key]);
    if (b.join("\n") === c.join("\n")) continue;
    const cf = (type === "A" || type === "AAAA") && b.length > 0 && c.length > 0 && [...b, ...c].every(isCloudflareIp);
    const critical = CRIT_TYPES.has(type) && !cf;
    out.push({
      severity: critical ? "critical" : "warn",
      title: `Αλλαγή DNS: ${key}`,
      detail: `Πριν (εικόνα αναφοράς): ${b.join(", ") || "(καμία)"}. Τώρα: ${c.join(", ") || "(καμία)"}. `
        + (cf ? "Όλες οι διευθύνσεις είναι του Cloudflare (proxied εγγραφή) — συνήθως αλλαγή anycast IP από το Cloudflare, όχι επίθεση. "
          : critical ? "Αλλαγή που μπορεί να στείλει την κίνηση (site ή email) αλλού — ελέγξτε αμέσως τη ζώνη στο Cloudflare και ποιος την άλλαξε. "
            : "Αλλαγή TXT/CAA (επαληθεύσεις, SPF, αρχές πιστοποίησης) — ελέγξτε αν έγινε από εμάς. ")
        + "Αν η αλλαγή είναι δική μας, ενημερώστε την εικόνα (npx tsx scripts/security-watch.ts --write-dns-baseline) με commit.",
      evidence: `${key}: ${c.join(", ") || "(καμία)"}`,
    });
  }
  return out;
}

// ── Certificate Transparency ───────────────────────────────────────────────────────────────────────────────────────
export type CtEntry = { names: string[]; notBefore: string; issuer: string };
const isoZ = (s: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
/** crt.sh `output=json` → κοινή μορφή (άκυρο σχήμα → σφάλμα: ο καλών το δίνει ως «δεν ελέγχθηκε»). */
export function parseCrtSh(json: unknown): CtEntry[] {
  if (!Array.isArray(json)) throw new Error("crt.sh: η απάντηση δεν είναι λίστα");
  return json.map((x: { name_value?: unknown; not_before?: unknown; issuer_name?: unknown }) => ({
    names: uniqSorted(String(x.name_value ?? "").split(/\s+/).map((n) => n.trim().toLowerCase()).filter(Boolean)),
    notBefore: isoZ(String(x.not_before ?? "")), issuer: String(x.issuer_name ?? ""),
  }));
}
/** certspotter (api.certspotter.com/v1/issuances, expand=dns_names) → κοινή μορφή. */
export function parseCertSpotter(json: unknown): CtEntry[] {
  if (!Array.isArray(json)) throw new Error("certspotter: η απάντηση δεν είναι λίστα");
  return json.map((x: { dns_names?: unknown; not_before?: unknown; issuer?: { name?: unknown } }) => ({
    names: uniqSorted((Array.isArray(x.dns_names) ? x.dns_names : []).map((n) => String(n).toLowerCase())),
    notBefore: isoZ(String(x.not_before ?? "")), issuer: String(x.issuer?.name ?? ""),
  }));
}
/**
 * Πιστοποιητικά που εκδόθηκαν τις τελευταίες `days` ημέρες για ονόματα που δεν είναι στη λίστα γνωστών (από την εικόνα
 * αναφοράς) → warn (κάποιος έβγαλε πιστοποιητικό για υποτομέα μας — νέο project ή κατάληψη DNS). Ένα εύρημα με όλα τα ονόματα.
 */
export function newCerts(entries: CtEntry[], known: string[], now: Date, days = 2): Finding[] {
  const k = new Set(known.map((x) => x.toLowerCase()));
  const from = now.getTime() - days * DAY, to = now.getTime() + DAY;
  const hits = entries.filter((e) => { const t = Date.parse(e.notBefore); return t >= from && t <= to; }).flatMap((e) => e.names.filter((n) => !k.has(n)).map((n) => ({ n, e })));
  if (!hits.length) return [];
  const names = uniqSorted(hits.map((h) => h.n));
  return [{ severity: "warn", title: "Νέο πιστοποιητικό για άγνωστο όνομα (Certificate Transparency)", detail: `Εκδόθηκαν πιστοποιητικά τις τελευταίες ${days} ημέρες για ονόματα που δεν υπήρχαν στην εικόνα αναφοράς: ${uniqSorted(hits.map((h) => `${h.n} (${h.e.notBefore.slice(0, 10)}${h.e.issuer ? `, ${h.e.issuer.slice(0, 80)}` : ""})`)).join("; ")}. Αν είναι νέο δικό μας project, προσθέστε το όνομα στο knownCertNames του security/dns-baseline.json· αλλιώς ελέγξτε ποιος ελέγχει το DNS.`, evidence: clipList(names, 20) }];
}

// ── heartbeat ──────────────────────────────────────────────────────────────────────────────────────────────────────
export type Heartbeat = { kind: "ok"; body: unknown } | { kind: "http"; status: number } | { kind: "unreachable"; error: string } | { kind: "nosecret" };
type Run = { id: string; startedAt: string; status: string };
const runOf = (v: unknown): Run | null | undefined => {
  if (v === null) return null;
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  return typeof o.startedAt === "string" && !Number.isNaN(Date.parse(o.startedAt)) && typeof o.status === "string" ? { id: String(o.id ?? ""), startedAt: o.startedAt, status: o.status } : undefined;
};
/** Ο light τρέχει κάθε ώρα· πιο παλιός από 3 ώρες → warn. */
export const LIGHT_STALE_MS = 3 * 3_600_000;
/** Από αυτή την ώρα (Ελλάδας) και μετά πρέπει να υπάρχει ο σημερινός full (τρέχει 07:00). */
export const FULL_BY_HOUR = 8;
const DOWN = "Δεν απαντά ο εσωτερικός έλεγχος";

/**
 * Dead man's switch: τι λέει ο εσωτερικός έλεγχος (GET /api/security/heartbeat) σε σχέση με όσα βρήκε ο φύλακας.
 * `watchStatus`: η χειρότερη κατάσταση των ελέγχων του φύλακα που κάνει ΚΑΙ ο εσωτερικός (σελίδες, Zaraz, αρχεία JS,
 * πιστοποιητικό) — DNS / CT ο εσωτερικός δεν τα βλέπει, δεν «διαψεύδουν» το ΟΚ του.
 *   critical: κανένας full σήμερα μετά τις 08:00 (πριν: κανένας χθες) · νεότερο εσωτερικό «ok» ενώ ο φύλακας βρίσκει
 *             critical · 401 / 404 / 5xx / χωρίς απάντηση / άκυρη απάντηση
 *   warn: 503 (ο φύλακας δεν ρυθμίστηκε στην εφαρμογή) · ειδοποιήσεις που δεν παραδόθηκαν · light παλιότερος από 3 ώρες
 *   error: ο φύλακας δεν έχει SECURITY_WATCH_SECRET — δεν ελέγχθηκε
 */
export function heartbeatVerdict(hb: Heartbeat, now: Date, watchStatus: Severity): Finding[] {
  if (hb.kind === "nosecret") return [{ severity: "error", title: "Ο φύλακας δεν έχει SECURITY_WATCH_SECRET — ο εσωτερικός έλεγχος δεν επαληθεύτηκε", detail: "Χωρίς το κοινό μυστικό ο φύλακας δεν μπορεί να υπογράψει το heartbeat. Προσθέστε το GitHub Secret SECURITY_WATCH_SECRET (ίδια τιμή με το Coolify).", evidence: "SECURITY_WATCH_SECRET" }];
  if (hb.kind === "unreachable") return [{ severity: "critical", title: DOWN, detail: `Το /api/security/heartbeat δεν απάντησε (${hb.error}). Ο φύλακας δεν μπορεί να επιβεβαιώσει ότι ο εσωτερικός έλεγχος τρέχει.`, evidence: "heartbeat unreachable" }];
  if (hb.kind === "http") {
    if (hb.status === 503) return [{ severity: "warn", title: "Ο εσωτερικός έλεγχος δεν έχει ρυθμιστεί για τον φύλακα (503)", detail: "Το /api/security/heartbeat απαντά 503: λείπει το SECURITY_WATCH_SECRET από το περιβάλλον της εφαρμογής (Coolify). Μέχρι να οριστεί, ο φύλακας δεν βλέπει αν τρέχει ο εσωτερικός έλεγχος.", evidence: "heartbeat 503" }];
    const why = hb.status === 401 ? "απέρριψε την υπογραφή — διαφορετικό SECURITY_WATCH_SECRET στο GitHub και στο Coolify, ή λάθος ρολόι"
      : hb.status === 404 ? "η διαδρομή δεν υπάρχει — η εφαρμογή που απαντά δεν έχει τον έλεγχο (δεν έγινε deploy, παλιό ή άλλο αντίγραφο)"
        : hb.status >= 500 ? "σφάλμα του server (π.χ. η βάση δεν απαντά — τότε δεν τρέχει ούτε ο εσωτερικός έλεγχος)" : "απρόσμενη απάντηση";
    return [{ severity: "critical", title: DOWN, detail: `Το /api/security/heartbeat απάντησε HTTP ${hb.status}: ${why}.`, evidence: `heartbeat HTTP ${hb.status}` }];
  }
  const b = hb.body && typeof hb.body === "object" ? (hb.body as Record<string, unknown>) : null;
  const lastFull = runOf(b?.lastFull), lastLight = runOf(b?.lastLight);
  if (!b || lastFull === undefined || lastLight === undefined || typeof b.alertsUndelivered !== "boolean") {
    return [{ severity: "critical", title: DOWN, detail: "Το /api/security/heartbeat απάντησε με περιεχόμενο που δεν αναγνωρίζεται (λείπουν lastFull / lastLight / alertsUndelivered).", evidence: "heartbeat invalid" }];
  }
  const out: Finding[] = [];
  const after = athensHour(now) >= FULL_BY_HOUR;
  const expected = athensDay(after ? now : new Date(now.getTime() - DAY));
  if (!lastFull || athensDay(new Date(lastFull.startedAt)) < expected) {
    out.push({ severity: "critical", title: `Ο εσωτερικός έλεγχος δεν έτρεξε ${after ? "σήμερα" : "χθες"}`, detail: `Δεν υπάρχει πλήρης (full) εσωτερικός έλεγχος της ${expected} (τρέχει 07:00 ώρα Ελλάδας). Τελευταίος: ${lastFull ? `${athensDateTime(new Date(lastFull.startedAt))} (${lastFull.status})` : "κανένας τις τελευταίες 7 ημέρες"}. Ελέγξτε το scheduled task του Coolify και τα logs της εφαρμογής.`, evidence: `full ${after ? "σήμερα" : "χθες"}` });
  }
  if (!lastLight || now.getTime() - Date.parse(lastLight.startedAt) > LIGHT_STALE_MS) {
    out.push({ severity: "warn", title: "Ο ωριαίος εσωτερικός έλεγχος δεν τρέχει", detail: `Τελευταίος ωριαίος (light): ${lastLight ? `${athensDateTime(new Date(lastLight.startedAt))} (${lastLight.status})` : "κανένας τις τελευταίες 7 ημέρες"} — πάνω από 3 ώρες. Ελέγξτε το scheduled task του Coolify.`, evidence: "light stale" });
  }
  const newest = [lastFull, lastLight].filter((x): x is Run => !!x).sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt))[0];
  if (newest && newest.status === "ok" && watchStatus === "critical") {
    out.push({ severity: "critical", title: "Ο εσωτερικός έλεγχος λέει ΟΚ ενώ ο εξωτερικός βρίσκει κρίσιμο", detail: `Ο νεότερος εσωτερικός έλεγχος (${athensDateTime(new Date(newest.startedAt))}) δηλώνει «ΟΚ», ενώ ο φύλακας βρίσκει κρίσιμο εύρημα σε έλεγχο που κάνει και ο εσωτερικός (σελίδες / Zaraz / αρχεία JS / πιστοποιητικό). Είτε το πρόβλημα εμφανίστηκε μετά, είτε ο εσωτερικός έλεγχος δεν βλέπει ό,τι βλέπει ο επισκέπτης — ή έχει παραβιαστεί. Δείτε τα ευρήματα του φύλακα.`, evidence: "internal ok vs watch critical" });
  }
  if (b.alertsUndelivered) out.push({ severity: "warn", title: "Ειδοποιήσεις του εσωτερικού ελέγχου δεν παραδόθηκαν", detail: "Υπάρχει report 2–48 ωρών με ειδοποίηση «ΚΡΙΣΙΜΟ» που δεν στάλθηκε (ή δεν την πήραν όλοι οι παραλήπτες). Ελέγξτε το Mailgun και τη σελίδα «Ασφάλεια».", evidence: "alertsUndelivered" });
  return out;
}

/** Ο νεότερος εσωτερικός full/light για τη σύνοψη. */
export function heartbeatSummary(hb: Heartbeat): string {
  if (hb.kind === "nosecret") return "χωρίς SECURITY_WATCH_SECRET — δεν ελέγχθηκε";
  if (hb.kind === "unreachable") return `χωρίς απάντηση (${hb.error})`;
  if (hb.kind === "http") return `HTTP ${hb.status}`;
  const b = (hb.body ?? {}) as Record<string, unknown>;
  const fmt = (r: Run | null | undefined) => (r ? `${athensDateTime(new Date(r.startedAt))} ${r.status}` : "—");
  return `τελευταίος full: ${fmt(runOf(b.lastFull))} · light: ${fmt(runOf(b.lastLight))} · ειδοποιήσεις που δεν παραδόθηκαν: ${b.alertsUndelivered ? "ναι" : "όχι"}`;
}

// ── αναφορά / email ────────────────────────────────────────────────────────────────────────────────────────────────
export function watchCheckOf(key: string, title: string, summary: string, findings: Finding[], ms: number): CheckResult {
  return { key, title, status: statusOf(findings), summary, findings, ms };
}
/** Οι έλεγχοι του φύλακα που κάνει και ο εσωτερικός (για το «εσωτερικό ΟΚ ενώ ο φύλακας βρίσκει κρίσιμο»). */
export const OVERLAP_KEYS: readonly string[] = ["pages", "zaraz", "chunks", "cloaking", "cert"];

export type WatchReport = { mode: "full" | "light"; status: Severity; startedAt: Date; finishedAt: Date; site: string; checks: CheckResult[]; notes: string[] };
const LABEL: Record<Severity, string> = { ok: "ΟΚ", warn: "Προειδοποίηση", critical: "ΚΡΙΣΙΜΟ", error: "Σφάλμα ελέγχου" };
const SUBJECT: Record<Severity, string> = { ok: "ΟΚ", warn: "Προειδοποιήσεις", critical: "ΚΡΙΣΙΜΟ", error: "Σφάλμα ελέγχου" };
const COLOR: Record<Severity, string> = { ok: "#15803d", warn: "#b45309", critical: "#b91c1c", error: "#6d28d9" };
const EMAIL_FINDINGS = 25;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const h = (s: string, n = 600) => escapeHtml(clip(s, n));
const t = (s: string, n = 600) => clip(s, n).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s{2,}/g, " ").trim();
const badge = (s: Severity) => `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${COLOR[s]};color:#fff;font-weight:bold;font-size:12px">${LABEL[s]}</span>`;

/**
 * Email του φύλακα (ίδια μορφή με τη σύνοψη του εσωτερικού ελέγχου): θέμα «[Euronics] Εξωτερικός φύλακας ΗΗ/ΜΜ: …»,
 * κάθε έλεγχος με κατάσταση, σύνοψη και ευρήματα (έως 25). Όλο το κείμενο περνά από escapeHtml — τα ευρήματα μπορεί να
 * περιέχουν ό,τι έγραψε επιτιθέμενος στις σελίδες.
 */
export function renderWatchEmail(r: WatchReport, link: string | null): { subject: string; html: string; text: string } {
  const dm = athensDateTime(r.startedAt).slice(0, 5);
  const subject = `[Euronics] Εξωτερικός φύλακας ${dm}: ${SUBJECT[r.status]}${r.mode === "light" ? " (ωριαίος)" : ""}`;
  const meta: [string, string][] = [
    ["Site", r.site], ["Είδος", r.mode === "full" ? "πλήρης (καθημερινός)" : "ωριαίος (light)"],
    ["Έναρξη", `${athensDateTime(r.startedAt)} (ώρα Ελλάδας)`], ["Λήξη", `${athensDateTime(r.finishedAt)} (ώρα Ελλάδας)`], ["Έλεγχοι", String(r.checks.length)],
  ];
  const rows = r.checks.map((c) => {
    const shown = c.findings.slice(0, EMAIL_FINDINGS), more = c.findings.length - shown.length;
    const list = shown.length ? `<ul style="margin:6px 0 0;padding-left:18px">${shown.map((f) => `<li style="margin:4px 0">${badge(f.severity)} <strong>${h(f.title, 300)}</strong><br><span style="color:#374151">${h(f.detail)}</span>${f.evidence ? `<br><code style="font-size:12px;color:#6b7280;word-break:break-all">${h(f.evidence, 300)}</code>` : ""}</li>`).join("")}${more > 0 ? `<li style="margin:4px 0;color:#6b7280">… και ${more} ακόμη (artifact του run)</li>` : ""}</ul>` : "";
    return `<tr><td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top;white-space:nowrap">${badge(c.status)}</td><td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top"><strong>${h(c.title, 200)}</strong><br><span style="color:#374151">${h(c.summary, 1500)}</span>${list}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827"><div style="max-width:760px;margin:0 auto;background:#fff;padding:20px;border-radius:8px">`
    + `<h1 style="margin:0 0 4px;font-size:20px">Εξωτερικός φύλακας ${badge(r.status)}</h1>`
    + `<p style="margin:0 0 12px;color:#4b5563">Ανεξάρτητος έλεγχος του site απ' έξω (GitHub Actions, όχι από τις υποδομές μας) — μόνο αναγνώσεις: όσα βλέπει ένας επισκέπτης, DNS, πιστοποιητικά και αν τρέχει ο εσωτερικός έλεγχος.</p>`
    + `<table style="border-collapse:collapse;margin-bottom:12px">${meta.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${escapeHtml(k)}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`).join("")}</table>`
    + (link ? `<p style="margin:0 0 12px"><a href="${escapeHtml(link)}" style="color:#1d4ed8">Το run στο GitHub (artifact με όλα τα στοιχεία)</a></p>` : "")
    + (r.notes.length ? `<ul style="margin:0 0 12px;padding-left:18px;color:#4b5563">${r.notes.map((n) => `<li>${h(n, 400)}</li>`).join("")}</ul>` : "")
    + `<table style="border-collapse:collapse;width:100%">${rows}</table></div></body></html>`;
  const text = [
    `Εξωτερικός φύλακας: ${LABEL[r.status]}`, ...meta.map(([k, v]) => `${k}: ${v}`), ...(link ? [`Run: ${link}`] : []), ...r.notes.map((n) => `* ${t(n, 400)}`), "",
    ...r.checks.flatMap((c) => [
      `[${LABEL[c.status]}] ${t(c.title, 200)}`, `  ${t(c.summary, 1500)}`,
      ...c.findings.slice(0, EMAIL_FINDINGS).map((f) => `  - [${LABEL[f.severity]}] ${t(f.title, 300)}: ${t(f.detail)}${f.evidence ? ` | ${t(f.evidence, 300)}` : ""}`),
      ...(c.findings.length > EMAIL_FINDINGS ? [`  … και ${c.findings.length - EMAIL_FINDINGS} ακόμη (artifact του run)`] : []), "",
    ]),
  ].join("\n");
  return { subject, html, text };
}

/**
 * Για το artifact του δημόσιου repo (logs/artifacts δημόσιων repos τα βλέπει οποιοσδήποτε): το heartbeat μόνο με την
 * κατάστασή του — χωρίς πότε έτρεξε ο εσωτερικός έλεγχος, με τι αποτέλεσμα, ή αν υπάρχουν αδιάβαστες ειδοποιήσεις.
 * Οι υπόλοιποι έλεγχοι είναι όσα βλέπει έτσι κι αλλιώς κάθε επισκέπτης.
 */
export function publicChecks(checks: CheckResult[]): CheckResult[] {
  return checks.map((c) => (c.key === "heartbeat" ? { ...c, summary: "Heartbeat του εσωτερικού ελέγχου — οι λεπτομέρειες μόνο στο email.", findings: [] } : c));
}

/**
 * Light: email μόνο για κρίσιμα που δεν στάλθηκαν τις τελευταίες 23 ώρες (`sent`: fingerprint → ISO, από την κατάσταση
 * που κρατά το workflow στο cache) — χωρίς αυτό ένα κρίσιμο που επιμένει θα έστελνε email κάθε ώρα.
 */
export function lightAlerts(checks: CheckResult[], sent: Record<string, string>, now: Date) {
  // ημερομηνία στο μέλλον (λάθος ρολόι / χειροκίνητη αλλαγή) δεν μετρά — αλλιώς θα έκοβε την ειδοποίηση για πάντα
  const m = new Map(Object.entries(sent).flatMap(([k, v]) => { const d = new Date(v); return Number.isNaN(d.getTime()) || d.getTime() > now.getTime() ? [] : [[k, d] as [string, Date]]; }));
  return alertsToSend(checks.flatMap((c) => c.findings.map((f) => ({ checkKey: c.key, f }))), m, now);
}
/** Νέα κατάσταση αποστολών: προσθήκη των σταλμένων, διαγραφή όσων είναι παλιότερα από 48 ώρες. */
export function updateSent(sent: Record<string, string>, fps: string[], now: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sent)) { const age = now.getTime() - Date.parse(v); if (age >= 0 && age < 2 * DAY) out[k] = v; }
  for (const fp of fps) out[fp] = now.toISOString();
  return out;
}
