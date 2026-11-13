"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronLeft, Search, SlidersHorizontal, X } from "lucide-react";
import { sx } from "@/components/ui/sx";
import { EnergyChip } from "@/components/commerce/EnergyChip";
import type { EnergyClass } from "@/lib/data/types";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ListResult } from "@/lib/data/repo";
import { StickySidebar } from "@/components/fluid/StickySidebar";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("facets");

/**
 * Facets live in the URL (?k=eikona-ixos&brand=lg,samsung&min=200&max=800
 * &avail=in-stock&sale=1&energy=A,B&f_Διαγώνιος=55"|65"&sort=price-asc
 * &page=2). Every selection is shareable, bookmarkable and campaign-able.
 * Characteristic facets (f_*) are computed from the products in scope
 * (lib/data/attributes) — the same keys the compare table uses.
 * Desktop: sidebar. Phones/tablets: a bottom sheet behind «Φίλτρα».
 */
/** Πλοήγηση στο δέντρο κατηγοριών μέσα στη στήλη των φίλτρων: υποκατηγορίες της τρέχουσας ή, στον τύπο, τα αδέλφια του. Κανονικοί σύνδεσμοι, όχι φίλτρα. */
export interface FacetNav { title: string; up?: { label: string; href: string }; items: { name: string; href: string; count: number; current?: boolean }[] }

