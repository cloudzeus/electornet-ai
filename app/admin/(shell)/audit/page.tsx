import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { Pagination } from "@/components/admin/Pagination";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PAGE = 50;

/** Who changed what, when. Before/after JSON expandable per row. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ p?: string; entity?: string }> }) {
  await requirePermission("audit.read");
  const { p = "1", entity } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where = entity ? { entity } : {};
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { staff: { select: { name: true, email: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Ιχνηλασιμότητα</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Audit log</h2>
        </div>
        <form className="flex items-center gap-2">
          <label className="font-bold text-eu-ink text-[length:var(--fs-14)]">Οντότητα</label>
          <select name="entity" defaultValue={entity ?? ""} className="rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white">
            <option value="">όλες</option>
            {entities.map((e) => (
              <option key={e.entity} value={e.entity}>{e.entity}</option>
            ))}
          </select>
          <button type="submit" className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-navy hover:text-white">Φίλτρο</button>
        </form>
      </div>
      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[length:var(--fs-14)]">
            <thead>
              <tr className="text-left text-eu-muted">
                <th className="p-3 font-bold whitespace-nowrap">Πότε</th>
                <th className="p-3 font-bold">Ποιος</th>
                <th className="p-3 font-bold">Ενέργεια</th>
                <th className="p-3 font-bold">Οντότητα</th>
                <th className="p-3 font-bold">Αλλαγή</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-eu-line-2 align-top hover:bg-eu-surface/60">
                  <td className="p-3 whitespace-nowrap tabular-nums text-eu-ink-2">{r.createdAt.toLocaleString("el-GR")}</td>
                  <td className="p-3">
                    <div className="font-bold text-eu-ink">{r.staff?.name ?? "σύστημα"}</div>
                    <div className="text-eu-muted text-[length:var(--fs-13)]">{r.staff?.email}</div>
                  </td>
                  <td className="p-3"><code className="rounded bg-eu-surface px-1.5 py-0.5 font-bold text-eu-navy">{r.action}</code></td>
                  <td className="p-3 text-eu-ink-2">{r.entity}{r.entityId && <span className="text-eu-muted"> · {r.entityId.slice(0, 8)}</span>}</td>
                  <td className="p-3">
                    <details>
                      <summary className="cursor-pointer font-bold text-eu-blue min-h-8 inline-flex items-center">before / after</summary>
                      <div className="grid @lg:grid-cols-2 gap-2 mt-2">
                        <pre className="m-0 rounded-lg bg-eu-surface p-2 text-[length:var(--fs-13)] overflow-x-auto">{JSON.stringify(r.before, null, 1) ?? "—"}</pre>
                        <pre className="m-0 rounded-lg bg-eu-surface p-2 text-[length:var(--fs-13)] overflow-x-auto">{JSON.stringify(r.after, null, 1) ?? "—"}</pre>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={5} className="p-8 text-center text-eu-muted">Καμία καταγραφή ακόμη.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-eu-line">
          <Pagination page={page} pages={pages} total={total} label="εγγραφές" href={(n) => `?p=${n}${entity ? `&entity=${encodeURIComponent(entity)}` : ""}`} />
        </div>
      </div>
    </>
  );
}
