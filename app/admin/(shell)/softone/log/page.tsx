import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { S1LOG_FILTERS, S1LogView } from "@/components/admin/softone/S1LogView";

export const metadata = { title: "Καταγραφή κλήσεων SoftOne" };
export const dynamic = "force-dynamic";
const dayAgo = () => new Date(Date.now() - 864e5);

/**
 * Κάθε κλήση προς το SoftOne (σύνδεση, αναγνώσεις, εγγραφές, iSite), νεότερη πρώτα, με το αίτημα και την απάντηση. Γράφεται
 * από το lib/softone.ts για όλες τις κλήσεις· ένα σφάλμα φεύγει και με email στον τεχνικό υπεύθυνο (lib/softone/log.ts).
 */
export default async function S1LogPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; id?: string }> }) {
  await requirePermission("settings.integrations.write");
  const sp = await searchParams;
  const f = S1LOG_FILTERS.some(([k]) => k === sp.f) ? sp.f! : "all", q = (sp.q ?? "").trim().slice(0, 80);
  const where = {
    ...(f === "errors" ? { ok: false } : f === "writes" ? { write: true } : {}),
    ...(q ? { OR: [{ service: { contains: q, mode: "insensitive" as const } }, { object: { contains: q, mode: "insensitive" as const } }, { source: { contains: q, mode: "insensitive" as const } }, { error: { contains: q, mode: "insensitive" as const } }, { key: q }] } : {}),
  };
  const day = dayAgo();
  // χωρίς τον πίνακα (πριν εφαρμοστεί το SQL) η σελίδα το λέει, δεν σκάει
  const data = await Promise.all([
    db.s1Log.findMany({ where, orderBy: { at: "desc" }, take: 150, select: { id: true, at: true, service: true, object: true, key: true, write: true, ok: true, error: true, ms: true, source: true, bytes: true } }),
    db.s1Log.count({ where: { at: { gte: day } } }), db.s1Log.count({ where: { at: { gte: day }, ok: false } }), db.s1Log.count({ where: { at: { gte: day }, write: true } }),
    db.s1Log.aggregate({ where: { at: { gte: day } }, _avg: { ms: true } }),
    sp.id ? db.s1Log.findUnique({ where: { id: sp.id } }) : null,
  ]).then(([rows, n24, err24, wr24, avg, one]) => ({ rows, n24, err24, wr24, avgMs: Math.round(avg._avg.ms ?? 0), one }), () => null);
  return <S1LogView data={data} f={f} q={q} id={sp.id} />;
}
