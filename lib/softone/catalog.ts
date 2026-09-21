import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { s1 } from "@/lib/softone";
import { getTable, friendlyError } from "@/lib/softone/lookups";

/**
 * Συγχρονισμός καταλόγου SoftOne → καθρέφτης (S1WebCategory, S1SpecGroup,
 * S1SpecDef, S1SpecOption, S1Item). Μόνο ανάγνωση από το ERP, μόνο με την
 * επίσημη υπηρεσία GetTable, και μόνο ό,τι έχει χαρτογραφηθεί με βεβαιότητα.
 *
 * - Κατηγορίες και ορισμοί χαρακτηριστικών: μικροί πίνακες, πάντα πλήρης ανάγνωση.
 * - Είδη: πρώτα τα ids που ανήκουν στο site (έχουν ομάδα χαρακτηριστικών ή
 *   κατηγορία web), μετά οι λεπτομέρειες σε κομμάτια κατά εύρος MTRL, ώστε
 *   καμία κλήση να μη ζητά δεκάδες χιλιάδες γραμμές με memo. Το delta παίρνει
 *   μόνο όσα άλλαξαν μετά τον δείκτη (UPDDATE)· ο πλήρης σημαδεύει και όσα
 *   χάθηκαν ως `missing`, δεν διαγράφει ποτέ.
 * - Παύση ανάμεσα στις κλήσεις: ο server του πελάτη εξυπηρετεί και το ζωντανό site.
 */
const PAUSE_MS = 250;
const CHUNK = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const int = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const num = (v: string) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const posNum = (v: string) => { const n = num(v); return n && n > 0 ? n : null; };
const posInt = (v: string) => { const n = int(v); return n && n > 0 ? n : null; };
const yes = (v: string) => v === "1" || /^true$/i.test(v);
const txt = (v: string) => { const t = (v ?? "").trim(); return t ? t : null; };
const date = (v: string) => { if (!v) return null; const d = new Date(v.replace(" ", "T")); return Number.isNaN(d.getTime()) ? null : d; };
/** SQL Server literal για το φίλτρο του GetTable. */
const sqlDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export type Trigger = "manual" | "cron" | "script";
export interface CatalogRunResult { ok: boolean; kind: string; fetched: number; created: number; updated: number; missing: number; skipped: number; ms: number; error?: string }

export async function logged(kind: string, trigger: Trigger, fn: () => Promise<Omit<CatalogRunResult, "ok" | "kind" | "ms" | "error">>): Promise<CatalogRunResult> {
  const t0 = Date.now();
  const run = await db.s1SyncRun.create({ data: { kind, trigger } });
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    await db.s1SyncRun.update({ where: { id: run.id }, data: { ok: true, ...r, ms } });
    return { ok: true, kind, ...r, ms };
  } catch (e) {
    const error = friendlyError(e);
    const ms = Date.now() - t0;
    await db.s1SyncRun.update({ where: { id: run.id }, data: { ok: false, ms, error } });
    return { ok: false, kind, fetched: 0, created: 0, updated: 0, missing: 0, skipped: 0, ms, error };
  }
}

// ---------- Κατηγορίες site ----------

const catKey = (level: 1 | 2, master: number, main?: number) => (level === 1 ? `1:${master}` : `2:${master}:${main}`);

