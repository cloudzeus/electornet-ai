import "server-only";
import { db } from "@/lib/db";
import { contentDims } from "./dims-from-content";
import { toRowProposal, s1Changes, s1SyncChanges, resolveDims, S1_DIM_FIELDS, type RowProposal, type S1DimField } from "./dims-missing-core";
import { DIM_MIN, DIM_MAX, KG_MIN, KG_MAX, checkDims } from "./dim-fill-core";

/**
 * «Διαστάσεις και βάρος που λείπουν»: τα προϊόντα που φαίνονται στο eshop (ενεργά) και δεν έχουν διαστάσεις ή βάρος για
 * την αποστολή (κριτήριο «dims» του ελέγχου πληρότητας), η μαζική αναζήτηση τιμών (ό,τι έχουμε ήδη → EPREL → internet)
 * και η αποθήκευση: eshop πάντα, SoftOne όταν είναι ανοιχτή η εγγραφή ειδών (CCC και τυπικά πεδία, μόνο όπου είναι κενά).
 * Τα σετ δεν μπαίνουν: παίρνουν διαστάσεις και βάρος από τα μέλη τους.
 */
export interface MissingRow { id: string; sku: string; title: string; brand: string; category: string; missDims: boolean; missWeight: boolean; eprelChecked: boolean; webChecked: boolean }
export interface MissingOverview { active: number; complete: number; sets: number; rows: MissingRow[] }

export async function missingOverview(): Promise<MissingOverview> {
  const [active, all] = await Promise.all([
    db.product.count({ where: { active: true } }),
    db.product.findMany({
      where: { active: true, publishMissing: { has: "dims" } }, orderBy: [{ brand: { name: "asc" } }, { title: "asc" }],
      select: { id: true, sku: true, title: true, erpCode: true, source: true, setSpcs: true, weightKg: true, eprelStatus: true, brand: { select: { name: true } }, category: { select: { name: true } }, dimensions: { where: { source: "manual" }, select: { id: true } }, enrichments: { where: { source: { in: ["icecat", "web"] } }, select: { id: true } } },
    }),
  ]);
  const list = all.filter((p) => p.setSpcs == null);
  const mtrls = list.filter((p) => p.source === "softone" && /^\d+$/.test(p.erpCode)).map((p) => Number(p.erpCode));
  const items = mtrls.length ? await db.s1Item.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, weightKg: true, widthCm: true, heightCm: true, lengthCm: true } }) : [];
  const io = new Map(items.map((i) => [String(i.mtrl), i]));
  const rows = list.map((p) => {
    const it = io.get(p.erpCode);
    return {
      id: p.id, sku: p.sku, title: p.title, brand: p.brand.name, category: p.category.name,
      missDims: !(it?.widthCm && it.heightCm && it.lengthCm) && !p.dimensions.length,
      missWeight: !((it?.weightKg ?? 0) > 0 || (p.weightKg ?? 0) > 0),
      eprelChecked: p.eprelStatus != null, webChecked: p.enrichments.length > 0,
    };
  });
  return { active, complete: active - all.length, sets: all.length - list.length, rows };
}

export async function proposeFor(productId: string): Promise<RowProposal> {
  const s = await contentDims(productId);
  const e = s.current.erp;
  return toRowProposal(productId, { dims: !(e?.w && e.h && e.l) && !s.current.manual, weight: !((e?.kg ?? 0) > 0 || (s.current.weightKg ?? 0) > 0) }, s.proposal);
}

export type SearchMode = "content" | "eprel" | "web";
export interface SearchResult { proposals: RowProposal[]; failed: { id: string; error: string }[]; costUsd: number }

/** Μία παρτίδα αναζήτησης. `eprel` και `web` φέρνουν πρώτα νέα στοιχεία (αποθηκεύονται ως χαρακτηριστικά / γραμμές διαστάσεων) και μετά ξαναδιαβάζουν. */
export async function searchBatch(ids: string[], mode: SearchMode): Promise<SearchResult> {
  const out: SearchResult = { proposals: [], failed: [], costUsd: 0 };
  let i = 0;
  const one = async (id: string) => {
    if (mode === "eprel") { const { matchProductEprel } = await import("./eprel-match"); await matchProductEprel(id); } // «δεν βρέθηκε» / κατηγορία χωρίς ετικέτα: συνεχίζει με ό,τι υπάρχει
    if (mode === "web") { const { enrichProduct } = await import("./enrich-run"); out.costUsd += (await enrichProduct(id))?.costUsd ?? 0; }
    out.proposals.push(await proposeFor(id));
  };
  const work = async () => { while (i < ids.length) { const id = ids[i++]; await one(id).catch((e: Error) => { console.error("[dims-missing]", mode, id, e); out.failed.push({ id, error: e.message.slice(0, 160) }); }); } };
  await Promise.all(Array.from({ length: mode === "content" ? 6 : mode === "eprel" ? 3 : 2 }, work));
  return out;
}

