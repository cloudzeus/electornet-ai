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
/**
 * Τι είδε ο έλεγχος site για τα builds — κρατιέται στο report (snapshot, δεν το δείχνουν UI/email) ώστε ο ΕΠΟΜΕΝΟΣ έλεγχος
 * να ξεχωρίζει ένα deploy σε εξέλιξη (περνά μέσα σε μία εκτέλεση) από κάτι που επιμένει (ruling J).
 */
export type SiteSnapshot = { at: string; serverBuild: string | null; pages: { path: string; pageBuild: string | null; missing: boolean }[] };
/** null = δεν υπάρχει προηγούμενος έλεγχος site με στιγμιότυπο· "unavailable" = δεν διαβάστηκε (π.χ. βάση εκτός). */
export type PrevSite = SiteSnapshot | null | "unavailable";
export type PageCtx = { origin: string; build: Build | null; allowedScriptHosts: string[]; expectedConnectSrc: string[]; /** προεπιλογή "unavailable" */ previous?: PrevSite };
export type PageResult = {
  path: string; label: string; scanned: boolean; findings: Finding[]; scripts: { external: number; inline: number };
  /** άλλο build με αρχεία που λείπουν: να ξαναελεγχθεί */ recheck?: true;
  /** buildId της σελίδας και τα αρχεία /_next/static που λείπουν από το build του server (μόνο όταν διαφέρει το build) */ build?: { page: string | null; missing: string[] };
};

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
/**
 * `confirmed`: δεύτερος έλεγχος της ίδιας σελίδας (το I/O την ξαναφέρνει μετά από ~20″ όταν `recheck`· χωρίς χρόνο
 * καλεί με `confirmed` και `note`) — άλλο build με αρχεία που λείπουν κρίνεται τότε από το mismatchFinding.
 */
