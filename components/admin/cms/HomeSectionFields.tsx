"use client";

import { ArrowDown, ArrowUp, Info, Plus, Trash2, Undo2 } from "lucide-react";
import { sectionDef, type HomeSection, type SectionField } from "@/lib/cms/home-sections";
import { Area, LinkField, MediaUrl, StringList, Txt } from "./brand/fields";
import { CategoryCellsField } from "./CategoryCellsField";
import { DealsSourceField, HeroInfoField } from "./HomeInfoFields";
import { TickerItemsField } from "./TickerItemsField";
import { ListChecks } from "lucide-react";

type Campaign = { id: string; brand: string; title: string; text: string; cta: string; href: string; image: string; alt: string };

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
      case "ticker-items": return <TickerItemsField key={f.key} value={val(f.key)} onChange={(v) => put(f.key, v)} label={f.label} help={f.help} max={f.max} />;
      case "deals-source": return <DealsSourceField key={f.key} props={s.props} set={(patch) => set({ ...(s.props ?? {}), ...patch })} />;
      case "hero-info": return <HeroInfoField key={f.key} />;
      case "category-cells": return <CategoryCellsField key={f.key} props={s.props} set={(patch) => set({ ...(s.props ?? {}), ...patch })} label={f.label} help={f.help} />;
      case "campaigns": {
        const list = ((val(f.key) as Campaign[] | undefined) ?? []).map((c) => ({ ...c }));
        const setList = (l: Campaign[]) => put(f.key, l);
        const upd = (i: number, p: Partial<Campaign>) => setList(list.map((c, k) => (k === i ? { ...c, ...p } : c)));
        return (
          <div key={f.key} className="grid gap-3">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{f.label}</span>
            {f.help && <span className="text-eu-muted text-[length:var(--fs-13)] -mt-2">{f.help}</span>}
            <ol className="m-0 p-0 list-none grid gap-3">
              {list.map((c, i) => (
                <li key={c.id || i}>
                  <details className="group rounded-xl border border-eu-line">
                    <summary className="list-none cursor-pointer flex items-center gap-2 px-3 min-h-12">
                      <span className="size-10 rounded-md shrink-0 bg-eu-surface bg-cover bg-center" style={c.image ? { backgroundImage: `url("${c.image.replace(/"/g, "")}")` } : undefined} aria-hidden />
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 truncate">{c.brand || "Καμπάνια"}{c.title ? ` · ${c.title}` : ""}</span>
                    </summary>
                    <div className="grid gap-3 p-3 pt-0">
                      <MediaUrl label="Εικόνα (key visual)" value={c.image} onChange={(v) => upd(i, { image: v })} help="Οριζόντια εικόνα της καμπάνιας, από τα Media ή τα προϊόντα." />
                      <Txt label="Μάρκα" value={c.brand} onChange={(v) => upd(i, { brand: v })} max={30} />
                      <Txt label="Τίτλος" value={c.title} onChange={(v) => upd(i, { title: v })} max={60} />
                      <Area label="Κείμενο" value={c.text} onChange={(v) => upd(i, { text: v })} max={160} rows={2} />
                      <Txt label="Κουμπί" value={c.cta} onChange={(v) => upd(i, { cta: v })} max={40} />
                      <LinkField label="Σύνδεσμος" value={c.href} onChange={(v) => upd(i, { href: v })} />
                      <Txt label="Περιγραφή εικόνας (alt)" value={c.alt} onChange={(v) => upd(i, { alt: v })} max={120} help="Για προσβασιμότητα και Google." />
                      <div className="flex gap-1">
                        <button type="button" disabled={i === 0} onClick={() => { const l = [...list]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setList(l); }} aria-label="Πιο πάνω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                        <button type="button" disabled={i === list.length - 1} onClick={() => { const l = [...list]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; setList(l); }} aria-label="Πιο κάτω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                        <button type="button" onClick={() => { if (window.confirm("Διαγραφή της καμπάνιας;")) setList(list.filter((_, k) => k !== i)); }} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 text-eu-red font-bold text-[length:var(--fs-14)] hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /> Διαγραφή</button>
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setList([...list, { id: `c-${Date.now().toString(36)}`, brand: "", title: "", text: "", cta: "Δες περισσότερα", href: "/prosfores", image: "", alt: "" }])} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Νέα καμπάνια</button>
          </div>
        );
      }
    }
  };
  return (
    <div className="grid gap-4">
      {d.how.length > 0 && (
        <div className="rounded-xl bg-eu-chip/60 px-3 py-2.5 grid gap-1.5">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide"><ListChecks className="size-4" aria-hidden /> Πώς το αλλάζω</span>
          <ol className="m-0 pl-5 grid gap-1 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug">{d.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
        </div>
      )}
      {d.managedAt && s.id !== "hero" && <p className="m-0 inline-flex items-start gap-2 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Το περιεχόμενο ρυθμίζεται στο <a href={d.managedAt.href} className="text-eu-blue underline font-bold">{d.managedAt.label}</a>.</span></p>}
      {d.fields.length ? d.fields.map(field) : !d.managedAt && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Αυτή η ενότητα ενημερώνεται αυτόματα — δεν έχει κείμενα για ρύθμιση. Από το «Πότε & σε ποιους» ορίζεις πού και πότε εμφανίζεται.</p>}
      {s.props && Object.keys(s.props).length > 0 && <button type="button" onClick={() => set({})} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface"><Undo2 className="size-3.5" aria-hidden /> Επαναφορά στις αρχικές ρυθμίσεις</button>}
    </div>
  );
}
