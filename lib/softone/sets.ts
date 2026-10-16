import "server-only";
import { db } from "@/lib/db";
import { getTable } from "@/lib/softone/lookups";
import { CENTRAL_WAREHOUSES, logged, type Trigger } from "@/lib/softone/catalog";

/**
 * «Set ειδών» του SoftOne → καθρέφτης `S1Set` / `S1SetLine`. Μόνο αναγνώσεις (GetTable):
 * - SPCS (SODTYPE=70): κεφαλίδα — κωδικός, όνομα, ενεργό, κύριο είδος (MTRL), ημερομηνίες ισχύος
 * - SPCLINES: μέλη — είδος, ποσότητα
 * - MTRL: κωδικός και όνομα των μελών (τα περισσότερα — π.χ. εξωτερικές μονάδες — δεν είναι στον κατάλογο του site)
 * - MTRBALSHEET: υπόλοιπο κεντρικών αποθηκών (1, 10) κάθε μέλους, για το απόθεμα του set (= το μικρότερο των μελών)
 * Η ετικέτα «Περιλαμβάνει» (`label`) είναι της διαχείρισης και δεν αλλάζει από εδώ.
 */
const int = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) && v !== "" ? Math.trunc(n) : null; };
const num = (v: string | undefined) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const date = (v: string | undefined) => (v ? new Date(v.replace(" ", "T")) : null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function syncSets(trigger: Trigger = "manual") {
  return logged("cat-sets", trigger, async () => {
    const heads = await getTable("SPCS", ["SPCS", "CODE", "NAME", "ISACTIVE", "MTRL", "FROMDATE", "FINALDATE"], "SODTYPE=70");
    const lines = await getTable("SPCLINES", ["SPCS", "LINENUM", "MTRL", "QTY1"], "");
    const ids = new Set(heads.map((h) => int(h[0])).filter((x): x is number => x != null));
    const mine = lines.filter((l) => ids.has(int(l[0]) ?? -1));
    const mtrls = [...new Set(mine.map((l) => int(l[2])).filter((x): x is number => x != null))].sort((a, b) => a - b);

    // ονόματα και απόθεμα μελών, σε κομμάτια (μικρές αναγνώσεις)
    const info = new Map<number, { code: string; name: string }>();
    const stock = new Map<number, number>();
    const year = new Date().getFullYear();
    for (let i = 0; i < mtrls.length; i += 300) {
      const part = mtrls.slice(i, i + 300), list = part.join(",");
      const [names, bal] = await Promise.all([
        getTable("MTRL", ["MTRL", "CODE", "NAME"], `MTRL IN (${list})`),
        getTable("MTRBALSHEET", ["MTRL", "WHOUSE", "IMPQTY1", "EXPQTY1"], `FISCPRD=${year} AND MTRL IN (${list}) AND WHOUSE IN (${CENTRAL_WAREHOUSES.join(",")})`),
      ]);
      for (const r of names) { const m = int(r[0]); if (m != null) info.set(m, { code: r[1] ?? "", name: r[2] ?? "" }); }
      for (const r of bal) { const m = int(r[0]); if (m != null) stock.set(m, (stock.get(m) ?? 0) + num(r[2]) - num(r[3])); }
      await sleep(250);
    }

    // μαζικές εγγραφές σε μία συναλλαγή (η βάση είναι απομακρυσμένη: μία-μία θα ήθελαν λεπτά). Οι ετικέτες «Περιλαμβάνει»
    // της διαχείρισης κρατιούνται ανά (set, γραμμή).
    const now = new Date();
    const setRows = heads.flatMap((h) => { const spcs = int(h[0]), mtrl = int(h[4]); return spcs == null || mtrl == null ? [] : [{ spcs, code: h[1] ?? "", name: h[2] ?? "", active: h[3] === "1", mtrl, fromDate: date(h[5]), finalDate: date(h[6]), syncedAt: now }]; });
    const lineRows = mine.flatMap((l) => { const spcs = int(l[0]), lineNum = int(l[1]), m = int(l[2]); return spcs == null || lineNum == null || m == null ? [] : [{ spcs, lineNum, mtrl: m, qty: num(l[3]) || 1, code: info.get(m)?.code ?? null, name: info.get(m)?.name ?? String(m), stockCentral: Math.max(0, Math.round((stock.get(m) ?? 0) * 100) / 100) }]; });
    const before = new Set((await db.s1Set.findMany({ select: { spcs: true } })).map((x) => x.spcs));
    const labels = new Map((await db.s1SetLine.findMany({ where: { label: { not: null } }, select: { spcs: true, lineNum: true, label: true } })).map((x) => [`${x.spcs}:${x.lineNum}`, x.label]));
    const keep = setRows.map((x) => x.spcs);
    const [gone] = await db.$transaction([
      db.s1Set.deleteMany({ where: { spcs: { notIn: keep } } }),
      db.s1SetLine.deleteMany({ where: { spcs: { in: keep } } }),
      db.s1Set.deleteMany({ where: { spcs: { in: keep } } }),
      db.s1Set.createMany({ data: setRows }),
      db.s1SetLine.createMany({ data: lineRows.map((x) => ({ ...x, label: labels.get(`${x.spcs}:${x.lineNum}`) ?? null })) }),
    ]);
    const created = keep.filter((x) => !before.has(x)).length, updated = keep.length - created;
    return { fetched: heads.length + mine.length, created, updated, missing: gone.count, skipped: 0 };
  });
}

/**
 * Τα «Set ειδών» ως προϊόντα του καταλόγου (docs/superpowers/specs/2026-10-16-item-sets-design.md):
 * - ένα προϊόν ανά σετ (erpCode SET-<spcs>, πηγή softone-set) με τιμή = Σ τιμών web των μελών, απόθεμα = πλήρη σετ,
 *   μάρκα / κατηγορία / ΦΠΑ από το κύριο είδος, εικόνες του κύριου την πρώτη φορά· ο τίτλος γράφεται μόνο στη δημιουργία
 *   (αλλάζει από τη διαχείριση)
 * - «Πωλείται και μόνο του» των κύριων: auto → όχι όταν είναι κύριο σε ενεργό σετ εξαρτημάτων
 * Γράφει μόνο ό,τι άλλαξε. Ασφαλές για επανάληψη.
 */
export async function projectSetProducts(): Promise<{ sets: number; created: number; updated: number; deactivated: number; mainsHidden: number }> {
  const { setErp, setPrice, setStock, setTitle, validSet, setKind } = await import("@/lib/catalog/set-core");
  const { slugify } = await import("@/lib/slug");
  const now = new Date();
  const sets = await db.s1Set.findMany({ include: { lines: { orderBy: { lineNum: "asc" } } } });
  const mtrls = [...new Set(sets.flatMap((x) => [x.mtrl, ...x.lines.map((l) => l.mtrl)]))];
  const [items, prods, existing] = await Promise.all([
    db.s1Item.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, eshopPrice: true } }),
    db.product.findMany({ where: { erpCode: { in: mtrls.map(String) } }, select: { id: true, erpCode: true, active: true, brandId: true, categoryId: true, vatRate: true, brand: { select: { name: true } } } }),
    db.product.findMany({ where: { OR: [{ kind: "set" }, { erpCode: { startsWith: "SET-" } }] }, select: { id: true, setSpcs: true, erpCode: true, price: true, stock: true, active: true, brandId: true, categoryId: true, _count: { select: { media: true } } } }),
  ]);
  const priceOf = new Map(items.map((i) => [i.mtrl, i.eshopPrice]));
  const prodOf = new Map(prods.map((p) => [Number(p.erpCode), p]));
  const bySpcs = new Map(existing.filter((e) => e.setSpcs != null).map((e) => [e.setSpcs!, e]));
  const taken = { slug: new Set((await db.product.findMany({ select: { slug: true } })).map((x) => x.slug)), sku: new Set((await db.product.findMany({ select: { sku: true } })).map((x) => x.sku)) };
  let created = 0, updated = 0;
  const mainOfParts = new Set<number>();
  const newMedia: { setId: string; mainId: string }[] = [];

  for (const set of sets) {
    const main = prodOf.get(set.mtrl);
    const kind = setKind(set.name, set.lines, set.mtrl, (m) => !!prodOf.get(m)?.active);
    const live = set.active && (!set.finalDate || set.finalDate >= now) && !!main?.active;
    if (live && kind === "parts" && validSet(set.lines, set.mtrl)) mainOfParts.add(set.mtrl);
    const price = setPrice(set.lines.map((l) => ({ price: priceOf.get(l.mtrl) ?? null, qty: l.qty, isMain: l.mtrl === set.mtrl })), kind);
    const stock = setStock(set.lines.map((l) => ({ stock: l.stockCentral, qty: l.qty, isMain: l.mtrl === set.mtrl })), kind);
    const active = live && price > 0 && validSet(set.lines, set.mtrl);
    const e = bySpcs.get(set.spcs);
    if (!main) { if (e?.active) { await db.product.update({ where: { id: e.id }, data: { active: false } }); updated++; } continue; }
    const data = { price: price > 0 ? price : null, stock, active, brandId: main.brandId, categoryId: main.categoryId, vatRate: main.vatRate };
    if (!e) {
      const title = setTitle(set.name, main.brand.name);
      let slug = `${slugify(title).slice(0, 90).replace(/-+$/, "")}-set`;
      for (let i = 2; taken.slug.has(slug); i++) slug = `${slugify(title).slice(0, 86).replace(/-+$/, "")}-set-${i}`;
      const sku = taken.sku.has(`SET-${set.code}`) ? `SET-${set.code}-${set.spcs}` : `SET-${set.code}`;
      taken.slug.add(slug); taken.sku.add(sku);
      const p = await db.product.create({ data: { ...data, erpCode: setErp(set.spcs), slug, sku, title, kind: "set", setSpcs: set.spcs, source: "softone-set", s1SyncedAt: now } });
      newMedia.push({ setId: p.id, mainId: main.id });
      created++;
    } else {
      const changed = e.price !== data.price || e.stock !== stock || e.active !== active || e.brandId !== main.brandId || e.categoryId !== main.categoryId;
      if (changed) { await db.product.update({ where: { id: e.id }, data: { ...data, s1SyncedAt: now } }); updated++; }
      if (!e._count.media) newMedia.push({ setId: e.id, mainId: main.id });
    }
  }
  // σετ που δεν υπάρχουν πια στο SoftOne → ανενεργά
  const alive = new Set(sets.map((x) => x.spcs));
  const gone = existing.filter((e) => e.setSpcs != null && !alive.has(e.setSpcs) && e.active).map((e) => e.id);
  if (gone.length) await db.product.updateMany({ where: { id: { in: gone } }, data: { active: false } });

  // εικόνες του κύριου ως αφετηρία (ίδια αρχεία· η διαχείριση τις αλλάζει ανεξάρτητα)
  for (const m of newMedia) {
    const imgs = await db.media.findMany({ where: { productId: m.mainId, kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, select: { url: true, alt: true, sortNo: true, thumbUrl: true, width: true, height: true, blur: true, assetId: true } });
    if (imgs.length) await db.media.createMany({ data: imgs.map((x) => ({ ...x, productId: m.setId, kind: "image", source: "set-main" })), skipDuplicates: true });
  }

  // παραλλαγή + ιστορικό τιμής (Omnibus) για τα προϊόντα-σετ
  await db.$executeRawUnsafe(`UPDATE "PriceHistory" h SET "to" = now() FROM "Variant" v JOIN "Product" p ON p.id = v."productId" WHERE h."variantId" = v.id AND h."to" IS NULL AND p.kind = 'set' AND p.price IS NOT NULL AND v.price <> round(p.price::numeric, 2)`);
  await db.$executeRawUnsafe(`INSERT INTO "PriceHistory" (id, "variantId", price, "from") SELECT 'ph_' || md5(random()::text || v.id), v.id, round(p.price::numeric, 2), now() FROM "Variant" v JOIN "Product" p ON p.id = v."productId" WHERE p.kind = 'set' AND p.price IS NOT NULL AND v.price <> round(p.price::numeric, 2)`);
  await db.$executeRawUnsafe(`UPDATE "Variant" v SET price = round(p.price::numeric, 2), "updatedAt" = now() FROM "Product" p WHERE p.id = v."productId" AND p.kind = 'set' AND p.price IS NOT NULL AND v.price <> round(p.price::numeric, 2)`);
  await db.$executeRawUnsafe(`INSERT INTO "Variant" (id, "productId", "erpCode", axis, price, "updatedAt") SELECT 'var_' || p."erpCode", p.id, p."erpCode", '{}'::jsonb, round(p.price::numeric, 2), now() FROM "Product" p WHERE p.kind = 'set' AND p.price IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p.id) ON CONFLICT DO NOTHING`);
  await db.$executeRawUnsafe(`INSERT INTO "PriceHistory" (id, "variantId", price, "from") SELECT 'ph_' || md5(random()::text || v.id), v.id, v.price, now() FROM "Variant" v JOIN "Product" p ON p.id = v."productId" WHERE p.kind = 'set' AND NOT EXISTS (SELECT 1 FROM "PriceHistory" h WHERE h."variantId" = v.id)`);

  // «Πωλείται και μόνο του» των ειδών: yes / no ρητά, auto → όχι μόνο στα κύρια ενεργών σετ εξαρτημάτων
  const parts = [...mainOfParts].map(String);
  const mainsHidden = await db.$executeRawUnsafe(
    `UPDATE "Product" SET "soldAlone" = ("soldAloneMode" = 'yes' OR ("soldAloneMode" = 'auto' AND NOT ("erpCode" = ANY($1::text[]))))
     WHERE kind = 'item' AND "soldAlone" IS DISTINCT FROM ("soldAloneMode" = 'yes' OR ("soldAloneMode" = 'auto' AND NOT ("erpCode" = ANY($1::text[]))))`, parts);
  return { sets: sets.length, created, updated: updated + gone.length, deactivated: gone.length, mainsHidden };
}

/** Παλιό όνομα (cron / κουμπί συγχρονισμού): η προβολή των σετ ως προϊόντα. */
export const projectSetStock = async () => { const r = await projectSetProducts(); return r.created + r.updated; };
