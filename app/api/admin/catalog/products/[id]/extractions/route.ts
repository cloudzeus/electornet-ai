import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { startExtraction } from "@/lib/catalog/banner-extract";

export const runtime = "nodejs";
export const maxDuration = 180;

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * POST multipart: `mediaId` (banner του προϊόντος) ή `file` (JPG/PNG/WebP — οι σελίδες PDF μετατρέπονται σε εικόνες στον browser).
 * Αναλύει το banner και επιστρέφει το πρόχειρο προς διόρθωση.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "Δεν έχεις δικαίωμα επεξεργασίας προϊόντων." }, { status: 403 });
  const { id } = await params;
  const fd = await req.formData();
  const mediaId = typeof fd.get("mediaId") === "string" ? String(fd.get("mediaId")) : undefined;
  const file = fd.get("file");
  if (!mediaId && !(file instanceof File)) return NextResponse.json({ error: "Διάλεξε banner ή ανέβασε αρχείο." }, { status: 400 });
  if (file instanceof File) {
    if (!IMAGE.includes(file.type)) return NextResponse.json({ error: "Δεκτά: JPG, PNG, WebP ή PDF." }, { status: 415 });
    if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "Μέγιστο μέγεθος 40 MB." }, { status: 413 });
  }
  try {
    const r = await startExtraction({ productId: id, userId: session.user.id, mediaId, upload: file instanceof File ? { bytes: Buffer.from(await file.arrayBuffer()), name: file.name } : undefined });
    await audit(session.user.id, "catalog.banner.extract", "Product", id, null, { extractionId: r.id, mediaId: r.mediaId, file: file instanceof File ? file.name : null, sections: r.doc.sections.length, costUsd: r.costUsd });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Η ανάλυση απέτυχε.";
    return NextResponse.json({ error: /402|credits/i.test(msg) ? "Τελείωσε το υπόλοιπο στο OpenRouter — χρειάζεται ανανέωση για να γίνει ανάλυση." : msg }, { status: 500 });
  }
}