type Src = { label: string; raw: string };
export interface SavePick { productId: string; dims?: (Src & { w: number; h: number; d: number }) | null; weight?: (Src & { kg: number }) | null }

/** Αποθήκευση στο eshop: χειροκίνητη γραμμή διαστάσεων και βάρος προϊόντος, με την πηγή τους. */
export async function saveEshopDims(pick: SavePick, typeName: string) {
  const label = (x: Src) => `${x.label} · ${x.raw}`.slice(0, 190);
  const { productId, dims, weight } = pick;
  if (dims) {
    const data = { w: dims.w, h: dims.h, d: dims.d, kind: "product", rawKey: "Από το περιεχόμενο", rawValue: label(dims), warning: checkDims(dims, typeName) };
    await db.productDimension.upsert({ where: { productId_source: { productId, source: "manual" } }, create: { productId, source: "manual", ...data }, update: data });
  }
  if (weight) await db.product.update({ where: { id: productId }, data: { weightKg: weight.kg, weightSource: label(weight) } });
}

export function pickError(p: SavePick): string | null {
  const inRange = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  if (!p.dims && !p.weight) return "Διάλεξε διαστάσεις ή βάρος.";
  if (p.dims && ![p.dims.w, p.dims.h, p.dims.d].every((n) => inRange(n, DIM_MIN, DIM_MAX))) return `Οι διαστάσεις πρέπει να είναι ${DIM_MIN}–${DIM_MAX} εκ.`;
  if (p.weight && !inRange(p.weight.kg, KG_MIN, KG_MAX)) return `Το βάρος πρέπει να είναι ${KG_MIN}–${KG_MAX} κιλά.`;
  return null;
}

export interface SaveOutcome { id: string; ok: boolean; /** written: γράφτηκε στο SoftOne · off: κλειστή εγγραφή · none: δεν είναι είδος SoftOne ή τίποτα κενό · error */ s1: "written" | "off" | "none" | "error"; message?: string }

/** Ένα προϊόν: SoftOne πρώτα (αν είναι ανοιχτό), μετά eshop. Αποτυχία του SoftOne δεν ακυρώνει το eshop — αναφέρεται. */
export async function saveOne(pick: SavePick, s1On: boolean): Promise<SaveOutcome> {
  const bad = pickError(pick);
  if (bad) return { id: pick.productId, ok: false, s1: "none", message: bad };
  const p = await db.product.findUnique({ where: { id: pick.productId }, select: { erpCode: true, source: true, setSpcs: true, category: { select: { name: true } } } });
  if (!p) return { id: pick.productId, ok: false, s1: "none", message: "Το προϊόν δεν βρέθηκε." };
  if (p.setSpcs != null) return { id: pick.productId, ok: false, s1: "none", message: "Σετ: οι διαστάσεις και το βάρος βγαίνουν από τα μέλη του." };
  let s1: SaveOutcome["s1"] = "none", message: string | undefined;
  const mtrl = p.source === "softone" && /^\d+$/.test(p.erpCode) ? Number(p.erpCode) : null;
  if (mtrl && !s1On) s1 = "off";
  else if (mtrl) {
    const { readFields, writeItem } = await import("@/lib/softone/item-write");
    const live = await readFields(mtrl, S1_DIM_FIELDS).catch(() => null);
    if (!live) { s1 = "error"; message = "Το είδος δεν διαβάστηκε από το SoftOne."; }
    else {
      const changes = s1Changes(live, { dims: pick.dims, kg: pick.weight?.kg });
      if (Object.keys(changes).length) {
        const w = await writeItem(mtrl, changes);
        if (w.ok) {
          s1 = "written";
          const [{ syncItem }, { projectItem }] = await Promise.all([import("@/lib/softone/catalog"), import("@/lib/softone/project")]);
          await syncItem(mtrl, "manual"); await projectItem(mtrl);
        } else { s1 = "error"; message = w.error ?? "Η εγγραφή στο SoftOne απέτυχε."; }
      }
    }
  }
  await saveEshopDims(pick, p.category.name);
  return { id: pick.productId, ok: true, s1, message };
}

/**
 * Συγχρονισμός με το SoftOne και προς τις δύο κατευθύνσεις, για όλα τα ενεργά είδη (όχι σετ). Κανόνας 17/11/2026: όπου κι
 * αν έχει καταχωριστεί μια τιμή, ενημερώνονται και τα τρία σημεία — τυπικά πεδία, CCC και eshop. Στο SoftOne: τα CCC (Βάρος, Μήκος, Πλάτος, Ύψος) και τα τυπικά (Μάζα, Διάσταση 1-3)
 * συμπληρώνουν το ένα το άλλο, και ό,τι λείπει και από τα δύο έρχεται από το eshop — μόνο σε κενά πεδία. Στο eshop:
 * το είδος ξαναδιαβάζεται από το SoftOne και γεμίζουν τα κενά δικά του πεδία (χειροκίνητες διαστάσεις, βάρος προϊόντος). Το `syncPlan` βρίσκει ποια χρειάζονται δουλειά με μία μαζική ανάγνωση.
 */