export function syncWebCategories(trigger: Trigger = "manual") {
  return logged("cat-webcat", trigger, async () => {
    const l1 = await getTable("CCCWEBCATEGORY1", ["CCCWEBCATEGORY1", "NAME", "ISACTIVE", "UPDDATE"]);
    await sleep(PAUSE_MS);
    const l2 = await getTable("CCCWEBCATEGORY2", ["CCCWEBCATEGORY1", "CCCWEBCATEGORY2", "NAME", "ISACTIVE", "UPDDATE"]);
    const rows = [
      ...l1.flatMap(([id, name, act, upd]) => { const s1Id = int(id); return s1Id == null ? [] : [{ key: catKey(1, s1Id), level: 1, s1Id, parentS1Id: null as number | null, name: name.trim(), active: yes(act), s1UpdatedAt: date(upd) }]; }),
      ...l2.flatMap(([p, id, name, act, upd]) => { const s1Id = int(id), parent = int(p); return s1Id == null || parent == null ? [] : [{ key: catKey(2, parent, s1Id), level: 2, s1Id, parentS1Id: parent, name: name.trim(), active: yes(act), s1UpdatedAt: date(upd) }]; }),
    ];
    const existing = new Map((await db.s1WebCategory.findMany()).map((c) => [c.key, c]));
    let created = 0, updated = 0;
    const now = new Date();
    for (const r of rows) {
      const e = existing.get(r.key);
      if (!e) { await db.s1WebCategory.create({ data: { ...r, syncedAt: now } }); created++; }
      else if (e.name !== r.name || e.active !== r.active || e.missing || e.s1UpdatedAt?.getTime() !== r.s1UpdatedAt?.getTime()) { await db.s1WebCategory.update({ where: { key: r.key }, data: { ...r, missing: false, syncedAt: now } }); updated++; }
    }
    const seen = new Set(rows.map((r) => r.key));
    const gone = [...existing.keys()].filter((k) => !seen.has(k) && !existing.get(k)!.missing);
    if (gone.length) await db.s1WebCategory.updateMany({ where: { key: { in: gone } }, data: { missing: true } });
    await db.s1SyncState.upsert({ where: { kind: "webcat" }, update: { lastFullAt: now }, create: { kind: "webcat", lastFullAt: now } });
    return { fetched: rows.length, created, updated, missing: gone.length, skipped: l1.length + l2.length - rows.length };
  });
}

// ---------- Ομάδες χαρακτηριστικών, χαρακτηριστικά, προκαθορισμένες τιμές ----------

