import "server-only";
import { db } from "@/lib/db";
import { resetSettingsCache } from "@/lib/settings/store";
import type { JobResult } from "@/lib/scheduler/jobs";
import { fetchProduct, fetchSitemap } from "./kotsovolos/client";
import { createPacer, KotStopError, type Pacer } from "./kotsovolos/pacer";
import { brandPool, isBundle, matchVariant, modelTokens, rankCandidates, sameEan, slugIndex, type KotItem } from "./kotsovolos/core";
import { aiPick, AiStop } from "./llm-match";
import { readCosts } from "./cost";
import { decideGone, decidePrice, decideVariant, isGoneError, isOddResponse, researchDue, runWindow, ourPrice, search, searchPrev, type Decision, type Prev } from "./run-core";

export { ourPrice };
const COMP = "kotsovolos";
const SECTION = "competitors.kotsovolos"; // { paused, brakedNights, firstScanDone } — γράφεται απευθείας, όπως οι άλλες ενότητες εκτός φόρμας
const FRESH_MS = 20 * 3600_000;
/** Χωρίς ζευγάρι μετά από πλήρες ψάξιμο (μοντέλο + AI): γραμμή με extId=null και αυτό το lastError, ξαναψάχνεται μετά από 7 ημέρες. */
export const NOT_FOUND = "δεν βρέθηκε στον Κωτσόβολο";
const RETRY_MS = 7 * 86400_000;
const AI_MAX = 150;

export const readState = async () => ((await db.setting.findUnique({ where: { section: SECTION } }))?.data ?? {}) as { paused?: boolean; brakedNights?: number; firstScanDone?: boolean };
export async function writeState(patch: { paused?: boolean; brakedNights: number; firstScanDone?: boolean }) {
  const data = { ...(await readState()), ...patch };
  await db.setting.upsert({ where: { section: SECTION }, update: { data }, create: { section: SECTION, data } });
  resetSettingsCache();
}

