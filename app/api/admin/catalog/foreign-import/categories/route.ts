import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { readWorkbook } from "@/lib/catalog/foreign-import/read";
import { guessFileCategories, categorySpecs } from "@/lib/catalog/foreign-import/server";
import { parseConfig, PREVIEW_ROWS } from "@/lib/catalog/foreign-import/ui-core";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_BODY = 16 * 1024 * 1024, MAX_FILE = 15 * 1024 * 1024;

/**
 * Βήμα 2, «Κατηγορίες και χαρακτηριστικά»: πρόταση κατηγορίας με AI για όλες τις γραμμές του φύλλου που δεν έχουν κατηγορία
 * (multipart: `file`, `sheet`, `headerRow`, `config`). Επιστρέφει τις προτάσεις και τα χαρακτηριστικά κάθε προτεινόμενης κατηγορίας.
 * Μόνο ανάγνωση· κάθε πάτημα είναι κλήσεις AI με κόστος, γι' αυτό τρέχει μόνο όταν το ζητήσει ο χρήστης.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα εισαγωγής προϊόντων." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "Το αρχείο ξεπερνά τα 15 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  if (file.size > MAX_FILE) return NextResponse.json({ error: "Το αρχείο ξεπερνά τα 15 MB." }, { status: 413 });
  try {
    const headerRow = Number(form.get("headerRow"));
    if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= PREVIEW_ROWS) throw new UserError("Η γραμμή επικεφαλίδας πρέπει να είναι μία από τις πρώτες 40.");
    let raw: unknown;
    try { raw = JSON.parse(String(form.get("config") ?? "")); } catch { throw new UserError("Μη έγκυρη αντιστοίχιση στηλών."); }
    const config = parseConfig(raw);
    const { sheets } = await readWorkbook(await file.arrayBuffer(), file.name);
    const sheet = sheets.find((s) => s.name === String(form.get("sheet") ?? ""));
    if (!sheet) throw new UserError("Το φύλλο δεν βρέθηκε στο αρχείο.");
    const res = await guessFileCategories(sheet.matrix, headerRow, config);
    const specs = await categorySpecs(res.guesses.map((g) => g.categoryId));
    await audit(session.user.id, "catalog.foreign-import.category-ai", "ImportFile", file.name, null, { asked: res.asked, guesses: res.guesses.length });
    return NextResponse.json({ ...res, specs });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[foreign-import/categories]", e);
    return NextResponse.json({ error: "Κάτι πήγε στραβά με τις προτάσεις κατηγορίας — ξαναδοκίμασε." }, { status: 500 });
  }
}
