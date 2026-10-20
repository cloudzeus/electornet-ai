import { checkHeaders, classifyPage, parseScripts, scanPage, statusOf, type Finding, type Severity } from "../rules";

/**
 * Το site όπως το βλέπει ο επισκέπτης — καθαρή λογική. Το I/O (site.ts) φέρνει τις σελίδες από το ΔΗΜΟΣΙΟ URL (μέσω
 * Cloudflare, ώστε να φαίνεται ό,τι προσθέτει η άκρη — έτσι μπήκε η επίθεση του Zaraz) και διαβάζει το build από τον δίσκο.
 * Εδώ: κατάταξη κάθε απάντησης, κανόνες σελίδας (scanPage) και headers (checkHeaders), συγχώνευση ευρημάτων ανά σελίδα,
 * σύνοψη. Ό,τι δεν ελέγχθηκε (σελίδα που δεν φόρτωσε, έλεγχος Cloudflare, build άγνωστο) φαίνεται — ποτέ σιωπηλό ok.
 */

export type Fetched =
  | { path: string; status: number; headers: Record<string, string>; html: string; /** ανακατεύθυνση σε άλλο origin (δεν ακολουθήθηκε) */ redirectTo?: string; /** τελική διαδρομή μετά από ανακατευθύνσεις στο ίδιο origin */ finalPath?: string }
  | { path: string; error: string };

export type Build = { id: string | null; files: Set<string> };
export type PageCtx = { origin: string; build: Build | null; allowedScriptHosts: string[]; expectedConnectSrc: string[] };
export type PageResult = { path: string; label: string; scanned: boolean; findings: Finding[]; scripts: { external: number; inline: number } };

/** Οι πηγές του connect-src ενός CSP (όπως τις παράγει το buildCsp) — αυτές περιμένει ο έλεγχος headers. */
export function connectSrcOf(csp: string): string[] {
  for (const d of csp.split(";")) {
    const [name, ...v] = d.trim().split(/\s+/);
    if (name?.toLowerCase() === "connect-src") return v;
  }
  return [];
}

/** Το buildId της σελίδας από τα δεδομένα του Next (`"b":"<id>"`) ή το _buildManifest — null αν δεν βρεθεί ένα μοναδικό. */
export function buildIdOf(html: string): string | null {
  const ids = new Set<string>();
  for (const m of html.matchAll(/\\?"b\\?"\s*:\s*\\?"([A-Za-z0-9_-]{6,64})\\?"/g)) ids.add(m[1]);
  for (const m of html.matchAll(/\/_next\/static\/([A-Za-z0-9_-]{6,64})\/_(?:build|ssg)Manifest\.js/g)) ids.add(m[1]);
  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * Διαδρομές κατηγοριών (/k/…) και προϊόντων (/proion/…) του ίδιου origin από sitemap (<loc>) ή HTML (href) — για την
 * εφεδρική επιλογή σελίδων όταν η βάση δεν απαντά.
 */
export function pickLinks(text: string, origin: string): { categories: string[]; products: string[] } {
  const base = new URL(origin);
  const paths = new Set<string>();
  for (const m of text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>|\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL((m[1] ?? m[2]).replace(/&amp;/g, "&"), base);
      if (u.origin === base.origin) paths.add(u.pathname);
    } catch { /* άκυρο */ }
  }
  const all = [...paths].sort();
  return { categories: all.filter((p) => /^\/k\/[^/]+/.test(p)), products: all.filter((p) => /^\/proion\/[^/]+$/.test(p)) };
}
export const pickOne = <T>(xs: T[], rand: () => number = Math.random): T | null => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))] : null);

const host = (u: string) => { try { return new URL(u).host; } catch { return u.slice(0, 80); } };

