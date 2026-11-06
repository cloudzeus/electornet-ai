"use server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { allShippingFacts, saveBulkyRules, shippingFacts, tallyShipping } from "@/lib/shipping/bulky-server";
import { decideShipping, normalizeBulkyRules } from "@/lib/shipping/bulky";
import { saveAsapRules } from "@/lib/shipping/asap-express-server";
import { asapEligible, normalizeAsapRules } from "@/lib/shipping/asap-express";

/** Αποθήκευση των κανόνων «μεγάλων συσκευών» (κατηγορίες, όρια βάρους / μεγέθους, θυρίδα). */
export async function saveBulkyRulesAction(raw: unknown) {
  const user = await requirePermission("settings.write");
  const { before, after } = await saveBulkyRules(raw, user.id);
  await audit(user.id, "shipping.bulky.save", "Setting", "shipping.bulky", before, after);
  revalidatePath("/admin/apostoles");
  return { ok: true as const, categories: Object.keys(after.categories).length };
}

/** Τι θα γίνει με αυτούς τους κανόνες (πριν την αποθήκευση): πλήθη σε όλο τον ενεργό κατάλογο. */
export async function previewShippingAction(raw: unknown) {
  await requirePermission("catalog.products.read");
  const t = tallyShipping(await allShippingFacts(), normalizeBulkyRules(raw));
  return { courier: t.courier, freight: t.freight, store: t.store, locker: t.locker, unknown: t.unknown, storeByCat: t.storeByCat, freightByCat: t.freightByCat };
}

/** «Γιατί πάει έτσι;» — αναζήτηση προϊόντος (τίτλος, SKU, κωδικός ERP, barcode) και η απόφαση με αυτούς τους κανόνες. */
export async function checkShippingAction(q: string, raw: unknown) {
  await requirePermission("catalog.products.read");
  const term = q.trim();
  if (term.length < 2) return [];
  const found = await db.product.findMany({
    where: { active: true, OR: [{ title: { contains: term, mode: "insensitive" } }, { sku: { contains: term, mode: "insensitive" } }, { erpCode: term }, { ean: term }] },
    take: 6, orderBy: { title: "asc" }, select: { id: true, title: true, sku: true },
  });
  const facts = new Map((await shippingFacts(found.map((p) => p.id))).map((f) => [f.id, f]));
  const rules = normalizeBulkyRules(raw);
  return found.map((p) => {
    const f = facts.get(p.id);
    const v = f ? decideShipping({ categoryPath: f.path, weightKg: f.weightKg, dimsCm: f.dimsCm }, rules) : null;
    return { id: p.id, title: p.title, sku: p.sku, courier: v?.courier ?? true, freight: v?.freight ?? true, locker: v?.locker ?? false, reason: v?.reason ?? null, weightKg: f?.weightKg ?? null, dimsCm: f?.dimsCm ?? null };
  });
}

/** ASAP Express (Αττική): διακόπτης, ΤΚ, ζώνες, κατηγορίες, εξαιρέσεις SKU. */
export async function saveAsapRulesAction(raw: unknown) {
  const user = await requirePermission("settings.write");
  const { before, after } = await saveAsapRules(raw, user.id);
  await audit(user.id, "shipping.asap.save", "Setting", "shipping.asap", before, after);
  revalidatePath("/admin/apostoles");
  return { ok: true as const };
}

const YES = /^(☑|✓|✔|x|1|ναι|nai|yes|y|true|on)$/i, NO = /^(☐|✗|0|οχι|όχι|oxi|no|n|false|off)$/i;
/**
 * Εισαγωγή εξαιρέσεων από Excel / CSV: στήλη SKU (ή «Κωδικός») και στήλη ASAP (☑ / ☐, Ναι / Όχι, 1 / 0).
 * Δεν αποθηκεύει: επιστρέφει τι διαβάστηκε, για να το δει ο χρήστης πριν πατήσει «Αποθήκευση».
 */
export async function importAsapSkusAction(form: FormData) {
  await requirePermission("settings.write");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Διάλεξε αρχείο Excel ή CSV." };
  if (file.size > 5_000_000) return { ok: false as const, error: "Το αρχείο ξεπερνά τα 5 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  let rows: string[][];
  if (/\.csv$/i.test(file.name)) {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    rows = text.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
  } else {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]); } catch { return { ok: false as const, error: "Δεν διαβάζεται ως Excel (.xlsx)." }; }
    const ws = wb.worksheets[0];
    rows = [];
    ws?.eachRow((r) => rows.push((r.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "text" in v ? String((v as { text: unknown }).text) : v == null ? "" : String(v)).trim())));
  }
  const h = rows.slice(0, 15).findIndex((r) => r.some((c) => /^(sku|κωδικός|κωδικος|code)$/i.test(c)) && r.some((c) => /asap|courier|express/i.test(c)));
  if (h < 0) return { ok: false as const, error: "Δεν βρέθηκαν στήλες «SKU» και «ASAP» στην κεφαλίδα." };
  const iSku = rows[h].findIndex((c) => /^(sku|κωδικός|κωδικος|code)$/i.test(c)), iOn = rows[h].findIndex((c) => /asap|courier|express/i.test(c));
  const read = new Map<string, boolean>();
  let skipped = 0;
  for (const r of rows.slice(h + 1)) {
    const sku = (r[iSku] ?? "").trim(), v = (r[iOn] ?? "").trim();
    if (!sku) continue;
    if (YES.test(v)) read.set(sku, true); else if (NO.test(v)) read.set(sku, false); else skipped++;
  }
  if (read.size > 20_000) return { ok: false as const, error: "Έως 20.000 γραμμές." };
  const known = new Set((await db.product.findMany({ where: { sku: { in: [...read.keys()] } }, select: { sku: true } })).map((p) => p.sku));
  const skus = Object.fromEntries([...read].filter(([s]) => known.has(s)));
  return { ok: true as const, skus, unknown: [...read.keys()].filter((s) => !known.has(s)).slice(0, 50), unknownCount: [...read.keys()].filter((s) => !known.has(s)).length, skipped };
}

/** Επιλέξιμα προϊόντα με αυτούς τους κανόνες (για τη σελίδα, πριν την αποθήκευση). */
export async function previewAsapAction(raw: unknown) {
  await requirePermission("catalog.products.read");
  const rules = normalizeAsapRules(raw);
  const [facts, prods] = await Promise.all([allShippingFacts(), db.product.findMany({ where: { active: true }, select: { id: true, sku: true } })]);
  const sku = new Map(prods.map((p) => [p.id, p.sku]));
  let eligible = 0, noDims = 0;
  for (const f of facts) if (asapEligible(f.path, sku.get(f.id), rules)) { eligible++; if (!f.weightKg || !f.dimsCm) noDims++; }
  return { eligible, noDims, total: facts.length };
}
