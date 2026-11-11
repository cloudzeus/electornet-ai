import "server-only";
import { db } from "@/lib/db";
import { resetSettingsCache } from "@/lib/settings/store";
import type { JobResult } from "@/lib/scheduler/jobs";
import { fetchProduct, fetchSitemap } from "./kotsovolos/client";
import { createPacer, KotStopError, type Pacer } from "./kotsovolos/pacer";
import { isBundle, matchByModel, matchPhone, sameEan, type KotItem } from "./kotsovolos/core";
import { readCosts } from "./cost";
import { decideGone, decidePrice, isGoneError, ourPrice, type Decision, type Prev } from "./run-core";

export { ourPrice };
const COMP = "kotsovolos";
const SECTION = "competitors.kotsovolos"; // { paused, brakedNights } — γράφεται απευθείας, όπως οι άλλες ενότητες εκτός φόρμας
const FRESH_MS = 20 * 3600_000;

const readState = async () => ((await db.setting.findUnique({ where: { section: SECTION } }))?.data ?? {}) as { paused?: boolean; brakedNights?: number };
async function writeState(data: { paused?: boolean; brakedNights: number }) {
  await db.setting.upsert({ where: { section: SECTION }, update: { data }, create: { section: SECTION, data } });
  resetSettingsCache();
}

type Search = { items: KotItem[]; base: "auto" | "suggested"; note: string | null };
function search(brand: string, alias: string | null, model: string | null, title: string, extPath: string, pool: KotItem[]): Search | null {
  const m = matchByModel({ brand, alias, model }, pool);
  if (m.kind === "matched") return { items: [m.item], base: "auto", note: null };
  if (m.kind === "suggested") return { items: [m.item], base: "suggested", note: m.reason };
  if (m.kind === "ambiguous") return { items: m.items.slice(0, 3), base: "suggested", note: `πολλά υποψήφια (${m.items.length})` };
  if (/phone|mobile|kinit/i.test(extPath)) { const p = matchPhone({ brand, alias, title }, pool); if (p) return { items: [p], base: "suggested", note: null }; }
  return null;
}

