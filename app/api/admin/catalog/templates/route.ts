import { NextResponse } from "next/server";
import JSZip from "jszip";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { buildTemplate, ensureFreshSpecGroups, type SheetKind } from "@/lib/catalog/supplier-sheet";
import { buildMediaTemplate } from "@/lib/catalog/supplier-media";

export const runtime = "nodejs";
export const maxDuration = 300;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "_");

/**
 * Templates προμηθευτών, φτιαγμένα τη στιγμή της λήψης (οι ομάδες χαρακτηριστικών ξαναδιαβάζονται από το SoftOne αν είναι παλιές).
 *   ?b=<brandId>&g=12,34&k=existing|new        → ένα .xlsx
 *   k: existing (στοιχεία υπαρχόντων) · new (κενό για νέα) · media (φωτογραφίες, banners, βίντεο) · both · all
 *   ?s=<brandId>~12.34|<brandId>~56&k=…  → .zip με τα αρχεία κάθε μάρκας
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "catalog.products.read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const k = q.get("k") ?? "existing";
  const kinds: SheetKind[] = k === "all" ? ["existing", "new", "media"] : k === "both" ? ["existing", "new"] : k === "new" ? ["new"] : k === "media" ? ["media"] : ["existing"];
  const ids = (s: string | null) => (s ?? "").split(/[,.]/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const sel = q.get("s") ? q.get("s")!.split("|").map((x) => { const [b, g] = x.split("~"); return { brandId: b, groups: ids(g) }; }) : [{ brandId: q.get("b") ?? "", groups: ids(q.get("g")) }];
  const jobs = sel.filter((x) => x.brandId && x.groups.length).flatMap((x) => kinds.map((kind) => ({ ...x, kind })));
  if (!jobs.length) return NextResponse.json({ error: "Διάλεξε μάρκα και τουλάχιστον μία κατηγορία." }, { status: 400 });
  if (jobs.length > 90) return NextResponse.json({ error: "Έως 30 μάρκες σε μία λήψη." }, { status: 400 });
  const known = await db.brand.count({ where: { id: { in: [...new Set(jobs.map((j) => j.brandId))] } } });
  if (known !== new Set(jobs.map((j) => j.brandId)).size) return NextResponse.json({ error: "Κάποια από τις μάρκες δεν βρέθηκε." }, { status: 400 });
  try {
    await ensureFreshSpecGroups();
    const files = [];
    for (const j of jobs) files.push(j.kind === "media" ? await buildMediaTemplate(j.brandId, j.groups) : await buildTemplate(j.brandId, j.groups, j.kind));
    await audit(session.user.id, "catalog.templates.download", "Brand", sel.map((x) => x.brandId).join(","), null, { jobs: jobs.map((j) => ({ brandId: j.brandId, groups: j.groups, kind: j.kind })) });
    if (files.length === 1 && !q.get("s")) {
      const f = files[0];
      return new Response(new Uint8Array(f.buffer), { headers: { "content-type": XLSX, "content-disposition": `attachment; filename="${ascii(f.filename)}"`, "cache-control": "no-store" } });
    }
    const zip = new JSZip();
    for (const f of files) zip.file(f.filename, f.buffer);
    const body = new Uint8Array(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    const name = `templates-${new Date().toISOString().slice(0, 10)}.zip`;
    return new Response(body, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Το αρχείο δεν δημιουργήθηκε." }, { status: 500 });
  }
}