/** Κατάταξη και έλεγχος μίας σελίδας. */
export function evaluatePage(page: Fetched, ctx: PageCtx): PageResult {
  const none = { external: 0, inline: 0 };
  const res = (label: string, findings: Finding[], scanned = false, scripts = none): PageResult => ({ path: page.path, label, scanned, findings, scripts });
  if ("error" in page) {
    return res("δεν φόρτωσε", [{ severity: "error", title: "Σελίδα που δεν φόρτωσε — δεν ελέγχθηκε", detail: `${page.path}: ${page.error}`, evidence: page.path }]);
  }
  if (page.redirectTo) {
    const h = host(page.redirectTo);
    if (/(^|\.)cloudflareaccess\.com$/i.test(h.replace(/:\d+$/, ""))) {
      return res(`${page.status} → Cloudflare Access`, [{ severity: "error", title: "Σελίδα πίσω από Cloudflare Access — δεν ελέγχθηκε", detail: `Η ${page.path} ανακατευθύνει στη σύνδεση του Cloudflare Access (${h}) — ο έλεγχος δεν βλέπει το περιεχόμενό της.`, evidence: page.path }]);
    }
    return res(`${page.status} → ${h}`, [{ severity: "critical", title: "Ανακατεύθυνση σε ξένο site", detail: `Η ${page.path} στέλνει τον επισκέπτη στο ${page.redirectTo.slice(0, 200)} — η εφαρμογή δεν ανακατευθύνει ποτέ εκτός site. Ελέγξτε Cloudflare (Rules → Redirect Rules / Page Rules, Workers) και DNS.`, evidence: `${page.path} → ${h}` }]);
  }
  const kind = classifyPage(page.status, page.headers, page.html);
  if (kind === "challenge") {
    return res(`${page.status} έλεγχος Cloudflare`, [{ severity: "error", title: "Σελίδα ελέγχου του Cloudflare αντί για τη σελίδα — δεν ελέγχθηκε", detail: `Το Cloudflare έδειξε τη δική του σελίδα ελέγχου («Just a moment…», HTTP ${page.status}) στον έλεγχο αντί για την ${page.path}. Η γνήσια σελίδα ελέγχου του Cloudflare δεν είναι επίθεση, αλλά η σελίδα μας δεν σαρώθηκε. Εξαιρέστε τον έλεγχο από το Bot Fight Mode / τους κανόνες WAF ή δοκιμάστε ξανά.`, evidence: page.path }]);
  }
  if (kind === "error") {
    return res(`HTTP ${page.status}`, [{ severity: "error", title: `Η σελίδα απάντησε HTTP ${page.status} — δεν ελέγχθηκε`, detail: `${page.path}: HTTP ${page.status}. Η σελίδα δεν σαρώθηκε.`, evidence: page.path }]);
  }
  const findings: Finding[] = [];
  let files: Set<string> | null = null;
  if (ctx.build) {
    const pageId = buildIdOf(page.html);
    if (ctx.build.id && pageId && pageId !== ctx.build.id) {
      findings.push({ severity: "warn", title: "Το site σερβίρει άλλο build από τον server του ελέγχου", detail: `Τα αρχεία /_next/static αυτής της σελίδας ΔΕΝ συγκρίθηκαν με το build. Συνήθως: deploy σε εξέλιξη ή ο έλεγχος τρέχει σε άλλο αντίγραφο της εφαρμογής από αυτό που σερβίρει το site. Αν επιμένει, ελέγξτε ποιος server απαντά στο δημόσιο URL.`, evidence: `site ${pageId} · server ${ctx.build.id}` });
    } else files = ctx.build.files;
  }
  findings.push(...scanPage(page.html, { origin: ctx.origin, buildChunks: files, allowedScriptHosts: ctx.allowedScriptHosts }));
  findings.push(...checkHeaders(page.headers, { expectedConnectSrc: ctx.expectedConnectSrc }));
  const { scripts } = parseScripts(page.html);
  const moved = page.finalPath && page.finalPath !== page.path ? ` → ${page.finalPath}` : "";
  return res(`${page.status}${moved}`, findings, true, { external: scripts.filter((s) => !s.inline).length, inline: scripts.filter((s) => s.inline).length });
}

