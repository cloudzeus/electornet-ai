"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, Laptop, Smartphone, Tablet } from "lucide-react";
import { sx } from "@/components/ui/sx";

type Device = "mobile" | "tablet" | "desktop";
const WIDTH: Record<Device, number> = { mobile: 390, tablet: 820, desktop: 1280 };

/**
 * Συλλογή όλων των components με δείγματα, σε πλάτος κινητού, tablet ή υπολογιστή και με τα χρώματα Euronics ή
 * μιας σελίδας μάρκας. Η ίδια η συλλογή είναι σελίδα της βιτρίνας (/cms/syllogi), ώστε να φαίνεται ακριβώς όπως
 * στον πελάτη· εδώ μπαίνει σε πλαίσιο με το πλάτος της συσκευής.
 */
export function ComponentsGallery({ themes, groups }: { themes: { value: string; label: string }[]; groups: { label: string; items: { type: string; label: string }[] }[] }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [theme, setTheme] = useState("");
  const [jump, setJump] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const target = WIDTH[device];
  const scale = w ? Math.min(1, w / target) : 1;
  const H = 1400;
  // το πλάτος (από τη συσκευή) μπαίνει με κλάση· ύψος / κλίμακα / κεντράρισμα αλλάζουν με το μέγεθος του πλαισίου και
  // γράφονται απευθείας στα στοιχεία (CSSOM — το CSP δεν επιτρέπει style attributes στο HTML)
  const inner = useRef<HTMLDivElement>(null);
  const wide = sx({ width: target });
  useLayoutEffect(() => {
    if (box.current) box.current.style.height = `${H * scale}px`;
    const el = inner.current;
    if (!el) return;
    el.style.transform = `scale(${scale})`;
    el.style.margin = w > target ? "0 auto" : "";
  }, [scale, w, target]);
  const src = `/cms/syllogi${theme ? `?theme=${theme}` : ""}${jump ? `#c-${jump}` : ""}`;
  return (
    <div className="grid gap-4 min-w-0">
      <header className="grid gap-2">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Περιεχόμενο</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Συλλογή components</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Όλα τα components που μπορείς να βάλεις στις ζώνες (σελίδες μαρκών, πληροφοριακές σελίδες), με δείγματα — όπως θα τα δει ο πελάτης. Άλλαξε συσκευή για να δεις πώς προσαρμόζονται και χρώματα για να δεις πώς δείχνουν σε σελίδα μάρκας.</p>
      </header>
      <div className="sticky top-0 z-20 -mx-4 @md:-mx-6 px-4 @md:px-6 py-3 bg-eu-surface/95 backdrop-blur border-b border-eu-line flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-full bg-white border border-eu-line p-1" role="radiogroup" aria-label="Συσκευή">
          {(["mobile", "tablet", "desktop"] as const).map((d) => { const I = d === "mobile" ? Smartphone : d === "tablet" ? Tablet : Laptop; return <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${device === d ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}><I className="size-4" aria-hidden />{d === "mobile" ? "Κινητό" : d === "tablet" ? "Tablet" : "Υπολογιστής"}</button>; })}
        </div>
        <label className="grid gap-1 min-w-[12rem]">
          <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">Χρώματα</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className="rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-16)] bg-white">{themes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </label>
        <label className="grid gap-1 min-w-[12rem] flex-1 max-w-sm">
          <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">Μετάβαση σε</span>
          <select value={jump} onChange={(e) => setJump(e.target.value)} className="rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-16)] bg-white">
            <option value="">— όλα —</option>
            {groups.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((i) => <option key={i.type} value={i.type}>{i.label}</option>)}</optgroup>)}
          </select>
        </label>
        <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Σε νέα καρτέλα <ExternalLink className="size-4" aria-hidden /></a>
      </div>
      <div ref={box} className="rounded-2xl border border-eu-line bg-eu-line-2 overflow-hidden h-[1400px]">
        {wide.node}
        <div ref={inner} className={`origin-top-left h-[1400px] ${wide.className}`}>
          <iframe key={`${device}-${theme}-${jump}`} title="Συλλογή components" src={src} className="block bg-white w-full h-full border-0" />
        </div>
      </div>
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κύλισε μέσα στο πλαίσιο για όλα τα components. Πλάτος: κινητό 390px, tablet 820px, υπολογιστής 1280px.</p>
    </div>
  );
}
