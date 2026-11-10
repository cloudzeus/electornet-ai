import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { readWorkbook } from "@/lib/catalog/foreign-import/read";
import { planDeactivation } from "@/lib/catalog/deactivate";
import { itemWriteEnabled, webFlagWriteEnabled } from "@/lib/softone/item-write";

export const runtime = "nodejs";
const MAX_BODY = 16 * 1024 * 1024, MAX_FILE = 15 * 1024 * 1024;
const TOO_BIG = "Το αρχείο ξεπερνά τα 15 MB.";
export const maxDuration = 300;

/**
 * Απενεργοποίηση από Excel — βήμα 1 (multipart: `file`, .xlsx/.csv έως 15 MB). Route Handler και όχι Server Action: το όριο
 * σώματος των actions (~1 MB) δεν χωράει αρχεία. Διαβάζει το αρχείο, βρίσκει ποιο είδος είναι κάθε γραμμή και τι είναι
 * σήμερα (στο eshop / εκτός eshop / ανενεργό / δεν βρέθηκε). Καμία εγγραφή — ούτε στη βάση, ούτε στο SoftOne.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα αλλαγής προϊόντων." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  if (file.size > MAX_FILE) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  try {
    const { sheets } = await readWorkbook(await file.arrayBuffer(), file.name);
    if (!sheets.length) return NextResponse.json({ error: "Το αρχείο δεν έχει κανένα φύλλο με δεδομένα." }, { status: 422 });
    const [rows, writeOn] = await Promise.all([planDeactivation(sheets), itemWriteEnabled()]);
    return NextResponse.json({ fileName: file.name, rows, writeOn, flagOn: webFlagWriteEnabled(), canRun: can(session.user.permissions, "catalog.sync.run") });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[deactivate/plan]", e);
    return NextResponse.json({ error: "Κάτι πήγε στραβά στην ανάγνωση του αρχείου." }, { status: 500 });
  }
}
