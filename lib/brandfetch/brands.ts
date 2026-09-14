import "server-only";
import { db } from "@/lib/db";
import { resolveBrand, logoUrl, hasKey } from "./resolve";
import { fetchLogoBytes } from "./download";
import { ingest } from "@/lib/media/repo";

/**
 * Λογότυπα μαρκών: αναζήτηση στο Brandfetch → **έγκριση διαχειριστή** → δικό
 * μας αρχείο στο Bunny CDN.
 *
 * Κανένα λογότυπο δεν μπαίνει αυτόματα. Η αναζήτηση είναι ασαφής («AEG»
 * γυρίζει πρώτο το «Aegon»), οπότε κάθε εύρεση μένει σε κατάσταση `pending`
 * με τον σύνδεσμο προεπισκόπησης· ο διαχειριστής βλέπει την εικόνα και
 * αποφασίζει. Με την έγκριση κατεβάζουμε το αρχείο και το ανεβάζουμε στη
 * βιβλιοθήκη πολυμέσων (Bunny), ώστε το κατάστημα να μην κρέμεται από ξένο
 * CDN. Όριο Brandfetch: 200 αναζητήσεις ανά 5 λεπτά ανά IP — κάθε πέρασμα
 * παίρνει ένα κομμάτι με απόσταση ~1,6 s.
 */
const GAP_MS = 1600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FOLDER = "Λογότυπα μαρκών";

export interface LogoRunResult { ok: boolean; scanned: number; matched: number; unmatched: number; remaining: number; error?: string; samples: { name: string; domain: string | null; score: number | null }[] }

/** Το λογότυπο που δείχνουμε: δικό μας αρχείο, αλλιώς εγκεκριμένος σύνδεσμος. */
export const brandLogoSrc = (b: { logo?: string | null; logoCdn?: string | null; logoStatus?: string | null }) =>
  b.logo ?? (b.logoStatus === "approved" ? b.logoCdn ?? null : null);

/**
 * Μαζική αναζήτηση: γεμίζει την ουρά εγκρίσεων, δεν γράφει λογότυπα.
 * Οι μάρκες που δεν βρίσκονται καθόλου σημειώνονται ως ελεγμένες ώστε το
 * επόμενο πέρασμα να συνεχίσει από εκεί που σταμάτησε.
 */
export async function resolveBrandLogos(opts: { limit?: number; force?: boolean } = {}): Promise<LogoRunResult> {
  if (!hasKey()) return { ok: false, scanned: 0, matched: 0, unmatched: 0, remaining: 0, error: "Λείπει το LOGOS_API_KEY στο .env.", samples: [] };
  const limit = Math.min(180, Math.max(1, opts.limit ?? 150));
  const where = opts.force ? { active: true, logo: null } : { active: true, logo: null, logoStatus: null, logoAt: null };
  const brands = await db.brand.findMany({ where, orderBy: [{ featured: "desc" }, { name: "asc" }], take: limit, select: { id: true, name: true } });
  let matched = 0, unmatched = 0;
  const samples: LogoRunResult["samples"] = [];
  for (const [i, b] of brands.entries()) {
    const r = await resolveBrand(b.name);
    if (r.error === "rate") {
      const remaining = await db.brand.count({ where });
      return { ok: false, scanned: i, matched, unmatched, remaining, error: "Όριο Brandfetch (200/5 λεπτά). Δοκίμασε ξανά σε λίγο.", samples };
    }
    // Και η «σίγουρη» εύρεση περιμένει έγκριση — απλώς με υψηλότερη βαθμολογία.
    const hit = r.best ?? (r.candidates[0] && r.candidates[0].score >= 0.35 ? { domain: r.candidates[0].domain, score: r.candidates[0].score } : null);
    if (hit) {
      await db.brand.update({ where: { id: b.id }, data: { domainSuggest: hit.domain, logoCdn: logoUrl(hit.domain), logoScore: hit.score, logoStatus: "pending", logoAt: new Date() } });
      matched++;
      if (samples.length < 8) samples.push({ name: b.name, domain: hit.domain, score: hit.score });
    } else {
      await db.brand.update({ where: { id: b.id }, data: { logoAt: new Date(), logoScore: r.candidates[0]?.score ?? 0, domainSuggest: null, logoStatus: "none" } });
      unmatched++;
      if (samples.length < 8) samples.push({ name: b.name, domain: null, score: r.candidates[0]?.score ?? null });
    }
    if (i < brands.length - 1) await sleep(GAP_MS);
  }
  const remaining = await db.brand.count({ where: { active: true, logo: null, logoStatus: null, logoAt: null } });
  return { ok: true, scanned: brands.length, matched, unmatched, remaining, samples };
}

