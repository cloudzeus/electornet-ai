import "server-only";
import { db } from "@/lib/db";
import { getTable } from "@/lib/softone/lookups";

/** Επιλογές για τα <select> της εισαγωγής / των νέων ειδών / των κανόνων: μάρκες, κατηγορίες (με διαδρομή), ομάδες χαρακτηριστικών. */
export type Opt = { id: string; name: string };

/** Μάρκες με ένδειξη αν είναι συνδεδεμένες με κατασκευαστή του SoftOne. */
export async function brandOptions(): Promise<(Opt & { s1: boolean; s1Id: string | null })[]> {
  const rows = await db.brand.findMany({ select: { id: true, name: true, s1Id: true }, orderBy: { name: "asc" } });
  return rows.map((b) => ({ id: b.id, name: b.name, s1: !!b.s1Id, s1Id: b.s1Id }));
}

/** Κατηγορίες με όνομα «Γονέας › Παιδί» (το name μένει το σκέτο όνομα για την αυτόματη αντιστοίχιση). */
export async function categoryOptions(): Promise<(Opt & { path: string; /** έχει ομάδα χαρακτηριστικών του SoftOne — μόνο εκεί μπορεί να μπει νέο είδος */ group: boolean })[]> {
  const rows = await db.category.findMany({ select: { id: true, name: true, parentId: true, erpCode: true } });
  const by = new Map(rows.map((c) => [c.id, c]));
  const path = (id: string) => {
    const parts: string[] = [];
    for (let c = by.get(id), n = 0; c && n < 8; c = c.parentId ? by.get(c.parentId) : undefined, n++) parts.unshift(c.name);
    return parts.join(" › ");
  };
  return rows.map((c) => ({ id: c.id, name: c.name, path: path(c.id), group: /^s1:g:\d+$/.test(c.erpCode ?? "") })).sort((a, b) => a.path.localeCompare(b.path, "el"));
}

/** Μονάδες μέτρησης (MTRUNIT) που έχουν σύνδεση με το SoftOne — μόνο αυτές μπορούν να μπουν σε νέο είδος. */
export async function unitOptions(): Promise<(Opt & { code: string })[]> {
  const rows = await db.unit.findMany({ where: { s1Id: { not: null }, active: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  return rows.map((u) => ({ id: u.id, code: u.code, name: u.name === u.code ? u.code : `${u.name} (${u.code})` }));
}

/** Εμπορικές σημάνσεις (MTRMARK) με σύνδεση στο SoftOne. */
export async function markOptions(): Promise<Opt[]> {
  const rows = await db.itemMark.findMany({ where: { s1Id: { not: null }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return rows.map((m) => ({ id: m.id, name: m.name }));
}

/** Ομάδες χαρακτηριστικών που βγάζουν κατηγορία στο site (όπως στα templates). */
export async function groupOptions(): Promise<{ id: number; name: string }[]> {
  const rows = await db.s1SpecGroup.findMany({ where: { missing: false, active: true, cat1: { not: null }, cat2: { not: null } }, select: { s1Id: true, name: true }, orderBy: { name: "asc" } });
  return rows.map((g) => ({ id: g.s1Id, name: g.name }));
}

/** Μονάδα μέτρησης ενός είδους του SoftOne ως κείμενο («ΤΕΜ · Τεμάχιο») — για καρτέλα και φόρμα προϊόντος. */
export async function unitLabel(unitS1Id: number | null | undefined): Promise<string | null> {
  if (unitS1Id == null) return null;
  const u = await db.unit.findUnique({ where: { s1Id: String(unitS1Id) }, select: { code: true, name: true } });
  return u ? (u.name && u.name !== u.code ? `${u.code} · ${u.name}` : u.code) : `κωδ. ${unitS1Id}`;
}

/** Λογιστικές κατηγορίες ειδών (ITEMGL: Εμπορεύματα, Υπηρεσίες, Λοιπά Υλικά) — 3 γραμμές, ανάγνωση από το SoftOne κάθε 6 ώρες. */
let acnMemo: { at: number; rows: Opt[] } | null = null;
export async function acnOptions(): Promise<Opt[]> {
  if (acnMemo && Date.now() - acnMemo.at < 6 * 3600_000) return acnMemo.rows;
  const rows = await getTable("ITEMGL", ["MTRACN", "NAME"], "SODTYPE=51").catch(() => null);
  if (!rows) return acnMemo?.rows ?? [];
  acnMemo = { at: Date.now(), rows: rows.filter((r) => Number(r[0]) > 0 && r[1]).map((r) => ({ id: r[0], name: r[1] })) };
  return acnMemo.rows;
}

export type ErpOpt = { id: string; name: string; hint?: string };
/** Επιλογές της φόρμας νέου είδους για τα πεδία ERP: προμηθευτές (TRDR), business units, λογιστικές κατηγορίες. */
export async function erpOptions(): Promise<{ suppliers: ErpOpt[]; busUnits: ErpOpt[]; acns: ErpOpt[] }> {
  const [sup, bu, acns] = await Promise.all([
    db.supplier.findMany({ select: { s1Trdr: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.businessUnit.findMany({ where: { s1Id: { not: null }, active: true }, select: { s1Id: true, name: true }, orderBy: { name: "asc" } }),
    acnOptions(),
  ]);
  return { suppliers: sup.map((s) => ({ id: String(s.s1Trdr), name: s.name, hint: s.code })), busUnits: bu.map((b) => ({ id: b.s1Id!, name: b.name })), acns };
}
