"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, CircleAlert, Copy, ExternalLink, Film, GalleryHorizontal, GripVertical, ImagePlus, Info, Loader2, Monitor, Package, Plus, RotateCcw, Save, Search, Send, Smartphone, Trash2, Type, Wrench, X, Zap } from "lucide-react";
import { CinematicHero } from "@/components/widgets/CinematicHero";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import { ResultBanner, StatusPill } from "@/components/admin/settings/ui";
import type { Settings } from "@/lib/cms/settings";
import { priceLong } from "@/lib/format";
import { MAX_SLIDES, athensDay, emptySlide, normalizeDoc, slideStatus, toHeroSlide, validateDoc, type HeroDoc, type HeroSlideDoc, type ProductInfo, type SlideIssue, type SlideTone } from "@/lib/cms/hero-slides-model";
import { publishHeroAction, revertHeroAction, saveHeroAction, searchHeroProductsAction } from "./actions";

/*
 * Hero slides (ui-ux-pro-max): λεπτή σταθερή κεφαλίδα με κατάσταση / έλεγχο / αποθήκευση / δημοσίευση, πυκνά πεδία
 * (36 px σε υπολογιστή, 44 px στο κινητό), σειρά slides με σύρσιμο, προεπισκόπηση υπολογιστή ή κινητού πάντα ορατή
 * δίπλα στη φόρμα, ζωντανός έλεγχος πριν τη δημοσίευση.
 */
const TONE: Record<SlideTone, string> = { live: "bg-eu-green/12 text-eu-green", soon: "bg-eu-blue/10 text-eu-blue", ended: "bg-eu-red/10 text-eu-red", permanent: "bg-eu-yellow/40 text-eu-navy", off: "bg-eu-surface text-eu-muted" };
const input = "w-full min-w-0 rounded-lg border border-eu-line px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] bg-white outline-none focus:border-eu-blue disabled:bg-eu-surface disabled:text-eu-muted";
const chip = "inline-flex items-center justify-center gap-1 rounded-full border border-eu-line bg-white font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy disabled:opacity-45";
const iconBtn = "size-11 md:size-8 shrink-0 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface hover:text-eu-navy disabled:opacity-30 disabled:hover:bg-transparent";
const lbl = "font-bold text-eu-ink-2 text-[length:var(--fs-12)]";
const hint = "text-eu-muted text-[length:var(--fs-12)]";
const unopt = (u: string) => u.startsWith("http");
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v ?? null));
const titleOf = (s: HeroSlideDoc) => s.title.filter((t) => t.trim()).join(" ") || "Χωρίς τίτλο";
type Media = "image" | "imageMobile" | "video";
type Device = "desktop" | "mobile";

/** Πεδίο: ετικέτα, ορατή σύντομη εξήγηση, λάθος ακριβώς από κάτω. */
function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 min-w-0">
      <span className={lbl}>{label}</span>
      {children}
      {help && <span className={hint}>{help}</span>}
      {error && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-12)]">{error}</span>}
    </div>
  );
}

/** Κείμενο με μετρητή χαρακτήρων μέσα στο πεδίο (φαίνεται όταν πλησιάζει το όριο ή με την εστίαση). */
function Counted({ value, max, onChange, ...rest }: { value: string; max: number; onChange: (v: string) => void; "aria-label"?: string; placeholder?: string }) {
  const near = value.length >= max * 0.8;
  return (
    <span className="relative block min-w-0 group">
      <input {...rest} className={`${input} pr-12`} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      <span aria-hidden className={`absolute right-2.5 top-1/2 -translate-y-1/2 tabular-nums text-[length:var(--fs-12)] ${near ? "text-eu-amber font-bold" : "text-eu-muted opacity-0 group-focus-within:opacity-100"}`}>{value.length}/{max}</span>
    </span>
  );
}

/** Διακόπτης με ετικέτα και εξήγηση (όλη η γραμμή πατιέται). */
function Toggle({ on, onChange, title, desc }: { on: boolean; onChange: (v: boolean) => void; title: string; desc?: string }) {
  return (
    <label className="flex items-start justify-between gap-3 min-h-11 py-1 cursor-pointer">
      <span className="grid gap-0.5"><span className="font-semibold text-eu-ink text-[length:var(--fs-13)]">{title}</span>{desc && <span className={hint}>{desc}</span>}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-eu-blue ${on ? "bg-eu-navy" : "bg-eu-line-2"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} /></span>
    </label>
  );
}

function MediaRow({ title, help, url, video, onPick, onClear, error, children }: { title: string; help: string; url: string | null; video?: boolean; onPick: () => void; onClear?: () => void; error?: string; children?: ReactNode }) {
  return (
    <Field label={title} help={help} error={error}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative h-12 w-20 shrink-0 rounded-lg overflow-hidden bg-eu-surface grid place-items-center">
          {url && !video && <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized={unopt(url)} />}
          {url && video && <Film className="size-5 text-eu-navy" aria-hidden />}
          {!url && <ImagePlus className="size-5 text-eu-muted" aria-hidden />}
        </span>
        <button type="button" onClick={onPick} className={chip}><ImagePlus className="size-4" aria-hidden /> {url ? "Αλλαγή" : "Από τη βιβλιοθήκη"}</button>
        {url && onClear && <button type="button" onClick={onClear} aria-label={`${title}: αφαίρεση`} title="Αφαίρεση" className={iconBtn}><X className="size-4" aria-hidden /></button>}
      </div>
      {children}
    </Field>
  );
}

