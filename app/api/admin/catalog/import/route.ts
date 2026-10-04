import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { ensureFreshSpecGroups, parseWorkbook } from "@/lib/catalog/supplier-sheet";
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
    if (!keysRaw) await ensureFreshSpecGroups();
    const parsed = await parseWorkbook(await file.arrayBuffer());
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
