import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Service } from "@/lib/data/types";
import { services as FIXTURE } from "@/lib/data/fixtures/services";

/**
 * Ο ένας κατάλογος υπηρεσιών του site (Εμπόριο → Υπηρεσίες): σελίδες /ypiresies, πρόσθετες υπηρεσίες σε προϊόν / καλάθι /
 * checkout, αρχική, hero, προσφορές, Ερμής. Από τη βάση, με τη σειρά του `no`· χωρίς εγγραφές (ή πριν το db push)
 * οι αρχικές του σχεδίου. 60″ στη μνήμη, ακυρώνεται σε κάθε αποθήκευση.
 */
export type AdminService = Service & { id: string | null; active: boolean; image?: string | null; usedInOrders?: number };
const ADDONS = new Set(["pdp", "checkout", "delivery"]);
const strs = (j: unknown) => (Array.isArray(j) ? j.map(String).map((x) => x.trim()).filter(Boolean) : []);
const faqOf = (j: unknown) => (Array.isArray(j) ? (j as { q?: unknown; a?: unknown }[]).map((x) => ({ q: String(x?.q ?? "").trim(), a: String(x?.a ?? "").trim() })).filter((x) => x.q && x.a) : []);

type Row = Prisma.ServiceGetPayload<{ include: { _count: { select: { orderLines: true } } } }>;
const fromRow = (r: Row, i: number): AdminService => ({
  id: r.id, no: String(i + 1).padStart(2, "0"), slug: r.slug, title: r.title, blurb: r.blurb, body: r.body ?? undefined,
  priceFrom: r.priceFrom != null ? Number(r.priceFrom) : undefined, steps: strs(r.steps), faq: faqOf(r.faq),
  addonAt: strs(r.addonAt).filter((x) => ADDONS.has(x)) as Service["addonAt"], image: r.image, active: r.active, usedInOrders: r._count.orderLines,
});
const fromFixture = (s: Service, i: number): AdminService => ({ ...s, no: String(i + 1).padStart(2, "0"), id: null, active: true, image: null });

let mem: { at: number; all: AdminService[]; fromDb: boolean } | null = null;
async function load(): Promise<{ all: AdminService[]; fromDb: boolean }> {
  if (mem && Date.now() - mem.at < 60_000) return mem;
  const rows = await db.service.findMany({ orderBy: [{ no: "asc" }, { title: "asc" }], include: { _count: { select: { orderLines: true } } } }).catch(() => null);
  const v = rows?.length ? { all: rows.map(fromRow), fromDb: true } : { all: FIXTURE.map(fromFixture), fromDb: false };
  mem = { at: Date.now(), ...v };
  return v;
}
export const invalidateServices = () => { mem = null; };

/** Οι ενεργές υπηρεσίες, με τη σειρά της διαχείρισης. */
export const getServiceList = cache(async (): Promise<Service[]> => (await load()).all.filter((s) => s.active));
export const getServiceBySlug = cache(async (slug: string): Promise<Service | null> => (await getServiceList()).find((s) => s.slug === slug) ?? null);
/** Για τη διαχείριση: όλες (και ανενεργές) και αν έρχονται ήδη από τη βάση. */
export async function getServicesForAdmin() { mem = null; return load(); }
export { FIXTURE as FIXTURE_SERVICES };
