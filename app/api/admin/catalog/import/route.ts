import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import ExcelJS from "exceljs";
import { ensureFreshSpecGroups, parseWorkbook, cellText, type SheetMeta } from "@/lib/catalog/supplier-sheet";
import { parseMediaWorkbook, planMedia, applyMedia } from "@/lib/catalog/supplier-media";
import { planImport, applyImport, type ImportOptions } from "@/lib/catalog/supplier-import";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { resetCatalogCache } from "@/lib/data/db-catalog";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Εισαγωγή από template προμηθευτή — multipart: `file` (.xlsx), `brandId`, `toSoftone`, `activate`, και:
 *   χωρίς `keys`  → σχέδιο: τι θα γίνει σε κάθε γραμμή, ΧΩΡΙΣ καμία εγγραφή
 *   με `keys` (JSON) → εκτελεί αυτές τις γραμμές (η οθόνη στέλνει μικρές παρτίδες για να δείχνει πρόοδο)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "Δεκτά μόνο αρχεία .xlsx (τα templates που κατεβάζεις από εδώ)." }, { status: 415 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Μέγιστο μέγεθος 20 MB." }, { status: 413 });
  const opts: ImportOptions = { brandId: String(form.get("brandId") ?? "") || undefined, toSoftone: form.get("toSoftone") === "1", activate: form.get("activate") === "1" };
  if (opts.toSoftone) {
    if (!can(session.user.permissions, "catalog.sync.run")) return NextResponse.json({ error: "Για εγγραφή στο SoftOne χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." }, { status: 403 });
    if (!(await itemWriteEnabled())) return NextResponse.json({ error: "Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne)." }, { status: 409 });
  }
  try {
    const keysRaw = form.get("keys");
    const buf = await file.arrayBuffer();
    // Αρχείο φωτογραφιών / βίντεο: δικός του έλεγχος και εκτέλεση (δεν αγγίζει στοιχεία ούτε το SoftOne)
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    let meta: SheetMeta | null = null;
    try { meta = JSON.parse(cellText(wb.getWorksheet("_meta")?.getCell("A1").value ?? null) || "null"); } catch { meta = null; }
    if (meta?.kind === "media") {
      const replace = form.get("replace") === "1";
      const m = await parseMediaWorkbook(wb, meta);
      if (!m.rows.length) return NextResponse.json({ error: "Το αρχείο δεν έχει καμία διεύθυνση φωτογραφίας ή βίντεο." }, { status: 422 });
      if (!keysRaw) return NextResponse.json(await planMedia(m.rows, m.warnings, meta, replace));
      const keys = (JSON.parse(String(keysRaw)) as string[]).slice(0, 3);
      const results = await applyMedia(m.rows, keys, replace, session.user.id);
      resetCatalogCache();
      await audit(session.user.id, "catalog.import.media", "Brand", meta.brandId, null, { file: file.name, replace, results: results.map((r) => ({ key: r.key, ok: r.ok, productId: r.productId })) });
      return NextResponse.json({ results });
    }
    if (!keysRaw) await ensureFreshSpecGroups();
    const parsed = await parseWorkbook(buf);
    if (!parsed.rows.length) return NextResponse.json({ error: "Το αρχείο δεν έχει καμία συμπληρωμένη γραμμή σε φύλλο κατηγορίας." }, { status: 422 });
    if (!keysRaw) return NextResponse.json(await planImport(parsed, opts));
    const keys = (JSON.parse(String(keysRaw)) as string[]).slice(0, 25);
    const results = await applyImport(parsed, opts, keys);
    resetCatalogCache();
    await audit(session.user.id, "catalog.import.apply", "Brand", parsed.meta?.brandId ?? opts.brandId ?? null, null, { file: file.name, toSoftone: opts.toSoftone, activate: opts.activate, results: results.map((r) => ({ key: r.key, ok: r.ok, mtrl: r.mtrl, productId: r.productId })) });
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Η εισαγωγή απέτυχε." }, { status: 500 });
  }
}
