/**
 * Screenshots του wiki: φωτογραφίζει κάθε σελίδα της διαχείρισης σε υπολογιστή και κινητό (public/help/shots) και
 * ξανατρέχει το help:gen. Χρησιμοποιεί το Chrome του υπολογιστή (playwright-core, χωρίς δικό του browser) με ξεχωριστό
 * προφίλ (.help-profile, εκτός git). Την πρώτη φορά ανοίγει παράθυρο για να συνδεθείς ΕΣΥ· μετά τρέχει μόνο του.
 * Μόνο πλοήγηση — κανένα κλικ, καμία αλλαγή δεδομένων.
 *
 *   npm run help:shots                       όλες οι σελίδες
 *   npm run help:shots -- /admin/apostoles   μόνο αυτές (και δυναμικές του SAMPLE_FROM, π.χ. "/admin/cms/pages/[key]")
 *   HELP_BASE=http://localhost:3000 …        άλλη διεύθυνση (προεπιλογή http://localhost:3111)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import generated from "../lib/help/generated.json";
import { routeSlug, type Generated } from "../lib/help/types";

const BASE = process.env.HELP_BASE ?? "http://localhost:3111";
const PROFILE = join(process.cwd(), ".help-profile");
// εκτός public/: τα σερβίρει μόνο σε συνδεδεμένο προσωπικό το /api/help-shot/<αρχείο>
const OUT = join(process.cwd(), "help-shots");
const SKIP = new Set(["/admin/help", "/admin/forbidden"]);
/** σελίδες με προσωπικά δεδομένα πελατών/προσωπικού: ΠΟΤΕ σε εικόνα (GDPR) */
const PII = new Set(["/admin/softone/log", "/admin/customers", "/admin/customers/import", "/admin/gdpr", "/admin/staff", "/admin/staff/anafora", "/admin/audit", "/admin/newsletter", "/admin/softone/customers", "/admin/prosfores/anafores", "/admin/prosfores/kouponia", "/admin/reports/wishlist", "/admin/orders", "/admin/orders/pliromes", "/admin/asfaleia", "/admin/synergates", "/admin/synergates/endiaferon", "/admin/service", "/admin/eggyiseis", "/admin/apostoles/kentro", "/admin/apostoles/xartis"]);
/** σελίδες που δείχνουν περισσότερα με ανοιχτή μια εγγραφή (π.χ. Χαρακτηριστικά: ένας τύπος προϊόντος, όχι κενό δεξί μέρος) */
const SHOT_QUERY: Record<string, string> = { "/admin/catalog/specs": "?g=944", "/admin/cms/copy": "?g=checkout" };
/** Δυναμικές σελίδες (editors) φωτογραφίζονται με την πρώτη εγγραφή της λίστας τους: διαβάζεται ο σύνδεσμος, δεν πατιέται τίποτα. */
const SAMPLE_FROM: Record<string, string> = { "/admin/cms/brand-stores/[slug]": "/admin/cms/brand-stores", "/admin/cms/pages/[key]": "/admin/cms/pages", "/admin/prosfores/selides/[id]": "/admin/prosfores/selides" };
const only = process.argv.slice(2).filter((a) => a.startsWith("/admin"));
const routes = (generated as unknown as Generated).routes.filter((r) => (!r.dynamic || r.route in SAMPLE_FROM) && !SKIP.has(r.route) && !PII.has(r.route) && (!only.length || only.includes(r.route)));

const open = (headless: boolean) => chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless, viewport: { width: 1440, height: 900 } });

async function ensureLogin(): Promise<void> {
  let ctx: BrowserContext = await open(true);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!page.url().includes("/admin/login")) { await ctx.close(); return; }
  await ctx.close();
  console.log("→ Συνδέσου στο παράθυρο του Chrome που άνοιξε (μία φορά· η σύνδεση κρατιέται στο .help-profile).");
  ctx = await open(false);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 10 * 60_000 });
  await ctx.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await ensureLogin();
  const ctx = await open(true);
  const page = await ctx.newPage();
  // χωρίς το σήμα του dev server και χωρίς κινούμενα στοιχεία στις εικόνες
  await page.addInitScript(() => {
    const css = "[data-private]{filter:blur(7px)!important}nextjs-portal{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}";
    document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); });
  });
  let ok = 0;
  for (const r of routes) {
    const slug = routeSlug(r.route);
    try {
      let url = `${BASE}${r.route}${SHOT_QUERY[r.route] ?? ""}`;
      const list = SAMPLE_FROM[r.route];
      if (list) {
        await page.goto(`${BASE}${list}`, { waitUntil: "networkidle", timeout: 120_000 });
        const hrefs = await page.locator(`a[href^="${list}/"]`).evaluateAll((els) => els.map((a) => a.getAttribute("href") ?? ""));
        const first = hrefs.find((h) => h && !h.endsWith("/new"));
        if (!first) throw new Error("η λίστα δεν έχει εγγραφή για δείγμα");
        url = `${BASE}${first}`;
      }
      for (const [k, vp] of [["d", { width: 1440, height: 900 }], ["m", { width: 390, height: 844 }]] as const) {
        await page.setViewportSize(vp);
        await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
        if (page.url().includes("/admin/forbidden") || page.url().includes("/admin/login")) throw new Error("χωρίς πρόσβαση");
        await page.waitForTimeout(1200);
        await page.screenshot({ path: join(OUT, `${slug}-${k}.jpg`), type: "jpeg", quality: 72 });
      }
      ok++;
      console.log(`✓ ${r.route}`);
    } catch (e) { console.log(`· ${r.route}: ${e instanceof Error ? e.message.split("\n")[0] : e}`); }
  }
  await ctx.close();
  console.log(`${ok}/${routes.length} σελίδες · ανανέωση wiki…`);
  execFileSync("npx", ["tsx", "scripts/help-gen.ts"], { stdio: "inherit" });
}
void main().catch((e) => { console.error(e); process.exit(1); });
