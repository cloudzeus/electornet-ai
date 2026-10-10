"use client";

import { createElement, useEffect, useRef, useState, type RefObject } from "react";
import {
  Bell, BookOpen, Check, FileText, GalleryHorizontal, HelpCircle, Image as ImageIcon, Laptop, ListOrdered, Loader2, Mail, Megaphone, MessageSquare, Monitor, Package, Percent,
  CalendarClock, EyeOff, LayoutGrid, Rocket, Search, ShoppingBag, Smartphone, Sparkles, Store, Tablet, Tag, Ticket, Timer, Truck, Video, Wrench, X, Zap, type LucideIcon,
} from "lucide-react";
import type { BrandBlock, Device } from "@/lib/cms/brand-store";
import { DEVICES } from "@/lib/cms/brand-store";
import type { HomeAudience } from "@/lib/cms/home-sections";
import { BLOCK_GROUPS, BLOCK_INFO } from "./brand/BlockEditors";
import { DateTime } from "./brand/fields";

/*
 * Κοινά κομμάτια των editors σελίδων (Ζώνες αρχικής, σελίδες μαρκών): εικονίδια components, σύνοψη και φόρμα
 * «Πότε & σε ποιους», παράθυρο προσθήκης, ζωντανή προεπισκόπηση με επιλογή στοιχείου.
 */
export const BLOCK_ICON: Partial<Record<BrandBlock["type"], LucideIcon>> = {
  ad: ImageIcon, "deal-hero": Zap, "promo-products": Percent, "promo-grid": Tag, countdown: Timer, "promo-landing": Megaphone, coupon: Ticket,
  "products-auto": ShoppingBag, "new-arrivals": Package, offers: Percent, series: LayoutGrid, categories: LayoutGrid,
  banner: ImageIcon, story: FileText, gallery: GalleryHorizontal, video: Video,
  text: FileText, steps: ListOrdered, callout: Bell, faq: HelpCircle, tech: Sparkles, support: Wrench,
  contact: MessageSquare, stores: Store, services: Truck, guides: BookOpen, newsletter: Mail,
  announcement: Megaphone, usp: Check, cta: Rocket,
};
/** εικονίδιο χωρίς «component μέσα στο render» */
export const ico = (I: LucideIcon, className: string) => createElement(I, { className, "aria-hidden": true });
export const AUD_LABEL: Record<HomeAudience, string> = { all: "Σε όλους", guest: "Μόνο επισκέπτες", customer: "Μόνο πελάτες" };
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "short" });

export type Vis = { enabled?: boolean; hideOn?: Device[]; audience?: HomeAudience; schedule?: { from?: string; to?: string } };
/**
 * Η ορατότητα σε μία φράση: «Κρυφή», «Από 1 Νοε · μόνο κινητό», «Σε όλους · όλες οι συσκευές».
 * plain = η προεπιλογή (όλοι, όλες οι συσκευές, χωρίς ημερομηνίες) — ο χάρτης τότε δεν γράφει τίποτα · soon = λήγει σε ≤ 3 ημέρες.
 */
export function visSummary(v: Vis): { live: boolean; text: string; plain: boolean; soon: boolean } {
  if (v.enabled === false) return { live: false, text: "Κρυφή", plain: false, soon: false };
  const now = Date.now();
  if (v.schedule?.to && new Date(v.schedule.to).getTime() < now) return { live: false, text: `Έληξε ${shortDate(v.schedule.to)}`, plain: false, soon: false };
  const parts: string[] = [];
  let soon = false;
  if (v.schedule?.from && new Date(v.schedule.from).getTime() > now) parts.push(`Από ${shortDate(v.schedule.from)}`);
  else if (v.schedule?.to) {
    const days = Math.ceil((new Date(v.schedule.to).getTime() - now) / 86_400_000);
    soon = days <= 3;
    parts.push(soon ? (days <= 1 ? "Λήγει σήμερα/αύριο" : `Λήγει σε ${days} ημέρες`) : `Έως ${shortDate(v.schedule.to)}`);
  }
  const aud = v.audience ?? "all";
  if (aud !== "all" || parts.length) parts.push(AUD_LABEL[aud]);
  const shown = DEVICES.filter((d) => !v.hideOn?.includes(d.key));
  if (shown.length !== 3 || parts.length) parts.push(shown.length === 3 ? "όλες οι συσκευές" : shown.length ? `μόνο ${shown.map((d) => d.label.toLowerCase()).join(" & ")}` : "καμία συσκευή");
  const plain = !parts.length;
  return { live: !(v.schedule?.from && new Date(v.schedule.from).getTime() > now) && shown.length > 0, text: plain ? "Σε όλους · όλες οι συσκευές" : parts.join(" · "), plain, soon };
}

