"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Loader2, Search, Zap } from "lucide-react";
import { matchEprelAction } from "@/app/admin/(shell)/catalog/actions";

export interface EnergyLabelInfo { cls: string; scale: string; labelUrl: string | null; ficheUrl: string | null; source: string | null; registrationNumber: string | null }

/** Ενεργειακή ετικέτα του προϊόντος και «Αναζήτηση στο EPREL» για αυτό μόνο. */
export function EnergyLabelPanel({ productId, needed, label, canWrite }: { productId: string; needed: boolean; label: EnergyLabelInfo | null; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const search = () => start(async () => {
    const r = await matchEprelAction(productId);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (r.status === "matched") { setMsg({ ok: true, text: `Βρέθηκε στο EPREL (${r.registrationNumber}). Αποθηκεύτηκαν ετικέτα, χαρακτηριστικά και διαστάσεις.` }); router.refresh(); }
    else if (r.status === "ambiguous") setMsg({ ok: false, text: `Βρέθηκαν πολλά πιθανά μοντέλα (${(r.candidates ?? []).slice(0, 4).join(", ")}). Διάλεξε το σωστό από τη σελίδα EPREL.` });
    else setMsg({ ok: false, text: `Δεν βρέθηκε στο EPREL${r.model ? ` για το μοντέλο ${r.model}` : ""}. Δοκίμασε χειροκίνητη αναζήτηση στη σελίδα EPREL.` });
  });
  return (
    <section aria-labelledby="energy-h" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 content-start min-w-0">
      <h3 id="energy-h" className="m-0 inline-flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]"><Zap className="size-4 text-eu-blue" aria-hidden /> Ενεργειακή ετικέτα</h3>
      {label ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="rounded-md bg-eu-green text-white font-extrabold px-2 py-0.5 text-[length:var(--fs-16)]">{label.cls}</span>
          <span className="text-eu-ink-3 text-[length:var(--fs-12)]">κλίμακα {label.scale}{label.registrationNumber ? ` · EPREL ${label.registrationNumber}` : ""}{label.source ? ` · πηγή: ${label.source === "eprel" ? "EPREL" : label.source === "s1-desc" ? "περιγραφή ERP" : label.source}` : ""}</span>
          {label.labelUrl && <a href={label.labelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-eu-blue min-h-11 md:min-h-8 text-[length:var(--fs-13)] hover:underline"><ExternalLink className="size-3.5" aria-hidden /> Ετικέτα</a>}
          {label.ficheUrl && <a href={label.ficheUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-eu-blue min-h-11 md:min-h-8 text-[length:var(--fs-13)] hover:underline"><ExternalLink className="size-3.5" aria-hidden /> Δελτίο</a>}
        </div>
      ) : (
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{needed ? <><b className="text-eu-red">Λείπει.</b> Η κατηγορία έχει υποχρεωτική ενεργειακή ετικέτα (EU). Χωρίς αυτήν το προϊόν δεν πρέπει να πουλιέται online.</> : "Δεν απαιτείται ενεργειακή ετικέτα για αυτή την κατηγορία."}</p>
      )}
      {canWrite && needed && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={search} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-3.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} {label ? "Ξαναψάξε στο EPREL" : "Αναζήτηση στο EPREL"}
          </button>
          <Link href="/admin/eprel" className="font-bold text-eu-blue min-h-11 md:min-h-9 inline-flex items-center hover:underline text-[length:var(--fs-13)]">Χειροκίνητη αναζήτηση</Link>
        </div>
      )}
      {msg && <p role="status" className={`m-0 rounded-lg px-2.5 py-1.5 text-[length:var(--fs-13)] ${msg.ok ? "bg-eu-green/10 text-eu-green font-bold" : "bg-eu-surface text-eu-ink-2"}`}>{msg.text}</p>}
    </section>
  );
}