async function logoFolderId() {
  const f = await db.mediaFolder.findFirst({ where: { name: FOLDER, parentId: null }, select: { id: true } });
  return f?.id ?? (await db.mediaFolder.create({ data: { name: FOLDER } })).id;
}

const fileSlug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "brand";

/**
 * Έγκριση: κατεβάζουμε το λογότυπο και το ανεβάζουμε στο δικό μας CDN.
 * Αν η λήψη αποτύχει, κρατάμε τον σύνδεσμο ως εγκεκριμένο ώστε να φαίνεται
 * κάτι — η μάρκα δεν ξαναμπαίνει στην ουρά.
 */
export async function approveBrandLogo(id: string, staffId?: string): Promise<{ ok: boolean; saved: boolean; url?: string; error?: string }> {
  const b = await db.brand.findUnique({ where: { id }, select: { id: true, name: true, slug: true, domain: true, domainSuggest: true, logoCdn: true } });
  if (!b) return { ok: false, saved: false, error: "Η μάρκα δεν βρέθηκε." };
  const domain = b.domainSuggest ?? b.domain;
  if (!domain) return { ok: false, saved: false, error: "Δεν υπάρχει domain για λήψη." };
  const file = await fetchLogoBytes(domain);
  if (!file) {
    await db.brand.update({ where: { id }, data: { domain, domainSuggest: null, logoCdn: logoUrl(domain), logoSource: "brandfetch", logoStatus: "approved", logoAt: new Date() } });
    return { ok: true, saved: false, error: "Το αρχείο δεν κατέβηκε — μένει ο σύνδεσμος." };
  }
  try {
    const asset = await ingest({ bytes: file.bytes, filename: `${fileSlug(b.slug || b.name)}.${file.ext}`, mime: file.mime, folderId: await logoFolderId(), createdBy: staffId ?? null, keepFormat: true, title: `Λογότυπο ${b.name}` });
    await db.brand.update({ where: { id }, data: { logo: asset.url, domain, domainSuggest: null, logoCdn: logoUrl(domain), logoSource: "brandfetch-saved", logoStatus: "approved", logoAt: new Date() } });
    return { ok: true, saved: true, url: asset.url };
  } catch (e) {
    // Χαλασμένο ή ασυνήθιστο αρχείο: η έγκριση δεν χάνεται, μένει ο σύνδεσμος.
    await db.brand.update({ where: { id }, data: { domain, domainSuggest: null, logoCdn: logoUrl(domain), logoSource: "brandfetch", logoStatus: "approved", logoAt: new Date() } });
    return { ok: true, saved: false, error: `Το αρχείο δεν αποθηκεύτηκε (${(e as Error).message.slice(0, 80)}) — μένει ο σύνδεσμος.` };
  }
}

/** Απόρριψη: η μάρκα μένει χωρίς λογότυπο και δεν ξαναπροτείνεται. */
export async function rejectBrandLogo(id: string) {
  return db.brand.update({ where: { id }, data: { domainSuggest: null, logoCdn: null, logoScore: null, logoStatus: "rejected", logoAt: new Date() } });
}

/** Επιστροφή στην ουρά ελέγχου (ο διαχειριστής άλλαξε γνώμη). */
export async function resetBrandLogo(id: string) {
  return db.brand.update({ where: { id }, data: { domainSuggest: null, logoCdn: null, logoScore: null, logoStatus: null, logoAt: null } });
}

/**
 * Χειροκίνητος ορισμός domain: είναι από μόνος του επιβεβαίωση του
 * διαχειριστή, οπότε κατεβάζουμε αμέσως το αρχείο στο δικό μας CDN.
 */
export async function setBrandDomain(id: string, domain: string, staffId?: string) {
  const d = domain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  if (!d) return db.brand.update({ where: { id }, data: { domain: null, logoCdn: null, logoSource: null, logoScore: null, logoStatus: null, domainSuggest: null } });
  await db.brand.update({ where: { id }, data: { domain: d, domainSuggest: d, logoCdn: logoUrl(d), logoSource: "manual-domain", logoScore: 1, logoStatus: "pending", logoAt: new Date() } });
  await approveBrandLogo(id, staffId);
  return db.brand.findUnique({ where: { id } });
}

export async function logoStats() {
  const [total, approved, withUpload, pending, rejected, searched] = await Promise.all([
    db.brand.count({ where: { active: true } }),
    db.brand.count({ where: { active: true, logoStatus: "approved" } }),
    db.brand.count({ where: { active: true, logo: { not: null } } }),
    db.brand.count({ where: { active: true, logoStatus: "pending" } }),
    db.brand.count({ where: { active: true, logoStatus: "rejected" } }),
    db.brand.count({ where: { active: true, logoAt: { not: null } } }),
  ]);
  return { total, approved, withUpload, pending, rejected, searched, unsearched: total - searched };
}
