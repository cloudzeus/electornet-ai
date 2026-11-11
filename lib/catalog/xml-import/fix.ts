import "server-only";
import { db } from "@/lib/db";
import { configForHeaders, UserError } from "@/lib/catalog/foreign-import/core";
import { NO_WEB_CATEGORY, guessCategory } from "@/lib/catalog/foreign-import/plan-core";
import { groupedCategories, suggestProductCategories } from "@/lib/catalog/category-ai";
import { categoryOptions } from "@/lib/catalog/foreign-import/options";
import { mergeEdits } from "@/lib/catalog/xml-import/diff-core";
import { loadFeed } from "@/lib/catalog/xml-import/feed";

/**
 * Επίλυση σφαλμάτων από τη λίστα, χωρίς να γυρίσει ο χρήστης στα βήματα της αντιστοίχισης. Το συχνότερο: η κατηγορία
 * του προμηθευτή δείχνει σε δική μας κατηγορία χωρίς ομάδα χαρακτηριστικών, άρα το είδος δεν μπορεί να πάρει web
 * κατηγορία στο SoftOne. Η διόρθωση αλλάζει την αντιστοίχιση **της τιμής του προμηθευτή** (ισχύει για όλα τα προϊόντα
 * με αυτή την τιμή, και για τα επόμενα τρεξίματα) και ξαναβάζει στην ουρά όσα είχαν κολλήσει εκεί.
 */
async function categoryHeader(feedId: string) {
  const feed = await loadFeed(feedId);
  const headers = feed.cfg.headers ?? [];
  const cols = Object.entries(configForHeaders(feed.cfg.saved, headers).columns);
  const hit = cols.find(([, t]) => t.kind === "category"), name = cols.find(([, t]) => t.kind === "field" && t.key === "name");
  if (!hit) throw new UserError("Το feed δεν έχει στήλη κατηγορίας — όρισέ την στην «Αλλαγή αντιστοίχισης».");
  return { feed, header: headers[Number(hit[0])], nameHeader: name ? headers[Number(name[0])] : "" };
}

/** Οι γραμμές με σφάλμα κατηγορίας, μαζί με την τιμή κατηγορίας του προμηθευτή που έχει η καθεμία. */
async function stuck(feedId: string, header: string, nameHeader = "") {
  const rows = await db.supplierFeedItem.findMany({ where: { feedId, status: "error", error: { contains: NO_WEB_CATEGORY } }, select: { id: true, sku: true, payload: true, edits: true } });
  return rows.map((r) => {
    const m = mergeEdits((r.payload ?? {}) as Record<string, string>, (r.edits ?? null) as Record<string, string> | null).merged;
    return { id: r.id, sku: r.sku, value: (m[header] ?? "").trim(), name: nameHeader ? m[nameHeader] ?? "" : "" };
  });
}

export async function categoryFixInfo(feedId: string, sku: string): Promise<{ value: string; same: number; /** πρόταση από τα ονόματα των προϊόντων — ο χρήστης την αλλάζει αν δεν ταιριάζει */ suggested: string | null; options: { id: string; name: string }[] }> {
  const { feed, header, nameHeader } = await categoryHeader(feedId);
  const rows = await stuck(feedId, header, nameHeader);
  const me = rows.find((r) => r.sku === sku);
  if (!me) throw new UserError("Το προϊόν δεν έχει πια αυτό το σφάλμα — ανανέωσε τη λίστα.");
  if (!me.value) throw new UserError("Το προϊόν δεν έχει κατηγορία στο feed — άνοιξέ το και συμπλήρωσέ την.");
  const same = rows.filter((r) => r.value === me.value);
  const [options, paths] = await Promise.all([groupedCategories(), categoryOptions()]);
  const now = feed.cfg.saved.categoryMap?.[me.value];
  const suggested = guessCategory(same.map((r) => r.name), options, (now && paths.find((p) => p.id === now)?.path) || "");
  return { value: me.value, same: same.length, suggested, options: options.map((o) => ({ id: o.id, name: o.path })) };
}

export async function fixCategory(feedId: string, value: string, categoryId: string): Promise<{ queued: number }> {
  const { feed, header } = await categoryHeader(feedId);
  if (!(await groupedCategories()).some((o) => o.id === categoryId)) throw new UserError("Αυτή η κατηγορία δεν έχει ομάδα χαρακτηριστικών — διάλεξε άλλη.");
  const raw = await db.supplierFeed.findUniqueOrThrow({ where: { id: feedId }, select: { config: true } });
  const config = (raw.config ?? {}) as { saved?: { categoryMap?: Record<string, string | null> } };
  await db.supplierFeed.update({ where: { id: feedId }, data: { config: { ...config, saved: { ...feed.cfg.saved, ...config.saved, categoryMap: { ...config.saved?.categoryMap, [value]: categoryId } } } as object } });
  const ids = (await stuck(feedId, header)).filter((r) => r.value === value).map((r) => r.id);
  const r = await db.supplierFeedItem.updateMany({ where: { id: { in: ids }, status: "error" }, data: { status: "queued", error: null } });
  return { queued: r.count };
}

/** «Πρότεινε με AI» για μία γραμμή: το AI διαβάζει το όνομα και την κατηγορία του προμηθευτή και διαλέγει από τις ίδιες επιλογές. */
export async function categoryFixAi(feedId: string, sku: string): Promise<{ categoryId: string | null; sure: boolean }> {
  const { header, nameHeader } = await categoryHeader(feedId);
  const me = (await stuck(feedId, header, nameHeader)).find((r) => r.sku === sku);
  if (!me) throw new UserError("Το προϊόν δεν έχει πια αυτό το σφάλμα — ανανέωσε τη λίστα.");
  if (!me.name.trim()) throw new UserError("Το προϊόν δεν έχει όνομα για να προταθεί κατηγορία — διάλεξέ τη με το χέρι.");
  const g = (await suggestProductCategories([{ key: sku, name: me.name, extra: me.value ? `Κατηγορία προμηθευτή: ${me.value}` : undefined }])).guesses[0];
  return { categoryId: g?.categoryId ?? null, sure: !!g?.sure };
}
