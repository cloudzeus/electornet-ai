import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { ingest } from "@/lib/media/repo";
import { audit } from "@/lib/rbac/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST multipart: file, folderId?, replaceId?, keepFormat?, frame? (product frame 1920/30px), posterAt? → MediaAssetDTO */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "cms.media.write")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > 500 * 1024 * 1024) return NextResponse.json({ error: "Μέγιστο μέγεθος 500 MB" }, { status: 413 });
  try {
    const asset = await ingest({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mime: file.type || "application/octet-stream",
      folderId: (fd.get("folderId") as string) || null,
      replaceId: (fd.get("replaceId") as string) || null,
      keepFormat: fd.get("keepFormat") === "1",
      frame: fd.get("frame") === "1",
      posterAt: fd.get("posterAt") ? Number(fd.get("posterAt")) : undefined,
      createdBy: session.user.id,
    });
    await audit(session.user.id, fd.get("replaceId") ? "media.replace" : "media.upload", "MediaAsset", asset.id, null, { filename: asset.filename, size: asset.size, storage: asset.storage });
    return NextResponse.json(asset);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "upload failed" }, { status: 500 });
  }
}
