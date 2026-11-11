"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Truck } from "lucide-react";
import { partnerDocYearAction } from "@/app/admin/(shell)/synergates/card-actions";
import { PartnerDocKpis, PartnerDocs, useDocSummary } from "./PartnerDocs";

export type PartnerTab = "overview" | "docs" | "orders" | "transport" | "stores" | "contacts" | "extra" | "history";
const LABEL: Record<PartnerTab, string> = { overview: "Επισκόπηση", docs: "Παραστατικά", orders: "Παραγγελίες", transport: "Μεταφορά", stores: "Καταστήματα", contacts: "Επαφές", extra: "Πρόσθετα στοιχεία", history: "Ιστορικό" };

/**
 * Καρτέλα συνεργάτη σε ενότητες. Το περιεχόμενο κάθε ενότητας έρχεται έτοιμο από τον server· εδώ μόνο η εναλλαγή
 * (θυμάται την ενότητα στο ?tab=) και τα παραστατικά του SoftOne, που φορτώνονται μετά το άνοιγμα της σελίδας.
 */
export function PartnerCardTabs({ partnerId, hasTrdr, initial, counts, panels, transportHead }: {
  partnerId: string; hasTrdr: boolean; initial: PartnerTab; counts: Partial<Record<PartnerTab, number>>;
  panels: Record<Exclude<PartnerTab, "docs">, ReactNode>; /** «Πώς πάνε τα προϊόντα του» (server), μπαίνει πάνω από τους μεταφορείς των παραστατικών */ transportHead: ReactNode;
}) {
  const [tab, setTab] = useState<PartnerTab>(initial);
  const go = (t: PartnerTab) => { setTab(t); const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u); };
  const { sum, reload } = useDocSummary(partnerId);
  const [carriers, setCarriers] = useState<{ name: string; n: number }[] | null>(null);
  const onCarriers = useCallback((c: { name: string; n: number }[]) => setCarriers(c), []);
  // μεταφορείς φετινών παραστατικών για την Επισκόπηση (το ίδιο αίτημα με την καρτέλα Παραστατικά, cache στον server)
  useEffect(() => {
    if (!hasTrdr) return;
    partnerDocYearAction(partnerId, new Date().getFullYear()).then((r) => setCarriers(r.ok ? r.data.carriers : [])) .catch(() => null);
  }, [partnerId, hasTrdr]);
  const tabs = (Object.keys(LABEL) as PartnerTab[]).filter((t) => t !== "docs" || hasTrdr);

  const seen = (
    <div className="grid gap-1">
      <span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold inline-flex items-center gap-1.5"><Truck className="size-4" aria-hidden /> Μεταφορείς στα φετινά παραστατικά</span>
      {!hasTrdr ? <span className="text-eu-ink-3 text-[length:var(--fs-14)]">Χωρίς κωδικό SoftOne</span>
        : carriers == null ? <span className="h-5 w-48 rounded bg-eu-surface-2 animate-pulse" aria-busy />
        : !carriers.length ? <span className="text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα παραστατικό φέτος δεν έχει μεταφορέα</span>
        : <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">{carriers.slice(0, 6).map((c) => <li key={c.name} className="rounded-full bg-eu-surface-2 px-3 py-1 text-[length:var(--fs-13)] text-eu-ink">{c.name} <span className="tabular-nums text-eu-muted">{c.n}</span></li>)}</ul>}
    </div>
  );

  return (
    <div className="grid gap-4 min-w-0">
      <div role="tablist" data-help="partner.tabs" className="flex flex-wrap gap-x-1 border-b border-eu-line">
        {tabs.map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => go(t)} className={`px-3 min-h-11 text-[length:var(--fs-14)] -mb-px border-b-2 ${tab === t ? "border-eu-navy text-eu-ink font-bold" : "border-transparent text-eu-ink-3 hover:text-eu-ink"}`}>
            {LABEL[t]}{counts[t] != null && <span className="ml-1.5 tabular-nums text-eu-muted">{counts[t]}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && <div className="grid gap-4 min-w-0">
        {hasTrdr && <PartnerDocKpis sum={sum} reload={reload} onOpen={() => go("docs")} />}
        <section data-help="partner.transport-summary" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0">
          <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold">Πώς πάνε τα προϊόντα του</h3>
          {transportHead}
          {seen}
        </section>
        {panels.overview}
      </div>}
      {tab === "docs" && hasTrdr && <PartnerDocs partnerId={partnerId} sum={sum} reload={reload} onCarriers={onCarriers} />}
      {tab === "transport" && <div className="grid gap-4 min-w-0"><section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0">{transportHead}{seen}</section>{panels.transport}</div>}
      {tab !== "overview" && tab !== "docs" && tab !== "transport" && panels[tab]}
    </div>
  );
}
