import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_HOURS, niceCity, regionFromZip, slugify } from "@/lib/stores/import";
import { resetStoresCache } from "@/lib/stores/repo";

/**
 * Καταστήματα eshop από υποκαταστήματα SoftOne που δεν έχουν ακόμη κατάστημα. Φτιάχνονται **κρυφά** (`active: false`)
 * και χωρίς σημείο στον χάρτη: η γεωκωδικοποίηση συμπληρώνει τις συντεταγμένες χωρίς να τα εμφανίζει· η εμφάνιση
 * είναι απόφαση της διαχείρισης (διακόπτης στη σελίδα του μέλους).
 */
export const creatableBranches = { storeId: null, s1Missing: false, OR: [{ matchedBy: null }, { matchedBy: { not: "manual" } }] } satisfies Prisma.PartnerBranchWhereInput;

async function uniqueSlug(base: string, fallback: string) {
  const root = slugify(base) || fallback;
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${root}-${i + 1}` : root;
    if (!(await db.store.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${root}-${Date.now()}`;
}

export async function createStoreFromBranch(branchId: string) {
  const b = await db.partnerBranch.findUnique({ where: { id: branchId }, include: { partner: { select: { id: true, name: true } } } });
  if (!b) throw new Error("Το υποκατάστημα δεν βρέθηκε");
  if (b.storeId) return { storeId: b.storeId, created: false };
  const city = b.city ? niceCity(b.city) : "";
  const zip = (b.zip ?? "").replace(/\s/g, "");
  const store = await db.store.create({
    data: {
      slug: await uniqueSlug(`${city} ${b.name}`, `store-${b.s1BranchId ?? b.id}`),
      name: b.name,
      member: b.partner.name,
      erpBranch: b.s1BranchId ? String(b.s1BranchId) : null,
      address: b.address ?? "",
      city,
      zip,
      region: regionFromZip(zip) ?? city,
      phone: b.phone,
      mobile: b.phone2,
      email: b.email,
      lat: 0,
      lng: 0,
      geocoded: "softone",
      hours: DEFAULT_HOURS,
      services: ["click-collect"],
      active: false,
      partnerId: b.partnerId,
    },
  });
  await db.partnerBranch.update({ where: { id: b.id }, data: { storeId: store.id, matchedBy: "created" } });
  resetStoresCache();
  return { storeId: store.id, created: true };
}

/** Όλα τα υποκαταστήματα χωρίς κατάστημα (εκτός από όσα αποσυνδέθηκαν επίτηδες) → κρυφά καταστήματα. */
export async function createMissingStores() {
  const rows = await db.partnerBranch.findMany({ where: creatableBranches, select: { id: true } });
  let created = 0;
  for (const r of rows) if ((await createStoreFromBranch(r.id)).created) created++;
  return { created };
}

/** Εμφάνιση/απόκρυψη στο eshop. Δεν εμφανίζεται κατάστημα χωρίς σημείο στον χάρτη. */
export async function setStoreVisible(storeId: string, visible: boolean) {
  const s = await db.store.findUnique({ where: { id: storeId }, select: { lat: true, lng: true, active: true } });
  if (!s) return { ok: false as const, error: "Το κατάστημα δεν βρέθηκε" };
  if (visible && s.lat === 0 && s.lng === 0) return { ok: false as const, error: "Το κατάστημα δεν έχει ακόμη σημείο στον χάρτη — τρέξε πρώτα τη γεωκωδικοποίηση ή όρισέ το από τη σελίδα του καταστήματος." };
  await db.store.update({ where: { id: storeId }, data: { active: visible } });
  resetStoresCache();
  return { ok: true as const, before: s.active };
}