export async function runCompetitorJob(trigger: "cron" | "manual", opts: { categoryIds?: string[]; limit?: number } = {}): Promise<JobResult> {
  const state = await readState();
  if (state.paused) return { ok: true, idle: true, message: "Σε παύση (ο Κωτσόβολος μάς είχε κόψει)· ενεργοποίησε την ξανά για να τρέξει" };
  const now = new Date();
  if (trigger === "cron" && now.getHours() < 1) return { ok: true, idle: true, message: "Πριν από τις 01:00" };

  const maps = await db.competitorCategoryMap.findMany({ where: { competitor: COMP, extPath: { not: null }, ...(opts.categoryIds ? { categoryId: { in: opts.categoryIds } } : {}) } });
  if (!maps.length) return { ok: true, idle: true, message: "Καμία κατηγορία δεν συγκρίνεται" };
  const pathOf = new Map(maps.map((m) => [m.categoryId, m.extPath as string]));
  const brandMaps = new Map((await db.competitorBrandMap.findMany({ where: { competitor: COMP } })).map((b) => [b.brandId, b]));

  const six = new Date(now); six.setHours(6, 0, 0, 0);
  const until = trigger === "cron" ? six : new Date(Math.max(six.getTime(), now.getTime() + 2 * 3600_000));
  const pacer = createPacer({ budget: trigger === "cron" ? 1800 : 300, until });

  let sitemap: KotItem[];
  try { sitemap = await fetchSitemap(pacer); }
  catch (e) {
    if (e instanceof KotStopError) return brake(e, state, { pairs: 0, prices: 0, expensive: 0, errors: 0, left: 0 });
    return { ok: false, message: `Το sitemap του Κωτσόβολου δεν κατεβαίνει (${(e as Error).message}) — οι παλιές τιμές μένουν` };
  }
  const byArt = new Map(sitemap.map((i) => [i.art, i]));
  const poolOf = (p: string) => sitemap.filter((i) => i.path === p || i.path.startsWith(p + "/"));

  const products = await db.product.findMany({
    where: { active: true, kind: { not: "set" }, categoryId: { in: [...pathOf.keys()] } },
    select: { id: true, erpCode: true, title: true, price: true, ean: true, modelCode: true, categoryId: true, brandId: true, brand: { select: { name: true } }, offer: { select: { price: true } },
      competitorPrices: { where: { competitor: COMP } } },
  });
  type Item = { p: (typeof products)[number]; row: (typeof products)[number]["competitorPrices"][number] | undefined };
  let work: Item[] = products
    .map((p) => ({ p, row: p.competitorPrices[0] }))
    .filter(({ p, row }) => !brandMaps.get(p.brandId)?.notCarried && !isBundle(p.title, "item") && row?.match !== "rejected"
      && !(row?.checkedAt && now.getTime() - row.checkedAt.getTime() < FRESH_MS));
  work.sort((a, b) => (a.row?.checkedAt?.getTime() ?? 0) - (b.row?.checkedAt?.getTime() ?? 0));
  if (opts.limit) work = work.slice(0, opts.limit);

  const c = { pairs: 0, prices: 0, expensive: 0, errors: 0, left: 0 };
  const touched: { productId: string; erp: number }[] = [];
  let bad = 0;
  // Ruling 9: 5 συνεχόμενες μη-404 αποτυχίες (non-JSON, redirect, χωρίς προϊόν) = ύποπτο φρένο
  const get = async (art: string) => {
    const r = await fetchProduct(art, pacer);
    if ("error" in r) { if (r.error !== "δεν βρέθηκε (404)" && ++bad >= 5) throw new KotStopError("blocked", "5 συνεχόμενες μη έγκυρες απαντήσεις"); }
    else bad = 0;
    return r;
  };

  const save = async (it: Item, extId: string | null, kot: KotItem | null, title: string | null, d: Decision, rejectedExtIds?: string[]) => {
    const { p } = it;
    const data = {
      match: d.match, lastError: d.lastError, missCount: d.missCount, checkedAt: new Date(),
      ...(d.clearPair ? { extId: null, extUrl: null, extTitle: null } : extId ? { extId, extUrl: kot ? `${kot.path}/${kot.last}` : it.row?.extUrl ?? null, extTitle: title ?? it.row?.extTitle ?? null } : {}),
      ...(d.available !== undefined ? { available: d.available } : {}),
      ...(d.prices ? { listPrice: d.prices.list, offerPrice: d.prices.offer, ourPrice: d.prices.ourPrice, diffPct: d.prices.diff } : {}),
      ...(rejectedExtIds ? { rejectedExtIds } : {}),
    };
    const row = await db.competitorPrice.upsert({ where: { productId_competitor: { productId: p.id, competitor: COMP } }, update: data, create: { productId: p.id, competitor: COMP, ...data } });
    if (d.prices && d.history) await db.competitorPriceHistory.create({ data: { competitorPriceId: row.id, price: d.prices.their, ourPrice: d.prices.ourPrice } });
    if (d.prices) { c.prices++; if ((d.prices.diff ?? 0) > 0.5) c.expensive++; }
    if (extId && !d.clearPair && ["auto", "manual", "suggested"].includes(d.match)) { c.pairs++; touched.push({ productId: p.id, erp: Number(p.erpCode) }); }
  };

  const process = async (it: Item) => {
    const { p } = it;
    const ours = ourPrice({ price: p.price, offer: p.offer });
    const path = pathOf.get(p.categoryId)!;
    const mkPrev = (r: Item["row"], match: Prev["match"]): Prev => ({ match, extUrl: r?.extUrl ?? null, missCount: r?.missCount ?? 0, their: r?.offerPrice != null ? Number(r.offerPrice) : r?.listPrice != null ? Number(r.listPrice) : null, ourPrice: r?.ourPrice != null ? Number(r.ourPrice) : null });
    let row = it.row;

    // 1. ζευγάρι που ξέρουμε: μόνο τιμή
    if (row?.extId && (row.match === "auto" || row.match === "manual")) {
      if (!byArt.has(row.extId)) {
        const g = decideGone(mkPrev(row, row.match as any));
        await save(it, null, null, null, g);
        if (!g.clearPair) return;
        row = undefined; // lost: ξαναψάχνεται την ίδια νύχτα
      } else {
        const r = await get(row.extId);
        if ("error" in r) {
          if (!isGoneError(r.error)) { await save(it, row.extId, null, null, { match: row.match as any, lastError: r.error, missCount: row.missCount }); return; }
          const g = decideGone(mkPrev(row, row.match as any));
          await save(it, null, null, null, g);
          if (!g.clearPair) return;
          row = undefined; // lost: ξαναψάχνεται την ίδια νύχτα
        } else {
          const kot = byArt.get(row.extId)!;
          await save(it, row.extId, kot, r.title, decidePrice({ prev: mkPrev(row, row.match as any), base: "auto", note: null, parsed: r, ourEan: p.ean, ourPrice: ours }));
          return;
        }
      }
    }

    // 2. ψάξιμο (χωρίς ζευγάρι, suggested, lost)
    const rejected = it.row?.rejectedExtIds ?? [];
    const pool = poolOf(path).filter((k) => !rejected.includes(k.art));
    const bm = brandMaps.get(p.brandId);
    const s = search(p.brand.name, bm?.alias ?? null, p.modelCode, p.title, path, pool);
    const known = row?.match === "suggested" && row.extId && byArt.has(row.extId) ? row.extId : null;
    if (!s && !known) return;
    const items = s ? s.items : [byArt.get(known!)!];
    let best: { kot: KotItem; r: Awaited<ReturnType<typeof get>> } | null = null;
    for (const kot of items) {
      const r = await get(kot.art);
      if (!("error" in r) && sameEan(r.ean, p.ean) === true) { best = { kot, r }; break; }
      best ??= { kot, r };
    }
    const { kot, r } = best!;
    const cur = row?.match === "lost" || !row ? null : (row.match as Prev["match"]);
    const base = s?.base ?? "suggested";
    const eanHit = !("error" in r) && sameEan(r.ean, p.ean) === true;
    if ("error" in r) { if (row) await save(it, null, null, null, { match: row.match as any, lastError: r.error, missCount: row.missCount }); return; }
    await save(it, kot.art, kot, r.title, decidePrice({ prev: mkPrev(row, cur), base: eanHit ? "auto" : base, note: eanHit ? null : s?.note ?? null, parsed: r, ourEan: p.ean, ourPrice: ours }));
  };

  let done = 0;
  try {
    for (const it of work) {
      try { await process(it); } catch (e) { if (e instanceof KotStopError) throw e; c.errors++; console.error("[competitor]", it.p.erpCode, (e as Error).message); }
      done++;
    }
  } catch (e) {
    if (!(e instanceof KotStopError)) throw e;
    c.left = work.length - done;
    await costs(touched);
    return brake(e, state, c);
  }
  await costs(touched);
  await writeState({ brakedNights: 0 });
  return { ok: true, message: msg(c) };
}

