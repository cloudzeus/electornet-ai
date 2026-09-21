"use client";

import React, { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
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
export function Facets({ result, showCategories = false }: { result: ListResult; showCategories?: boolean }) {
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
    if (k.startsWith("f_")) v.split("|").filter(Boolean).forEach((val) => active.push({ label: `${k.slice(2)}: ${val}`, remove: () => toggleIn(k, val, "|") }));
  }
  const clearAll = () => router.push(pathname, { scroll: false });

  const body = (
    <div className="grid gap-1">
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-4 border-b border-eu-line-2 mb-2">
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
        <Check label="Σε προσφορά" checked={!!sp.get("sale")} onChange={() => set("sale", sp.get("sale") ? null : "1")} />
      </Group>}

      {priced && <Group title={c.timi} open>
        <PriceRange min={result.priceRange[0]} max={result.priceRange[1]} curMin={sp.get("min")} curMax={sp.get("max")} onApply={(a, b) => apply((n) => (a ? n.set("min", a) : n.delete("min"), b ? n.set("max", b) : n.delete("max")))} />
      </Group>}

      <Group title={c.marka} open count={(sp.get("brand") ?? "").split(",").filter(Boolean).length}>
        <Limited>
          {result.brands.map((b) => (
            <Check key={b.slug} label={b.name} count={b.count} checked={has("brand", b.slug)} onChange={() => toggleIn("brand", b.slug)} />
          ))}
        </Limited>
      </Group>

      {result.energies.length > 1 && (
        <Group title={c.energeiaki_klasi} open count={(sp.get("energy") ?? "").split(",").filter(Boolean).length}>
          {result.energies.map((e) => (
            <Check key={e.cls} label={`Κλάση ${e.cls}`} count={e.count} checked={has("energy", e.cls)} onChange={() => toggleIn("energy", e.cls)} />
          ))}
        </Group>
      )}

      {result.attributes
        .filter((a) => a.key !== "Ενεργειακή κλάση")
        .map((a, i) => (
          <Group key={a.key} title={a.key} open={i < 2} count={(sp.get(`f_${a.key}`) ?? "").split("|").filter(Boolean).length}>
            <Limited>
              {a.values.map((v) => (
                <Check key={v.value} label={v.value} count={v.count} checked={has(`f_${a.key}`, v.value, "|")} onChange={() => toggleIn(`f_${a.key}`, v.value, "|")} />
              ))}
            </Limited>
          </Group>
        ))}
    </div>
  );

  return (
    <>
      <StickySidebar className="hidden @3xl:block w-[280px] shrink-0">
        <aside className="bg-white rounded-2xl border border-eu-line p-5" aria-label={c.filtra}>
          <div className="flex items-center justify-between mb-2">
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

/** Shows the first 6 options; the rest open in place — never an inner scrollbar. */
function Limited({ children, limit = 6 }: { children: React.ReactNode; limit?: number }) {
  const [all, setAll] = useState(false);
  const items = React.Children.toArray(children);
  const shown = all ? items : items.slice(0, limit);
  return (
    <div className="grid gap-0.5">
      {shown}
      {items.length > limit && (
        <button type="button" onClick={() => setAll(!all)} className="justify-self-start text-eu-blue font-bold text-[length:var(--fs-14)] min-h-9 hover:underline">
          {all ? "Λιγότερα" : `+ ${items.length - limit} ακόμη`}
        </button>
      )}
    </div>
  );
}

function Group({ title, open = false, count = 0, children }: { title: string; open?: boolean; count?: number; children: React.ReactNode }) {
  const [o, setO] = useState(open);
  return (
    <div className="border-b border-eu-line-2 py-1 last:border-0">
      <button type="button" aria-expanded={o} onClick={() => setO(!o)} className="w-full flex justify-between items-center gap-2 font-extrabold text-eu-ink text-[length:var(--fs-15)] min-h-11 text-left">
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && <span className="rounded-full bg-eu-chip text-eu-blue text-[length:var(--fs-13)] px-2 py-0.5">{count}</span>}
        </span>
        <ChevronDown className={`size-5 text-eu-muted transition-transform shrink-0 ${o ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {o && <div className="grid gap-0.5 pb-2">{children}</div>}
    </div>
  );
}

function Check({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex items-center gap-2.5 text-[length:var(--fs-15)] min-h-10 cursor-pointer rounded-md px-1 -mx-1 hover:bg-eu-surface ${checked ? "text-eu-ink font-semibold" : "text-eu-ink-2"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="size-[18px] accent-eu-blue" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-eu-muted-2 text-[length:var(--fs-13)] tabular-nums">{count}</span>}
    </label>
  );
}

function Radio({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex items-center gap-2.5 text-[length:var(--fs-15)] min-h-10 cursor-pointer rounded-md px-1 -mx-1 hover:bg-eu-surface ${checked ? "text-eu-blue font-bold" : "text-eu-ink-2"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="size-[18px] accent-eu-blue rounded-full" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-eu-muted-2 text-[length:var(--fs-13)] tabular-nums">{count}</span>}
    </label>
  );
}

function PriceRange({ min, max, curMin, curMax, onApply }: { min: number; max: number; curMin: string | null; curMax: string | null; onApply: (a: string | null, b: string | null) => void }) {
  const [a, setA] = useState(curMin ?? "");
  const [b, setB] = useState(curMax ?? "");
  const presets = [
    [null, 200],
    [200, 500],
    [500, 1000],
    [1000, null],
  ] as const;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {presets
          .filter(([lo, hi]) => (lo == null || lo < max) && (hi == null || hi > min))
          .map(([lo, hi]) => {
            const on = (curMin ?? "") === String(lo ?? "") && (curMax ?? "") === String(hi ?? "");
            return (
              <button key={`${lo}-${hi}`} type="button" onClick={() => onApply(lo == null ? null : String(lo), hi == null ? null : String(hi))} className={`rounded-full border px-3 min-h-9 text-[length:var(--fs-14)] font-semibold ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-ink-2 hover:border-eu-blue"}`}>
                {lo == null ? `έως ${hi} €` : hi == null ? `από ${lo} €` : `${lo}–${hi} €`}
              </button>
            );
          })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(a || null, b || null);
        }}
        className="flex items-center gap-1.5"
      >
        <input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} placeholder={String(Math.floor(min))} aria-label={c.elachisti_timi} className="w-full min-w-0 rounded-md border border-eu-line px-2.5 min-h-11 text-[length:var(--fs-15)]" />
        <span className="text-eu-muted-2">–</span>
        <input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} placeholder={String(Math.ceil(max))} aria-label={c.megisti_timi} className="w-full min-w-0 rounded-md border border-eu-line px-2.5 min-h-11 text-[length:var(--fs-15)]" />
        <button type="submit" className="rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-14)] px-3.5 min-h-11 hover:bg-eu-blue">
          OK
        </button>
      </form>
    </div>
  );
}