/** Αναζήτηση προϊόντος του καταλόγου (όνομα ή κωδικός) — για slide ή για προσφορά ημέρας. */
function ProductSearch({ onPick, label = "Αναζήτηση προϊόντος", autoFocus }: { onPick: (id: string, p: ProductInfo) => void; label?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<(ProductInfo & { id: string; sku: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setRes([]); return; }
    timer.current = setTimeout(async () => { setBusy(true); try { setRes(await searchHeroProductsAction(v)); } finally { setBusy(false); } }, 250);
  };
  return (
    <div className="grid gap-1 min-w-0">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
        <input aria-label={label} autoFocus={autoFocus} value={q} onChange={(e) => search(e.target.value)} placeholder="Όνομα ή κωδικός προϊόντος…" className={`${input} pl-8`} />
        {busy && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-eu-muted" aria-hidden />}
      </div>
      {q.trim().length >= 2 && !busy && !res.length && <span className={hint}>Κανένα προϊόν με «{q.trim()}».</span>}
      {res.length > 0 && (
        <ul className="m-0 p-0 list-none max-h-60 overflow-y-auto rounded-lg border border-eu-line divide-y divide-eu-line-2 bg-white">
          {res.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p.id, { title: p.title, slug: p.slug, cutout: p.cutout, price: p.price }); setQ(""); setRes([]); }} className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 min-h-11 hover:bg-eu-chip">
                <span className="relative size-8 shrink-0 rounded bg-eu-surface overflow-hidden">{p.cutout && <Image src={p.cutout} alt="" fill sizes="32px" className="object-contain" unoptimized={unopt(p.cutout)} />}</span>
                <span className="min-w-0"><span className="block font-bold text-eu-ink text-[length:var(--fs-13)] truncate">{p.title}</span><span className="block text-eu-muted text-[length:var(--fs-12)]">{p.sku}{p.price ? ` · ${priceLong(p.price)}` : ""}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductField({ s, info, onPick, onClear }: { s: HeroSlideDoc; info: ProductInfo | null; onPick: (id: string, p: ProductInfo) => void; onClear: () => void }) {
  const current = info ? `${info.title}${info.price ? ` · ${priceLong(info.price)}` : ""}` : s.cutout ? "Το αρχικό προϊόν του slide (χωρίς σύνδεση με τον κατάλογο)" : null;
  return (
    <Field label="Προϊόν (προαιρετικό)" help="Η φωτογραφία του χωρίς φόντο «επιπλέει» στο slide, με σύνδεσμο στη σελίδα του και την τρέχουσα τιμή.">
      {current && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-chip text-eu-navy font-bold px-2.5 py-1 text-[length:var(--fs-13)] min-w-0"><Package className="size-4 shrink-0" aria-hidden /><span className="truncate">{current}</span></span>
          <button type="button" onClick={onClear} aria-label="Αφαίρεση προϊόντος" title="Αφαίρεση" className={iconBtn}><X className="size-4" aria-hidden /></button>
        </div>
      )}
      <ProductSearch onPick={onPick} />
    </Field>
  );
}

/** Οι επόμενες n ημέρες (ώρα Ελλάδας) ως YYYY-MM-DD. */
function nextDays(n: number): string[] {
  const [y, m, d] = athensDay(new Date()).split("-").map(Number);
  return Array.from({ length: n }, (_, k) => new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10));
}
const dayLabel = (day: string, k: number) => {
  const dt = new Date(`${day}T12:00:00Z`);
  const wd = dt.toLocaleDateString("el-GR", { weekday: "short", timeZone: "UTC" });
  return { name: k === 0 ? "Σήμερα" : k === 1 ? "Αύριο" : wd.charAt(0).toUpperCase() + wd.slice(1), date: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}` };
};

/** «Προσφορά ημέρας»: πυκνός πίνακας 14 ημερών· κενή ημέρα = αυτόματα η μεγαλύτερη πραγματική έκπτωση. */
function DealsPanel({ deals, products, onSet }: { deals: { day: string; productId: string }[]; products: Record<string, ProductInfo>; onSet: (day: string, id: string | null, p?: ProductInfo) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const days = useMemo(() => nextDays(14), []);
  const set = days.filter((d) => deals.some((x) => x.day === d)).length;
  return (
    <div className="grid gap-2 min-w-0 max-w-4xl">
      <p className="m-0 inline-flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)] max-w-[80ch]"><Info className="size-3.5 mt-px shrink-0 text-eu-blue" aria-hidden /><span>Ένα προϊόν ανά ημέρα· τιμή, παλιά τιμή και έκπτωση έρχονται ζωντανά από την προσφορά του, το countdown λήγει τα μεσάνυχτα. Ημέρα χωρίς επιλογή = <b>αυτόματα η μεγαλύτερη πραγματική έκπτωση</b> με απόθεμα (αν δεν υπάρχει, το πλακίδιο κρύβεται).</span></p>
      <div data-help="deals.list" className="rounded-xl border border-eu-line bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-eu-surface/70 border-b border-eu-line text-[length:var(--fs-12)]">
          <span className="font-bold text-eu-ink-3 mr-auto">Επόμενες 14 ημέρες</span>
          <span className="text-eu-ink-3 tabular-nums"><b className="text-eu-ink">{set}</b> με επιλογή · {14 - set} αυτόματα</span>
        </div>
        <ol className="m-0 p-0 list-none divide-y divide-eu-line-2">
          {days.map((day, k) => {
            const id = deals.find((d) => d.day === day)?.productId ?? null, info = id ? products[id] : null, dl = dayLabel(day, k), open = editing === day;
            return (
              <li key={day} className={`grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-1 ${k === 0 ? "bg-eu-chip/40" : ""}`}>
                <span className="grid leading-tight"><span className={`font-bold text-[length:var(--fs-13)] ${k === 0 ? "text-eu-navy" : "text-eu-ink-2"}`}>{dl.name}</span><span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{dl.date}</span></span>
                <span className="min-w-0 flex items-center gap-2">
                  {id ? (
                    <>
                      <span className="relative size-8 shrink-0 rounded bg-eu-surface overflow-hidden">{info?.cutout && <Image src={info.cutout} alt="" fill sizes="32px" className="object-contain" unoptimized={unopt(info.cutout)} />}</span>
                      <span className="min-w-0 grid leading-tight"><span className="font-bold text-eu-ink text-[length:var(--fs-13)] truncate">{info?.title ?? "Επιλεγμένο προϊόν"}</span>{info?.price ? <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{priceLong(info.price)}</span> : null}</span>
                    </>
                  ) : <span className="inline-flex items-center gap-1 text-eu-muted text-[length:var(--fs-13)]"><Zap className="size-3.5 shrink-0" aria-hidden />Αυτόματα</span>}
                </span>
                <span className="flex items-center gap-0.5">
                  <button type="button" onClick={() => setEditing(open ? null : day)} aria-expanded={open} className={`${chip} md:min-h-8`}>{open ? "Κλείσιμο" : id ? "Αλλαγή" : "Επιλογή"}</button>
                  {id && <button type="button" onClick={() => onSet(day, null)} className={iconBtn} title="Αυτόματα" aria-label={`${dl.name} ${dl.date}: αφαίρεση προϊόντος (αυτόματα)`}><X className="size-4" aria-hidden /></button>}
                </span>
                {open && <div className="col-span-3 pb-1.5"><ProductSearch autoFocus label={`Προϊόν για ${dl.name} ${dl.date}`} onPick={(pid, p) => { onSet(day, pid, p); setEditing(null); }} /></div>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** Υπηρεσίες του πλακιδίου: ποιες και με ποια σειρά (καμία επιλογή = οι πρώτες 4). */
function ServicesPanel({ all, chosen, onChange }: { all: { slug: string; title: string; blurb: string }[]; chosen: string[]; onChange: (v: string[]) => void }) {
  const ordered = [...chosen.map((slug) => all.find((x) => x.slug === slug)).filter((x): x is (typeof all)[number] => !!x), ...all.filter((x) => !chosen.includes(x.slug))];
  const move = (slug: string, dir: -1 | 1) => { const i = chosen.indexOf(slug), j = i + dir; if (i < 0 || j < 0 || j >= chosen.length) return; const a = [...chosen]; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <div className="grid gap-2 min-w-0 max-w-4xl">
      <p className="m-0 inline-flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)] max-w-[80ch]"><Info className="size-3.5 mt-px shrink-0 text-eu-blue" aria-hidden /><span>Τσέκαρε ποιες υπηρεσίες φαίνονται και με ποια σειρά — προτείνονται 3–4. Στον υπολογιστή φαίνονται οι 4 πρώτες σε λίστα· σε tablet και κινητό εναλλάσσονται μία-μία. Χωρίς επιλογή: οι πρώτες 4. Τα κείμενα αλλάζουν στις <a href="/admin/ypiresies" className="text-eu-blue font-bold underline">Υπηρεσίες</a>.</span></p>
      <div data-help="services.list" className="rounded-xl border border-eu-line bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-eu-surface/70 border-b border-eu-line text-[length:var(--fs-12)]">
          <span className="font-bold text-eu-ink-3 mr-auto">Υπηρεσίες</span>
          <span className="text-eu-ink-3 tabular-nums">{chosen.length ? <><b className="text-eu-ink">{chosen.length}</b> επιλεγμένες</> : "Χωρίς επιλογή · οι πρώτες 4"}</span>
        </div>
        <ol className="m-0 p-0 list-none divide-y divide-eu-line-2">
          {ordered.map((x, pos) => {
            const on = chosen.includes(x.slug), idx = chosen.indexOf(x.slug), auto = !chosen.length && pos < 4;
            return (
              <li key={x.slug} className={`flex items-center gap-2 px-3 py-0.5 ${on || auto ? "" : "bg-eu-surface/30"}`}>
                <label className="flex flex-1 min-w-0 items-center gap-2.5 min-h-11 cursor-pointer">
                  <input type="checkbox" className="size-4 shrink-0 accent-eu-navy" checked={on} onChange={(e) => onChange(e.target.checked ? [...chosen, x.slug] : chosen.filter((y) => y !== x.slug))} />
                  <span title={auto ? "Μπαίνει αυτόματα (καμία επιλογή)" : undefined} className={`size-6 shrink-0 grid place-items-center rounded-full text-[length:var(--fs-12)] font-bold tabular-nums ${on ? "bg-eu-navy text-white" : auto ? "border border-dashed border-eu-navy/50 text-eu-navy" : "bg-eu-surface text-eu-muted"}`}>{on ? idx + 1 : auto ? pos + 1 : "–"}</span>
                  <span className="min-w-0 grid leading-tight"><span className={`font-bold text-[length:var(--fs-13)] ${on || auto ? "text-eu-ink" : "text-eu-ink-3"}`}>{x.title}</span><span className="text-eu-muted text-[length:var(--fs-12)] truncate">{x.blurb}</span></span>
                </label>
                {on && <>
                  <button type="button" aria-label={`${x.title}: πιο πάνω`} disabled={idx === 0} onClick={() => move(x.slug, -1)} className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={`${x.title}: πιο κάτω`} disabled={idx === chosen.length - 1} onClick={() => move(x.slug, 1)} className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
                </>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/**
 * Προεπισκόπηση σε πραγματική κλίμακα: ο hero ζωγραφίζεται στο πλάτος που έχει στο site (880 px υπολογιστής, 390 px
 * κινητό) και μικραίνει ώστε να χωρά στη στήλη και στο ύψος της οθόνης — οι γραμμές του τίτλου σπάνε όπως στο site.
 */
function ScaledPreview({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, h: 0, left: 0 });
  useEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const maxH = Math.max(260, window.innerHeight - 190);
      const scale = Math.min(1, o.clientWidth / width, maxH / Math.max(1, i.offsetHeight));
      setBox({ scale, h: i.offsetHeight * scale, left: Math.max(0, (o.clientWidth - width * scale) / 2) });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(o); ro.observe(i);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [width]);
  return (
    <div ref={outer} className="relative w-full overflow-hidden" style={box.h ? { height: box.h } : { aspectRatio: width === 880 ? "880 / 540" : "390 / 640", maxHeight: "60vh" }}>
      <div ref={inner} className="@container origin-top-left absolute top-0" style={{ width, left: box.left, transform: `scale(${box.scale})`, visibility: box.h ? "visible" : "hidden" }}>{children}</div>
    </div>
  );
}

type Tab = "text" | "media" | "when";
const TABS: { id: Tab; label: string; icon: typeof Type; fields: SlideIssue["field"][] }[] = [
  { id: "text", label: "Κείμενα", icon: Type, fields: ["title", "primary", "secondary"] },
  { id: "media", label: "Εικόνα", icon: ImagePlus, fields: ["image"] },
  { id: "when", label: "Πότε", icon: CalendarDays, fields: ["dates"] },
];
const tabOf = (issues: SlideIssue[]) => TABS.find((t) => issues.some((i) => t.fields.includes(i.field)))?.id ?? "text";

/** Η φόρμα ενός slide: κεφαλίδα με σειρά / αντίγραφο / διαγραφή και τρεις σύντομες καρτέλες — ποτέ όλα τα πεδία μαζί. */
function SlideForm({ s, k, total, issues, showErrors, info, tab, onTab, onChange, onMedia, onProduct, onMove, onDuplicate, onRemove, canAdd }: { s: HeroSlideDoc; k: number; total: number; issues: SlideIssue[]; showErrors: boolean; info: ProductInfo | null; tab: Tab; onTab: (t: Tab) => void; onChange: (p: Partial<HeroSlideDoc>) => void; onMedia: (m: Media) => void; onProduct: (id: string | null, p?: ProductInfo) => void; onMove: (dir: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void; canAdd: boolean }) {
  const err = (f: SlideIssue["field"]) => (showErrors ? issues.filter((i) => i.field === f).map((i) => i.message).join(" ") || undefined : undefined);
  const lines = [0, 1, 2].map((j) => s.title[j] ?? "");
  const bullets = [0, 1, 2].map((j) => s.bullets[j] ?? "");
  const setLine = (j: number, v: string) => onChange({ title: lines.map((x, i) => (i === j ? v : x)) });
  const setBullet = (j: number, v: string) => onChange({ bullets: bullets.map((x, i) => (i === j ? v : x)) });
  const setSecondary = (p: { label?: string; href?: string }) => { const next = { label: s.secondary?.label ?? "", href: s.secondary?.href ?? "", ...p }; onChange({ secondary: next.label || next.href ? next : null }); };
  const st = slideStatus(s, new Date());
  return (
    <div className="grid gap-2.5 min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        <span className="size-6 shrink-0 grid place-items-center rounded-md bg-eu-navy text-white font-bold text-[length:var(--fs-12)] tabular-nums">{k + 1}</span>
        <span className="min-w-0 flex-1 grid leading-tight pl-1">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{titleOf(s)}</span>
          <span className={`justify-self-start rounded-full px-1.5 text-[length:var(--fs-12)] font-bold whitespace-nowrap ${TONE[st.tone]}`}>{st.label}</span>
        </span>
        <button type="button" aria-label="Νωρίτερα στη σειρά" title="Νωρίτερα στη σειρά" disabled={k <= 0} onClick={() => onMove(-1)} className={iconBtn}><ArrowLeft className="size-4" aria-hidden /></button>
        <button type="button" aria-label="Αργότερα στη σειρά" title="Αργότερα στη σειρά" disabled={k >= total - 1} onClick={() => onMove(1)} className={iconBtn}><ArrowRight className="size-4" aria-hidden /></button>
        <button type="button" aria-label="Αντίγραφο του slide" title={canAdd ? "Αντίγραφο (ανενεργό, για να το αλλάξεις)" : `Έως ${MAX_SLIDES} slides`} disabled={!canAdd} onClick={onDuplicate} className={iconBtn}><Copy className="size-4" aria-hidden /></button>
        <button type="button" aria-label="Διαγραφή του slide" title="Διαγραφή" onClick={onRemove} className={`${iconBtn} hover:!bg-eu-red/10 hover:!text-eu-red`}><Trash2 className="size-4" aria-hidden /></button>
      </div>

      <div role="tablist" aria-label="Στοιχεία του slide" className="grid grid-cols-3 gap-0.5 rounded-lg bg-eu-surface p-0.5">
        {TABS.map((t) => {
          const on = tab === t.id, bad = issues.some((i) => t.fields.includes(i.field));
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onTab(t.id)} className={`inline-flex items-center justify-center gap-1.5 rounded-md min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${on ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}>
              <t.icon className="size-4" aria-hidden /> {t.label}{bad && <span className="size-1.5 rounded-full bg-eu-red" aria-label="λείπουν στοιχεία" />}
            </button>
          );
        })}
      </div>

      {tab === "text" && (
        <div role="tabpanel" className="grid gap-2.5">
          <Field label="Μικρός τίτλος" help="Η κίτρινη ετικέτα, π.χ. «Φθινόπωρο 2026 · ψυγεία»."><Counted aria-label="Μικρός τίτλος" max={60} value={s.kicker} onChange={(v) => onChange({ kicker: v })} /></Field>
          <Field label="Μεγάλος τίτλος · έως 3 σύντομες γραμμές" error={err("title")}>
            <div className="grid gap-1">{lines.map((v, j) => <Counted key={j} aria-label={`Γραμμή ${j + 1}`} placeholder={`Γραμμή ${j + 1}`} max={40} value={v} onChange={(x) => setLine(j, x)} />)}</div>
          </Field>
          <Field label="Κείμενο">
            <span className="relative block group">
              <textarea aria-label="Κείμενο" rows={3} className={`${input} py-1.5 pr-14 leading-snug resize-y`} maxLength={300} value={s.body} onChange={(e) => onChange({ body: e.target.value })} />
              <span aria-hidden className={`absolute right-2.5 bottom-2 tabular-nums text-[length:var(--fs-12)] ${s.body.length >= 240 ? "text-eu-amber font-bold" : "text-eu-muted opacity-0 group-focus-within:opacity-100"}`}>{s.body.length}/300</span>
            </span>
          </Field>
          <Field label="Κουμπί" help="Σύνδεσμος: σελίδα του site (/k/…) ή https://…" error={err("primary")}>
            <div className="grid gap-1"><Counted aria-label="Κείμενο κουμπιού" placeholder="Δες τα ψυγεία" max={60} value={s.primary.label} onChange={(v) => onChange({ primary: { ...s.primary, label: v } })} /><input aria-label="Σύνδεσμος κουμπιού" placeholder="/k/…" className={`${input} font-mono`} value={s.primary.href} onChange={(e) => onChange({ primary: { ...s.primary, href: e.target.value } })} /></div>
          </Field>
          <details className="group rounded-lg border border-eu-line" open={!!s.secondary || bullets.some(Boolean) || !!err("secondary")}>
            <summary className="cursor-pointer list-none px-2.5 min-h-11 md:min-h-9 flex items-center gap-1.5 font-bold text-eu-ink-2 text-[length:var(--fs-13)]"><Plus className="size-3.5 group-open:rotate-45 transition-transform" aria-hidden /> Δεύτερο κουμπί, σημεία</summary>
            <div className="grid gap-2.5 px-2.5 pb-2.5">
              <Field label="Δεύτερο κουμπί" help="Κενό = χωρίς δεύτερο κουμπί." error={err("secondary")}>
                <div className="grid gap-1"><Counted aria-label="Κείμενο δεύτερου κουμπιού" placeholder="Οδηγός επιλογής" max={60} value={s.secondary?.label ?? ""} onChange={(v) => setSecondary({ label: v })} /><input aria-label="Σύνδεσμος δεύτερου κουμπιού" placeholder="/odigoi/…" className={`${input} font-mono`} value={s.secondary?.href ?? ""} onChange={(e) => setSecondary({ href: e.target.value })} /></div>
              </Field>
              <Field label="Σημεία κάτω από τα κουμπιά" help="Έως 3, π.χ. «Δωρεάν μεταφορά».">
                <div className="grid gap-1">{bullets.map((v, j) => <Counted key={j} aria-label={`Σημείο ${j + 1}`} placeholder={`Σημείο ${j + 1}`} max={40} value={v} onChange={(x) => setBullet(j, x)} />)}</div>
              </Field>
            </div>
          </details>
        </div>
      )}

      {tab === "media" && (
        <div role="tabpanel" className="grid gap-3">
          <MediaRow title="Φωτογραφία φόντου" help="Οριζόντια, ≥ 1600 px πλάτος." url={s.image.url || null} onPick={() => onMedia("image")} error={err("image")}>
            <Counted aria-label="Τι δείχνει η φωτογραφία" placeholder="Τι δείχνει η φωτογραφία (για αναγνώστες οθόνης και Google)" max={160} value={s.image.alt} onChange={(v) => onChange({ image: { ...s.image, alt: v } })} />
          </MediaRow>
          <ProductField s={s} info={info} onPick={(id, p) => onProduct(id, p)} onClear={() => onProduct(null)} />
          <details className="group rounded-lg border border-eu-line" open={!!s.imageMobile || !!s.video}>
            <summary className="cursor-pointer list-none px-2.5 min-h-11 md:min-h-9 flex items-center gap-1.5 font-bold text-eu-ink-2 text-[length:var(--fs-13)]"><Plus className="size-3.5 group-open:rotate-45 transition-transform" aria-hidden /> Φωτογραφία κινητού, βίντεο</summary>
            <div className="grid gap-3 px-2.5 pb-2.5">
              <MediaRow title="Φωτογραφία για κινητά" help="Κάθετη. Χωρίς αυτήν το κινητό κόβει την οριζόντια — δες την προεπισκόπηση «Κινητό»." url={s.imageMobile?.url ?? null} onPick={() => onMedia("imageMobile")} onClear={() => onChange({ imageMobile: null })} />
              <MediaRow title="Βίντεο φόντου" help="Σύντομο mp4 χωρίς ήχο· η φωτογραφία μένει για αργές συνδέσεις." url={s.video?.url ?? null} video onPick={() => onMedia("video")} onClear={() => onChange({ video: null })} />
            </div>
          </details>
        </div>
      )}

      {tab === "when" && (
        <div role="tabpanel" className="grid gap-2">
          <div className="grid divide-y divide-eu-line-2 rounded-lg border border-eu-line px-2.5">
            <Toggle on={s.active} onChange={(v) => onChange({ active: v })} title="Ενεργό" desc="Ανενεργό = μένει εδώ, δεν φαίνεται στο site και δεν ελέγχεται." />
            <Toggle on={s.permanent} onChange={(v) => onChange({ permanent: v, ...(v ? { from: null, to: null } : {}) })} title="Μόνιμο (εφεδρικό)" desc="Χωρίς ημερομηνίες· βγαίνει μόνο όταν δεν υπάρχει άλλο ενεργό slide, ώστε η αρχική να μην είναι ποτέ άδεια." />
          </div>
          {!s.permanent && (
            <div className="grid gap-2 grid-cols-2">
              <Field label="Από" help="Κενό = από τώρα" error={err("dates")}><input type="date" className={input} value={s.from ?? ""} onChange={(e) => onChange({ from: e.target.value || null })} /></Field>
              <Field label="Έως (και)" help="Κενό = χωρίς λήξη"><input type="date" className={input} value={s.to ?? ""} onChange={(e) => onChange({ to: e.target.value || null })} /></Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HeroSlidesEditor({ initial, published: pub0, publishedAt: pubAt, products: p0, settings, canUpload, services: allServices, embedded = false }: { embedded?: boolean; initial: HeroDoc; published: HeroDoc | null; publishedAt: string | null; products: Record<string, ProductInfo>; settings: Settings; canUpload: boolean; services: { slug: string; title: string; blurb: string }[] }) {
  const [section, setSection] = useState<"slides" | "deal" | "services">("slides");
  const [doc, setDoc] = useState<HeroDoc>(initial);
  const [savedJson, setSavedJson] = useState(() => stable(initial));
  const [pubJson, setPubJson] = useState(() => (pub0 ? stable(normalizeDoc(pub0)) : null));
  const [publishedAt, setPublishedAt] = useState(pubAt);
  const [products, setProducts] = useState(p0);
  const [selId, setSelId] = useState<string | null>(initial.slides[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("text");
  const [tried, setTried] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState<{ id: string; field: Media } | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [drag, setDrag] = useState<{ id: string; over: number | null } | null>(null);
  const [pending, start] = useTransition();
  const now = useMemo(() => new Date(), []);

  const dirty = stable(doc) !== savedJson;
  const published = pubJson != null;
  const draftDiffers = !published || stable(normalizeDoc(doc)) !== pubJson;
  const issues = useMemo(() => validateDoc(doc), [doc]);
  const issueList = doc.slides.flatMap((s, k) => (issues[s.id] ?? []).map((i) => ({ s, k, i })));
  const onSite = doc.slides.filter((s) => slideStatus(s, now).tone === "live");
  const fallback = onSite.length ? [] : doc.slides.filter((s) => slideStatus(s, now).tone === "permanent");

  // προειδοποίηση πριν φύγεις με μη αποθηκευμένες αλλαγές· ⌘/Ctrl+S = αποθήκευση πρόχειρου
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (!msg?.ok) return; const t = setTimeout(() => setMsg(null), 6000); return () => clearTimeout(t); }, [msg]);

  const patch = (id: string, p: Partial<HeroSlideDoc>) => setDoc((d) => ({ ...d, slides: d.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const setDeal = (day: string, id: string | null, info?: ProductInfo) => { if (id && info) setProducts((m) => ({ ...m, [id]: info })); setDoc((d) => ({ ...d, deals: [...(d.deals ?? []).filter((x) => x.day !== day), ...(id ? [{ day, productId: id }] : [])].sort((a, b) => a.day.localeCompare(b.day)) })); };
  const moveTo = (id: string, to: number) => setDoc((d) => {
    const i = d.slides.findIndex((s) => s.id === id);
    if (i < 0 || to < 0 || to >= d.slides.length || to === i) return d;
    const a = [...d.slides]; const [x] = a.splice(i, 1); a.splice(to, 0, x);
    return { ...d, slides: a };
  });
  const remove = (id: string) => {
    if (!confirm("Διαγραφή του slide; Φεύγει από το site με την επόμενη δημοσίευση.")) return;
    const i = doc.slides.findIndex((s) => s.id === id), rest = doc.slides.filter((s) => s.id !== id);
    setDoc((d) => ({ ...d, slides: rest })); setSelId(rest[Math.min(i, rest.length - 1)]?.id ?? null);
  };
  const add = () => { const s = emptySlide(); setDoc((d) => ({ ...d, slides: [...d.slides, s] })); setSelId(s.id); setTab("text"); setSection("slides"); };
  const duplicate = (src: HeroSlideDoc) => {
    const c: HeroSlideDoc = { ...structuredClone(src), id: emptySlide().id, active: false };
    setDoc((d) => { const i = d.slides.findIndex((s) => s.id === src.id); const a = [...d.slides]; a.splice(i + 1, 0, c); return { ...d, slides: a }; });
    setSelId(c.id);
    setMsg({ ok: true, text: "Έγινε αντίγραφο — είναι ανενεργό μέχρι να το ενεργοποιήσεις στο «Πότε»." });
  };
  const loaded = (d: HeroDoc) => { setDoc(d); setSavedJson(stable(d)); };
  const goIssue = (id: string, list: SlideIssue[]) => { setSection("slides"); setSelId(id); setTab(tabOf(list)); setTried(true); };

  const save = () => { if (!dirty || pending) return; start(async () => { const r = await saveHeroAction(doc); loaded(r.doc); setMsg({ ok: true, text: "Αποθηκεύτηκε ως πρόχειρο. Το site αλλάζει μόνο με «Δημοσίευση»." }); }); };
  saveRef.current = save;
  const publish = () => {
    setTried(true);
    const first = Object.keys(issues)[0];
    if (first) { goIssue(first, issues[first]); setShowIssues(true); setMsg({ ok: false, text: `${issueList.length === 1 ? "Ένα στοιχείο θέλει" : `${issueList.length} στοιχεία θέλουν`} διόρθωση πριν τη δημοσίευση.` }); return; }
    if (!confirm(`Δημοσίευση; Οι επισκέπτες θα δουν αμέσως ${onSite.length === 1 ? "1 ενεργό slide" : `${onSite.length || fallback.length} slides`} στην αρχική.`)) return;
    start(async () => {
      const r = await publishHeroAction(doc);
      if (!r.ok) { const id = Object.keys(r.issues)[0]; if (id) goIssue(id, r.issues[id]); setMsg({ ok: false, text: "Κάποια στοιχεία θέλουν διόρθωση." }); return; }
      loaded(r.doc); setPubJson(stable(normalizeDoc(r.doc))); setPublishedAt(r.publishedAt); setTried(false); setShowIssues(false);
      setMsg({ ok: true, text: "Δημοσιεύτηκε — το βλέπουν τώρα οι επισκέπτες." });
    });
  };
  const revert = () => { if (confirm("Ακύρωση όλων των αλλαγών; Το πρόχειρο γυρίζει σε ό,τι δείχνει τώρα το site.")) start(async () => { const r = await revertHeroAction(); loaded(r.doc); setTried(false); setSelId(r.doc.slides[0]?.id ?? null); setMsg({ ok: true, text: "Το πρόχειρο γύρισε στο δημοσιευμένο." }); }); };

  const sel = doc.slides.find((s) => s.id === selId) ?? null;
  const selIdx = sel ? doc.slides.indexOf(sel) : -1;
  const info = sel?.productId ? products[sel.productId] ?? null : null;
  const preview = sel ? toHeroSlide(sel, info) : null;
  const shown = preview && device === "mobile" ? { ...preview, image: preview.imageMobile ?? preview.image, imageMobile: undefined } : preview;
  const when = publishedAt ? new Date(publishedAt).toLocaleString("el-GR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const status = dirty ? (["incomplete", "Μη αποθηκευμένες αλλαγές"] as const) : !published ? (["off", "Δεν έχει δημοσιευτεί"] as const) : draftDiffers ? (["incomplete", "Πρόχειρο με αλλαγές"] as const) : (["live", `Δημοσιευμένο${when ? ` · ${when}` : ""}`] as const);
  const dealsSet = (doc.deals ?? []).filter((d) => d.day >= athensDay(now)).length;
  const canAdd = doc.slides.length < MAX_SLIDES;

  const onDrop = (to: number) => { if (drag) moveTo(drag.id, to); setDrag(null); };

  return (
    <div className="@container grid gap-3 min-w-0">
      {/* λεπτή σταθερή κεφαλίδα: τι, κατάσταση, έλεγχος, αποθήκευση, δημοσίευση */}
      <div data-help="slides.header" className={`@md:sticky top-0 z-30 -mx-4 -mt-4 px-4 py-2 ${embedded ? "@md:-mx-5 @md:-mt-5 @md:px-5" : "@md:-mx-6 @md:-mt-6 @md:px-6"} bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><GalleryHorizontal className="size-5 text-eu-blue" aria-hidden /> Hero slides</h2>
          <StatusPill status={status[0]} text={status[1]} />
          {published && <a href="/" target="_blank" rel="noopener noreferrer" aria-label="Η αρχική στο site" title="Στο site" className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:bg-white"><span className="hidden @md:inline">Στο site</span> <ExternalLink className="size-3.5" aria-hidden /></a>}
          <div className="w-full @3xl:w-auto @3xl:ml-auto grid grid-flow-col auto-cols-fr @3xl:flex items-center gap-1.5">
            {published && draftDiffers && <button type="button" onClick={revert} disabled={pending} title="Το πρόχειρο γυρίζει σε ό,τι δείχνει τώρα το site" className={chip}><RotateCcw className="size-4 hidden @sm:block" aria-hidden /> Ακύρωση</button>}
            <button data-help="slides.check" type="button" onClick={() => setShowIssues((x) => !x)} aria-expanded={showIssues} title="Έλεγχος πριν τη δημοσίευση" className={`${chip} ${issueList.length ? "!border-eu-red text-eu-red" : "!border-eu-green/50 text-eu-green"}`}>{issueList.length ? <CircleAlert className="size-4 shrink-0" aria-hidden /> : <Check className="size-4 shrink-0" aria-hidden />}<span className="truncate">{issueList.length ? `${issueList.length} για διόρθωση` : "Έτοιμο"}</span></button>
            <button type="button" onClick={save} disabled={pending || !dirty} title="Αποθήκευση πρόχειρου (⌘S)" className={`${chip} !border-eu-navy text-eu-navy`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4 hidden @sm:block" aria-hidden />} Αποθήκευση</button>
            <button data-help="slides.publish" type="button" onClick={publish} disabled={pending || (!dirty && !draftDiffers)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-4 min-h-11 md:min-h-9 hover:bg-eu-blue disabled:opacity-45 justify-center whitespace-nowrap"><Send className="size-4 hidden @sm:block" aria-hidden />{dirty || draftDiffers ? "Δημοσίευση" : <><span className="@md:hidden">Δημοσιευμένο</span><span className="hidden @md:inline">Χωρίς αλλαγές</span></>}</button>
          </div>
        </div>
        {msg && <div className="relative"><ResultBanner ok={msg.ok}><span role="status" className="block pr-8">{msg.text}</span></ResultBanner><button type="button" onClick={() => setMsg(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button></div>}
        {showIssues && (
          issueList.length ? (
            <ul className="m-0 p-0 list-none grid gap-0.5 max-h-[40vh] overflow-y-auto rounded-xl bg-white border border-eu-line p-1.5">
              {issueList.map(({ s, k, i }, n) => (
                <li key={n}><button type="button" onClick={() => goIssue(s.id, [i])} className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 min-h-11 md:min-h-9 hover:bg-eu-surface"><CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden /><span className="text-[length:var(--fs-13)]"><b>Slide {k + 1} · {titleOf(s)}:</b> {i.message}</span></button></li>
              ))}
            </ul>
          ) : <p className="m-0 rounded-xl bg-white border border-eu-line px-3 py-2 text-eu-green font-bold text-[length:var(--fs-13)] inline-flex items-center gap-1.5"><Check className="size-4" aria-hidden /> Όλα τα ενεργά slides έχουν τίτλο, φωτογραφία με περιγραφή και κουμπί με σωστό σύνδεσμο.</p>
        )}
        {/* τρία μέρη του hero */}
        <div data-help="slides.sections" role="tablist" aria-label="Μέρη του hero" className="grid grid-cols-[auto_minmax(0,1fr)_auto] @md:flex gap-0.5 rounded-lg bg-white/70 border border-eu-line p-0.5 @md:justify-self-start">
          {([["slides", "Slides", GalleryHorizontal, `${doc.slides.length}`], ["deal", "Προσφορά ημέρας", Zap, `${dealsSet}/14`], ["services", "Υπηρεσίες", Wrench, `${(doc.services ?? []).length || 4}`]] as const).map(([id, label, Icon, n]) => (
            <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`inline-flex items-center justify-center gap-1.5 rounded-md min-h-11 md:min-h-8 px-1.5 @md:px-2.5 font-bold text-[length:var(--fs-13)] min-w-0 ${section === id ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:text-eu-navy hover:bg-white"}`}>
              <Icon className="size-4 shrink-0 hidden @md:block" aria-hidden /><span className="truncate">{label}</span><span className={`hidden @sm:inline tabular-nums text-[length:var(--fs-12)] ${section === id ? "text-white/75" : "text-eu-muted"}`}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      {section === "deal" && <DealsPanel deals={doc.deals ?? []} products={products} onSet={setDeal} />}
      {section === "services" && <ServicesPanel all={allServices} chosen={doc.services ?? []} onChange={(v) => setDoc((d) => ({ ...d, services: v }))} />}

      {section === "slides" && <>
        {/* σειρά προβολής: όλα με μια ματιά, σύρσιμο για αλλαγή σειράς */}
        <section data-help="slides.strip" aria-label="Slides με τη σειρά προβολής" className="grid gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[length:var(--fs-12)]">
            <span className="font-bold text-eu-ink-2">Σειρά προβολής</span>
            <span className="text-eu-ink-3">{onSite.length ? <><b className="text-eu-green">{onSite.length}</b> στο site τώρα</> : fallback.length ? <>Κανένα με ημερομηνίες τώρα · φαίνεται το μόνιμο</> : <b className="text-eu-red">Κανένα ενεργό τώρα — η αρχική μένει χωρίς hero</b>}</span>
            <span className="hidden md:inline text-eu-muted">Σύρε μια κάρτα για να αλλάξεις σειρά.</span>
          </div>
          <ol className="m-0 p-0 list-none grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,13rem),1fr))]">
            {doc.slides.map((s, k) => {
              const st = slideStatus(s, now), on = s.id === selId, bad = !!issues[s.id]?.length, over = drag?.over === k && drag.id !== s.id;
              return (
                <li key={s.id} draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ id: s.id, over: null }); }} onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.over !== k) setDrag({ ...drag, over: k }); }} onDrop={(e) => { e.preventDefault(); onDrop(k); }}
                  className={`relative rounded-lg ${drag?.id === s.id ? "opacity-40" : ""} ${over ? "outline-2 outline-dashed outline-eu-blue outline-offset-2" : ""}`}>
                  <button type="button" onClick={() => setSelId(s.id)} aria-current={on} className={`w-full text-left flex items-center gap-2 rounded-lg border bg-white p-1 pr-2 min-h-11 ${on ? "border-eu-navy ring-1 ring-eu-navy" : "border-eu-line hover:border-eu-navy/50"}`}>
                    <span className="relative h-10 w-16 shrink-0 rounded-md overflow-hidden bg-eu-navy">
                      {s.image.url && <Image src={s.image.url} alt="" fill sizes="64px" className="object-cover opacity-70" unoptimized={unopt(s.image.url)} />}
                      <span className="absolute left-0.5 top-0.5 rounded bg-white/90 px-1 text-[length:var(--fs-12)] leading-tight font-bold text-eu-navy tabular-nums">{k + 1}</span>
                    </span>
                    <span className="min-w-0 grid leading-tight gap-0.5">
                      <span className="font-bold text-eu-ink truncate text-[length:var(--fs-13)]">{titleOf(s)}</span>
                      <span className="flex items-center gap-1 min-w-0">
                        <span className={`rounded-full px-1.5 text-[length:var(--fs-12)] font-bold truncate ${TONE[st.tone]}`}>{st.label}</span>
                        {bad && <CircleAlert className="size-3.5 shrink-0 text-eu-red" aria-label="λείπουν στοιχεία" />}
                      </span>
                    </span>
                    <GripVertical className="hidden md:block size-4 ml-auto shrink-0 text-eu-muted cursor-grab" aria-hidden />
                  </button>
                </li>
              );
            })}
            {canAdd && (
              <li onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); onDrop(doc.slides.length - 1); }}>
                <button type="button" onClick={add} className="w-full h-full min-h-11 rounded-lg border border-dashed border-eu-line text-eu-navy font-bold inline-flex items-center justify-center gap-1.5 hover:border-eu-navy hover:bg-white text-[length:var(--fs-13)]"><Plus className="size-4" aria-hidden /> Νέο slide</button>
              </li>
            )}
          </ol>
        </section>

        {sel ? (
          <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] items-start">
            {/* προεπισκόπηση: πάντα ορατή, υπολογιστής ή κινητό */}
            <div data-help="slides.preview" className="grid gap-1.5 min-w-0 @4xl:sticky @4xl:top-28 rounded-xl border border-eu-line bg-white p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-[length:var(--fs-12)] text-eu-ink-3 min-w-0 truncate"><b className="text-eu-ink-2">Προεπισκόπηση</b> · ό,τι γράφεις φαίνεται αμέσως</span>
                <div role="radiogroup" aria-label="Συσκευή" className="flex gap-0.5 rounded-lg bg-eu-surface p-0.5">
                  {([["desktop", "Υπολογιστής", Monitor], ["mobile", "Κινητό", Smartphone]] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" role="radio" aria-checked={device === id} onClick={() => setDevice(id)} className={`inline-flex items-center gap-1 rounded-md px-2 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] ${device === id ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}><Icon className="size-4" aria-hidden />{label}</button>
                  ))}
                </div>
              </div>
              {device === "mobile" && !sel.imageMobile && <p className="m-0 inline-flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)]"><Info className="size-3.5 mt-px shrink-0 text-eu-amber" aria-hidden /><span>Χωρίς φωτογραφία κινητού κόβεται η οριζόντια. <button type="button" onClick={() => setPicker({ id: sel.id, field: "imageMobile" })} className="font-bold text-eu-blue underline">Διάλεξε κάθετη φωτογραφία</button></span></p>}
              <div className={`rounded-lg ${device === "mobile" ? "bg-eu-surface py-2" : ""}`}>
                <ScaledPreview width={device === "mobile" ? 390 : 880}>
                  <SettingsProvider settings={settings}><CinematicHero key={`${device}:${JSON.stringify(shown)}`} slides={[shown!]} /></SettingsProvider>
                </ScaledPreview>
              </div>
            </div>
            <div data-help="slides.form" className="rounded-xl border border-eu-line bg-white p-2.5 min-w-0">
              <SlideForm s={sel} k={selIdx} total={doc.slides.length} issues={issues[sel.id] ?? []} showErrors={tried} info={info} tab={tab} onTab={setTab} canAdd={canAdd}
                onChange={(p) => patch(sel.id, p)} onMedia={(field) => setPicker({ id: sel.id, field })} onRemove={() => remove(sel.id)}
                onMove={(dir) => moveTo(sel.id, selIdx + dir)} onDuplicate={() => duplicate(sel)}
                onProduct={(id, p) => { if (id && p) setProducts((m) => ({ ...m, [id]: p })); patch(sel.id, { productId: id, cutout: null, productHref: null }); }} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-eu-line bg-white p-6 grid justify-items-center gap-2 text-center">
            <GalleryHorizontal className="size-8 text-eu-muted" aria-hidden />
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν υπάρχει κανένα slide — η αρχική δείχνει μόνο την προσφορά ημέρας και τις υπηρεσίες.</p>
            <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-4 min-h-11 md:min-h-9 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέο slide</button>
          </div>
        )}
      </>}

      {picker && (
        <MediaPickerDialog accept={[picker.field === "video" ? "video" : "image"]} canWrite={canUpload} onClose={() => setPicker(null)}
          onSelect={(a) => {
            const x = a[0];
            if (x) {
              const cur = doc.slides.find((y) => y.id === picker.id);
              if (picker.field === "image") patch(picker.id, { image: { url: x.url, alt: cur?.image.alt || x.alt || "" } });
              else if (picker.field === "imageMobile") patch(picker.id, { imageMobile: { url: x.url } });
              else patch(picker.id, { video: { url: x.url } });
            }
            setPicker(null);
          }} />
      )}
    </div>
  );
}