/** Το ίδιο εύρημα (σοβαρότητα + τίτλος + τεκμήριο) σε πολλές σελίδες → ένα, με τις σελίδες στη λεπτομέρεια (όχι στο τεκμήριο: fingerprint). */
export function mergeFindings(pages: { path: string; findings: Finding[] }[]): Finding[] {
  const by = new Map<string, { f: Finding; paths: string[] }>();
  for (const p of pages) for (const f of p.findings) {
    const k = `${f.severity}\n${f.title}\n${f.evidence ?? ""}`;
    const cur = by.get(k);
    if (cur) { if (!cur.paths.includes(p.path)) cur.paths.push(p.path); } else by.set(k, { f, paths: [p.path] });
  }
  return [...by.values()].map(({ f, paths }) => (f.evidence === paths[0] && paths.length === 1 ? f : { ...f, detail: `${f.detail} Σελίδες: ${paths.join(", ")}.` }));
}

export type PickInfo = { source: "db" | "sitemap" | "home" | "none"; note?: string };
const PICK: Record<PickInfo["source"], string> = { db: "από τη βάση (τυχαία ενεργά)", sitemap: "από το sitemap.xml", home: "από συνδέσμους της αρχικής", none: "δεν βρέθηκαν" };

export function siteOutcome(input: {
  mode: "full" | "light"; origin: string; originSource: string; pages: PageResult[]; build: Build | null;
  analytics: { keys: string[]; hosts: string[] } | null; pick?: PickInfo; missing?: string[];
}): { status: Severity; summary: string; findings: Finding[]; complete: boolean } {
  const findings = mergeFindings(input.pages);
  if (!input.build) findings.push({ severity: "warn", title: "Δεν βρέθηκε το build — ο έλεγχος αρχείων παραλείπεται", detail: "Ο φάκελος .next/static δεν βρέθηκε στον server του ελέγχου: τα scripts /_next/static των σελίδων ΔΕΝ συγκρίθηκαν με τα αρχεία του build (ένα αρχείο που προστέθηκε/αντικαταστάθηκε δεν θα φαινόταν). Οι υπόλοιποι κανόνες εφαρμόστηκαν.", evidence: ".next/static" });
  for (const m of input.missing ?? []) findings.push({ severity: "error", title: `Δεν βρέθηκε σελίδα ${m} για έλεγχο`, detail: `Ούτε η βάση, ούτε το sitemap, ούτε η αρχική έδωσαν σελίδα ${m}${input.pick?.note ? ` (${input.pick.note})` : ""} — δεν ελέγχθηκε.`, evidence: m });
  const scanned = input.pages.filter((p) => p.scanned);
  const ext = scanned.reduce((s, p) => s + p.scripts.external, 0), inl = scanned.reduce((s, p) => s + p.scripts.inline, 0);
  const summary = [
    `${scanned.length} από ${input.pages.length} σελίδες ελέγχθηκαν μέσω ${input.origin} (πηγή URL: ${input.originSource}): ${input.pages.map((p) => `${p.path} (${p.label})`).join(", ")}`,
    `${ext} εξωτερικά και ${inl} inline scripts, iframes, δείκτες ClickFix και headers (CSP/HSTS/nosniff/frame-ancestors, connect-src όπως το lib/security/csp.ts)`,
    input.build ? `build ${input.build.id ?? "(χωρίς BUILD_ID)"}: ${input.build.files.size} αρχεία .next/static για σύγκριση` : "build: δεν βρέθηκε — χωρίς σύγκριση αρχείων",
    input.analytics ? (input.analytics.keys.length ? `επιτρεπτοί script hosts από τα pixels ${input.analytics.keys.join(", ")}: ${input.analytics.hosts.join(", ")}` : "κανένα pixel ρυθμισμένο — κανένας ξένος script host επιτρεπτός") : "οι ρυθμίσεις Analytics δεν διαβάστηκαν — κανένας ξένος script host επιτρεπτός",
    ...(input.mode === "full" && input.pick ? [`κατηγορία/προϊόν ${PICK[input.pick.source]}${input.pick.note ? ` (${input.pick.note})` : ""}`] : []),
  ].join(" · ");
  return { status: statusOf(findings), summary, findings, complete: scanned.length === input.pages.length && !(input.missing ?? []).length };
}
