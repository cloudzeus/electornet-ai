/** Κατηγορίες της σελίδας /prosfores: μόνο όσες έχουν προσφορές, με πλήθος, σε δύο επίπεδα (π.χ. Λευκές Συσκευές → Ψυγεία). */

export interface CatLite { id: string; slug: string; name: string; depth: number; parentId: string | null }
export interface OfferCat { slug: string; name: string; count: number; children: { slug: string; name: string; count: number }[] }

/** Η αλυσίδα από τη ρίζα ως την κατηγορία του προϊόντος. */
function chain(id: string, byId: Map<string, CatLite>): CatLite[] {
  const out: CatLite[] = [];
  for (let n = byId.get(id); n; n = n.parentId ? byId.get(n.parentId) : undefined) out.unshift(n);
  return out;
}

/** Ρίζες (1ο επίπεδο) και τα παιδιά τους (2ο επίπεδο) με πλήθος προσφορών, πρώτα όσες έχουν τις περισσότερες. */
export function offerCategories(categoryIds: string[], byId: Map<string, CatLite>): OfferCat[] {
  const roots = new Map<string, OfferCat>();
  for (const id of categoryIds) {
    const [l1, l2] = chain(id, byId);
    if (!l1) continue;
    const r = roots.get(l1.slug) ?? { slug: l1.slug, name: l1.name, count: 0, children: [] };
    r.count++;
    if (l2) { const c = r.children.find((x) => x.slug === l2.slug); if (c) c.count++; else r.children.push({ slug: l2.slug, name: l2.name, count: 1 }); }
    roots.set(l1.slug, r);
  }
  const list = [...roots.values()].sort((a, b) => b.count - a.count);
  for (const r of list) r.children.sort((a, b) => b.count - a.count);
  return list;
}

/** Ανήκει η κατηγορία του προϊόντος (ή κάποια πρόγονός της) στο `slug`; */
export const inCategory = (categoryId: string, slug: string, byId: Map<string, CatLite>) => chain(categoryId, byId).some((n) => n.slug === slug);
