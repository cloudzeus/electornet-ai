import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { readWorkbook, findMapping } from "@/lib/catalog/foreign-import/read";
import { inspectSheet, type InspectSheet } from "@/lib/catalog/foreign-import/ui-core";
import type { SavedConfig } from "@/lib/catalog/foreign-import/core";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Εισαγωγή από ξένο Excel — βήμα 1 (multipart: `file`, .xlsx/.csv έως 15 MB). Route Handler και όχι Server Action: το
 * όριο σώματος των actions (~1 MB) δεν χωράει τιμοκαταλόγους. Επιστρέφει ανά φύλλο: πλήθος γραμμών, προτεινόμενη
 * επικεφαλίδα, τις πρώτες 40 γραμμές, τις τιμές ανά στήλη (για μάρκα/κατηγορία) και την αποθηκευμένη αντιστοίχιση των
 * επικεφαλίδων, αν υπάρχει. Καμία εγγραφή.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα εισαγωγής προϊόντων." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  try {
    const { sheets } = await readWorkbook(await file.arrayBuffer(), file.name);
    if (!sheets.length) return NextResponse.json({ error: "Το αρχείο δεν έχει κανένα φύλλο με δεδομένα." }, { status: 422 });
    const out: InspectSheet[] = [];
    for (const s of sheets) {
      const info = inspectSheet(s.matrix);
      const m = await findMapping(info.preview[info.headerRow] ?? []);
      out.push({ name: s.name, ...info, mapping: m ? { id: m.id, name: m.name, config: m.config as SavedConfig } : null });
    }
    return NextResponse.json({ fileName: file.name, sheets: out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Το αρχείο δεν διαβάστηκε." }, { status: 422 });
  }
}
