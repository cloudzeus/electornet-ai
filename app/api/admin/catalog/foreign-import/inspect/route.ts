import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { readWorkbook, findMapping } from "@/lib/catalog/foreign-import/read";
import { inspectSheet, type InspectSheet } from "@/lib/catalog/foreign-import/ui-core";
import type { SavedConfig } from "@/lib/catalog/foreign-import/core";

export const runtime = "nodejs";
const MAX_BODY = 16 * 1024 * 1024, MAX_FILE = 15 * 1024 * 1024;
const TOO_BIG = "Το αρχείο ξεπερνά τα 15 MB.";
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
  // Όριο πριν διαβαστεί το σώμα στη μνήμη (αρχείο 15 MB + πεδία)
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  if (file.size > MAX_FILE) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
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
    // Μόνο τα δικά μας ελληνικά μηνύματα φτάνουν στον χρήστη· τα υπόλοιπα (βάση, βιβλιοθήκες) μένουν στο log
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[foreign-import/inspect]", e);
    return NextResponse.json({ error: "Κάτι πήγε στραβά στην ανάγνωση του αρχείου." }, { status: 500 });
  }
}