export function syncSpecGroups(trigger: Trigger = "manual") {
  return logged("cat-specs", trigger, async () => {
    const groups = await getTable("CCCWEBGRSPECS", ["CCCWEBGRSPECS", "WEBGRSPECS", "CCCWEBCATEGORY1", "CCCWEBCATEGORY2", "NAME", "ISACTIVE", "UPDDATE"]);
    await sleep(PAUSE_MS);
    const specs = await getTable("CCCWEBSPECS", ["CCCWEBGRSPECS", "WEBSPECS", "NAME", "ISVIEW", "ISACTIVE", "ISFILTER", "UPDDATE"]);
    await sleep(PAUSE_MS);
    const opts = await getTable("CCCWEBSPECSLNS", ["CCCWEBGRSPECS", "WEBSPECS", "WEBSPECSLNS", "NAME", "SOCOLOR", "ISACTIVE"]);
    const now = new Date();
    let created = 0, updated = 0, skipped = 0;

    // Ομάδες
    const exG = new Map((await db.s1SpecGroup.findMany()).map((g) => [g.s1Id, g]));
    const seenG = new Set<number>();
    for (const [id, code, c1, c2, name, act, upd] of groups) {
      const s1Id = int(id); if (s1Id == null) { skipped++; continue; }
      seenG.add(s1Id);
      const data = { code: txt(code), name: name.trim(), cat1: posInt(c1), cat2: posInt(c2), active: yes(act), s1UpdatedAt: date(upd), missing: false, syncedAt: now };
      const e = exG.get(s1Id);
      if (!e) { await db.s1SpecGroup.create({ data: { s1Id, ...data } }); created++; }
      else if (e.name !== data.name || e.code !== data.code || e.cat1 !== data.cat1 || e.cat2 !== data.cat2 || e.active !== data.active || e.missing) { await db.s1SpecGroup.update({ where: { s1Id }, data }); updated++; }
    }
    const goneG = [...exG.keys()].filter((k) => !seenG.has(k) && !exG.get(k)!.missing);
    if (goneG.length) await db.s1SpecGroup.updateMany({ where: { s1Id: { in: goneG } }, data: { missing: true } });

    // Χαρακτηριστικά
    const exS = new Map((await db.s1SpecDef.findMany()).map((x) => [`${x.groupS1Id}:${x.code}`, x]));
    const seenS = new Set<string>();
    for (const [g, c, name, view, act, filter, upd] of specs) {
      const groupS1Id = int(g), code = int(c);
      if (groupS1Id == null || code == null || !seenG.has(groupS1Id)) { skipped++; continue; }
      const k = `${groupS1Id}:${code}`; seenS.add(k);
      const data = { name: name.trim(), isView: yes(view), isFilter: yes(filter), active: yes(act), s1UpdatedAt: date(upd), missing: false };
      const e = exS.get(k);
      if (!e) { const n = await db.s1SpecDef.create({ data: { groupS1Id, code, ...data } }); exS.set(k, n); created++; }
      else if (e.name !== data.name || e.isView !== data.isView || e.isFilter !== data.isFilter || e.active !== data.active || e.missing) { await db.s1SpecDef.update({ where: { id: e.id }, data }); updated++; }
    }
    const goneS = [...exS.entries()].filter(([k, v]) => !seenS.has(k) && !v.missing).map(([, v]) => v.id);
    if (goneS.length) await db.s1SpecDef.updateMany({ where: { id: { in: goneS } }, data: { missing: true } });

    // Προκαθορισμένες τιμές
    const exO = new Map((await db.s1SpecOption.findMany()).map((x) => [`${x.specId}:${x.code}`, x]));
    const seenO = new Set<string>();
    for (const [g, c, o, name, color, act] of opts) {
      const spec = exS.get(`${int(g)}:${int(c)}`); const code = int(o);
      if (!spec || code == null) { skipped++; continue; }
      const k = `${spec.id}:${code}`; seenO.add(k);
      const data = { name: name.trim(), color: txt(color), active: yes(act), missing: false };
      const e = exO.get(k);
      if (!e) { await db.s1SpecOption.create({ data: { specId: spec.id, code, ...data } }); created++; }
      else if (e.name !== data.name || e.color !== data.color || e.active !== data.active || e.missing) { await db.s1SpecOption.update({ where: { id: e.id }, data }); updated++; }
    }
    const goneO = [...exO.entries()].filter(([k, v]) => !seenO.has(k) && !v.missing).map(([, v]) => v.id);
    if (goneO.length) await db.s1SpecOption.updateMany({ where: { id: { in: goneO } }, data: { missing: true } });

    await db.s1SyncState.upsert({ where: { kind: "specgroup" }, update: { lastFullAt: now }, create: { kind: "specgroup", lastFullAt: now } });
    return { fetched: groups.length + specs.length + opts.length, created, updated, missing: goneG.length + goneS.length + goneO.length, skipped };
  });
}

// ---------- Είδη ----------

const ITEM_FIELDS = ["MTRL", "CODE", "NAME", "NAME1", "CODE1", "CODE2", "ISACTIVE", "MTRMANFCTR", "MTRMARK", "MTRCATEGORY", "MTRGROUP", "VAT", "MTRUNIT1", "PRICER", "PRICEW", "CCCWEBCATEGORY1", "CCCWEBCATEGORY2", "CCCWEBGRSPECS", "CCCWREMARKS1", "CCCWREMARKS", "CCCAVAIL", "CCCWARRANTY", "GUARTIME", "MTRONORDER", "MTRRPLCODE", "CCCWEIGHT", "CCCLENGTH", "CCCWIDTH", "CCCHEIGHT", "UPDDATE"] as const;
/** Είδη αποθήκης που ανήκουν στο site. Το WEBVIEW είναι 0 παντού στην εγκατάσταση, οπότε δεν το χρησιμοποιούμε. */
const WEB_FILTER = "SODTYPE=51 AND (CCCWEBGRSPECS>0 OR CCCWEBCATEGORY1>0)";