export function evaluatePage(page: Fetched, ctx: PageCtx, opts: { confirmed?: boolean; note?: string } = {}): PageResult {
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
  // πρέπει να είναι σελίδα της εφαρμογής: 200, text/html, με scripts /_next/static ή δεδομένα του Next (__next_f) —
  // αλλιώς κενή/204/3xx χωρίς Location/JSON (δεν ελέγχθηκε) ή στατική σελίδα στη θέση της (αντικατάσταση → critical)
  const ctype = (Object.entries(page.headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "").toLowerCase();
  const { scripts } = parseScripts(page.html);
  const counts = { external: scripts.filter((s) => !s.inline).length, inline: scripts.filter((s) => s.inline).length };
  if (page.status !== 200 || !/^\s*text\/html\b/.test(ctype) || !page.html.trim()) {
    return res(`HTTP ${page.status}${ctype ? ` ${ctype.split(";")[0].trim()}` : ""}`, [{ severity: "error", title: "Η απάντηση δεν είναι σελίδα της εφαρμογής — δεν ελέγχθηκε", detail: `${page.path}: HTTP ${page.status}, Content-Type «${ctype || "—"}», ${page.html.length} bytes. Η εφαρμογή απαντά με σελίδα HTML (200) — αυτή η απάντηση δεν σαρώθηκε.`, evidence: page.path }]);
  }
  const ours = scripts.some((s) => (s.src ? sameOriginStatic(s.src, ctx.origin) !== null : /__next_f\b/.test(s.code)));
  if (!ours) {
    return res(`${page.status} χωρίς σημάδια της εφαρμογής`, [
      { severity: "critical", title: "Η σελίδα δεν είναι της εφαρμογής (πιθανή αντικατάσταση/defacement)", detail: `Η ${page.path} απάντησε με HTML χωρίς κανένα script /_next/static ή δεδομένα του Next — η εφαρμογή δεν παράγει ποτέ τέτοια σελίδα. Κάτι άλλο σερβίρει στη θέση της (αντικατάσταση, Cloudflare Worker / Page Rule, άλλος server). Αρχή: «${snip(page.html, 160)}».`, evidence: page.path },
      ...scanPage(page.html, { origin: ctx.origin, buildChunks: ctx.build?.files ?? null, allowedScriptHosts: ctx.allowedScriptHosts }),
    ], false, counts);
  }
  const findings: Finding[] = [];
  let files: Set<string> | null = null;
  let recheck: true | undefined;
  let buildSeen: PageResult["build"];
  if (ctx.build) {
    const pageId = buildIdOf(page.html);
    buildSeen = { page: pageId, missing: [] };
    if (ctx.build.id && pageId && pageId !== ctx.build.id) {
      // άλλο build: τα αρχεία του δεν συγκρίνονται ένα-ένα (scanPage), αλλά ό,τι λείπει από το δικό μας build μετρά —
      // ένας ενδιάμεσος που αλλάζει το buildId δεν «κρύβει» έτσι ένα ξένο chunk
      const missing = missingStatic(scripts, ctx.origin, ctx.build.files);
      buildSeen = { page: pageId, missing };
      if (missing.length && !opts.confirmed) {
        recheck = true;
        findings.push({ severity: "warn", title: "Το site σερβίρει άλλο build από τον server του ελέγχου", detail: `Η σελίδα δηλώνει άλλο build και φορτώνει ${missing.length} αρχεία που δεν υπάρχουν στο build του server (θα ξαναελεγχθεί).`, evidence: `site ${pageId} · server ${ctx.build.id}` });
      } else if (missing.length) {
        findings.push(mismatchFinding({ pageBuild: pageId, serverBuild: ctx.build.id, missing, previous: ctx.previous === undefined ? "unavailable" : ctx.previous, note: opts.note }));
      } else {
        findings.push({ severity: "warn", title: "Το site σερβίρει άλλο build από τον server του ελέγχου", detail: "Η σελίδα δηλώνει άλλο build — όλα τα αρχεία /_next/static της υπάρχουν στο build του server. Συνήθως: deploy σε εξέλιξη. Αν επιμένει, ελέγξτε ποιος server απαντά στο δημόσιο URL.", evidence: `site ${pageId} · server ${ctx.build.id}` });
      }
    } else files = ctx.build.files;
  }
  findings.push(...scanPage(page.html, { origin: ctx.origin, buildChunks: files, allowedScriptHosts: ctx.allowedScriptHosts }));
  findings.push(...checkHeaders(page.headers, { expectedConnectSrc: ctx.expectedConnectSrc }));
  const moved = page.finalPath && page.finalPath !== page.path ? ` → ${page.finalPath}` : "";
  return { ...res(`${page.status}${moved}`, findings, true, counts), ...(recheck ? { recheck } : {}), ...(buildSeen ? { build: buildSeen } : {}) };
}

const snip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
/** Η διαδρομή /_next/static ενός src του ίδιου origin (αποκωδικοποιημένη) — null αν δεν είναι τέτοιο. */
function sameOriginStatic(src: string, origin: string): string | null {
  try {
    const u = new URL(src, origin);
    if (u.origin !== new URL(origin).origin || !u.pathname.startsWith("/_next/static/")) return null;
    try { return decodeURIComponent(u.pathname); } catch { return u.pathname; }
  } catch { return null; }
}
/** Τα scripts /_next/static της σελίδας που δεν υπάρχουν στα αρχεία του build (ταξινομημένα, μοναδικά). */
export function missingStatic(scripts: { src: string | null }[], origin: string, files: Set<string>): string[] {
  const out = new Set<string>();
  for (const s of scripts) {
    const p = s.src ? sameOriginStatic(s.src, origin) : null;
    if (p && !files.has(p)) out.add(p);
  }
  return [...out].sort();
}

/**
 * Άλλο build στη σελίδα με αρχεία /_next/static που λείπουν από το build του server (και μετά τη δεύτερη λήψη) — ruling J:
 * critical ΜΟΝΟ αν το ίδιο ζεύγος (buildId σελίδας ≠ buildId server, με αρχεία που λείπουν) υπήρχε και στον προηγούμενο
 * έλεγχο site (light ή full, ~1 ώρα πριν): ένα deploy δεν κρατά τόσο. Πρώτη εμφάνιση → warn «πιθανό deploy»· ο
 * προηγούμενος δεν διαβάστηκε → warn που το λέει. (Scripts από ξένο host δίνουν critical αμέσως, από το scanPage.)
 */
export function mismatchFinding(i: { pageBuild: string | null; serverBuild: string | null; missing: string[]; previous: PrevSite; note?: string }): Finding {
  const evidence = `site ${i.pageBuild} · server ${i.serverBuild}`;
  const files = `${i.missing.length} αρχεία /_next/static που δεν υπάρχουν στο build του server${i.note ? ` (${i.note})` : ""}: ${i.missing.slice(0, 5).join(", ")}${i.missing.length > 5 ? "…" : ""}`;
  const prev = i.previous;
  if (prev && prev !== "unavailable" && prev.serverBuild === i.serverBuild && prev.pages.some((p) => p.missing && p.pageBuild === i.pageBuild)) {
    return { severity: "critical", title: "Το site σερβίρει αρχεία που δεν υπάρχουν στο build του server", detail: `Η σελίδα δηλώνει build ${i.pageBuild} (ο server: ${i.serverBuild}) και φορτώνει ${files}. Το ίδιο είχε βρεθεί και στον προηγούμενο έλεγχο (${prev.at}) — δεν είναι σύντομο deploy. Είτε το δημόσιο URL σερβίρεται από άλλο αντίγραφο της εφαρμογής (παλιός/δεύτερος server) είτε ενδιάμεσος (Cloudflare Worker / ένεση) άλλαξε τη σελίδα. Επιβεβαιώστε ποιος server απαντά.`, evidence };
  }
  if (prev === "unavailable") {
    return { severity: "warn", title: "Αρχεία που λείπουν από το build — χωρίς σύγκριση με τον προηγούμενο έλεγχο", detail: `Η σελίδα δηλώνει build ${i.pageBuild} (ο server: ${i.serverBuild}) και φορτώνει ${files}. Ο προηγούμενος έλεγχος δεν διαβάστηκε (π.χ. η βάση δεν απάντησε), οπότε δεν κρίνεται αν είναι σύντομο deploy ή κάτι που επιμένει — ΔΕΝ είναι «όλα καλά». Ελέγξτε ποιος server απαντά στο δημόσιο URL.`, evidence };
  }
  return { severity: "warn", title: "Πιθανό deploy σε εξέλιξη — αρχεία που λείπουν από το build· επανέλεγχος στην επόμενη εκτέλεση", detail: `Η σελίδα δηλώνει build ${i.pageBuild} (ο server: ${i.serverBuild}) και φορτώνει ${files}. Πρώτη φορά που εμφανίζεται${prev ? " (ο προηγούμενος έλεγχος είχε άλλη εικόνα)" : ""}: αν το ίδιο βρεθεί και στην επόμενη εκτέλεση, γίνεται κρίσιμο.`, evidence };
}

/** Στιγμιότυπο builds για τον επόμενο έλεγχο. */
export function siteSnapshot(pages: PageResult[], build: Build | null, now: Date): SiteSnapshot {
  return { at: now.toISOString(), serverBuild: build?.id ?? null, pages: pages.filter((p) => p.build).map((p) => ({ path: p.path, pageBuild: p.build!.page, missing: p.build!.missing.length > 0 })) };
}
/** Το στιγμιότυπο του ελέγχου site από τα αποθηκευμένα checks ενός report (null αν δεν υπάρχει / άκυρο). */
export function prevSiteSnapshot(checks: unknown): SiteSnapshot | null {
  if (!Array.isArray(checks)) return null;
  const c = checks.find((x) => x && typeof x === "object" && (x as { key?: unknown }).key === "site") as { snapshot?: unknown } | undefined;
  const s = c?.snapshot as SiteSnapshot | undefined;
  if (!s || typeof s !== "object" || typeof s.at !== "string" || !Array.isArray(s.pages)) return null;
  return s.pages.every((p) => p && typeof p.path === "string" && typeof p.missing === "boolean") ? s : null;
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
  analytics: { keys: string[]; hosts: string[] } | null; pick?: PickInfo; missing?: string[]; /** το URL είναι η ενσωματωμένη προεπιλογή */ originDefault?: boolean;
  now?: Date;
}): { status: Severity; summary: string; findings: Finding[]; complete: boolean; snapshot: SiteSnapshot } {
  const findings = mergeFindings(input.pages);
  if (input.originDefault) findings.push({ severity: "warn", title: `Δεν έχει οριστεί SECURITY_SITE_URL/AUTH_URL — ελέγχεται η προεπιλογή ${input.origin}`, detail: `Ο έλεγχος δεν ξέρει από τις ρυθμίσεις ποιο είναι το δημόσιο URL της εφαρμογής και ελέγχει την ενσωματωμένη προεπιλογή ${input.origin}. Αν το site έχει μετακομίσει, ο έλεγχος κοιτάζει λάθος site. Ορίστε SECURITY_SITE_URL (ή AUTH_URL) στο περιβάλλον του server.`, evidence: input.origin });
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
  return { status: statusOf(findings), summary, findings, complete: scanned.length === input.pages.length && !(input.missing ?? []).length, snapshot: siteSnapshot(input.pages, input.build, input.now ?? new Date()) };
}
