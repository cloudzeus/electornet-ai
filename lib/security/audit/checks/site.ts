import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { LISTED } from "@/lib/data/db-catalog";
import { getSetting } from "@/lib/settings/store";
import { cleanAnalyticsIds } from "@/lib/security/analytics-ids";
import { buildCsp } from "@/lib/security/csp";
import { allowedScriptHosts } from "../policy";
import type { Check } from "../types";
import { timeoutFor } from "../execute";
import { connectSrcOf, evaluatePage, pickLinks, pickOne, prevSiteSnapshot, siteOutcome, type Build, type Fetched, type PickInfo, type PrevSite } from "./site-core";
import { DB_MS, siteOrigin, withTimeout } from "./site-origin";

/**
 * Το site όπως το βλέπει ο επισκέπτης: GET των σελίδων από το ΔΗΜΟΣΙΟ URL (μέσω Cloudflare — ό,τι προσθέτει η άκρη,
 * π.χ. Zaraz, φαίνεται μόνο έτσι), με user agent browser Windows (τα δολώματα ClickFix στοχεύουν Windows και κρύβονται
 * από bots). full: /, /admin/login, μία κατηγορία, ένα προϊόν, /kalathi· light: /, /admin/login. Μόνο αναγνώσεις.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const FETCH_MS = 15_000;
const MAX_REDIRECTS = 5;
/** Αναμονή πριν τον δεύτερο έλεγχο σελίδας με άλλο build και αρχεία που λείπουν (σύντομο παράθυρο deploy). */
const RECHECK_MS = 20_000;

/** Τα αρχεία του build (.next/static) ως διαδρομές όπως τις αναφέρει το HTML («/_next/static/chunks/x.js») + BUILD_ID. */
async function loadBuild(): Promise<Build | null> {
  const cwd = process.cwd();
  for (const dir of [path.join(cwd, ".next"), path.join(cwd, ".next", "standalone", ".next")]) {
    const st = path.join(dir, "static");
    if (!(await stat(st).then((s) => s.isDirectory(), () => false))) continue;
    const entries = await readdir(st, { recursive: true, withFileTypes: true });
    const files = new Set(entries.filter((e) => e.isFile()).map((e) => `/_next/static/${path.relative(st, path.join(e.parentPath, e.name)).split(path.sep).join("/")}`));
    const id = await readFile(path.join(dir, "BUILD_ID"), "utf8").then((s) => s.trim() || null, () => null);
    return { id, files };
  }
  return null;
}

/** Τα ρυθμισμένα pixels (όπως τα βάζει το app/layout.tsx) → επιτρεπτοί script hosts· null αν οι ρυθμίσεις δεν διαβάστηκαν. */
async function analytics(): Promise<{ keys: string[]; hosts: string[] } | null> {
  try {
    const ids = cleanAnalyticsIds((await withTimeout(getSetting("analytics"), DB_MS, "Ρυθμίσεις")).data);
    const rest = Object.fromEntries(Object.entries(ids).filter((e): e is [string, string] => e[0] !== "consentMode" && typeof e[1] === "string"));
    return { keys: Object.keys(rest).sort(), hosts: allowedScriptHosts(rest).sort() };
  } catch { return null; }
}

/** Σύντομο μήνυμα σφάλματος για τη σύνοψη: χωρίς το code frame του Prisma και χωρίς διευθύνσεις (`host:port`) της βάσης. */
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  const line = m.split("\n").map((x) => x.trim()).find((x) => x && !/^Invalid `|invocation in$|^\d+\s|^→|^\//.test(x)) ?? m;
  return line.replace(/`[^`]*`/g, "…").slice(0, 120);
};
const headersOf = (h: Headers) => { const o: Record<string, string> = {}; h.forEach((v, k) => { o[k.toLowerCase()] = v; }); return o; };

/** GET μιας σελίδας: ανακατευθύνσεις μόνο μέσα στο ίδιο origin· 2 επαναλήψεις σε σφάλμα δικτύου / 5xx (όχι σε έλεγχο Cloudflare). */
async function fetchPage(origin: string, p: string, signal?: AbortSignal): Promise<Fetched> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) break;
    try {
      let url = new URL(p, origin);
      for (let hop = 0; ; hop++) {
        const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_MS)]) : AbortSignal.timeout(FETCH_MS);
        const res = await fetch(url, { redirect: "manual", cache: "no-store", signal: sig, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "el-GR,el;q=0.9,en;q=0.8" } });
        const headers = headersOf(res.headers);
        const loc = res.status >= 300 && res.status < 400 ? headers.location : undefined;
        if (loc) {
          await res.body?.cancel();
          const next = new URL(loc, url);
          if (next.origin !== new URL(origin).origin) return { path: p, status: res.status, headers, html: "", redirectTo: next.href };
          if (hop >= MAX_REDIRECTS) return { path: p, error: `πάνω από ${MAX_REDIRECTS} ανακατευθύνσεις` };
          url = next;
          continue;
        }
        const html = await res.text();
        if (res.status >= 500 && !headers["cf-mitigated"] && attempt < 2) { last = `HTTP ${res.status}`; break; }
        return { path: p, status: res.status, headers, html, finalPath: url.pathname + url.search };
      }
    } catch (e) { last = e instanceof Error ? (e.cause instanceof Error ? `${e.message} (${e.cause.message})` : e.message) : String(e); }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return { path: p, error: last || "ακύρωση (χρονικό όριο)" };
}

/**
 * Το στιγμιότυπο του προηγούμενου ελέγχου site (light ή full, έως 48 ώρες πίσω) — για το ruling J (deploy ή κάτι που
 * επιμένει). Βάση εκτός → "unavailable" (ο έλεγχος δεν βγάζει ok γι' αυτό, βλ. mismatchFinding).
 */
