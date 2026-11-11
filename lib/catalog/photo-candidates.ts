import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { isProductImageUrl, blockedHost } from "./enrich-core";
import { checkImage, nonPhotoName, plainPixel, sourceRank, type PhotoProbe } from "./photo-fill-core";
import { suggestFromResult } from "./enrich-suggestions";
import { LOW_RES_PX } from "./product-images";

/**
 * Υποψήφιες φωτογραφίες ενός προϊόντος από το web — κοινό για το μαζικό `scripts/fill-photos.ts` και το παράθυρο
 * «Φωτογραφίες από το web» της λίστας προϊόντων (εκεί διαλέγει ο χρήστης).
 */
const MAX_IMAGE = 25 * 1024 * 1024;

/** Κατέβασμα για έλεγχο: μέγεθος αρχείου, τύπος και πραγματικές διαστάσεις. Καμία αποθήκευση. */
export async function probeImage(url: string): Promise<{ probe: PhotoProbe | null; error?: string }> {
  try {
    const f = await fetchPublicBytes(url, { max: MAX_IMAGE, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" });
    const meta = await sharp(f.bytes).metadata().catch(() => null);
    return { probe: { bytes: f.bytes.length, width: meta?.width ?? null, height: meta?.height ?? null, mime: f.mime, plainEdge: await plainEdge(f.bytes) } };
  } catch (e) { return { probe: null, error: (e as Error).message.slice(0, 160) }; }
}

/** Μερίδιο της περιμέτρου (εικόνα 48×48) με λευκό / ανοιχτό γκρι / διάφανο φόντο. */
async function plainEdge(bytes: Buffer): Promise<number | null> {
  try {
    const N = 48;
    const { data } = await sharp(bytes).resize(N, N, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let plain = 0, all = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (x > 1 && x < N - 2 && y > 1 && y < N - 2) continue; // μόνο λωρίδα 2 pixel γύρω γύρω
      const i = (y * N + x) * 4; all++;
      if (plainPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) plain++;
    }
    return plain / all;
  } catch { return null; }
}

/**
 * Σελίδες κατασκευαστή / καταστήματος που βρέθηκαν ήδη: ξαναδιαβάζονται δωρεάν (χωρίς νέα αναζήτηση) για φωτογραφίες
 * που δεν είχαν βγει την πρώτη φορά (π.χ. πριν διαβάζονται τα <img> με το μοντέλο στο όνομα). Επιστρέφει νέες προτάσεις.
 */
export async function revisitFoundPages(productId: string, sources: string[] = ["web", "shop"]) {
  const found = await db.productEnrichment.findMany({ where: { productId, status: "found", source: { in: sources }, url: { not: null } }, select: { source: true, url: true, sourceName: true } });
  let added = 0;
  for (const e of found) {
    const r = await suggestFromResult(productId, { source: e.source as "web", status: "found", url: e.url!, pageUrl: e.url!, sourceName: e.sourceName ?? undefined, specs: [], images: [], costUsd: 0 }).catch(() => null);
    added += r?.added ?? 0;
  }
  return added;
}

export interface PhotoCandidateDTO { id: string; url: string; source: string; sourceName: string | null; pageUrl: string | null; width: number | null; height: number | null; kb: number | null; /** γιατί ΔΕΝ προεπιλέγεται (σχέδιο, μικρή, δεν κατέβηκε…) — ο χρήστης μπορεί να τη διαλέξει παρ' όλα αυτά */ note: string | null; ok: boolean }

/** Οι προτάσεις εικόνων σε αναμονή, ελεγμένες (διαστάσεις, όνομα αρχείου), με τη σειρά πηγής: κατασκευαστής πρώτα. */
export async function photoCandidates(productId: string, max = 24): Promise<PhotoCandidateDTO[]> {
  const rows = await db.enrichSuggestion.findMany({ where: { productId, status: "pending", kind: "image", url: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, source: true, url: true, sourceName: true, pageUrl: true } });
  const usable = rows.filter((r) => isProductImageUrl(r.url!) && !blockedHost(r.url!)).sort((a, b) => sourceRank(a.source) - sourceRank(b.source)).slice(0, max);
  const out = await Promise.all(usable.map(async (r) => {
    const p = await probeImage(r.url!);
    const note = nonPhotoName(r.url!) ?? (p.probe ? checkImage(p.probe) : p.error ?? "δεν κατέβηκε");
    return { id: r.id, url: r.url!, source: r.source, sourceName: r.sourceName, pageUrl: r.pageUrl, width: p.probe?.width ?? null, height: p.probe?.height ?? null, kb: p.probe ? Math.round(p.probe.bytes / 1024) : null, note, ok: !note };
  }));
  // οι ελεγμένες πρώτες (σταθερή ταξινόμηση: μέσα σε κάθε ομάδα μένει η σειρά πηγής)
  return out.sort((a, b) => Number(b.ok) - Number(a.ok));
}

/** Κρύβει (δεν σβήνει) τις ορατές μικρές φωτογραφίες — μεγάλη πλευρά < LOW_RES_PX — όταν μπήκαν καλύτερες. */
export async function hideSmallPhotos(productId: string) {
  const r = await db.media.updateMany({ where: { productId, kind: "image", hidden: false, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } }, data: { hidden: true } });
  return r.count;
}