const SYNC_WHERE = { active: true, source: "softone", setSpcs: null };
const SYNC_SELECT = { id: true, erpCode: true, weightKg: true, category: { select: { name: true } }, dimensions: { where: { source: "manual" }, select: { w: true, h: true, d: true } } } as const;
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return n > 0 ? n : null; };

export async function syncPlan(s1On: boolean): Promise<string[]> {
  const ps = (await db.product.findMany({ where: SYNC_WHERE, select: SYNC_SELECT })).filter((p) => /^\d+$/.test(p.erpCode));
  const mtrls = ps.map((p) => Number(p.erpCode));
  const [{ getTable }, { ITEM_FIELDS }, mirror] = await Promise.all([import("@/lib/softone/lookups"), import("@/lib/softone/item-write"), db.s1Item.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true } })]);
  const live = new Map<number, Record<S1DimField, string>>();
  for (let i = 0; i < mtrls.length; i += 300) for (const r of await getTable("MTRL", ["MTRL", ...S1_DIM_FIELDS.map((k) => ITEM_FIELDS[k].s1)], `MTRL IN (${mtrls.slice(i, i + 300).join(",")})`)) live.set(Number(r[0]), Object.fromEntries(S1_DIM_FIELDS.map((k, j) => [k, r[j + 1] ?? ""])) as Record<S1DimField, string>);
  const mo = new Map(mirror.map((m) => [m.mtrl, m]));
  return ps.filter((p) => {
    const l = live.get(Number(p.erpCode)), m = mo.get(Number(p.erpCode));
    if (!l) return false;
    const stale = (["weightKg", "lengthCm", "widthCm", "heightCm"] as const).some((k) => num(l[k]) !== (m?.[k] && m[k]! > 0 ? m[k] : null));
    const eshop = { dims: p.dimensions[0] ?? null, kg: p.weightKg }, r = resolveDims(l, eshop);
    return stale || (!!r.dims && !eshop.dims) || (r.kg != null && eshop.kg == null) || (s1On && Object.keys(s1SyncChanges(l, eshop)).length > 0);
  }).map((p) => p.id);
}

export async function syncRun(ids: string[], s1On: boolean): Promise<{ done: number; written: number; failed: { id: string; error: string }[] }> {
  const out = { done: 0, written: 0, failed: [] as { id: string; error: string }[] };
  const [{ readFields, writeItem }, { syncItem }, { projectItem }] = await Promise.all([import("@/lib/softone/item-write"), import("@/lib/softone/catalog"), import("@/lib/softone/project")]);
  for (const p of await db.product.findMany({ where: { ...SYNC_WHERE, id: { in: ids } }, select: SYNC_SELECT })) {
    try {
      const mtrl = Number(p.erpCode);
      const live = await readFields(mtrl, S1_DIM_FIELDS);
      if (!live) throw new Error("Το είδος δεν διαβάστηκε από το SoftOne.");
      const eshop = { dims: p.dimensions[0] ?? null, kg: p.weightKg }, r = resolveDims(live, eshop);
      const changes = s1On ? s1SyncChanges(live, eshop) : {};
      if (Object.keys(changes).length) { const w = await writeItem(mtrl, changes); if (!w.ok) throw new Error(w.error ?? "Η εγγραφή στο SoftOne απέτυχε."); out.written++; }
      // το είδος ξαναδιαβάζεται μόνο όταν γράφτηκε κάτι ή ο καθρέφτης μας διαφέρει από το SoftOne (αλλιώς ~2″ χαμένα ανά είδος)
      const m = await db.s1Item.findUnique({ where: { mtrl }, select: { weightKg: true, lengthCm: true, widthCm: true, heightCm: true } });
      const stale = (["weightKg", "lengthCm", "widthCm", "heightCm"] as const).some((k) => num(live[k]) !== (m?.[k] && m[k]! > 0 ? m[k] : null));
      if (Object.keys(changes).length || stale) { await syncItem(mtrl, "manual"); await projectItem(mtrl); }
      // τα δικά μας πεδία του eshop, όπου είναι κενά· τιμές του SoftOne εκτός ορίων (π.χ. παλιές σε μέτρα) δεν αντιγράφονται
      const src = { label: "SoftOne", raw: "συγχρονισμός" };
      const fill: SavePick = { productId: p.id, dims: r.dims && !eshop.dims ? { ...r.dims, ...src } : null, weight: r.kg != null && eshop.kg == null ? { kg: r.kg, ...src } : null };
      if (!pickError(fill)) await saveEshopDims(fill, p.category.name);
      out.done++;
    } catch (e) { console.error("[dims-missing] sync", p.id, e); out.failed.push({ id: p.id, error: (e as Error).message.slice(0, 160) }); }
  }
  return out;
}
