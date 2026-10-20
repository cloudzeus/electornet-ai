import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { ensureFreshSpecGroups } from "@/lib/catalog/supplier-sheet";
import { readWorkbook, saveMapping } from "@/lib/catalog/foreign-import/read";
import { planForeign } from "@/lib/catalog/foreign-import/server";
import { parseConfig, configIds, PREVIEW_ROWS } from "@/lib/catalog/foreign-import/ui-core";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Εισαγωγή από ξένο Excel — βήμα 4, προεπισκόπηση (multipart: `file`, `sheet`, `headerRow`, `config` JSON, προαιρετικά
 * `saveAs` / `mappingId`). Ξαναδιαβάζει το αρχείο (ο browser το κρατά), αποθηκεύει την αντιστοίχιση αν ζητήθηκε και
 * φτιάχνει το σχέδιο (ImportJob «draft»). Καμία εγγραφή σε SoftOne ή κατάστημα — η εκτέλεση είναι Server Action σε παρτίδες.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα εισαγωγής προϊόντων." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  try {
    const sheetName = String(form.get("sheet") ?? "");
    const headerRow = Number(form.get("headerRow"));
    if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= PREVIEW_ROWS) throw new Error("Η γραμμή επικεφαλίδας πρέπει να είναι μία από τις πρώτες 40.");
    let raw: unknown;
    try { raw = JSON.parse(String(form.get("config") ?? "")); } catch { throw new Error("Μη έγκυρη αντιστοίχιση στηλών."); }
    const config = parseConfig(raw);
    if (!Object.keys(config.columns).length) throw new Error("Δεν αντιστοιχίστηκε καμία στήλη.");
    // Μάρκες/κατηγορίες της αντιστοίχισης πρέπει να υπάρχουν (αλλιώς θα κατέληγαν σε PendingItem με άκυρο id)
    const ids = configIds(config);
    const [nb, nc] = await Promise.all([
      ids.brands.length ? db.brand.count({ where: { id: { in: ids.brands } } }) : 0,
      ids.categories.length ? db.category.count({ where: { id: { in: ids.categories } } }) : 0,
    ]);
    if (nb !== ids.brands.length || nc !== ids.categories.length) throw new Error("Κάποια μάρκα ή κατηγορία της αντιστοίχισης δεν υπάρχει πια — ξαναδιάλεξέ τη.");

    const { sheets } = await readWorkbook(await file.arrayBuffer(), file.name);
    const sheet = sheets.find((s) => s.name === sheetName);
    if (!sheet) throw new Error("Το φύλλο δεν βρέθηκε στο αρχείο.");
    const headers = sheet.matrix[headerRow] ?? [];
    let mappingId = String(form.get("mappingId") ?? "") || null;
    const saveAs = String(form.get("saveAs") ?? "").trim();
    if (saveAs) {
      if (saveAs.length > 80) throw new Error("Το όνομα της αντιστοίχισης έχει έως 80 χαρακτήρες.");
      mappingId = (await saveMapping(saveAs, headers, config, session.user.id)).id;
    }
    await ensureFreshSpecGroups();
    const plan = await planForeign({ fileName: file.name, sheet: sheet.matrix, headerRow, config, mappingId }, session.user.id);
    return NextResponse.json({ ...plan, mappingId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Η προεπισκόπηση απέτυχε." }, { status: 422 });
  }
}
