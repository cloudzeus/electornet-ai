import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { downloadBackup } from "@/lib/backup/run";

/** Super admin: download one backup file (proxied from Bunny Storage with the private key; never a public URL). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSuperAdmin();
  const { id } = await ctx.params;
  const f = await downloadBackup(id);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  await audit(user.id, "backup.download", "BackupRun", id, null, { filename: f.filename });
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${f.filename}"`, "cache-control": "no-store" } });
}
