import { Receipt } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { DEFAULT_RATES, normalizeRates } from "@/lib/delivery/rates";
import { RateEditor, type RateRow } from "./RateEditor";

export const metadata = { title: "Τιμοκατάλογοι μεταφορικών" };
export const dynamic = "force-dynamic";

const BASE = [
  { key: "freight", label: "Μεταφορική / συνεργάτες (ογκώδη)" },
  { key: "acs", label: "ACS Courier" },
  { key: "geniki", label: "Γενική Ταχυδρομική" },
  { key: "elta", label: "ΕΛΤΑ Courier" },
  { key: "boxnow", label: "BOX NOW" },
];

/** Τιμοκατάλογοι: ζώνη Τ.Κ. × κλίμακα βάρους. Ο δημοσιευμένος υπολογίζει τα μεταφορικά στο checkout· τα πρακτορεία δίνουν το κόστος στη σύγκριση του κέντρου ελέγχου. */
export default async function RatesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const [rows, agencies] = await Promise.all([
    db.shippingRateTable.findMany({ orderBy: [{ carrier: "asc" }, { updatedAt: "desc" }] }).catch(() => null),
    db.carrier.findMany({ where: { role: { in: ["agency", "driver"] }, active: true, s1Missing: false }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }).catch(() => []),
  ]);
  const carriers = [...BASE, ...agencies.map((a) => ({ key: `carrier:${a.id}`, label: `${a.role === "driver" ? "Οδηγός" : "Πρακτορείο"}: ${a.name}` }))];
  const { c } = await searchParams;
  const current = carriers.find((x) => x.key === c)?.key ?? "freight";
  const list: RateRow[] = (rows ?? []).map((r) => ({ id: r.id, carrier: r.carrier, name: r.name, status: r.status, validFrom: r.validFrom?.toISOString().slice(0, 10) ?? null, updatedAt: r.updatedAt.toISOString(), data: normalizeRates(r.data) }));
  return (
    <div className="grid gap-5 min-w-0 @container">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Receipt className="size-3.5" aria-hidden /> Αποστολές</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Τιμοκατάλογοι μεταφορικών</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Η τιμή που βλέπει ο πελάτης στο checkout βγαίνει από τη ζώνη του Τ.Κ. του και το βάρος του καλαθιού (το μεγαλύτερο από πραγματικό και ογκομετρικό). Χωρίς δημοσιευμένο τιμοκατάλογο ισχύει η σταθερή τιμή των ρυθμίσεων. Στα πρακτορεία γράφεις τι πληρώνουμε εμείς, για τη σύγκριση στο κέντρο ελέγχου.</p>
      </div>
      {rows === null ? (
        <p className="m-0 rounded-2xl border border-eu-amber/40 bg-eu-amber/10 p-4 text-eu-ink text-[length:var(--fs-14)]">Οι πίνακες της δρομολόγησης δεν υπάρχουν ακόμη στη βάση. Χρειάζεται η εφαρμογή του <code>prisma/sql/2026-11-11-delivery-routing.sql</code>.</p>
      ) : (
        <RateEditor key={current} carriers={carriers} current={current} rows={list} defaults={DEFAULT_RATES} canWrite={can(user.permissions, "settings.write")} />
      )}
    </div>
  );
}
