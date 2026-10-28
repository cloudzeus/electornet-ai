import "server-only";
import { db } from "@/lib/db";

/** Επιλογές για τα <select> της εισαγωγής / των νέων ειδών / των κανόνων: μάρκες, κατηγορίες (με διαδρομή), ομάδες χαρακτηριστικών. */
export type Opt = { id: string; name: string };

/** Μάρκες με ένδειξη αν είναι συνδεδεμένες με κατασκευαστή του SoftOne. */
export async function brandOptions(): Promise<(Opt & { s1: boolean; s1Id: string | null })[]> {
  const rows = await db.brand.findMany({ select: { id: true, name: true, s1Id: true }, orderBy: { name: "asc" } });
  return rows.map((b) => ({ id: b.id, name: b.name, s1: !!b.s1Id, s1Id: b.s1Id }));
}

/** Κατηγορίες με όνομα «Γονέας › Παιδί» (το name μένει το σκέτο όνομα για την αυτόματη αντιστοίχιση). */
export async function categoryOptions(): Promise<(Opt & { path: string })[]> {
  const rows = await db.category.findMany({ select: { id: true, name: true, parentId: true } });
  const by = new Map(rows.map((c) => [c.id, c]));
  const path = (id: string) => {
    const parts: string[] = [];
    for (let c = by.get(id), n = 0; c && n < 8; c = c.parentId ? by.get(c.parentId) : undefined, n++) parts.unshift(c.name);
    return parts.join(" › ");
  };
  return rows.map((c) => ({ id: c.id, name: c.name, path: path(c.id) })).sort((a, b) => a.path.localeCompare(b.path, "el"));
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
