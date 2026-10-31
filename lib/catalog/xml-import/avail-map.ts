import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { configForHeaders, guessAvail, UserError, type Target } from "@/lib/catalog/foreign-import/core";
import { loadFeed } from "@/lib/catalog/xml-import/feed";
import { mergeEdits } from "@/lib/catalog/xml-import/diff-core";
import { isAvailState, type AvailState } from "@/lib/catalog/availability-core";
import { projectAvailability } from "@/lib/catalog/availability";
import { projectPublishReady } from "@/lib/catalog/publish-ready-server";

/**
 * Διαθεσιμότητα του προμηθευτή: οι τιμές της στήλης «Διαθεσιμότητα» του XML («Διαθέσιμο», «Μη Διαθέσιμο», «Μικρό Απόθεμα»…)
 * → κατάσταση (`AvailState`). Αποθηκεύεται στο `Product.supplierAvail` — **όχι** στο SoftOne — και είναι συνθήκη στους
 * κανόνες διαθεσιμότητας (/admin/catalog/availability), όπου ορίζεται η φράση και αν δημοσιεύεται.
 */
export interface AvailValue { value: string; items: number; state: AvailState | null; guessed: boolean }

function availHeader(feed: Awaited<ReturnType<typeof loadFeed>>): string | null {
  const headers = feed.cfg.headers ?? [];
  const config = configForHeaders(feed.cfg.saved, headers);
  const i = Object.entries(config.columns).find(([, t]) => (t as Target).kind === "availability")?.[0];
  return i === undefined ? null : headers[Number(i)] ?? null;
}

export async function availValues(feedId: string): Promise<{ header: string | null; values: AvailValue[] }> {
  const feed = await loadFeed(feedId);
  const header = availHeader(feed);
  if (!header) return { header: null, values: [] };
  const map = feed.cfg.saved.availMap ?? {};
  const rows = await db.$queryRaw<{ v: string | null; n: number }[]>(Prisma.sql`
    SELECT btrim(payload ->> CAST(${header} AS text)) AS v, count(*)::int AS n
    FROM "SupplierFeedItem" WHERE "feedId" = ${feedId} AND "diff" <> 'gone' GROUP BY 1 ORDER BY 2 DESC LIMIT 60`);
  return {
    header,
    values: rows.filter((r) => r.v).map((r) => {
      const v = r.v as string;
      const own = Object.hasOwn(map, v);
      const s = own ? map[v] : guessAvail(v);
      return { value: v, items: Number(r.n), state: isAvailState(s) ? s : null, guessed: !own };
    }),
  };
}

/** Αποθήκευση του χάρτη και άμεση ενημέρωση των συνδεδεμένων προϊόντων (χωρίς SoftOne). */
export async function saveAvailMap(feedId: string, raw: Record<string, unknown>): Promise<{ products: number }> {
  const feed = await loadFeed(feedId);
  const header = availHeader(feed);
  if (!header) throw new UserError("Το feed δεν έχει στήλη «Διαθεσιμότητα προμηθευτή» — όρισέ την στην αντιστοίχιση στηλών.");
  const map: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(raw ?? {}).slice(0, 200)) map[String(k).slice(0, 200)] = isAvailState(v) ? v : null;
  const stored = await db.supplierFeed.findUniqueOrThrow({ where: { id: feed.id }, select: { config: true } });
  const cfg = (stored.config ?? {}) as { saved?: Record<string, unknown> };
  await db.supplierFeed.update({ where: { id: feed.id }, data: { config: { ...cfg, saved: { ...(cfg.saved ?? {}), availMap: map } } as object } });

  const items = await db.supplierFeedItem.findMany({ where: { feedId, productId: { not: null }, status: { not: "skipped" } }, select: { productId: true, payload: true, edits: true } });
  const byState = new Map<string | null, string[]>();
  for (const it of items) {
    const { merged } = mergeEdits((it.payload ?? {}) as Record<string, string>, (it.edits ?? null) as Record<string, string> | null);
    const v = (merged[header] ?? "").trim();
    const s = v ? (Object.hasOwn(map, v) ? map[v] : guessAvail(v)) : null;
    const k = s ?? null;
    byState.set(k, [...(byState.get(k) ?? []), it.productId as string]);
  }
  for (const [s, ids] of byState) await db.product.updateMany({ where: { id: { in: ids } }, data: { supplierAvail: s } });
  const ids = items.map((i) => i.productId as string);
  if (ids.length) { await projectAvailability(ids); await projectPublishReady(ids); }
  return { products: ids.length };
}
