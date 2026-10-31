import "server-only";
import { db } from "@/lib/db";
import { getBrowserRows } from "@/lib/softone/lookups";
import { parseSupplierRow, matchesQuery, dedupeSuppliers, type SupplierRow } from "@/lib/catalog/xml-import/suppliers-core";
import type { SupplierCard } from "@/lib/catalog/xml-import/ui-core";
import { countPendingApply } from "@/lib/catalog/xml-import/queue";
import { feedNext, normSchedule } from "@/lib/catalog/xml-import/schedule-core";

/**
 * Cache των προμηθευτών του SoftOne, ώστε ο οδηγός «XML προμηθευτές» να ανοίγει χωρίς να περιμένει το ERP.
 * ΜΟΝΟ ΑΝΑΓΝΩΣΕΙΣ από το SoftOne — καμία εγγραφή.
 *
 * Η λίστα έρχεται από τον browser του αντικειμένου `SUPPLIER` (664 εγγραφές): το `SOSOURCE` δεν είναι πεδίο του TRDR
 * εδώ, άρα `GetTable TRDR` με φίλτρο προμηθευτών δεν γίνεται. Τα πεδία τα καθαρίζει το `suppliers-core`.
 */

/** Στήλες του browser, με τη σειρά που τις περιμένει το `parseSupplierRow`. */
const COLS = ["ZOOMINFO", "SUPPLIER.CODE", "SUPPLIER.NAME", "SUPPLIER.AFM"];

export async function syncSuppliers(): Promise<{ added: number; updated: number; duplicates: number; unreadable: number }> {
  const rows = await getBrowserRows("SUPPLIER", COLS, "");
  const readable = rows.map(parseSupplierRow).filter((s): s is SupplierRow => !!s);
  const parsed = dedupeSuppliers(readable);
  // Δύο διαφορετικά πράγματα, και τα δύο αξίζει να φαίνονται: γραμμές που ο browser έδωσε δύο φορές (αναμενόμενο,
  // ~οι μισές) και γραμμές που δεν διαβάστηκαν καθόλου (θα έπρεπε να είναι 0 — αν δεν είναι, άλλαξε κάτι στο ERP).
  const unreadable = rows.length - readable.length;
  const duplicates = readable.length - parsed.length;

  const existing = await db.supplier.findMany({ select: { id: true, s1Trdr: true, code: true, name: true, afm: true } });
  const byTrdr = new Map(existing.map((e) => [e.s1Trdr, e]));
  const now = new Date();

  const fresh = parsed.filter((s) => !byTrdr.has(s.s1Trdr));
  if (fresh.length) await db.supplier.createMany({ data: fresh.map((s) => ({ ...s, lastSyncedAt: now })) });

  // Ενημέρωση μόνο όπου κάτι άλλαξε πραγματικά — ο πίνακας είναι σε απομακρυσμένη βάση.
  let updated = 0;
  for (const s of parsed) {
    const was = byTrdr.get(s.s1Trdr);
    if (!was || (was.code === s.code && was.name === s.name && was.afm === s.afm)) continue;
    await db.supplier.update({ where: { id: was.id }, data: { ...s, lastSyncedAt: now } });
    updated++;
  }
  return { added: fresh.length, updated, duplicates, unreadable };
}

export interface SupplierListItem {
  id: string;
  s1Trdr: number;
  code: string;
  name: string;
  afm: string | null;
  feed: { id: string; url: string; lastRunAt: Date | null; lastCount: number | null; active: boolean; mapped: boolean; schedule: unknown; minFetchMin: number; lastAutoAt: Date | null } | null;
}

/**
 * Οι προμηθευτές με το feed τους, για το βήμα ①. Η αναζήτηση γίνεται στη μνήμη (664 εγγραφές) και όχι σε SQL, ώστε το
 * «βαγιωνης» να βρίσκει το «ΒΑΓΙΩΝΗΣ» — η Postgres δεν αγνοεί τόνους χωρίς επέκταση.
 */
export async function listSuppliers(q = ""): Promise<SupplierListItem[]> {
  const all = await db.supplier.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, s1Trdr: true, code: true, name: true, afm: true,
      feeds: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, url: true, lastRunAt: true, lastCount: true, active: true, config: true, schedule: true, minFetchMin: true, lastAutoAt: true } },
    },
  });
  return all
    .filter((s) => matchesQuery(s, q))
    .map(({ feeds, ...s }) => {
      const f = feeds[0];
      // «mapped» = έχει περάσει η αντιστοίχιση· feed που σώθηκε από το βήμα ① έχει μόνο διεύθυνση.
      const mapped = !!f && ((f.config as { headers?: string[] } | null)?.headers ?? []).length > 0;
      return { ...s, feed: f ? { id: f.id, url: f.url, lastRunAt: f.lastRunAt, lastCount: f.lastCount, active: f.active, mapped, schedule: f.schedule, minFetchMin: f.minFetchMin, lastAutoAt: f.lastAutoAt } : null };
    });
}

/**
 * Οι κάρτες του βήματος ① όπως τις θέλει ο browser: πρώτα όσοι έχουν feed (είναι η συνηθισμένη επανάληψη), μετά
 * αλφαβητικά. Ζει εδώ και όχι στη σελίδα, γιατί τη θέλουν και η σελίδα και η αναζήτηση.
 */
export async function supplierCards(q = "", limit = 60): Promise<SupplierCard[]> {
  const list = await listSuppliers(q);
  const feedIds = list.map((s) => s.feed?.id).filter((v): v is string => !!v);
  const counts = feedIds.length
    ? await db.supplierFeedItem.groupBy({ by: ["feedId"], where: { feedId: { in: feedIds } }, _count: { _all: true } })
    : [];
  const byFeed = new Map(counts.map((c) => [c.feedId, c._count._all]));
  const pend = new Map(await Promise.all(feedIds.map(async (id) => [id, await countPendingApply(id)] as const)));
  const now = new Date();
  return list
    .map((s) => ({
      id: s.id, s1Trdr: s.s1Trdr, code: s.code, name: s.name, afm: s.afm,
      feed: s.feed
        ? (() => {
          const schedule = normSchedule(s.feed.schedule, s.feed.minFetchMin);
          return {
            id: s.feed.id, url: s.feed.url, lastRunAt: s.feed.lastRunAt?.toISOString() ?? null, lastCount: s.feed.lastCount, items: byFeed.get(s.feed.id) ?? 0, active: s.feed.active, mapped: s.feed.mapped,
            schedule, minFetchMin: s.feed.minFetchMin, lastAutoAt: s.feed.lastAutoAt?.toISOString() ?? null,
            nextAt: s.feed.active && s.feed.mapped ? feedNext(schedule, s.feed.lastAutoAt, now)?.toISOString() ?? null : null,
            pending: pend.get(s.feed.id) ?? 0,
          };
        })()
        : null,
    }))
    .sort((a, b) => Number(!a.feed) - Number(!b.feed) || a.name.localeCompare(b.name, "el"))
    .slice(0, limit);
}