export function Facets({ result, showCategories = false, nav }: { result: ListResult; showCategories?: boolean; nav?: FacetNav }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const priced = result.priceRange[1] > 0;

  const apply = useCallback(
    (mut: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(sp.toString());
      mut(next);
      next.delete("page");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );
  const set = (key: string, value: string | null) => apply((n) => (value ? n.set(key, value) : n.delete(key)));
  const toggleIn = (key: string, v: string, sep = ",") =>
    apply((n) => {
      const cur = (n.get(key) ?? "").split(sep).filter(Boolean);
      const val = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      if (val.length) n.set(key, val.join(sep));
      else n.delete(key);
    });
  const has = (key: string, v: string, sep = ",") => (sp.get(key) ?? "").split(sep).includes(v);

  const active: { label: string; remove: () => void }[] = [];
  if (sp.get("k")) active.push({ label: result.categories.find((c) => c.slug === sp.get("k"))?.label ?? "Κατηγορία", remove: () => set("k", null) });
  (sp.get("brand") ?? "").split(",").filter(Boolean).forEach((b) => active.push({ label: result.brands.find((x) => x.slug === b)?.name ?? b, remove: () => toggleIn("brand", b) }));
  (sp.get("energy") ?? "").split(",").filter(Boolean).forEach((e) => active.push({ label: `Κλάση ${e}`, remove: () => toggleIn("energy", e) }));
  if (sp.get("avail")) active.push({ label: "Άμεσα διαθέσιμα", remove: () => set("avail", null) });
  if (sp.get("sale")) active.push({ label: "Σε προσφορά", remove: () => set("sale", null) });
  if (sp.get("min") || sp.get("max")) active.push({ label: `${sp.get("min") ?? result.priceRange[0]} – ${sp.get("max") ?? result.priceRange[1]} €`, remove: () => apply((n) => (n.delete("min"), n.delete("max"))) });
  for (const [k, v] of sp.entries()) {
    if (k.startsWith("f_")) v.split("|").filter(Boolean).forEach((val) => active.push({ label: result.attributes.find((a) => a.key === k.slice(2))?.toggle ? k.slice(2) : `${k.slice(2)}: ${val}`, remove: () => toggleIn(k, val, "|") }));
    if (k.startsWith("r_")) { const [lo, hi] = v.split("-"); const u = result.attributes.find((a) => a.key === k.slice(2))?.range?.unit ?? ""; active.push({ label: `${k.slice(2)}: ${lo ? num(Number(lo)) : "…"} – ${hi ? num(Number(hi)) : "…"} ${u}`.trim(), remove: () => set(k, null) }); }
  }
  const toggles = result.attributes.filter((a) => a.toggle);
  const clearAll = () => router.push(pathname, { scroll: false });

  const body = (
    <div className="grid">
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-3 border-b border-eu-line-2">
          {active.map((a, i) => (
            <button key={i} type="button" onClick={a.remove} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-blue font-semibold text-[length:var(--fs-14)] px-3 py-1.5 min-h-9 hover:bg-eu-blue hover:text-white">
              {a.label} <X className="size-3.5" aria-hidden />
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-eu-muted font-semibold text-[length:var(--fs-14)] px-2 min-h-9 hover:text-eu-red">
            {c.katharismos_olon}
          </button>
        </div>
      )}

      {nav && nav.items.length > 0 && (
        <Group title={nav.title} open>
          <nav aria-label={nav.title} className="grid gap-0.5">
            {nav.up && (
              <Link href={nav.up.href} className="flex items-center gap-1.5 min-h-11 md:min-h-9 rounded-md px-1 -mx-1 font-semibold text-eu-blue text-[length:var(--fs-15)] hover:bg-eu-surface">
                <ChevronLeft className="size-4 shrink-0" aria-hidden /> {nav.up.label}
              </Link>
            )}
            {nav.items.map((it) => (
              <Link key={it.href} href={it.href} aria-current={it.current ? "page" : undefined} className={`flex items-center gap-2.5 min-h-11 md:min-h-9 rounded-md px-1 -mx-1 text-[length:var(--fs-15)] hover:bg-eu-surface ${it.current ? "font-extrabold text-eu-navy" : "text-eu-ink-2 hover:text-eu-blue"}`}>
                <span className="flex-1">{it.name}</span>
                {it.count > 0 && <span className="text-eu-muted-2 text-[length:var(--fs-13)] tabular-nums">{it.count.toLocaleString("el-GR")}</span>}
              </Link>
            ))}
          </nav>
        </Group>
      )}

      {showCategories && result.categories.length > 0 && (
        <Group title={c.katigoria} open>
          {result.categories.map((c) => (
            <Radio key={c.slug} label={c.label} count={c.count} checked={sp.get("k") === c.slug} onChange={() => set("k", sp.get("k") === c.slug ? null : c.slug)} />
          ))}
        </Group>
      )}

      {/* Κατάλογος της βάσης χωρίς τιμές ακόμη (priceRange 0–0): τα φίλτρα τιμής, προσφοράς και αποθέματος δεν έχουν τι να φιλτράρουν */}
      {priced && <Group title={c.diathesimotita_prosfores} open>
        <Check label="Άμεσα διαθέσιμα" checked={!!sp.get("avail")} onChange={() => set("avail", sp.get("avail") ? null : "in-stock")} />
        {!result.noSale && <Check label="Σε προσφορά" checked={!!sp.get("sale")} onChange={() => set("sale", sp.get("sale") ? null : "1")} />}
      </Group>}

      {priced && <Group title={c.timi} open>
        <RangeFilter label={c.timi} min={result.priceRange[0]} max={result.priceRange[1]} unit="€" step={1} cur={sp.get("min") || sp.get("max") ? `${sp.get("min") ?? ""}-${sp.get("max") ?? ""}` : null} onApply={(lo, hi) => apply((n) => (lo != null ? n.set("min", String(lo)) : n.delete("min"), hi != null ? n.set("max", String(hi)) : n.delete("max")))} />
      </Group>}

      <Group title={c.marka} open count={(sp.get("brand") ?? "").split(",").filter(Boolean).length}>
        <Options name={c.marka} items={result.brands.map((b) => ({ key: b.slug, label: b.name, count: b.count, checked: has("brand", b.slug), onToggle: () => toggleIn("brand", b.slug) }))} />
      </Group>

      {result.energies.length > 1 && (
        <Group title={c.energeiaki_klasi} open count={(sp.get("energy") ?? "").split(",").filter(Boolean).length}>
          {/* η κλίμακα της ετικέτας, με το χρώμα της: πατάς μία ή περισσότερες κλάσεις */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {result.energies.map((e) => {
              const on = has("energy", e.cls);
              return (
                <button key={e.cls} type="button" aria-pressed={on} aria-label={`Ενεργειακή κλάση ${e.cls}, ${e.count} προϊόντα`} onClick={() => toggleIn("energy", e.cls)} className={`inline-flex items-center gap-1.5 rounded-lg border-2 pl-1 pr-2 min-h-11 md:min-h-9 ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                  <EnergyChip cls={e.cls as EnergyClass} fiche="" compact />
                  <span className="text-eu-muted-2 text-[length:var(--fs-13)] tabular-nums">{e.count}</span>
                </button>
              );
            })}
          </div>
        </Group>
      )}

      {toggles.length > 0 && (
        <Group title="Δυνατότητες" open count={toggles.filter((a) => sp.get(`f_${a.key}`)).length}>
          {toggles.map((a) => (
            <Check key={a.key} label={a.key} count={a.toggle!.count} checked={has(`f_${a.key}`, a.toggle!.value, "|")} onChange={() => toggleIn(`f_${a.key}`, a.toggle!.value, "|")} />
          ))}
        </Group>
      )}

      {result.attributes
        .filter((a) => a.key !== "Ενεργειακή κλάση" && !a.toggle)
        .map((a, i) => a.range ? (
          <Group key={a.key} title={a.key} open={i < 2 || !!sp.get(`r_${a.key}`)} count={sp.get(`r_${a.key}`) ? 1 : 0}>
            <RangeFilter label={a.key} min={a.range.min} max={a.range.max} unit={a.range.unit} step={a.range.max - a.range.min < 20 ? 0.1 : 1} cur={sp.get(`r_${a.key}`)} onApply={(lo, hi) => set(`r_${a.key}`, lo == null && hi == null ? null : `${lo ?? ""}-${hi ?? ""}`)} />
          </Group>
        ) : (
          <Group key={a.key} title={a.key} open={i < 2 || !!sp.get(`f_${a.key}`)} count={(sp.get(`f_${a.key}`) ?? "").split("|").filter(Boolean).length}>
            <Options name={a.key} items={a.values.map((v) => ({ key: v.value, label: v.value, count: v.count, checked: has(`f_${a.key}`, v.value, "|"), onToggle: () => toggleIn(`f_${a.key}`, v.value, "|") }))} />
          </Group>
        ))}
    </div>
  );

  return (
    <>
      <StickySidebar className="hidden @3xl:block w-[280px] shrink-0">
        <aside className="bg-white rounded-2xl border border-eu-line px-4 py-3" aria-label={c.filtra}>
          <div className="flex items-center justify-between min-h-10">
            <h2 className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-18)]">{c.filtra}</h2>
            {active.length > 0 && <span className="rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-2.5 py-0.5">{active.length}</span>}
          </div>
          {body}
        </aside>
      </StickySidebar>
      <div className="@3xl:hidden">
        <Sheet>
          <SheetTrigger className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 bg-white">
            <SlidersHorizontal className="size-5" aria-hidden /> Φίλτρα{active.length ? ` · ${active.length}` : ""}
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl p-5">
            <SheetTitle className="font-extrabold text-eu-ink text-[length:var(--fs-19)] mb-3">{c.filtra}</SheetTitle>
            {body}
            <div className="sticky bottom-0 bg-white pt-3 mt-3 border-t border-eu-line">
              <div className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] py-3.5 min-h-12 text-center">Δες {result.total} προϊόντα</div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

const num = (v: number) => v.toLocaleString("el-GR", { maximumFractionDigits: 1 });
const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Λίστα επιλογών ενός φίλτρου: οι επιλεγμένες πρώτες, οι 6 πρώτες ορατές και οι υπόλοιπες ανοίγουν επί τόπου (ποτέ εσωτερική κύλιση).
 * Με πάνω από 8 επιλογές μπαίνει αναζήτηση — γράφεις «sam» και μένει η Samsung.
 */
function Options({ name, items, limit = 6 }: { name: string; items: { key: string; label: string; count?: number; checked: boolean; onToggle: () => void }[]; limit?: number }) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const sorted = [...items.filter((x) => x.checked), ...items.filter((x) => !x.checked)];
  const found = q.trim() ? sorted.filter((x) => fold(x.label).includes(fold(q.trim()))) : sorted;
  const shown = all || q.trim() || items.length <= limit + 2 ? found : found.slice(0, Math.max(limit, items.filter((x) => x.checked).length));
  return (
    <div className="grid">
      {items.length > 8 && (
        <label className="relative block mb-1.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted pointer-events-none" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Αναζήτηση σε ${items.length}`} aria-label={`Αναζήτηση: ${name}`} className="w-full rounded-lg border border-eu-line bg-eu-surface pl-8 pr-2 min-h-11 md:min-h-9 text-[length:var(--fs-14)] placeholder:text-eu-muted focus:bg-white focus:border-eu-blue outline-none" />
        </label>
      )}
      {shown.map((x) => <Check key={x.key} label={x.label} count={x.count} checked={x.checked} onChange={x.onToggle} />)}
      {q.trim() && !found.length && <p className="m-0 py-2 text-eu-muted text-[length:var(--fs-14)]">Δεν βρέθηκε «{q.trim()}».</p>}
      {!q.trim() && found.length > shown.length || (all && items.length > limit && !q.trim()) ? (
        <button type="button" onClick={() => setAll(!all)} className="justify-self-start text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 md:min-h-9 hover:underline">
          {all ? "Λιγότερα" : `+ ${found.length - shown.length} ακόμη`}
        </button>
      ) : null}
    </div>
  );
}

function Group({ title, open = false, count = 0, children }: { title: string; open?: boolean; count?: number; children: React.ReactNode }) {
  const [o, setO] = useState(open);
  return (
    <div className="border-b border-eu-line-2 py-0.5 last:border-0">
      <button type="button" aria-expanded={o} onClick={() => setO(!o)} className="w-full flex justify-between items-center gap-2 font-extrabold text-eu-ink text-[length:var(--fs-15)] min-h-11 md:min-h-10 text-left">
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && <span className="rounded-full bg-eu-chip text-eu-blue text-[length:var(--fs-13)] px-2 py-0.5">{count}</span>}
        </span>
        <ChevronDown className={`size-5 text-eu-muted transition-transform shrink-0 ${o ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {o && <div className="grid pb-2.5">{children}</div>}
    </div>
  );
}

function Check({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex items-center gap-2.5 text-[length:var(--fs-15)] min-h-11 md:min-h-9 cursor-pointer rounded-md px-1 -mx-1 hover:bg-eu-surface ${checked ? "text-eu-ink font-semibold" : "text-eu-ink-2"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="size-[18px] accent-eu-blue" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-eu-muted-2 text-[length:var(--fs-13)] tabular-nums">{count}</span>}
    </label>
  );
}

function Radio({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex items-center gap-2.5 text-[length:var(--fs-15)] min-h-11 md:min-h-9 cursor-pointer rounded-md px-1 -mx-1 hover:bg-eu-surface ${checked ? "text-eu-blue font-bold" : "text-eu-ink-2"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="size-[18px] accent-eu-blue rounded-full" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-eu-muted-2 text-[length:var(--fs-13)] tabular-nums">{count}</span>}
    </label>
  );
}

const THUMB = "absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-7 m-0 appearance-none bg-transparent pointer-events-none focus-visible:outline-none " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-eu-navy [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab [&:focus-visible::-webkit-slider-thumb]:ring-4 [&:focus-visible::-webkit-slider-thumb]:ring-eu-blue/30 " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-eu-navy [&::-moz-range-thumb]:cursor-grab [&::-moz-range-track]:bg-transparent";

/**
 * «Από – έως» με μπάρα δύο λαβών και δύο πεδία: σέρνεις μια λαβή (ή γράφεις) και το φίλτρο εφαρμόζεται όταν την αφήσεις.
 * Τιμή (€) και αριθμητικά χαρακτηριστικά (βάθος, θόρυβος) — μια άκρη στο όριό της σημαίνει «χωρίς όριο».
 */
function RangeFilter({ label, min, max, unit, step, cur, onApply }: { label: string; min: number; max: number; unit: string; step: number; cur: string | null; onApply: (lo: number | null, hi: number | null) => void }) {
  const lo0 = Math.floor(min / step) * step, hi0 = Math.ceil(max / step) * step;
  const parse = (): [number, number] => { const [a, b] = (cur ?? "-").split("-"); return [a ? Math.max(lo0, Math.min(hi0, Number(a))) : lo0, b ? Math.max(lo0, Math.min(hi0, Number(b))) : hi0]; };
  const [v, setV] = useState<[number, number]>(parse);
  // αλλαγή από το URL (αφαίρεση φίλτρου, «πίσω») ή νέα όρια → η μπάρα ακολουθεί
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setV(parse()), 0); return () => clearTimeout(t); }, [cur, lo0, hi0]);
  const commit = (n: [number, number]) => onApply(n[0] > lo0 ? n[0] : null, n[1] < hi0 ? n[1] : null);
  const pct = (x: number) => (hi0 > lo0 ? ((x - lo0) / (hi0 - lo0)) * 100 : 0);
  const fill = sx({ left: `${pct(v[0])}%`, right: `${100 - pct(v[1])}%` });
  const field = "w-full min-w-0 rounded-lg border border-eu-line pl-2.5 pr-7 min-h-11 md:min-h-9 text-[length:var(--fs-15)] tabular-nums focus:border-eu-blue outline-none";
  const edit = (i: 0 | 1, raw: string) => { const x = Number(raw.replace(",", ".")); if (raw === "" || isNaN(x)) return; const n: [number, number] = i === 0 ? [Math.max(lo0, Math.min(x, v[1])), v[1]] : [v[0], Math.min(hi0, Math.max(x, v[0]))]; setV(n); commit(n); };
  if (hi0 <= lo0) return null;
  return (
    <div className="grid gap-2 pt-1">
      <div className="relative h-7 mx-1">
        {fill.node}
        <span aria-hidden className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-eu-line" />
        <span aria-hidden className={`absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-eu-navy ${fill.className}`} />
        <input type="range" min={lo0} max={hi0} step={step} value={v[0]} aria-label={`${label}: από`} onChange={(e) => setV([Math.min(Number(e.target.value), v[1]), v[1]])} onPointerUp={() => commit(v)} onKeyUp={() => commit(v)} className={`${THUMB} ${v[0] > hi0 - (hi0 - lo0) / 10 ? "z-10" : ""}`} />
        <input type="range" min={lo0} max={hi0} step={step} value={v[1]} aria-label={`${label}: έως`} onChange={(e) => setV([v[0], Math.max(Number(e.target.value), v[0])])} onPointerUp={() => commit(v)} onKeyUp={() => commit(v)} className={THUMB} />
      </div>
      <div className="flex items-center gap-1.5">
        {([0, 1] as const).map((i) => (
          <label key={`${i}-${v[i]}`} className="relative flex-1 min-w-0">
            <span className="sr-only">{label}: {i ? "έως" : "από"}</span>
            <input inputMode="decimal" defaultValue={num(v[i])} onBlur={(e) => edit(i, e.target.value.replace(/\./g, ""))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className={field} />
            <span aria-hidden className="absolute right-2 top-1/2 -translate-y-1/2 text-eu-muted text-[length:var(--fs-13)]">{unit}</span>
          </label>
        )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, <span key="sep" className="text-eu-muted-2">–</span>, el] : [el]), [])}
      </div>
    </div>
  );
}
