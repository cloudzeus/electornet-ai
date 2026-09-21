import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { uploadProductImage } from "@/lib/catalog/product-images";
import { IMAGE_MIMES } from "@/lib/media/process";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST multipart `file` → ανεβαίνει στη βιβλιοθήκη (φάκελος «Προϊόντα», WebP, Bunny) και δένεται στο προϊόν. Επιστρέφει ProductImageDTO. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.write")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
  if (!IMAGE_MIMES.includes(file.type) || file.type === "image/svg+xml") return NextResponse.json({ error: "Δεκτά: JPEG, PNG, WebP, AVIF." }, { status: 415 });
  if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "Μέγιστο μέγεθος 40 MB." }, { status: 413 });
  try {
    const image = await uploadProductImage(id, { bytes: Buffer.from(await file.arrayBuffer()), filename: file.name, mime: file.type }, session.user.id);
    await audit(session.user.id, "catalog.product.image.upload", "Product", id, null, { mediaId: image.id, assetId: image.assetId, filename: file.name, width: image.width, height: image.height });
    return NextResponse.json(image);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Το ανέβασμα απέτυχε." }, { status: 500 });
  }
}