export type JobOpts = {
  categoryIds?: string[]; limit?: number;
  /** Μόνο χειροκίνητα (σάρωση από script): κλήσεις, ώρες παραθύρου, κλήσεις AI. */
  budget?: number; hours?: number; aiMax?: number;
  onProgress?: (done: number, total: number, msg: string) => void;
};
export async function runCompetitorJob(trigger: "cron" | "manual", opts: JobOpts = {}): Promise<JobResult> {
  const state = await readState();
  if (state.paused) return { ok: true, idle: true, message: "Σε παύση (ο Κωτσόβολος μάς είχε κόψει)· ενεργοποίησε την ξανά για να τρέξει" };
  const now = new Date();
  const win = runWindow(trigger, now, state.firstScanDone !== true);
  if (win.idle) return { ok: true, idle: true, message: win.idle };
  const manual = trigger === "manual";
  if (manual && opts.hours) win.until = new Date(now.getTime() + opts.hours * 3600_000);

  // Η αντιστοίχιση κατηγοριών είναι προαιρετική: σειρά προτεραιότητας και πρώτη δεξαμενή ψαξίματος
  const maps = await db.competitorCategoryMap.findMany({ where: { competitor: COMP, extPath: { not: null } } });
  const pathOf = new Map(maps.map((m) => [m.categoryId, m.extPath as string]));
  const brandMaps = new Map((await db.competitorBrandMap.findMany({ where: { competitor: COMP } })).map((b) => [b.brandId, b]));

  const pacer = createPacer({ budget: manual && opts.budget ? opts.budget : trigger === "cron" ? 1800 : 300, until: win.until });
  const aiMax = manual && opts.aiMax != null ? opts.aiMax : AI_MAX;

  let sitemap: KotItem[];
  try { sitemap = await fetchSitemap(pacer); }
  catch (e) {
    if (e instanceof KotStopError) return brake(e, trigger, state, { pairs: 0, prices: 0, expensive: 0, errors: 0, left: 0, sugg: 0, readErr: 0, ai: 0, aiUsd: 0, notFound: 0, reads: 0, variant: 0 });
    return { ok: false, message: `Το sitemap του Κωτσόβολου δεν κατεβαίνει (${(e as Error).message}) — οι παλιές τιμές μένουν` };
  }
  const byArt = new Map(sitemap.map((i) => [i.art, i]));
  const ix = slugIndex(sitemap);

  const products = await db.product.findMany({
    where: { active: true, kind: { not: "set" }, ...(opts.categoryIds ? { categoryId: { in: opts.categoryIds } } : {}) },
    select: { id: true, erpCode: true, title: true, price: true, ean: true, modelCode: true, categoryId: true, brandId: true, brand: { select: { name: true } }, category: { select: { name: true } }, offer: { select: { price: true } },
      competitorPrices: { where: { competitor: COMP } } },
  });
  type Item = { p: (typeof products)[number]; row: (typeof products)[number]["competitorPrices"][number] | undefined };
  let work: Item[] = products
    .map((p) => ({ p, row: p.competitorPrices[0] }))
    .filter(({ p, row }) => !brandMaps.get(p.brandId)?.notCarried && !isBundle(p.title, "item")
      && !(row?.checkedAt && now.getTime() - row.checkedAt.getTime() < (!row.extId && row.lastError === NOT_FOUND ? RETRY_MS : FRESH_MS)));
  // πρώτα οι επιβεβαιωμένες κατηγορίες, μετά ο παλαιότερος έλεγχος
  work.sort((a, b) => Number(pathOf.has(b.p.categoryId)) - Number(pathOf.has(a.p.categoryId)) || (a.row?.checkedAt?.getTime() ?? 0) - (b.row?.checkedAt?.getTime() ?? 0));
  if (opts.limit) work = work.slice(0, opts.limit);

  const c = { pairs: 0, prices: 0, expensive: 0, errors: 0, left: 0, sugg: 0, readErr: 0, ai: 0, aiUsd: 0, notFound: 0, reads: 0, variant: 0 };
  let aiOff: string | null = null;
  const touched: { productId: string; erp: number }[] = [];
  let bad = 0;
  // Ruling 9: 5 συνεχόμενες μη-404 αποτυχίες (non-JSON, redirect, χωρίς προϊόν) = ύποπτο φρένο
  const get = async (art: string) => {
    c.reads++;
    const r = await fetchProduct(art, pacer);
    if ("error" in r) { if (isOddResponse(r.error) && ++bad >= 5) throw new KotStopError("blocked", "5 συνεχόμενες μη έγκυρες απαντήσεις"); }
    else bad = 0;
    if ("error" in r && !isOddResponse(r.error)) bad = 0;
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
    const firm = d.match === "auto" || d.match === "manual";
    if (d.prices && firm) { c.prices++; if ((d.prices.diff ?? 0) > 0.5) c.expensive++; }
    if (extId && !d.clearPair && firm) { c.pairs++; touched.push({ productId: p.id, erp: Number(p.erpCode) }); }
    if (extId && !d.clearPair && d.match === "suggested") c.sugg++;
    if (extId && !d.clearPair && d.match === "variant") c.variant++;
    if (!d.prices && !d.clearPair && d.available === undefined && d.lastError) c.readErr++;
  };

  const process = async (it: Item) => {
    const { p } = it;
    const ours = ourPrice({ price: p.price, offer: p.offer });
    const mkPrev = (r: Item["row"], match: Prev["match"]): Prev => ({ match, extUrl: r?.extUrl ?? null, missCount: r?.missCount ?? 0, their: r?.offerPrice != null ? Number(r.offerPrice) : r?.listPrice != null ? Number(r.listPrice) : null, ourPrice: r?.ourPrice != null ? Number(r.ourPrice) : null });
    let row = it.row;

    // 1. ζευγάρι που ξέρουμε: μόνο τιμή. Τα ενδεικτικά (άλλο χρώμα) το ίδιο, εκτός από μία νύχτα την εβδομάδα που ξαναψάχνονται.
    if (row?.extId && (row.match === "auto" || row.match === "manual" || (row.match === "variant" && !researchDue(p.id, now)))) {
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
          await save(it, row.extId, kot, r.title, row.match === "variant"
            ? decideVariant({ prev: mkPrev(row, "variant"), parsed: r, ourEan: p.ean, ourPrice: ours })
            : decidePrice({ prev: mkPrev(row, row.match as any), base: "auto", note: null, parsed: r, ourEan: p.ean, ourPrice: ours }));
          return;
        }
      }
    }

    // 2. ψάξιμο (χωρίς ζευγάρι, suggested, lost): όλη η μάρκα στο sitemap, πρώτα η αντιστοιχισμένη κατηγορία
    const rejected = it.row?.rejectedExtIds ?? [];
    const bm = brandMaps.get(p.brandId);
    const all = brandPool(ix, p.brand.name, bm?.alias).filter((k) => !rejected.includes(k.art));
    const known = row?.match === "suggested" && row.extId && byArt.has(row.extId) ? row.extId : null;
    if (!all.length && !known) return; // η μάρκα δεν υπάρχει στον Κωτσόβολο: σιωπηλά, χωρίς AI
    const path = pathOf.get(p.categoryId);
    const inCat = path ? all.filter((i) => i.path === path || i.path.startsWith(path + "/")) : [];
    const phone = /phone|mobile|kinit/i.test(path ?? "") || /κινητ|smartphone/i.test(p.category?.name ?? "");
    let s = search(p.brand.name, bm?.alias ?? null, p.modelCode, p.title, phone, inCat.length ? [inCat, all] : [all]);
    let note = s?.note ?? (known && row?.lastError?.startsWith("AI:") ? row.lastError : null);
    if (!s && !known) {
      // 3. AI: μόνο πρόταση· auto μόνο αν το EAN που διαβάζουμε είναι ίδιο
      if (aiOff || c.ai >= aiMax) return; // χωρίς πλήρες ψάξιμο: δεν σημειώνεται «δεν βρέθηκε»
      const was = row?.match === "variant" ? row.extId : null; // το γνωστό «άλλο χρώμα» δεν είναι ακριβές ζευγάρι
      const cands = rankCandidates({ title: p.title, model: p.modelCode }, all.filter((k) => k.art !== was)); // ίσοι βαθμοί: η σειρά του sitemap
      let pick = null;
      if (cands.length) {
        c.ai++;
        try { const a = await aiPick({ title: p.title, brand: p.brand.name, model: p.modelCode, category: p.category?.name ?? null }, cands); c.aiUsd += a.costUsd; pick = a.pick; }
        catch (e) { if (e instanceof AiStop) aiOff = e.message; else console.error("[competitor] AI", p.erpCode, (e as Error).message); return; }
      }
      if (!pick) {
        // 4. ίδιο μοντέλο σε άλλο χρώμα: ενδεικτική τιμή, ποτέ ζευγάρι (Ruling 15)
        const v = [...new Set([p.modelCode, ...modelTokens(p.title)])].map((m) => matchVariant({ brand: p.brand.name, alias: bm?.alias, model: m }, all)).find(Boolean);
        if (v) {
          const r = await get(v.art);
          if ("error" in r) return; // ξαναδοκιμάζεται αύριο
          await save(it, v.art, v, r.title, decideVariant({ prev: mkPrev(row?.extId === v.art ? row : undefined, null), parsed: r, ourEan: p.ean, ourPrice: ours }));
          return;
        }
        c.notFound++;
        await save(it, null, null, null, { match: row?.match === "rejected" ? "rejected" : "lost", lastError: NOT_FOUND, missCount: 0, clearPair: true });
        return;
      }
      s = { items: [pick.item], base: "suggested", note: null };
      note = `AI: ${pick.why || "ίδιο μοντέλο"}`;
    }
    const items = s ? s.items : [byArt.get(known!)!];
    let best: { kot: KotItem; r: Awaited<ReturnType<typeof get>> } | null = null;
    for (const kot of items) {
      const r = await get(kot.art);
      if (!("error" in r) && sameEan(r.ean, p.ean) === true) { best = { kot, r }; break; }
      if (!best || ("error" in best.r && !("error" in r))) best = { kot, r }; // reserve: το πρώτο χωρίς σφάλμα
    }
    const { kot, r } = best!;
    const cur = searchPrev(row?.match);
    const base = s?.base ?? "suggested";
    const eanHit = !("error" in r) && sameEan(r.ean, p.ean) === true;
    if ("error" in r) { if (row) await save(it, null, null, null, { match: row.match as any, lastError: r.error, missCount: row.missCount }); return; }
    await save(it, kot.art, kot, r.title, decidePrice({ prev: mkPrev(row, cur), base: eanHit ? "auto" : base, note: eanHit ? null : note, parsed: r, ourEan: p.ean, ourPrice: ours }));
  };

  let done = 0;
  try {
    for (const it of work) {
      try { await process(it); } catch (e) { if (e instanceof KotStopError) throw e; c.errors++; console.error("[competitor]", it.p.erpCode, (e as Error).message); }
      done++;
      if (opts.onProgress && done % 50 === 0) opts.onProgress(done, work.length, msg(c));
    }
  } catch (e) {
    if (!(e instanceof KotStopError)) throw e;
    c.left = work.length - done;
    await costs(touched);
    return brake(e, trigger, state, c);
  }
  await costs(touched);
  await writeState({ brakedNights: 0, ...(trigger === "cron" ? { firstScanDone: true } : {}) });
  return { ok: true, message: `${msg(c)}${aiOff ? ` · AI σταμάτησε: ${aiOff}` : ""}` };
}