/** Κλικ σε κείμενο της προεπισκόπησης → το αντίστοιχο πεδίο μέσα στο `box`, έτοιμο για γράψιμο (τονίζεται για λίγο). */
export function useFocusText(box: RefObject<HTMLElement | null>, focusText: { text: string; n: number } | null, itemKey: string) {
  useEffect(() => {
    if (!focusText) return;
    const t = setTimeout(() => {
      const norm = (x: string) => x.replace(/\s+/g, " ").trim().toLocaleLowerCase("el-GR");
      const want = norm(focusText.text);
      if (want.length < 2) return;
      const fields = [...(box.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=checkbox]):not([type=radio]):not([type=number]):not([type=datetime-local]), textarea") ?? [])].filter((f) => f.value.trim().length > 1);
      const score = (f: HTMLInputElement | HTMLTextAreaElement) => { const val = norm(f.value); return val === want ? 3 : want.includes(val) && val.length >= 4 ? 2 : val.includes(want) && want.length >= 4 ? 1 : 0; };
      const best = fields.map((f) => ({ f, s: score(f) })).filter((x) => x.s).sort((a, b) => b.s - a.s)[0]?.f;
      if (!best) return;
      best.closest("details")?.setAttribute("open", "");
      best.scrollIntoView({ block: "center", behavior: "smooth" });
      best.focus({ preventScroll: true });
      best.select?.();
      best.animate?.([{ boxShadow: "0 0 0 4px rgba(241,196,0,.9)" }, { boxShadow: "0 0 0 0 rgba(241,196,0,0)" }], { duration: 1400, easing: "ease-out" });
    }, 120);
    return () => clearTimeout(t);
  }, [box, focusText, itemKey]);
}

/** Ρυθμίσεις → στήλη δίπλα στον χάρτη: διακόπτης ρυθμίσεις / προεπισκόπηση (μεσαίες οθόνες). */
export function RightSwitch({ right, setRight }: { right: "settings" | "preview"; setRight: (r: "settings" | "preview") => void }) {
  return (
    <div role="tablist" aria-label="Δεξιά στήλη" className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-eu-surface p-1">
      {(["settings", "preview"] as const).map((r) => <button key={r} type="button" role="tab" aria-selected={right === r} onClick={() => setRight(r)} className={`rounded-full min-h-11 font-bold text-[length:var(--fs-14)] ${right === r ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-2"}`}>{r === "settings" ? "Ρυθμίσεις" : "Προεπισκόπηση"}</button>)}
    </div>
  );
}

