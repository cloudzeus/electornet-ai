import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { configForHeaders, type MappingConfig, type Target } from "@/lib/catalog/foreign-import/core";
import { loadFeed } from "@/lib/catalog/xml-import/feed";
import { classifyValues, unmapped, type ValueRow } from "@/lib/catalog/xml-import/values-core";

/**
 * Ποιες τιμές του προμηθευτή (κατηγορίες, μάρκες, μονάδες, σημάνσεις) έχουν αντιστοίχιση και ποιες όχι.
 *
 * Διαβάζονται από τα **αποθηκευμένα payload** των προϊόντων, όχι από το XML: έτσι η απάντηση είναι άμεση, δεν θέλει
 * λήψη, και αφορά ακριβώς ό,τι έχει φορτωθεί. Οι γραμμές που έπαψαν να υπάρχουν (`gone`) δεν μετρούν — η κατηγορία
 * τους δεν περιμένει απόφαση.
 */

export type MapKind = "category" | "brand" | "unit" | "mark";
export const MAP_KINDS: MapKind[] = ["category", "brand", "unit", "mark"];

export interface ColumnValues {
  kind: MapKind;
  /** η επικεφαλίδα του feed που κρατά αυτή την τιμή — null αν ο χρήστης δεν αντιστοίχισε καμία στήλη εδώ */
  header: string | null;
  rows: ValueRow[];
  pending: { values: number; items: number };
}

const mapOf = (cfg: MappingConfig, kind: MapKind): Record<string, string | null> =>
  (kind === "category" ? cfg.categoryMap : kind === "brand" ? cfg.brandMap : kind === "unit" ? cfg.unitMap : cfg.markMap) ?? {};

/** Η επικεφαλίδα της στήλης που κρατά αυτό το είδος τιμής (η πρώτη, αν κάποιος αντιστοίχισε δύο). */
function headerOf(config: MappingConfig, headers: string[], kind: MapKind): string | null {
  const hit = Object.entries(config.columns)
    .filter(([, t]) => (t as Target).kind === kind)
    .map(([i]) => Number(i))
    .sort((a, b) => a - b)[0];
  return hit === undefined ? null : headers[hit] ?? null;
}

/** Οι τιμές μιας στήλης με το πλήθος προϊόντων τους, από τα αποθηκευμένα payload. */
async function uses(feedId: string, header: string): Promise<{ value: string; items: number }[]> {
  const rows = await db.$queryRaw<{ v: string | null; n: number }[]>(Prisma.sql`
    SELECT btrim(payload ->> CAST(${header} AS text)) AS v, count(*)::int AS n
    FROM "SupplierFeedItem"
    WHERE "feedId" = ${feedId} AND "diff" <> 'gone'
    GROUP BY 1`);
  return rows.filter((r) => r.v).map((r) => ({ value: r.v as string, items: Number(r.n) }));
}

export async function feedValues(feedId: string, kinds: MapKind[] = MAP_KINDS): Promise<ColumnValues[]> {
  const feed = await loadFeed(feedId);
  const headers = feed.cfg.headers ?? [];
  const config = configForHeaders(feed.cfg.saved, headers);
  const out: ColumnValues[] = [];
  for (const kind of kinds) {
    const header = headerOf(config, headers, kind);
    const rows = header ? classifyValues(await uses(feedId, header), mapOf(config, kind)) : [];
    out.push({ kind, header, rows, pending: unmapped(rows) });
  }
  return out;
}

/** Μόνο ο αριθμός: πόσες τιμές και πόσα προϊόντα περιμένουν απόφαση — για το σήμα στη λίστα ελέγχου. */
export async function pendingValues(feedId: string): Promise<Record<MapKind, { values: number; items: number }>> {
  const all = await feedValues(feedId);
  return Object.fromEntries(all.map((c) => [c.kind, c.pending])) as Record<MapKind, { values: number; items: number }>;
}
