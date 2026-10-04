import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { parseNopFile, saveJob, loadJob, planJob, applyCustomers, applyNewsletter, geocodeImported } from "@/lib/customers/nop-import";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Εισαγωγή από το nopCommerce.
 *   multipart `file` → ανάγνωση + έλεγχος (καμία εγγραφή): { jobId, plan }
 *   JSON { jobId, offset } → εφαρμογή μίας παρτίδας: { done, next, result }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "customers.write")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Δεν ήρθε αρχείο." }, { status: 400 });
      if (!/\.(xlsx|xml|csv|txt)$/i.test(file.name)) return NextResponse.json({ error: "Δεκτά: .xlsx ή .xml (πελάτες), .csv ή .txt (newsletter) — όπως τα βγάζει το nopCommerce." }, { status: 415 });
      if (file.size > 150 * 1024 * 1024) return NextResponse.json({ error: "Μέγιστο μέγεθος 150 MB." }, { status: 413 });
      const job = await saveJob(await parseNopFile(Buffer.from(await file.arrayBuffer()), file.name));
      await audit(session.user.id, "customers.nop.upload", "NopImport", job.id, null, { file: file.name, kind: job.kind, rows: job.kind === "customers" ? job.customers.length : job.subscribers.length });
      return NextResponse.json({ jobId: job.id, plan: await planJob(job) });
    }
    const { jobId, offset } = (await req.json()) as { jobId: string; offset: number };
    const job = await loadJob(jobId);
    if (!job) return NextResponse.json({ error: "Η εισαγωγή έληξε (ο server ξεκίνησε ξανά) — ανέβασε ξανά το αρχείο." }, { status: 410 });
    const total = job.kind === "customers" ? job.customers.length : job.subscribers.length;
    const limit = job.kind === "customers" ? 100 : 500;
    const result = job.kind === "customers" ? await applyCustomers(job, offset, limit, session.user.id) : await applyNewsletter(job, offset, limit, session.user.id);
    const next = offset + limit, done = next >= total;
    await audit(session.user.id, "customers.nop.apply", "NopImport", job.id, null, { offset, ...result, errors: result.errors.length });
    if (done && job.kind === "customers") geocodeImported();
    return NextResponse.json({ done, next: Math.min(next, total), total, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Η εισαγωγή απέτυχε." }, { status: 500 });
  }
}
