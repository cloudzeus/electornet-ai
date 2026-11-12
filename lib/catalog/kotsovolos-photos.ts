import "server-only";
import { db } from "@/lib/db";
import { cachedSitemap, fetchProductImages } from "@/lib/competitors/kotsovolos/client";
import { brandPool, kotHref, matchByModel, matchVariant, modelTokens, slugIndex } from "@/lib/competitors/kotsovolos/core";
import type { EnrichResult } from "./enrich";

/**
 * Φωτογραφίες από τον Κωτσόβολο για «Φωτογραφίες από το web»: το είδος τους από το ζευγάρι της σύγκρισης τιμών
 * (ίδιο προϊόν, όχι «άλλο χρώμα»), αλλιώς με τον κωδικό μοντέλου στο sitemap. Μόνο προτάσεις — διαλέγει ο χρήστης.
 */
export async function enrichFromKotsovolos(productId: string): Promise<EnrichResult> {
  const none = (error: string): EnrichResult => ({ source: "kotsovolos", status: "none", specs: [], costUsd: 0, error });
  const p = await db.product.findUnique({ where: { id: productId }, select: {
    title: true, modelCode: true, brandId: true, brand: { select: { name: true } },
    competitorPrices: { where: { competitor: "kotsovolos" }, select: { match: true, extId: true, extUrl: true } },
  } });
  if (!p) return none("άγνωστο προϊόν");
  const pair = p.competitorPrices.find((c) => c.extId && ["auto", "manual", "suggested"].includes(c.match));
  let art = pair?.extId ?? null, url = pair?.extUrl ?? null, how = pair ? (pair.match === "suggested" ? "πρόταση ζευγαριού" : "ζευγάρι σύγκρισης τιμών") : "";
  if (!art) {
    const bm = await db.competitorBrandMap.findFirst({ where: { competitor: "kotsovolos", brandId: p.brandId }, select: { alias: true, notCarried: true } });
    if (bm?.notCarried) return none(`ο Κωτσόβολος δεν φέρνει ${p.brand.name}`);
    const pool = brandPool(slugIndex(await cachedSitemap()), p.brand.name, bm?.alias);
    if (!pool.length) return none(`ο Κωτσόβολος δεν έχει προϊόντα ${p.brand.name}`);
    for (const m of [...new Set([p.modelCode, ...modelTokens(p.title)].filter(Boolean))]) {
      const r = matchByModel({ brand: p.brand.name, alias: bm?.alias, model: m }, pool);
      if (r.kind === "matched" || r.kind === "suggested") { art = r.item.art; url = `${r.item.path}/${r.item.last}`; how = r.kind === "matched" ? "ίδιος κωδικός μοντέλου" : r.reason; break; }
    }
    // χωρίς το ίδιο μοντέλο: η αδελφή έκδοση (άλλο χρώμα / φινίρισμα, π.χ. LFR73944FQG ↔ lfr73944fug) — μόνο ως πρόταση
    const vp = p.competitorPrices.find((c) => c.extId && c.match === "variant");
    if (!art && vp) { art = vp.extId; url = vp.extUrl; how = "άλλη έκδοση"; }
    if (!art) for (const m of [...new Set([p.modelCode, ...modelTokens(p.title)].filter(Boolean))]) {
      const v = matchVariant({ brand: p.brand.name, alias: bm?.alias, model: m }, pool);
      if (v) { art = v.art; url = `${v.path}/${v.last}`; how = "άλλη έκδοση"; break; }
    }
    if (!art) return none(`δεν βρέθηκε ${p.modelCode ?? "το μοντέλο"} στον Κωτσόβολο`);
  }
  const r = await fetchProductImages(art);
  if ("error" in r) return { source: "kotsovolos", status: "failed", specs: [], costUsd: 0, error: `Κωτσόβολος: ${r.error}` };
  if (!r.images.length) return none("το είδος του Κωτσόβολου δεν έχει φωτογραφίες");
  return { source: "kotsovolos", status: "found", url: kotHref(url) ?? undefined, sourceName: (how === "άλλη έκδοση" ? `kotsovolos.gr · άλλη έκδοση: ${r.title || art}` : `kotsovolos.gr · ${how}`).slice(0, 120), specs: [], images: r.images.slice(0, 12), costUsd: 0 };
}