async function previousSite(now: Date): Promise<PrevSite> {
  try {
    const rows = await withTimeout(db.securityReport.findMany({ where: { startedAt: { gte: new Date(now.getTime() - 48 * 3_600_000), lt: now } }, orderBy: { startedAt: "desc" }, take: 60, select: { checks: true } }), DB_MS, "Βάση");
    for (const r of rows) { const s = prevSiteSnapshot(r.checks); if (s) return s; }
    return null;
  } catch { return "unavailable"; }
}

/** Μία τυχαία ενεργή κατηγορία (με προϊόντα) και ένα τυχαίο προϊόν της βιτρίνας, από τη βάση. */
async function pickFromDb(): Promise<{ category: string | null; product: string | null }> {
  type Cat = { slug: string; parent: Cat | null };
  const parent = { select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } } } } } } };
  const catWhere = { active: true, productCount: { gt: 0 } };
  const [nc, np] = await Promise.all([db.category.count({ where: catWhere }), db.product.count({ where: LISTED })]);
  const [cat, prod] = await Promise.all([
    nc ? db.category.findFirst({ where: catWhere, orderBy: { id: "asc" }, skip: Math.floor(Math.random() * nc), select: { slug: true, parent } }) : null,
    np ? db.product.findFirst({ where: LISTED, orderBy: { id: "asc" }, skip: Math.floor(Math.random() * np), select: { slug: true } }) : null,
  ]);
  const chain: string[] = [];
  for (let c = cat as unknown as Cat | null; c; c = c.parent ?? null) chain.unshift(c.slug);
  return { category: chain.length ? `/k/${chain.map(encodeURIComponent).join("/")}` : null, product: prod ? `/proion/${encodeURIComponent(prod.slug)}` : null };
}

export const siteCheck: Check = {
  key: "site",
  title: "Το site όπως το βλέπει ο επισκέπτης",
  modes: ["full", "light"],
  timeoutMs: { full: 150_000, light: 55_000 },
  async run({ mode, signal, now }) {
    const t0 = Date.now();
    const [{ origin, source, fallback }, build, an, previous] = await Promise.all([siteOrigin(), loadBuild(), analytics(), previousSite(now)]);
    const ctx = { origin, build, allowedScriptHosts: an?.hosts ?? [], expectedConnectSrc: connectSrcOf(buildCsp({ nonce: "x", dev: false })), previous };
    const fixed = mode === "full" ? ["/", "/admin/login", "/kalathi"] : ["/", "/admin/login"];
    const dbPick = mode === "full" ? withTimeout(pickFromDb(), DB_MS, "Βάση").then((r) => ({ r, err: null as string | null }), (e: unknown) => ({ r: null, err: errText(e) as string | null })) : null;
    const pages = await Promise.all(fixed.map((p) => fetchPage(origin, p, signal)));

    let pick: PickInfo | undefined;
    const missing: string[] = [];
    if (dbPick) {
      const { r, err } = await dbPick;
      let category = r?.category ?? null, product = r?.product ?? null;
      pick = { source: "db" };
      if (!category || !product) {
        // εφεδρεία: sitemap.xml, μετά σύνδεσμοι της αρχικής
        const why = err ? `η βάση δεν απάντησε: ${err}` : "η βάση δεν έδωσε ενεργή κατηγορία/προϊόν";
        const sm = await fetchPage(origin, "/sitemap.xml", signal);
        const fromSm = "html" in sm && sm.status === 200 ? pickLinks(sm.html, origin) : { categories: [], products: [] };
        const home = pages[0];
        const fromHome = "html" in home && home.status === 200 ? pickLinks(home.html, origin) : { categories: [], products: [] };
        const useSm = (!category ? fromSm.categories.length : 1) && (!product ? fromSm.products.length : 1);
        const src = useSm ? fromSm : fromHome;
        category ??= pickOne(src.categories);
        product ??= pickOne(src.products);
        pick = { source: useSm ? "sitemap" : category || product ? "home" : "none", note: `${why}${useSm ? "" : `; sitemap.xml: ${"html" in sm ? `HTTP ${sm.status}` : sm.error}`}` };
      }
      if (!category) missing.push("κατηγορίας");
      if (!product) missing.push("προϊόντος");
      pages.push(...(await Promise.all([category, product].filter((x): x is string => !!x).map((p) => fetchPage(origin, p, signal)))));
    }
    let results = pages.map((p) => evaluatePage(p, ctx));
    // άλλο build με αρχεία που λείπουν: ένας δεύτερος έλεγχος μετά από 20″ (σύντομο παράθυρο deploy)· αν δεν χωρά στο
    // χρονικό όριο του mode, κρίνεται χωρίς αυτόν (critical, με σημείωση)
    if (results.some((r) => r.recheck)) {
      const budget = timeoutFor(siteCheck, mode) - 5_000;
      if (Date.now() - t0 + RECHECK_MS + FETCH_MS * 1.5 < budget && !signal?.aborted) {
        await new Promise((r) => setTimeout(r, RECHECK_MS));
        results = await Promise.all(results.map(async (r, i) => (r.recheck ? evaluatePage(await fetchPage(origin, pages[i].path, signal), ctx, { confirmed: true, note: "δεύτερη λήψη μετά από 20″" }) : r)));
      } else {
        results = results.map((r, i) => (r.recheck ? evaluatePage(pages[i], ctx, { confirmed: true, note: "χωρίς δεύτερη λήψη — δεν έμενε χρόνος" }) : r));
      }
    }
    return siteOutcome({ mode, origin, originSource: source, originDefault: fallback, pages: results, build, analytics: an, pick, missing, now });
  },
};