const msg = (c: { pairs: number; prices: number; expensive: number; errors: number }) => `${c.pairs} ζευγάρια · ${c.prices} τιμές · ακριβότεροι σε ${c.expensive} · ${c.errors} σφάλματα`;

async function costs(touched: { productId: string; erp: number }[]) {
  if (!touched.length) return;
  const m = await readCosts(touched.map((t) => t.erp));
  if (!m) return; // η ανάγνωση απέτυχε: μένει το παλιό κόστος
  const at = new Date();
  for (const t of touched) { const x = m.get(t.erp); if (x) await db.competitorPrice.update({ where: { productId_competitor: { productId: t.productId, competitor: COMP } }, data: { cost: x.cost, costSource: x.source, costAt: at } }); }
}

async function brake(e: KotStopError, state: { brakedNights?: number }, c: { pairs: number; prices: number; expensive: number; errors: number; left: number }): Promise<JobResult> {
  if (e.reason === "budget" || e.reason === "window") {
    await writeState({ brakedNights: 0 });
    return { ok: true, message: `${msg(c)} · συνεχίζει αύριο: ${c.left} έμειναν` };
  }
  const nights = (state.brakedNights ?? 0) + 1;
  if (nights >= 2) {
    await writeState({ brakedNights: nights, paused: true });
    return { ok: false, message: `ο Κωτσόβολος μάς κόβει — η εργασία σταματά ώσπου να την ξαναενεργοποιήσεις (${msg(c)})` };
  }
  await writeState({ brakedNights: nights });
  return { ok: false, message: `Φρένο (${e.reason}${e.message !== e.reason ? `: ${e.message}` : ""}) · ${msg(c)}` };
}
