"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Info, Undo2 } from "lucide-react";
import { sectionDef, type HomeSection, type SectionField } from "@/lib/cms/home-sections";
import { LinkField, StringList, Txt } from "./brand/fields";
import { CategoryCellsField } from "./CategoryCellsField";
import { DealsSourceField, HeroInfoField } from "./HomeInfoFields";
import { TickerItemsField } from "./TickerItemsField";
import { ServiceCellsField } from "./ServiceCellsField";
import { CampaignsField } from "./CampaignsField";
import { OrderToggleField } from "./OrderToggleField";
import { ListChecks } from "lucide-react";


/** Φόρμα των ρυθμίσεων μιας ενότητας της αρχικής (κείμενα, πλήθος, καμπάνιες) — τιμή = αλλαγή του διαχειριστή ή η προεπιλογή. */
export function SectionFields({ s, set }: { s: HomeSection; set: (props: Record<string, unknown>) => void }) {
  const d = sectionDef(s.id)!;
  const base = (d.widget?.props ?? {}) as Record<string, unknown>;
  const val = (k: string) => (s.props && k in s.props ? s.props[k] : k === "limit" && d.widget?.query?.limit ? d.widget.query.limit : base[k]);
  const put = (k: string, v: unknown) => set({ ...(s.props ?? {}), [k]: v });
  const field = (f: SectionField) => {
    switch (f.kind) {
      case "text": return <Txt key={f.key} label={f.label} value={String(val(f.key) ?? "")} onChange={(v) => put(f.key, v)} help={f.help} max={f.max} />;
      case "number": {
        const raw = Number(val(f.key) ?? f.min);
        const shown = f.key === "intervalMs" ? Math.round(raw >= 100 ? raw / 1000 : raw) : raw;
        return (
          <label key={f.key} className="grid gap-1 min-w-0">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
            <input type="number" inputMode="numeric" min={f.min} max={f.max} value={shown} onChange={(e) => { const n = Math.min(f.max, Math.max(f.min, Number(e.target.value) || f.min)); put(f.key, n); }} className="w-full max-w-[10rem] rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white tabular-nums" />
            {f.help && <span className="text-eu-muted text-[length:var(--fs-13)]">{f.help}</span>}
          </label>
        );
      }
      case "lines": return <StringList key={f.key} label={f.label} help={f.help} items={((val(f.key) as string[] | undefined) ?? []).map(String)} onChange={(v) => put(f.key, v)} max={f.max} addLabel="Νέο μήνυμα" />;
      case "link": {
        const l = (val(f.key) as { label?: string; href?: string } | undefined) ?? {};
        return (
          <div key={f.key} className="grid gap-3">
            <Txt label={`${f.label} · κείμενο`} value={l.label ?? ""} onChange={(v) => put(f.key, { ...l, label: v })} max={40} />
            <LinkField label={`${f.label} · σύνδεσμος`} value={l.href ?? ""} onChange={(v) => put(f.key, { ...l, href: v })} />
          </div>
        );
      }
      case "order-toggle": return <OrderToggleField key={f.key} source={f.source} value={val(f.key)} onChange={(v) => put(f.key, v)} label={f.label} />;
      case "service-cells": return <ServiceCellsField key={f.key} props={s.props} set={(patch) => set({ ...(s.props ?? {}), ...patch })} label={f.label} />;
      case "ticker-items": return <TickerItemsField key={f.key} value={val(f.key)} onChange={(v) => put(f.key, v)} label={f.label} help={f.help} max={f.max} />;
      case "deals-source": return <DealsSourceField key={f.key} props={s.props} set={(patch) => set({ ...(s.props ?? {}), ...patch })} />;
      case "hero-info": return <HeroInfoField key={f.key} />;
      case "category-cells": return <CategoryCellsField key={f.key} props={s.props} set={(patch) => set({ ...(s.props ?? {}), ...patch })} label={f.label} help={f.help} />;
      case "campaigns": return <CampaignsField key={f.key} value={val(f.key)} onChange={(l) => put(f.key, l)} label={f.label} help={f.help} />;
    }
  };
  return (
    <div className="grid gap-4">
      {d.how.length > 0 && <HowBox id={s.id} steps={d.how} />}
      {d.managedAt && s.id !== "hero" && <p className="m-0 inline-flex items-start gap-2 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Το περιεχόμενο ρυθμίζεται στο <a href={d.managedAt.href} className="text-eu-blue underline font-bold">{d.managedAt.label}</a>.</span></p>}
      {d.fields.length ? d.fields.map(field) : !d.managedAt && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Αυτή η ενότητα ενημερώνεται αυτόματα — δεν έχει κείμενα για ρύθμιση. Από το «Πότε & σε ποιους» ορίζεις πού και πότε εμφανίζεται.</p>}
      {s.props && Object.keys(s.props).length > 0 && <button type="button" onClick={() => set({})} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface"><Undo2 className="size-3.5" aria-hidden /> Επαναφορά στις αρχικές ρυθμίσεις</button>}
    </div>
  );
}

/** «Πώς το αλλάζω»: ανοιχτό την πρώτη φορά για κάθε ενότητα· μετά μένει κλειστό (ανοίγει με ένα πάτημα). */
const SEEN = "home.how.seen";
/** όσα είδε σε αυτή την επίσκεψη μένουν ανοιχτά μέχρι να ξαναφορτώσει τη σελίδα */
const SHOWN = new Set<string>();
function HowBox({ id, steps }: { id: string; steps: string[] }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN) ?? "[]"));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- η μνήμη ζει μόνο στον browser
      if (seen.has(id) && !SHOWN.has(id)) setOpen(false); else { SHOWN.add(id); seen.add(id); localStorage.setItem(SEEN, JSON.stringify([...seen])); }
    } catch { /* χωρίς localStorage: μένει ανοιχτό */ }
  }, [id]);
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="group rounded-xl bg-eu-chip/60">
      <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 min-h-11 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide"><ListChecks className="size-4" aria-hidden /> Πώς το αλλάζω<ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden /></summary>
      <ol className="m-0 pl-8 pr-3 pb-2.5 grid gap-1 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug">{steps.map((h, i) => <li key={i}>{h}</li>)}</ol>
    </details>
  );
}
