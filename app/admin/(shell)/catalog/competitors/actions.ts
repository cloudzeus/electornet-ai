"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import type { JobResult } from "@/lib/scheduler/jobs";
import { cachedCategories } from "@/lib/competitors/kotsovolos/client";
import { knownPath, suggestPath } from "@/lib/competitors/mapping-core";

const COMP = "kotsovolos";
const JOB = "competitor-kotsovolos";
const PATH = "/admin/catalog/competitors";
type Out = { ok: true } | { ok: false; error: string };

async function tree() {
  const cats = await db.category.findMany({ select: { id: true, name: true, parentId: true, active: true, productCount: true } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const kids = new Map<string, string[]>();
  for (const c of cats) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
  const grand = (id: string) => { const p = byId.get(id)?.parentId; return p ? byId.get(p)?.parentId ?? null : null; };
  const node = (id: string) => { const c = byId.get(id), p = c?.parentId ? byId.get(c.parentId) : null; return { id, parentId: c?.parentId ?? null, grandId: grand(id), name: c?.name ?? "", parentName: p?.name ?? null }; };
  /** Οι τελικές κατηγορίες (εκεί κάθονται τα προϊόντα) κάτω από μια κατηγορία, μόνο ενεργές με προϊόντα. */
  const leaves = (id: string): string[] => { const k = kids.get(id); if (k?.length) return k.flatMap(leaves); const c = byId.get(id); return c?.active && c.productCount > 0 ? [id] : []; };
  const rows = new Map((await db.competitorCategoryMap.findMany({ where: { competitor: COMP } })).map((r) => [r.categoryId, r]));
  const mapped = [...rows.values()].filter((r) => r.extPath).map((r) => ({ ...node(r.categoryId), extPath: r.extPath as string }));
  return { cats, byId, kids, grand, node, leaves, rows, mapped };
}
const knownPaths = () => cachedCategories().then((k) => k.map((x) => x.path), () => null);

/** Μετά από επιβεβαίωση: ξαναϋπολογίζει τις ανεπιβεβαίωτες προτάσεις στις αδελφές/ξαδέρφες (δεν προσθέτει κατηγορίες). */
async function refreshSuggestions(categoryId: string, known: string[]) {
  const t = await tree();
  const me = t.node(categoryId);
  for (const row of t.rows.values()) {
    if (row.extPath || row.categoryId === categoryId) continue;
    const c = t.node(row.categoryId);
    if (!((me.parentId && c.parentId === me.parentId) || (me.grandId && c.grandId === me.grandId))) continue;
    const s = suggestPath(c, t.mapped, known);
    if (s && s !== row.suggested) await db.competitorCategoryMap.update({ where: { id: row.id }, data: { suggested: s } });
  }
}

/** Προσθέτει τις τελικές κατηγορίες κάτω από `categoryId` (ή την ίδια) με πρόταση `suggested`· δεν συγκρίνονται πριν από επιβεβαίωση. */
async function addUnder(categoryId: string, userId: string, action: string): Promise<{ ok: true; added: number; suggested: number } | { ok: false; error: string }> {
  const t = await tree();
  if (!t.byId.has(categoryId)) return { ok: false, error: "Άγνωστη κατηγορία." };
  const ids = t.leaves(categoryId).filter((id) => !t.rows.has(id));
  if (!ids.length) return { ok: false, error: "Οι κατηγορίες με προϊόντα εδώ είναι ήδη στη σύγκριση." };
  const known = await knownPaths();
  let suggested = 0;
  for (const id of ids) {
    const s = known ? suggestPath(t.node(id), t.mapped, known) : null;
    if (s) suggested++;
    await db.competitorCategoryMap.create({ data: { competitor: COMP, categoryId: id, suggested: s } });
  }
  await audit(userId, action, "Category", categoryId, null, { added: ids.length, suggested });
  revalidatePath(PATH);
  return { ok: true, added: ids.length, suggested };
}

/** Πρόσθεσε μια κατηγορία μας στη σύγκριση (αν έχει υποκατηγορίες, μπαίνουν όλες). */
export async function addCategory(categoryId: string) {
  const user = await requirePermission("catalog.products.write");
  return addUnder(categoryId, user.id, "competitor.category.add");
}

/** «Πρότεινε όλες»: όλες οι τελικές κατηγορίες μιας ριζικής, με πρόταση προς έλεγχο. */
export async function suggestAll(rootCategoryId: string) {
  const user = await requirePermission("catalog.products.write");
  return addUnder(rootCategoryId, user.id, "competitor.category.suggestAll");
}

/** Βγάζει την κατηγορία από τη σύγκριση· οι τιμές που βρέθηκαν ήδη μένουν. */
export async function removeCategory(categoryId: string): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  const row = await db.competitorCategoryMap.findUnique({ where: { competitor_categoryId: { competitor: COMP, categoryId } } });
  if (!row) return { ok: true };
  await db.competitorCategoryMap.delete({ where: { id: row.id } });
  await audit(user.id, "competitor.category.remove", "Category", categoryId, { extPath: row.extPath, suggested: row.suggested }, null);
  revalidatePath(PATH);
  return { ok: true };
}

/** Επιβεβαίωση/αλλαγή: κατηγορία μας → κατηγορία Κωτσόβολου (από εδώ και πέρα συγκρίνεται). null = χωρίς επιλογή, δεν συγκρίνεται. */
export async function setCategoryMap(categoryId: string, extPath: string | null): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  if (!(await db.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) return { ok: false, error: "Άγνωστη κατηγορία." };
  const known = await knownPaths();
  if (!known) return { ok: false, error: "Δεν φόρτωσαν οι κατηγορίες του Κωτσόβολου — δοκίμασε σε λίγο." };
  if (extPath !== null && !knownPath(extPath, known)) return { ok: false, error: "Η κατηγορία δεν υπάρχει στον Κωτσόβολο." };
  const key = { competitor_categoryId: { competitor: COMP, categoryId } };
  const before = await db.competitorCategoryMap.findUnique({ where: key });
  await db.competitorCategoryMap.upsert({ where: key, update: { extPath, suggested: null }, create: { competitor: COMP, categoryId, extPath } });
  await refreshSuggestions(categoryId, known);
  await audit(user.id, "competitor.category", "Category", categoryId, before ? { extPath: before.extPath } : null, { extPath });
  revalidatePath(PATH);
  return { ok: true };
}

/** Πώς γράφεται η μάρκα στον Κωτσόβολο, ή ότι δεν τη φέρνουν (τότε δεν ψάχνεται και δεν μετρά ως αποτυχία). */
export async function setBrandMap(brandId: string, patch: { alias?: string | null; notCarried?: boolean }): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  if (!(await db.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) return { ok: false, error: "Άγνωστη μάρκα." };
  const data: { alias?: string | null; notCarried?: boolean } = {};
  if (patch.alias !== undefined) {
    const a = patch.alias?.trim() || null;
    if (a && a.length > 60) return { ok: false, error: "Το όνομα είναι πολύ μεγάλο." };
    data.alias = a;
  }
  if (patch.notCarried !== undefined) data.notCarried = !!patch.notCarried;
  const key = { competitor_brandId: { competitor: COMP, brandId } };
  const before = await db.competitorBrandMap.findUnique({ where: key });
  await db.competitorBrandMap.upsert({ where: key, update: data, create: { competitor: COMP, brandId, ...data } });
  await audit(user.id, "competitor.brand", "Brand", brandId, before ? { alias: before.alias, notCarried: before.notCarried } : null, data);
  revalidatePath(PATH);
  return { ok: true };
}

/** «Τρέξε τώρα»: ξεκινά στο παρασκήνιο (ίδιοι ρυθμοί, έως 300 κλήσεις) και επιστρέφει αμέσως. */
export async function runNow(): Promise<JobResult> {
  const user = await requirePermission("catalog.sync.run");
  const { jobStatus, runJob } = await import("@/lib/scheduler");
  const st = (await jobStatus()).find((j) => j.key === JOB);
  if (st?.running) return { ok: false, message: "Τρέχει ήδη έλεγχος — η σελίδα δείχνει την πρόοδό του." };
  const { readState } = await import("@/lib/competitors/run");
  if ((await readState()).paused) return { ok: false, message: "Η εργασία είναι σε παύση — πάτα πρώτα «Ξαναενεργοποίηση»." };
  after(async () => { await runJob(JOB, "manual"); });
  await audit(user.id, "competitor.run", "ScheduledJob", JOB, null, null);
  return { ok: true, message: "Ξεκίνησε. Έως 300 έλεγχοι με παύσεις, περίπου 25 λεπτά· η σελίδα δείχνει την πρόοδο." };
}

/** Μετά από «ο Κωτσόβολος μάς έκοψε»: σβήνει την παύση και τον μετρητή νυχτών με φρένο. */
export async function resumeJob(): Promise<Out> {
  const user = await requirePermission("catalog.sync.run");
  const { writeState } = await import("@/lib/competitors/run");
  await writeState({ paused: false, brakedNights: 0 });
  await audit(user.id, "competitor.resume", "Setting", "competitors.kotsovolos", null, null);
  revalidatePath(PATH);
  return { ok: true };
}
