import "server-only";
import { db } from "@/lib/db";
import { resolveBrand, logoUrl, hasKey } from "./resolve";

/**
 * Μαζική αντιστοίχιση μαρκών → domain → σύνδεσμος λογοτύπου.
 *
 * Το Brandfetch επιτρέπει 200 αναζητήσεις ανά 5 λεπτά ανά IP, οπότε κάθε
 * πέρασμα παίρνει ένα κομμάτι με απόσταση ~1,6 s. Οι μάρκες που δεν
 * ταιριάζουν με βεβαιότητα μένουν κενές — καλύτερα κενό λογότυπο παρά λάθος.
 */
const GAP_MS = 1600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LogoRunResult { ok: boolean; scanned: number; matched: number; unmatched: number; remaining: number; error?: string; samples: { name: string; domain: string | null; score: number | null }[] }

export async function resolveBrandLogos(opts: { limit?: number; force?: boolean } = {}): Promise<LogoRunResult> {
  if (!hasKey()) return { ok: false, scanned: 0, matched: 0, unmatched: 0, remaining: 0, error: "Λείπει το LOGOS_API_KEY στο .env.", samples: [] };
  const limit = Math.min(180, Math.max(1, opts.limit ?? 150));
  const where = opts.force ? { active: true } : { active: true, domain: null, logoAt: null };
  const brands = await db.brand.findMany({ where, orderBy: [{ featured: "desc" }, { name: "asc" }], take: limit, select: { id: true, name: true } });
  let matched = 0, unmatched = 0;
  const samples: LogoRunResult["samples"] = [];
  for (const [i, b] of brands.entries()) {
    const r = await resolveBrand(b.name);
    if (r.error === "rate") {
      const remaining = await db.brand.count({ where });
      return { ok: false, scanned: i, matched, unmatched, remaining, error: "Όριο Brandfetch (200/5 λεπτά). Δοκίμασε ξανά σε λίγο.", samples };
    }
    if (r.best) {
      await db.brand.update({ where: { id: b.id }, data: { domain: r.best.domain, logoCdn: r.best.logoCdn, logoSource: "brandfetch", logoScore: r.best.score, domainSuggest: null, logoAt: new Date() } });
      matched++;
      if (samples.length < 8) samples.push({ name: b.name, domain: r.best.domain, score: r.best.score });
    } else {
      // Καμία ασφαλής αντιστοίχιση: κρατάμε την καλύτερη πρόταση για έγκριση
      // αντί να γράψουμε λάθος λογότυπο, και σημειώνουμε ότι ψάξαμε.
      const top = r.candidates[0];
      await db.brand.update({ where: { id: b.id }, data: { logoAt: new Date(), logoScore: top?.score ?? 0, domainSuggest: top && top.score >= 0.35 ? top.domain : null } });
      unmatched++;
      if (samples.length < 8) samples.push({ name: b.name, domain: null, score: top?.score ?? null });
    }
    if (i < brands.length - 1) await sleep(GAP_MS);
  }
  const remaining = await db.brand.count({ where: { active: true, domain: null, logoAt: null } });
  return { ok: true, scanned: brands.length, matched, unmatched, remaining, samples };
}

/** Χειροκίνητος ορισμός domain για μία μάρκα (ο διαχειριστής διόρθωσε την αντιστοίχιση). */
export async function setBrandDomain(id: string, domain: string) {
  const d = domain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  if (!d) return db.brand.update({ where: { id }, data: { domain: null, logoCdn: null, logoSource: null, logoScore: null } });
  return db.brand.update({ where: { id }, data: { domain: d, logoCdn: logoUrl(d), logoSource: "manual-domain", logoScore: 1, logoAt: new Date() } });
}

export async function logoStats() {
  const [total, withDomain, withUpload, searched, suggested] = await Promise.all([
    db.brand.count({ where: { active: true } }),
    db.brand.count({ where: { active: true, domain: { not: null } } }),
    db.brand.count({ where: { active: true, logo: { not: null } } }),
    db.brand.count({ where: { active: true, logoAt: { not: null } } }),
    db.brand.count({ where: { active: true, domain: null, domainSuggest: { not: null } } }),
  ]);
  return { total, withDomain, withUpload, searched, suggested, pending: total - searched };
}