export function mapItem(r: string[]) {
  const f = Object.fromEntries(ITEM_FIELDS.map((k, i) => [k, r[i] ?? ""])) as Record<(typeof ITEM_FIELDS)[number], string>;
  const mtrl = int(f.MTRL);
  if (mtrl == null || !f.CODE.trim()) return null;
  const data = {
    mtrl, code: f.CODE.trim(), name: f.NAME.trim(), name2: txt(f.NAME1), barcode: txt(f.CODE1), factoryCode: txt(f.CODE2), active: yes(f.ISACTIVE),
    manufacturerS1Id: posInt(f.MTRMANFCTR), markS1Id: posInt(f.MTRMARK), commCategory: posInt(f.MTRCATEGORY), itemGroup: posInt(f.MTRGROUP), vatS1Id: posInt(f.VAT), unitS1Id: posInt(f.MTRUNIT1),
    priceRetail: posNum(f.PRICER), priceWholesale: posNum(f.PRICEW),
    webCat1: posInt(f.CCCWEBCATEGORY1), webCat2: posInt(f.CCCWEBCATEGORY2), specGroupS1Id: posInt(f.CCCWEBGRSPECS),
    shortDesc: txt(f.CCCWREMARKS1), longDesc: txt(f.CCCWREMARKS), availText: txt(f.CCCAVAIL), extWarranty: yes(f.CCCWARRANTY), guaranteeMonths: posInt(f.GUARTIME),
    onOrder: yes(f.MTRONORDER), replacedByMtrl: posInt(f.MTRRPLCODE),
    weightKg: posNum(f.CCCWEIGHT), lengthCm: posNum(f.CCCLENGTH), widthCm: posNum(f.CCCWIDTH), heightCm: posNum(f.CCCHEIGHT),
    s1UpdatedAt: date(f.UPDDATE),
  };
  // Ό,τι μπαίνει στο κείμενο αναζήτησης: όταν αλλάξει αυτό, το vector του προϊόντος θέλει ξανά υπολογισμό
  const contentHash = createHash("sha1").update(JSON.stringify([data.code, data.name, data.name2, data.factoryCode, data.manufacturerS1Id, data.webCat1, data.webCat2, data.specGroupS1Id, data.shortDesc, data.longDesc, data.availText, data.extWarranty, data.guaranteeMonths, data.priceRetail, data.widthCm, data.heightCm, data.lengthCm, data.active])).digest("hex");
  return { ...data, contentHash };
}

export function syncItems(mode: "delta" | "full" = "delta", trigger: Trigger = "manual") {
  return logged(mode === "full" ? "cat-items-full" : "cat-items", trigger, async () => {
    const state = await db.s1SyncState.findUnique({ where: { kind: "item" } });
    const useDelta = mode === "delta" && !!state?.cursor;
    const filter = useDelta ? `${WEB_FILTER} AND UPDDATE>'${sqlDate(state!.cursor!)}'` : WEB_FILTER;
    const ids = (await getTable("MTRL", ["MTRL"], filter)).map((r) => int(r[0])).filter((x): x is number => x != null).sort((a, b) => a - b);
    const groups = new Set((await db.s1SpecGroup.findMany({ select: { s1Id: true } })).map((g) => g.s1Id));
    const now = new Date();
    let created = 0, updated = 0, skipped = 0, fetched = 0;
    let cursor = state?.cursor ?? null;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      await sleep(PAUSE_MS);
      const rows = await getTable("MTRL", [...ITEM_FIELDS], `${filter} AND MTRL>=${part[0]} AND MTRL<=${part[part.length - 1]}`);
      fetched += rows.length;
      const mapped = rows.map(mapItem).filter((x): x is NonNullable<ReturnType<typeof mapItem>> => { if (!x) skipped++; return !!x; })
        // ομάδα που δεν έχουμε (ακόμη): κρατάμε το είδος, χωρίς τη σχέση, για να μη σπάσει το FK
        .map((x) => (x.specGroupS1Id && !groups.has(x.specGroupS1Id) ? { ...x, specGroupS1Id: null } : x));
      const existing = new Map((await db.s1Item.findMany({ where: { mtrl: { in: mapped.map((m) => m.mtrl) } }, select: { mtrl: true, contentHash: true, s1UpdatedAt: true, missing: true, active: true, priceWholesale: true } })).map((e) => [e.mtrl, e]));
      const fresh = mapped.filter((m) => !existing.has(m.mtrl));
      if (fresh.length) { await db.s1Item.createMany({ data: fresh.map((m) => ({ ...m, syncedAt: now })), skipDuplicates: true }); created += fresh.length; }
      for (const m of mapped) {
        const e = existing.get(m.mtrl); if (!e) continue;
        if (e.contentHash !== m.contentHash || e.missing || e.s1UpdatedAt?.getTime() !== m.s1UpdatedAt?.getTime() || e.priceWholesale !== m.priceWholesale) { await db.s1Item.update({ where: { mtrl: m.mtrl }, data: { ...m, missing: false, syncedAt: now } }); updated++; }
      }
      for (const m of mapped) if (m.s1UpdatedAt && (!cursor || m.s1UpdatedAt > cursor)) cursor = m.s1UpdatedAt;
    }
    let missing = 0;
    if (!useDelta) {
      // Πλήρης: ό,τι είχαμε και δεν ήρθε, σημαδεύεται — δεν διαγράφεται
      const r = await db.s1Item.updateMany({ where: { missing: false, mtrl: { notIn: ids } }, data: { missing: true } });
      missing = r.count;
    }
    await db.s1SyncState.upsert({ where: { kind: "item" }, update: { cursor, ...(useDelta ? { lastDeltaAt: now } : { lastFullAt: now }) }, create: { kind: "item", cursor, ...(useDelta ? { lastDeltaAt: now } : { lastFullAt: now }) } });
    return { fetched, created, updated, missing, skipped };
  });
}