/** «Πότε & σε ποιους»: συσκευές (κουμπιά), κοινό (επιλογές με εξήγηση), ημερομηνίες. */
export function VisibilityForm({ v, summary, onChange, audience = true }: { v: Vis; summary: string; onChange: (p: Vis) => void; audience?: boolean }) {
  const AUD: { v: HomeAudience; t: string; d: string }[] = [
    { v: "all", t: "Σε όλους", d: "Επισκέπτες και συνδεδεμένοι πελάτες." },
    { v: "guest", t: "Μόνο σε επισκέπτες", d: "Όσοι δεν έχουν συνδεθεί — π.χ. κουπόνι εγγραφής." },
    { v: "customer", t: "Μόνο σε πελάτες", d: "Όσοι έχουν συνδεθεί — π.χ. προσφορά για μέλη." },
  ];
  return (
    <div className="grid gap-5">
      <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><b>Τώρα:</b> {summary}</p>
      <fieldset className="m-0 p-0 border-0 grid gap-2">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-1">Σε ποιες συσκευές</legend>
        <div className="grid grid-cols-3 gap-2">
          {DEVICES.map((dv) => {
            const on = !v.hideOn?.includes(dv.key);
            return (
              <button key={dv.key} type="button" aria-pressed={on} onClick={() => { const cur = new Set<Device>(v.hideOn ?? []); if (on) cur.add(dv.key); else cur.delete(dv.key); onChange({ hideOn: cur.size ? [...cur] : undefined }); }}
                className={`grid justify-items-center gap-1 rounded-xl border-2 px-2 py-2 min-h-16 font-bold text-[length:var(--fs-13)] ${on ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-muted"}`}>
                {ico(dv.key === "mobile" ? Smartphone : dv.key === "tablet" ? Tablet : Laptop, "size-5")}{dv.label}<span className="font-normal">{on ? "Ναι" : "Όχι"}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {audience && <fieldset className="m-0 p-0 border-0 grid gap-2">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-1">Σε ποιους</legend>
        {AUD.map((a) => {
          const on = (v.audience ?? "all") === a.v;
          return (
            <label key={a.v} className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 min-h-12 cursor-pointer ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-navy/50"}`}>
              <input type="radio" name="aud" checked={on} onChange={() => onChange({ audience: a.v === "all" ? undefined : a.v })} className="mt-1 size-4 accent-eu-navy" />
              <span className="grid"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{a.t}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{a.d}</span></span>
            </label>
          );
        })}
      </fieldset>}
      <fieldset className="m-0 p-0 border-0 grid gap-3">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-1 inline-flex items-center gap-2"><CalendarClock className="size-4" aria-hidden /> Πότε</legend>
        <DateTime label="Από" value={v.schedule?.from} onChange={(x) => onChange({ schedule: { ...v.schedule, from: x } })} help="Κενό = από τώρα." />
        <DateTime label="Έως" value={v.schedule?.to} onChange={(x) => onChange({ schedule: { ...v.schedule, to: x } })} help="Κενό = χωρίς λήξη. Μετά κρύβεται μόνο του." />
      </fieldset>
    </div>
  );
}

/* ---------------- προσθήκη ---------------- */
/** Προσθήκη component: αναζήτηση, θέση (κάτω από ποιο στοιχείο), κάρτες ανά ομάδα. `allowed` = όσα ταιριάζουν στη σελίδα. */
export function AddDialog({ after, positions, top = "Θέση: στην κορυφή της σελίδας", allowed, label = "Προσθήκη", onAdd, onClose }: { after: string | null; positions: { key: string; label: string }[]; top?: string | null; allowed?: BrandBlock["type"][]; label?: string; onAdd: (t: BrandBlock["type"], after: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<string>(after ?? (top === null ? positions[0]?.key ?? "" : ""));
  const ref = useRef<HTMLDialogElement>(null);
  // χωρίς close() στο cleanup: στο StrictMode θα έκλεινε αμέσως (το event close → onClose)· στο unmount φεύγει μόνο του
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const groups = BLOCK_GROUPS.map((g) => ({ ...g, types: g.types.filter((t) => (!allowed || allowed.includes(t)) && (!q || norm(`${BLOCK_INFO[t].label} ${BLOCK_INFO[t].help}`).includes(norm(q)))) })).filter((g) => g.types.length);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-label={label} className="m-auto w-[min(56rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-2xl p-0 backdrop:bg-black/50 bg-white">
      <div className="grid grid-rows-[auto_minmax(0,1fr)] max-h-[calc(100dvh-2rem)]">
        <div className="grid gap-3 p-4 border-b border-eu-line">
          <div className="flex items-center gap-2">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Τι θέλεις να προσθέσεις;</h2>
            <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="ml-auto size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
          </div>
          <div className="grid @xl:grid-cols-2 gap-2">
            <label className="relative">
              <span className="sr-only">Αναζήτηση</span>
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση: banner, κουπόνι, προϊόντα…" className="w-full rounded-xl border-2 border-eu-line pl-9 pr-3 min-h-12 text-[length:var(--fs-16)] bg-white" />
            </label>
            <label className="grid">
              <span className="sr-only">Θέση</span>
              <select value={pos} onChange={(e) => setPos(e.target.value)} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-15)] bg-white">
                {top !== null && <option value="">{top}</option>}
                {positions.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-y-auto p-4 grid gap-5">
          {groups.length ? groups.map((g) => (
            <section key={g.label} className="grid gap-2">
              <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{g.label}</h3>
              <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-2">
                {g.types.map((t) => {
                  return (
                    <button key={t} type="button" onClick={() => onAdd(t, pos || null)} className="text-left flex items-start gap-3 rounded-xl border-2 border-eu-line p-3 min-h-16 hover:border-eu-navy hover:bg-eu-chip/40 focus-visible:outline-2 focus-visible:outline-eu-blue">
                      <span className="size-10 shrink-0 grid place-items-center rounded-lg bg-eu-chip text-eu-blue">{ico(BLOCK_ICON[t] ?? Package, "size-5")}</span>
                      <span className="grid gap-0.5 min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{BLOCK_INFO[t].label}</span><span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{BLOCK_INFO[t].help}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>
          )) : <p className="m-0 text-eu-muted">Τίποτα με «{q}». Δοκίμασε άλλη λέξη.</p>}
        </div>
      </div>
    </dialog>
  );
}

/* ---------------- ζωντανή προεπισκόπηση ---------------- */
/**
 * Το πρόχειρο σε iframe (ίδιο origin): κυλά και τονίζει το επιλεγμένο στοιχείο· κλικ μέσα στην προεπισκόπηση επιλέγει
 * το στοιχείο αντί να ανοίγει συνδέσμους. Ανανεώνεται μετά από κάθε αποθήκευση.
 */
export function LivePreview({ src, attr = "data-home-item", v, device, setDevice, saving, focus, notice, onPick }: { src: string; attr?: string; v: number; device: "desktop" | "mobile"; setDevice: (d: "desktop" | "mobile") => void; saving: boolean; focus: string | null; notice: string | null; onPick: (key: string, text: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [w, setW] = useState(0);
  const [bh, setBh] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [missing, setMissing] = useState(false);
  const pick = useRef(onPick);
  useEffect(() => { pick.current = onPick; }, [onPick]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { setW(e.contentRect.width); setBh(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // τονισμός + κύλιση στο επιλεγμένο
  useEffect(() => {
    const d = frame.current?.contentDocument;
    if (!d) return;
    d.querySelectorAll(`[${attr}]`).forEach((n) => { (n as HTMLElement).style.outline = ""; (n as HTMLElement).style.outlineOffset = ""; });
    const el = focus ? (d.querySelector(`[${attr}="${focus}"]`) as HTMLElement | null) : null;
    // το επιλεγμένο δεν υπάρχει (κρυφό, κενό, άλλη συσκευή) ή δεν φαίνεται σε αυτή τη συσκευή → μήνυμα αντί για σιωπή
    const gone = !!focus && (!el || el.offsetParent === null || el.getBoundingClientRect().height < 2);
    queueMicrotask(() => setMissing(gone));
    if (!focus || !el || gone) return;
    el.style.outline = "4px solid #1d428a"; el.style.outlineOffset = "-4px";
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, loaded, attr]);
  const onLoad = () => {
    const d = frame.current?.contentDocument;
    if (d) {
      const st = d.createElement("style");
      st.textContent = `[${attr}]{cursor:pointer}[${attr}]:hover{box-shadow:inset 0 0 0 3px rgba(29,66,138,.45)}`;
      d.head.appendChild(st);
      d.addEventListener("click", (e) => {
        const t = (e.target as HTMLElement).closest(`[${attr}]`);
        e.preventDefault(); e.stopPropagation();
        // το κείμενο που πατήθηκε → ο editor ανοίγει το αντίστοιχο πεδίο
        const txt = (e.target as HTMLElement).closest("h1,h2,h3,h4,p,a,button,li,span,strong,b,em")?.textContent?.trim() ?? null;
        if (t) pick.current(t.getAttribute(attr)!, txt && txt.length < 300 ? txt : null);
      }, true);
    }
    setLoaded((n) => n + 1);
  };
  const target = device === "desktop" ? 1280 : 390;
  const scale = w ? Math.min(1, w / target) : 1;
  const inner = (bh || 760) / scale;
  const msg = focus && (notice || missing) ? notice ?? "Το επιλεγμένο δεν φαίνεται σε αυτή την προβολή — π.χ. είναι κρυφό σε αυτή τη συσκευή ή δεν έχει περιεχόμενο τώρα." : null;
  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-2">Προεπισκόπηση{saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}<span className="font-normal text-eu-muted">· πάτα ένα κείμενο για να το αλλάξεις</span></span>
        <div className="flex gap-1 rounded-full bg-white border border-eu-line p-1" role="radiogroup" aria-label="Συσκευή προεπισκόπησης">
          {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] ${device === d ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{d === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}{d === "desktop" ? "Υπολογιστής" : "Κινητό"}</button>)}
        </div>
      </div>
      <div ref={box} className="relative rounded-2xl border border-eu-line bg-eu-line-2 overflow-hidden h-[calc(100dvh-10.5rem)] min-h-[26rem]">
        {msg && <p role="status" className="absolute z-10 left-3 right-3 top-3 m-0 flex items-start gap-2 rounded-xl bg-eu-navy/95 text-white px-3 py-2.5 text-[length:var(--fs-14)] shadow-lg"><EyeOff className="size-4 mt-0.5 shrink-0" aria-hidden /><span>{msg}</span></p>}
        <div style={{ width: target, height: inner, transform: `scale(${scale})`, transformOrigin: "top left", margin: device === "mobile" && w > target ? "0 auto" : undefined }}>
          <iframe ref={frame} key={v} onLoad={onLoad} title="Προεπισκόπηση" src={`${src}${src.includes("?") ? "&" : "?"}v=${v}`} className="block bg-white" style={{ width: target, height: "100%", border: 0 }} />
        </div>
      </div>
    </div>
  );
}
