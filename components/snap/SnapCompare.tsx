"use client";

import { Leaf, Ruler, TrendingDown, TriangleAlert, Zap } from "lucide-react";
import { ProductImage } from "@/components/commerce/ProductImage";
import type { ApplianceId } from "@/lib/ai/tasks";
import type { SnapCompare } from "@/lib/snap/identify";

const eur = (n: number) => `${n.toLocaleString("el-GR")} €`;
const dims = (d: { w: number | null; h: number | null; d: number | null } | null | undefined) => (d?.w && d.h ? `${d.w}×${d.h}${d.d ? `×${d.d}` : ""} cm` : "—");

/**
 * Η παλιά συσκευή του πελάτη δίπλα στο προϊόν που κοιτάζει: ενεργειακή κλάση, κατανάλωση, ρεύμα τον χρόνο, CO₂,
 * διαστάσεις και αν χωράει στη θέση της. Πάνω απ' όλα, σε μία γραμμή, τι κερδίζει.
 */
export function SnapCompareCard({ c, a, photo }: { c: SnapCompare; a: ApplianceId; photo: string | null }) {
  const oldName = [a.brand, a.model].filter(Boolean).join(" ") || a.kindLabel;
  const rows: { label: string; old: string; neu: string; better?: boolean }[] = [
    { label: "Ενεργειακή κλάση", old: a.energyClass ?? "—", neu: c.product.energy ?? "—" },
    { label: "Κατανάλωση τον χρόνο", old: c.oldKwh != null ? `~${c.oldKwh} kWh` : "—", neu: c.newKwh != null ? `${c.newKwh} kWh` : "—", better: c.oldKwh != null && c.newKwh != null && c.newKwh < c.oldKwh },
    { label: "Ρεύμα τον χρόνο", old: c.oldCostEur != null ? `~${eur(c.oldCostEur)}` : "—", neu: c.newCostEur != null ? eur(c.newCostEur) : "—", better: c.oldCostEur != null && c.newCostEur != null && c.newCostEur < c.oldCostEur },
    { label: "Διαστάσεις (Π×Υ×Β)", old: dims(a.dims), neu: dims(c.product.dims) },
  ];
  return (
    <div className="grid gap-3">
      {c.sameKind === false && (
        <p className="m-0 flex gap-2 items-start rounded-xl bg-eu-yellow/15 border border-eu-yellow/60 p-3 text-eu-ink text-[length:var(--fs-14)]"><TriangleAlert className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden /> Η φωτογραφία μοιάζει με {a.kindLabel.toLocaleLowerCase("el-GR")}, ενώ αυτό το προϊόν είναι {c.product.typeName?.toLocaleLowerCase("el-GR") ?? "άλλο είδος"}. Η σύγκριση μπορεί να μην έχει νόημα.</p>
      )}

      {c.savingEur != null && c.savingEur > 0 && (
        <div className="rounded-2xl bg-eu-green/10 border border-eu-green/30 p-4 grid gap-1">
          <div className="flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight"><TrendingDown className="size-5 text-eu-green shrink-0" aria-hidden /> Γλιτώνεις περίπου {eur(c.savingEur)} τον χρόνο σε ρεύμα</div>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">
            {c.paybackYears != null && <>Η αξία του νέου «επιστρέφει» σε περίπου <b>{c.paybackYears.toLocaleString("el-GR")} χρόνια</b>. </>}
            {c.savingCo2Kg != null && c.savingCo2Kg > 0 && <span className="inline-flex items-center gap-1"><Leaf className="size-4 text-eu-green" aria-hidden /> {c.savingCo2Kg} kg λιγότερο CO₂ τον χρόνο.</span>}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-eu-line overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-eu-surface">
          <div className="p-3 flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo ? <img src={photo} alt="" className="size-12 rounded-lg object-cover shrink-0" /> : <span className="size-12 rounded-lg bg-white shrink-0" />}
            <span className="min-w-0"><span className="block text-eu-muted font-bold text-[length:var(--fs-13)] uppercase">Η παλιά σου</span><span className="block font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-2">{oldName}{a.ageYears != null ? ` · ~${a.ageYears} ετών` : ""}</span></span>
          </div>
          <div className="p-3 flex items-center gap-2 min-w-0 border-l border-eu-line">
            <ProductImage src={c.product.image} sizes="48px" className="size-12 shrink-0" rounded="rounded-lg" />
            <span className="min-w-0"><span className="block text-eu-blue font-bold text-[length:var(--fs-13)] uppercase">Το νέο</span><span className="block font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-2">{c.product.brand} {c.product.title}</span></span>
          </div>
        </div>
        <dl className="m-0 divide-y divide-eu-line-2">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <dt className="col-span-2 px-3 pt-2 text-eu-muted font-semibold text-[length:var(--fs-13)]">{r.label}</dt>
              <dd className="m-0 px-3 pb-2 text-eu-ink-2 text-[length:var(--fs-15)] tabular-nums">{r.old}</dd>
              <dd className={`m-0 px-3 pb-2 border-l border-eu-line-2 font-bold text-[length:var(--fs-15)] tabular-nums inline-flex items-center gap-1 ${r.better ? "text-eu-green" : "text-eu-ink"}`}>{r.better && <Zap className="size-3.5" aria-hidden />}{r.neu}</dd>
            </div>
          ))}
        </dl>
        {c.fit && (
          <p className={`m-0 px-3 py-2 border-t border-eu-line text-[length:var(--fs-14)] font-bold inline-flex items-center gap-1.5 w-full ${c.fit.ok ? "text-eu-green bg-eu-green/5" : "text-eu-ink bg-eu-yellow/10"}`}><Ruler className="size-4 shrink-0" aria-hidden /> {c.fit.ok ? "Χωράει στη θέση της παλιάς" : `Προσοχή: ${c.fit.note} σε σχέση με την παλιά`}</p>
        )}
      </div>
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η κατανάλωση της παλιάς είναι εκτίμηση για συσκευή αυτού του είδους και της ηλικίας της. Του νέου: {c.newKwhSource === "eprel" ? "από την επίσημη ενεργειακή ετικέτα (EPREL)" : c.newKwhSource === "specs" ? "από τα χαρακτηριστικά του κατασκευαστή" : "εκτίμηση από την ενεργειακή κλάση"}.</p>
    </div>
  );
}
