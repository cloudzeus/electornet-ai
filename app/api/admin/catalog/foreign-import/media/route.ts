import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { UserError, mediaRows } from "@/lib/catalog/foreign-import/core";
import { readWorkbook } from "@/lib/catalog/foreign-import/read";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_FILE = 15 * 1024 * 1024;

/**
 * Εισαγωγή από ξένο Excel — το δεύτερο αρχείο μόνο με φωτογραφίες / βίντεο, μόλις το διαλέξει ο χρήστης (βήμα 1):
 * επιστρέφει τα κλειδιά και τα URL κάθε γραμμής, ώστε η ζωντανή κάρτα να δείχνει τις φωτογραφίες πριν από την προεπισκόπηση.
 * Καμία εγγραφή — στην προεπισκόπηση το αρχείο ξαναστέλνεται και δένεται με τις γραμμές στον server.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα εισαγωγής προϊόντων." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE + 1024 * 1024) return NextResponse.json({ error: "Το αρχείο ξεπερνά τα 15 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  if (file.size > MAX_FILE) return NextResponse.json({ error: "Το αρχείο ξεπερνά τα 15 MB." }, { status: 413 });
  try {
    const rows = mediaRows((await readWorkbook(await file.arrayBuffer(), file.name)).sheets.map((s) => s.matrix));
    if (!rows.length) throw new UserError(`Στο «${file.name}» δεν βρήκα φωτογραφίες: χρειάζεται στήλη-κλειδί (κωδικός, barcode ή MTRL) και στήλες με διευθύνσεις φωτογραφιών / βίντεο (π.χ. «Φωτογραφία 1»).`);
    // μόνο ό,τι χρειάζεται το ταίριασμα και η κάρτα: κλειδιά και πολυμέσα
    return NextResponse.json({ rows: rows.slice(0, 10000).map((r) => ({ rowNo: r.rowNo, fields: { mtrl: r.fields.mtrl, code: r.fields.code, factoryCode: r.fields.factoryCode, barcode: r.fields.barcode }, media: r.media })) });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[foreign-import/media]", e);
    return NextResponse.json({ error: "Το αρχείο φωτογραφιών δεν διαβάστηκε." }, { status: 500 });
  }
}
