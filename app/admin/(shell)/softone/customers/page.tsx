import Link from "next/link";
import { Users, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { purchaseStats } from "@/lib/softone/purchases";
import { PurchaseSyncButtons } from "./PurchaseSyncButtons";

export const metadata = { title: "Πελάτες ERP" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("el-GR");
const isRunning = (runs: { ok: boolean; error: string | null; ms: number; at: Date }[]) => { const now = Date.now(); return runs.some((r) => !r.ok && !r.error && r.ms === 0 && now - r.at.getTime() < 60 * 60_000); };
const when = (d: Date | null | undefined) => (d ? d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Πελάτες του eshop από το SoftOne. Το σημερινό eshop (nopCommerce) κρατά τους λογαριασμούς στη δική του βάση· στο SoftOne
 * φτάνουν οι παραγγελίες και τα παραστατικά, με τον αγοραστή γραμμένο πάνω τους. Από εκεί χτίζονται πελάτες, αγορές,
 * συσκευές και εγγυήσεις στο νέο eshop.
 */
export default async function ErpCustomersPage() {
  await requirePermission("settings.integrations.write");
  let stats: Awaited<ReturnType<typeof purchaseStats>> | null = null, schemaError = false;
  try { stats = await purchaseStats(); } catch { schemaError = true; }
  const runs = await db.s1SyncRun.findMany({ where: { kind: "cust-purchases" }, orderBy: { at: "desc" }, take: 8 });
  const running = isRunning(runs);
  const tile = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl border border-eu-line bg-white p-3 grid gap-0.5 min-w-0"><span className="text-eu-muted text-[length:var(--fs-12)] font-bold">{label}</span><span className="font-heading font-bold text-eu-ink text-[length:var(--fs-22)] tabular-nums">{value}</span>{sub && <span className="text-eu-muted text-[length:var(--fs-12)]">{sub}</span>}</div>
  );
  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden /> SoftOne</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Πελάτες ERP → πελάτες eshop</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[75ch]">Οι παραγγελίες και τα παραστατικά του σημερινού eshop διαβάζονται από το SoftOne (μόνο ανάγνωση) και γίνονται <strong>πελάτες με πλήρες ιστορικό αγορών, συσκευές και εγγυήσεις</strong>. Λιανική: ο αγοραστής από τα στοιχεία αποστολής, ταίριασμα με το κινητό. Τιμολόγιο: ο πελάτης του SoftOne (TRDR, ΑΦΜ). Τα παραστατικά προς τα καταστήματα-μέλη μένουν έξω.</p>
      </div>
      {schemaError ? (
        <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />Οι πίνακες αγορών δεν υπάρχουν ακόμη στη βάση — χρειάζεται εφαρμογή του σχήματος (prisma db push).</p>
      ) : stats && (
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11rem),1fr))]">
          {tile("Πελάτες eshop", n(stats.customers), `${n(stats.fromHistory)} από το ιστορικό του SoftOne`)}
          {tile("Αγορές", n(stats.purchases), Object.entries(stats.byKind).map(([k, v]) => `${{ order: "παραγγελίες", receipt: "αποδείξεις", invoice: "τιμολόγια", credit: "πιστωτικά" }[k] ?? k} ${n(v)}`).join(" · ") || "—")}
          {tile("Συσκευές από αγορές", n(stats.devices), "με εγγύηση από την ημερομηνία αγοράς")}
          {tile("Τελευταία αλλαγή", when(stats.cursor), stats.lastFullAt ? `πλήρης: ${when(stats.lastFullAt)}` : "πλήρης: ποτέ")}
          {tile("Διευθύνσεις με geodata", n(stats.geocoded), `${n(stats.geoPending)} σε αναμονή · ${n(stats.geoMissed)} δεν βρέθηκαν`)}
        </div>
      )}
      <section className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Συγχρονισμός</h3>
        <PurchaseSyncButtons running={running} ready={!schemaError} />
        {runs.length > 0 && (
          <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-13)]">
            {runs.map((r) => <li key={r.id} className="flex flex-wrap gap-x-3 border-t border-eu-line-2 pt-1"><span className="tabular-nums">{when(r.at)}</span><span className={r.error ? "text-eu-red font-bold" : r.ok ? "text-eu-green font-bold" : "text-eu-ink-3"}>{r.error ? "σφάλμα" : r.ok ? "ok" : "τρέχει"}</span><span className="text-eu-muted">{r.trigger} · {n(r.fetched)} παραστατικά · {n(r.created)} νέα · {n(r.updated)} ενημερώσεις · {n(r.missing)} εκτός (μέλη) · {Math.round(r.ms / 1000)} s</span>{r.error && <span className="text-eu-red basis-full">{r.error}</span>}</li>)}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-1">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Λογαριασμοί του σημερινού eshop (nopCommerce)</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Email, κωδικοί σύνδεσης, newsletter και διευθύνσεις των λογαριασμών υπάρχουν μόνο στη βάση του nopCommerce. Με την εξαγωγή του (Customers → Export) θα ενωθούν με τους πελάτες εδώ — με ταίριασμα email / κινητού / ΑΦΜ.</p>
        <div className="flex flex-wrap gap-x-4"><Link href="/admin/customers/import" className="font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline w-fit min-h-11 inline-flex items-center">Εισαγωγή από nopCommerce →</Link><Link href="/admin/customers?f=history" className="font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline w-fit min-h-11 inline-flex items-center">Δες τους πελάτες από το ιστορικό →</Link></div>
      </section>
    </div>
  );
}