type Counts = { pairs: number; prices: number; expensive: number; errors: number; sugg: number; readErr: number; ai: number; aiUsd: number; notFound: number; reads: number; variant: number };
const msg = (c: Counts) => `${c.pairs} ζευγάρια · ${c.prices} τιμές · ακριβότεροι σε ${c.expensive} · ${c.sugg} προτάσεις προς έλεγχο · ${c.readErr} χωρίς τιμή · ${c.notFound} δεν βρέθηκαν${c.variant ? ` · ${c.variant} ενδεικτικά (άλλο χρώμα)` : ""} · ${c.errors} σφάλματα · ${c.reads} αναγνώσεις Κωτσόβολου${c.ai ? ` · AI ${c.ai} κλήσεις ($${c.aiUsd.toFixed(3)})` : ""}`;

async function costs(touched: { productId: string; erp: number }[]) {
  if (!touched.length) return;
  const m = await readCosts(touched.map((t) => t.erp));
  if (!m) return; // η ανάγνωση απέτυχε: μένει το παλιό κόστος
  const at = new Date();
  for (const t of touched) { const x = m.get(t.erp); if (x) await db.competitorPrice.update({ where: { productId_competitor: { productId: t.productId, competitor: COMP } }, data: { cost: x.cost, costSource: x.source, costAt: at } }); }
}

async function brake(e: KotStopError, trigger: "cron" | "manual", state: { brakedNights?: number }, c: Counts & { left: number }): Promise<JobResult> {
  if (e.reason === "budget" || e.reason === "window") {
    await writeState({ brakedNights: 0, ...(trigger === "cron" ? { firstScanDone: true } : {}) }); // το πρώτο scanning ολοκληρώθηκε όσο επέτρεπε ο προϋπολογισμός· τα υπόλοιπα στο κανονικό παράθυρο

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