/** Όλος ο κατάλογος με τη σωστή σειρά: κατηγορίες → ορισμοί χαρακτηριστικών → είδη. Σταματά στο πρώτο σφάλμα ανάγνωσης. */
export async function syncCatalog(mode: "delta" | "full" = "delta", trigger: Trigger = "manual") {
  const out: CatalogRunResult[] = [];
  for (const step of [() => syncWebCategories(trigger), () => syncSpecGroups(trigger), () => syncItems(mode, trigger)]) {
    const r = await step(); out.push(r);
    if (!r.ok) break;
  }
  return out;
}

/** Ζει ο server των web services; Ένα ελαφρύ αίτημα, χωρίς δεδομένα. */
export async function s1Alive(): Promise<{ ok: boolean; error?: string }> {
  try { const r = await s1("GetTable", { TABLE: "VAT", FIELDS: "VAT", FILTER: "VAT=-1" }); return r.success === false ? { ok: false, error: String(r.error) } : { ok: true }; }
  catch (e) { return { ok: false, error: friendlyError(e) }; }
}

export async function catalogStats() {
  const [cat1, cat2, groups, specs, filters, options, items, active, missing, withDesc, withDims, withAvail, withGroup, withBrand, states, runs] = await Promise.all([
    db.s1WebCategory.count({ where: { level: 1, missing: false } }), db.s1WebCategory.count({ where: { level: 2, missing: false } }),
    db.s1SpecGroup.count({ where: { missing: false } }), db.s1SpecDef.count({ where: { missing: false } }), db.s1SpecDef.count({ where: { missing: false, isFilter: true } }), db.s1SpecOption.count({ where: { missing: false } }),
    db.s1Item.count(), db.s1Item.count({ where: { active: true, missing: false } }), db.s1Item.count({ where: { missing: true } }),
    db.s1Item.count({ where: { OR: [{ shortDesc: { not: null } }, { longDesc: { not: null } }] } }), db.s1Item.count({ where: { widthCm: { not: null }, heightCm: { not: null }, lengthCm: { not: null } } }),
    db.s1Item.count({ where: { availText: { not: null } } }), db.s1Item.count({ where: { specGroupS1Id: { not: null } } }), db.s1Item.count({ where: { manufacturerS1Id: { not: null } } }),
    db.s1SyncState.findMany(), db.s1SyncRun.findMany({ where: { kind: { startsWith: "cat-" } }, orderBy: { at: "desc" }, take: 8 }),
  ]);
  return { cat1, cat2, groups, specs, filters, options, items, active, missing, withDesc, withDims, withAvail, withGroup, withBrand, states, runs };
}
