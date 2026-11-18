"use client";

import { BANNER_TEMPLATES } from "@/lib/promo/banner-design";
import { ImageUrlField } from "@/components/admin/promos/ImageUrlField";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Camera, Cpu, Eye, Leaf, Plus, Shield, Sparkles, Wifi, X, Zap } from "lucide-react";
import type { BrandBlock, Cta } from "@/lib/cms/brand-store";
import { blockOptionsAction, promoProductsAction, type BlockOptions, type PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { AUTO_SOURCES, BLOCK_GROUPS, BLOCK_INFO, newBlock } from "@/lib/cms/blocks-catalog";
export { BLOCK_GROUPS, BLOCK_INFO, newBlock };
import { ProductList } from "./ProductPicker";
import { Area, DateTime, LinkField, MediaUrl, StringList, Txt } from "./fields";
import { CategoryPicker } from "./CategoryPicker";

type Ctx = { brandId: string | null; brandName: string; info: Record<string, PickProduct>; onInfo: (p: PickProduct[]) => void };
type B<T extends BrandBlock["type"]> = Extract<BrandBlock, { type: T }>;

export const PROMO_TYPES: BrandBlock["type"][] = ["ad", "promo-products", "promo-landing", "coupon"];

let optCache: BlockOptions | null = null;
/** Οι επιλογές από Προσφορές / καταστήματα / μάρκες, μία φορά ανά συνεδρία του editor. */
export function useOptions() {
  const [o, setO] = useState<BlockOptions | null>(optCache);
  useEffect(() => { if (!o) blockOptionsAction().then((x) => { optCache = x; setO(x); }); }, [o]);
  return o;
}
const nowMs = () => Date.now();
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "short" }) : null);

function Pick({ label, help, value, onChange, options, empty }: { label: string; help?: string; value: string; onChange: (v: string, label: string) => void; options: { value: string; label: string }[] | null; empty: string }) {
  return (
    <label className="grid gap-1 min-w-0">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
      {options === null ? <span className="text-eu-muted text-[length:var(--fs-14)] min-h-12 inline-flex items-center">Φόρτωση…</span> : options.length === 0 ? <span className="rounded-xl bg-eu-surface px-3 py-2 text-eu-muted text-[length:var(--fs-14)]">{empty}</span> : (
        <select value={value} onChange={(e) => onChange(e.target.value, options.find((x) => x.value === e.target.value)?.label ?? "")} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white">
          <option value="">— διάλεξε —</option>
          {options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      )}
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</span>}
    </label>
  );
}



export const TECH_ICONS = { cpu: Cpu, eye: Eye, zap: Zap, wifi: Wifi, shield: Shield, sparkles: Sparkles, leaf: Leaf, camera: Camera } as const;
const ICON_LABEL: Record<keyof typeof TECH_ICONS, string> = { cpu: "Επεξεργαστής", eye: "Εικόνα", zap: "Ενέργεια", wifi: "Σύνδεση", shield: "Ασφάλεια", sparkles: "AI / νέο", leaf: "Οικολογία", camera: "Κάμερα" };


function Item({ title, children, onUp, onDown, onRemove }: { title: string; children: ReactNode; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  return (
    <div className="rounded-xl border border-eu-line bg-eu-surface/50 p-3 grid gap-3 min-w-0">
      <div className="flex items-center gap-1">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] flex-1 min-w-0 truncate">{title}</span>
        {onUp && <button type="button" onClick={onUp} aria-label="Πιο πάνω" className="size-10 grid place-items-center rounded-full hover:bg-white"><ArrowUp className="size-4" aria-hidden /></button>}
        {onDown && <button type="button" onClick={onDown} aria-label="Πιο κάτω" className="size-10 grid place-items-center rounded-full hover:bg-white"><ArrowDown className="size-4" aria-hidden /></button>}
        <button type="button" onClick={onRemove} aria-label="Αφαίρεση" className="size-10 grid place-items-center rounded-full text-eu-red hover:bg-eu-red/10"><X className="size-4" aria-hidden /></button>
      </div>
      {children}
    </div>
  );
}
const swap = <T,>(a: T[], i: number, d: number) => { const x = [...a]; [x[i], x[i + d]] = [x[i + d], x[i]]; return x; };

function Choice<T extends string>({ label, value, options, onChange, help }: { label: string; value: T; options: { value: T; label: string; help?: string }[]; onChange: (v: T) => void; help?: string }) {
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-2 min-w-0">
      <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">{label}</legend>
      <div className="flex flex-wrap gap-2">{options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} title={o.help} onClick={() => onChange(o.value)} className={`rounded-full border-2 px-4 min-h-10 font-bold text-[length:var(--fs-14)] ${value === o.value ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line"}`}>{o.label}</button>)}</div>
      {(options.find((o) => o.value === value)?.help ?? help) && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{options.find((o) => o.value === value)?.help ?? help}</span>}
    </fieldset>
  );
}

/** Κουμπί (κείμενο + σύνδεσμος), προαιρετικό: άδειο κείμενο = χωρίς κουμπί. */
function CtaFields({ label, value, onChange }: { label: string; value?: Cta; onChange: (v: Cta | undefined) => void }) {
  return (
    <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
      <Txt label={`${label} · κείμενο`} value={value?.label ?? ""} onChange={(v) => onChange(v || value?.href ? { label: v, href: value?.href ?? "" } : undefined)} max={36} help="Κενό = χωρίς κουμπί." />
      {value && <LinkField label={`${label} · σύνδεσμος`} value={value.href} onChange={(v) => onChange({ label: value.label, href: v })} />}
    </div>
  );
}

const optBrandId = (slug: string) => optCache?.brands.find((b) => b.slug === slug)?.id ?? null;
function BrandChoice({ value, onChange }: { value?: { slug: string; name: string }; onChange: (v: { slug: string; name: string } | undefined) => void }) {
  const o = useOptions();
  return <Pick label="Μάρκα (προαιρετικό)" help="Κενό = όλος ο κατάλογος." value={value?.slug ?? ""} onChange={(v, l) => onChange(v ? { slug: v, name: l } : undefined)} options={o ? o.brands.map((b) => ({ value: b.slug, label: b.name })) : null} empty="Καμία μάρκα." />;
}

/** Η φόρμα ενός component: τα πεδία του τύπου του και, κοινό για όλα, το χρώμα φόντου του. */
export function BlockFields({ b, set, ctx }: { b: BrandBlock; set: (b: BrandBlock) => void; ctx: Ctx }): ReactNode {
  const cur = b.bg && /^#[0-9a-f]{6}$/i.test(b.bg) ? b.bg : "";
  return (
    <div className="grid gap-4">
      <TypeFields b={b} set={set} ctx={ctx} />
      <div className="grid gap-1 min-w-0">
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Χρώμα φόντου</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="color" aria-label="Χρώμα φόντου" value={cur || "#ffffff"} onChange={(e) => set({ ...b, bg: e.target.value })} className="size-11 rounded-lg border-2 border-eu-line bg-white p-0.5 cursor-pointer" />
          {[["#05060f", "Μαύρο καμπάνιας"], ["#122a58", "Μπλε Euronics"], ["#f1c400", "Κίτρινο"], ["#f3f5f9", "Ανοιχτό γκρι"]].map(([c, t]) => <button key={c} type="button" aria-pressed={cur === c} onClick={() => set({ ...b, bg: c })} className={`rounded-full border-2 px-3 min-h-11 font-bold text-[length:var(--fs-13)] ${cur === c ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-navy/50"}`}>{t}</button>)}
          {cur && <button type="button" onClick={() => set({ ...b, bg: undefined })} className="rounded-full border border-eu-line px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface">Χωρίς χρώμα</button>}
        </div>
        <span className="text-eu-muted text-[length:var(--fs-13)]">Πίσω από το component, σε όλο το πλάτος της ζώνης. Σε σκούρο χρώμα τα κείμενα γίνονται μόνα τους ανοιχτά. Κενό = το φόντο της σελίδας.</span>
      </div>
      <div className="grid gap-1 min-w-0">
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Χρώμα γραμμάτων</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="color" aria-label="Χρώμα γραμμάτων" value={b.ink && /^#[0-9a-f]{6}$/i.test(b.ink) ? b.ink : "#1a1a1a"} onChange={(e) => set({ ...b, ink: e.target.value })} className="size-11 rounded-lg border-2 border-eu-line bg-white p-0.5 cursor-pointer" />
          {[["#ffffff", "Λευκά"], ["#1a1a1a", "Σκούρα"], ["#122a58", "Μπλε Euronics"], ["#f1c400", "Κίτρινα"], ["#22e06b", "Πράσινα"]].map(([c, t]) => <button key={c} type="button" aria-pressed={b.ink === c} onClick={() => set({ ...b, ink: c })} className={`rounded-full border-2 px-3 min-h-11 font-bold text-[length:var(--fs-13)] ${b.ink === c ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-navy/50"}`}>{t}</button>)}
          {b.ink && <button type="button" onClick={() => set({ ...b, ink: undefined })} className="rounded-full border border-eu-line px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface">Αυτόματο</button>}
        </div>
        <span className="text-eu-muted text-[length:var(--fs-13)]">Τίτλοι και κείμενα του component. «Αυτόματο» = λευκά σε σκούρο φόντο, σκούρα σε ανοιχτό. Διάλεξε χρώμα που ξεχωρίζει καθαρά από το φόντο.</span>
      </div>
      <fieldset data-help="zones.spacing" className="m-0 p-0 border-0 grid gap-2 min-w-0">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Αποστάσεις</legend>
        {([["headGap", "Τίτλος → περιεχόμενο", "Το κενό ανάμεσα στον τίτλο του component και σε ό,τι ακολουθεί (π.χ. τα τετράγωνα ενός banner)."], ["padY", "Πάνω και κάτω από το component", "Το κενό πριν και μετά το component μέσα στη ζώνη."]] as const).map(([k, label, help]) => (
          <div key={k} className="grid gap-1">
            <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">{label}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
              {([[undefined, "Κανονική"], [0, "Κολλητά"], [1, "Μικρή"], [2, "Μεσαία"], [3, "Μεγάλη"]] as const).map(([v, t]) => (
                <button key={t} type="button" aria-pressed={b[k] === v} onClick={() => set({ ...b, [k]: v })} className={`rounded-xl border-2 px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] ${b[k] === v ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-navy/50"}`}>{t}</button>
              ))}
            </div>
            <span className="text-eu-muted text-[length:var(--fs-13)]">{help}</span>
          </div>
        ))}
      </fieldset>
      <fieldset className="m-0 p-0 border-0 grid gap-2 min-w-0">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Χρώματα ανά στοιχείο</legend>
        {([["kickerColor", "Υπέρτιτλος", "Η μικρή γραμμή πάνω από τον τίτλο."], ["titleColor", "Τίτλος", "Η επικεφαλίδα του component."], ["linkColor", "Σύνδεσμοι", "Οι σύνδεσμοι κειμένου, π.χ. «Όλες οι προσφορές»."]] as const).map(([k, l, h]) => {
          const val = b[k] && /^#[0-9a-f]{6}$/i.test(b[k]!) ? b[k]! : "";
          return (
            <div key={k} className="flex flex-wrap items-center gap-2">
              <input type="color" aria-label={`Χρώμα: ${l}`} value={val || "#122a58"} onChange={(e) => set({ ...b, [k]: e.target.value })} className="size-11 rounded-lg border-2 border-eu-line bg-white p-0.5 cursor-pointer" />
              <span className="grid min-w-0 flex-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{l} <span className="font-mono font-normal text-eu-muted text-[length:var(--fs-12)]">{val || "αυτόματο"}</span></span><span className="text-eu-muted text-[length:var(--fs-13)]">{h}</span></span>
              {val && <button type="button" onClick={() => set({ ...b, [k]: undefined })} className="rounded-full border border-eu-line px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface">Αυτόματο</button>}
            </div>
          );
        })}
        <span className="text-eu-muted text-[length:var(--fs-13)]">Όσα μείνουν «αυτόματο» ακολουθούν τα χρώματα της σελίδας. Το «Χρώμα γραμμάτων» από πάνω αφορά το υπόλοιπο κείμενο.</span>
      </fieldset>
      <ImageUrlField label="Εικόνα φόντου (προαιρετικό)" value={b.bgImage ?? ""} onChange={(v) => set({ ...b, bgImage: v || undefined })} help="Καλύπτει όλο το πλάτος πίσω από το component και κόβεται στις άκρες. Χωρίς χρώμα από πάνω: μπαίνει σκούρο πέπλο και τα κείμενα γίνονται λευκά. Με χρώμα: τα κείμενα ακολουθούν το χρώμα (σκούρο χρώμα → λευκά κείμενα), για ανοιχτές εικόνες διάλεξε ανοιχτό χρώμα." />
    </div>
  );
}

/** Τα πεδία μιας ενότητας ανάλογα με τον τύπο της. */
function TypeFields({ b, set, ctx }: { b: BrandBlock; set: (b: BrandBlock) => void; ctx: Ctx }): ReactNode {
  const head = !["support", "video", "announcement", "usp", "callout"].includes(b.type) && (
    <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
      <Txt label="Μικρός τίτλος (πάνω)" value={b.kicker ?? ""} onChange={(v) => set({ ...b, kicker: v })} max={40} help="Με το χρώμα της μάρκας, κεφαλαία." />
      <Txt label="Τίτλος ενότητας" value={b.title ?? ""} onChange={(v) => set({ ...b, title: v })} max={70} />
    </div>
  );
  const products = (label: string, ids: string[], on: (ids: string[]) => void, help?: string, max?: number) => <ProductList label={label} help={help} ids={ids} onChange={on} info={ctx.info} onInfo={ctx.onInfo} brandId={ctx.brandId} brandName={ctx.brandName} max={max} />;

  switch (b.type) {
    case "new-arrivals": {
      const x = b as B<"new-arrivals">;
      return <div className="grid gap-4">{head}<Area label="Συνοδευτικό κείμενο" value={x.lead ?? ""} onChange={(v) => set({ ...x, lead: v })} max={140} rows={2} help="Μία πρόταση κάτω από τον τίτλο (προαιρετικό)." />{products("Προϊόντα", x.productIds, (ids) => set({ ...x, productIds: ids }), "3 ή 4 δείχνουν καλύτερα. Το πρώτο είναι το μεγαλύτερο.", 6)}</div>;
    }
    case "offers": {
      const x = b as B<"offers">;
      return <div className="grid gap-4">{head}<DateTime label="Λήξη προσφοράς" value={x.endsAt} onChange={(v) => set({ ...x, endsAt: v ?? "" })} help="Η αντίστροφη μέτρηση μετρά μέχρι εδώ. Οι τιμές έρχονται από τις Προσφορές — εδώ διαλέγεις μόνο ποια προϊόντα προβάλλονται." />{products("Προϊόντα σε προσφορά", x.productIds, (ids) => set({ ...x, productIds: ids }), "Συνήθως 4.", 8)}</div>;
    }
    case "series": {
      const x = b as B<"series">;
      const setItem = (i: number, v: Partial<B<"series">["items"][number]>) => set({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, ...v } : it)) });
      return (
        <div className="grid gap-4">
          {head}
          {x.items.map((it, i) => (
            <Item key={i} title={it.name || `Σειρά ${i + 1}`} onUp={i > 0 ? () => set({ ...x, items: swap(x.items, i, -1) }) : undefined} onDown={i < x.items.length - 1 ? () => set({ ...x, items: swap(x.items, i, 1) }) : undefined} onRemove={() => set({ ...x, items: x.items.filter((_, k) => k !== i) })}>
              <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
                <Txt label="Όνομα σειράς" value={it.name} onChange={(v) => setItem(i, { name: v })} max={30} placeholder="π.χ. OLED evo" />
                <LinkField label="Σύνδεσμος «Δες τη σειρά»" value={it.href ?? ""} onChange={(v) => setItem(i, { href: v || undefined })} help="Συνήθως η κατηγορία με φίλτρο μάρκας, π.χ. /k/eikona-ixos/tileoraseis?brand=lg" />
              </div>
              <Area label="Περιγραφή" value={it.blurb} onChange={(v) => setItem(i, { blurb: v })} max={120} rows={2} />
              <MediaUrl label="Εικόνα" value={it.image} onChange={(v) => setItem(i, { image: v })} help="Οριζόντια φωτογραφία ή cutout προϊόντος της σειράς." />
              {products("Προϊόντα της σειράς", it.productIds, (ids) => setItem(i, { productIds: ids }), "Εμφανίζονται ως μικρές κάρτες κάτω από τη σειρά.", 4)}
            </Item>
          ))}
          {x.items.length < 4 && <button type="button" onClick={() => set({ ...x, items: [...x.items, { name: "", blurb: "", image: "", productIds: [] }] })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Σειρά</button>}
        </div>
      );
    }
    case "story": {
      const x = b as B<"story">;
      return (
        <div className="grid gap-4">
          {head}
          <MediaUrl label="Εικόνα" value={x.image} onChange={(v) => set({ ...x, image: v })} help="Μεγάλη φωτογραφία (τουλάχιστον 1600 px πλάτος)." />
          <Area label="Κείμενο" value={x.body} onChange={(v) => set({ ...x, body: v })} max={420} rows={5} help="2–4 προτάσεις. Γράψε για τον πελάτη: τι κερδίζει, όχι τεχνικά φύλλα." />
          <fieldset className="m-0 p-0 border-0 grid gap-2">
            <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Θέση εικόνας</legend>
            <div className="flex flex-wrap gap-2">{(["left", "right"] as const).map((a) => <button key={a} type="button" aria-pressed={(x.align ?? "right") === a} onClick={() => set({ ...x, align: a })} className={`rounded-full border-2 px-4 min-h-10 font-bold text-[length:var(--fs-14)] ${(x.align ?? "right") === a ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>{a === "left" ? "Αριστερά" : "Δεξιά"}</button>)}</div>
          </fieldset>
          <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
            <Txt label="Κουμπί · κείμενο (προαιρετικό)" value={x.cta?.label ?? ""} onChange={(v) => set({ ...x, cta: v || x.cta?.href ? { label: v, href: x.cta?.href ?? "" } : undefined })} max={40} placeholder="π.χ. Κλείσε επίδειξη" />
            {x.cta && <LinkField label="Κουμπί · σύνδεσμος" value={x.cta.href} onChange={(v) => set({ ...x, cta: { label: x.cta!.label, href: v } })} />}
          </div>
        </div>
      );
    }
    case "tech": {
      const x = b as B<"tech">;
      const setItem = (i: number, v: Partial<B<"tech">["items"][number]>) => set({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, ...v } : it)) });
      return (
        <div className="grid gap-4">
          {head}
          {x.items.map((it, i) => (
            <Item key={i} title={it.title || `Χαρακτηριστικό ${i + 1}`} onUp={i > 0 ? () => set({ ...x, items: swap(x.items, i, -1) }) : undefined} onDown={i < x.items.length - 1 ? () => set({ ...x, items: swap(x.items, i, 1) }) : undefined} onRemove={() => set({ ...x, items: x.items.filter((_, k) => k !== i) })}>
              <fieldset className="m-0 p-0 border-0 grid gap-2">
                <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Εικονίδιο</legend>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(TECH_ICONS) as (keyof typeof TECH_ICONS)[]).map((k) => { const I = TECH_ICONS[k]; const on = it.icon === k; return <button key={k} type="button" aria-pressed={on} title={ICON_LABEL[k]} onClick={() => setItem(i, { icon: k })} className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 min-h-10 text-[length:var(--fs-13)] font-bold ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}><I className="size-4" aria-hidden />{ICON_LABEL[k]}</button>; })}
                </div>
              </fieldset>
              <Txt label="Τίτλος" value={it.title} onChange={(v) => setItem(i, { title: v })} max={32} placeholder="π.χ. Επεξεργαστής α9 AI" />
              <Area label="Περιγραφή" value={it.blurb} onChange={(v) => setItem(i, { blurb: v })} max={110} rows={2} />
            </Item>
          ))}
          {x.items.length < 6 && <button type="button" onClick={() => set({ ...x, items: [...x.items, { icon: "sparkles", title: "", blurb: "" }] })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Χαρακτηριστικό</button>}
        </div>
      );
    }
    case "support": {
      const x = b as B<"support">;
      return (
        <div className="grid gap-5">
          <StringList label="Εγγύηση & service" items={x.facts} onChange={(v) => set({ ...x, facts: v })} placeholder="π.χ. 5 έτη εγγύηση panel OLED" addLabel="Στοιχείο" max={6} help="Σύντομες, συγκεκριμένες φράσεις — μία ανά γραμμή." />
          <StringList label="Ερωτήσεις για τον Ερμή" items={x.askAris ?? []} onChange={(v) => set({ ...x, askAris: v })} placeholder="π.χ. OLED ή QNED για φωτεινό σαλόνι;" addLabel="Ερώτηση" max={4} help="Εμφανίζονται ως κουμπιά· με ένα πάτημα ο πελάτης τις ρωτά στον Ερμή." />
        </div>
      );
    }
    case "video": {
      const x = b as B<"video">;
      return (
        <div className="grid gap-4">
          <MediaUrl kind="video" label="Βίντεο (MP4)" value={x.src} onChange={(v) => set({ ...x, src: v })} help="Από τη βιβλιοθήκη media. Παίζει χωρίς ήχο, σε επανάληψη — κράτα το κάτω από 30″." />
          <MediaUrl label="Εικόνα εξωφύλλου" value={x.poster} onChange={(v) => set({ ...x, poster: v })} help="Φαίνεται μέχρι να φορτώσει το βίντεο." />
          <Txt label="Λεζάντα" value={x.caption ?? ""} onChange={(v) => set({ ...x, caption: v })} max={60} />
        </div>
      );
    }
    case "announcement": {
      const x = b as B<"announcement">;
      return (
        <div className="grid gap-4">
          <Txt label="Κείμενο" value={x.text} onChange={(v) => set({ ...x, text: v })} max={90} help="Μία σύντομη φράση — σε κινητό σπάει σε δύο γραμμές." />
          <LinkField label="Σύνδεσμος (προαιρετικό)" value={x.href ?? ""} onChange={(v) => set({ ...x, href: v || undefined })} help="Όλη η λωρίδα γίνεται σύνδεσμος. Κενό = απλό κείμενο." />
          <DateTime label="Αντίστροφη μέτρηση μέχρι (προαιρετικό)" value={x.endsAt} onChange={(v) => set({ ...x, endsAt: v })} help="Μετά τη λήξη η μέτρηση κρύβεται· για να φύγει η λωρίδα, βάλε «Έως» στο «Πότε εμφανίζεται»." />
        </div>
      );
    }
    case "usp": {
      const x = b as B<"usp">;
      const setItem = (i: number, v: Partial<B<"usp">["items"][number]>) => set({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, ...v } : it)) });
      return (
        <div className="grid gap-3">
          {x.items.map((it, i) => (
            <Item key={i} title={it.text || `Πλεονέκτημα ${i + 1}`} onUp={i > 0 ? () => set({ ...x, items: swap(x.items, i, -1) }) : undefined} onDown={i < x.items.length - 1 ? () => set({ ...x, items: swap(x.items, i, 1) }) : undefined} onRemove={() => set({ ...x, items: x.items.filter((_, k) => k !== i) })}>
              <div className="flex flex-wrap gap-1.5">{(Object.keys(TECH_ICONS) as (keyof typeof TECH_ICONS)[]).map((k) => { const I = TECH_ICONS[k]; const on = it.icon === k; return <button key={k} type="button" aria-pressed={on} aria-label={ICON_LABEL[k]} title={ICON_LABEL[k]} onClick={() => setItem(i, { icon: k })} className={`size-10 grid place-items-center rounded-full border-2 ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}><I className="size-4" aria-hidden /></button>; })}</div>
              <Txt label="Κείμενο" value={it.text} onChange={(v) => setItem(i, { text: v })} max={40} placeholder="π.χ. Δωρεάν τοποθέτηση" />
            </Item>
          ))}
          {x.items.length < 4 && <button type="button" onClick={() => set({ ...x, items: [...x.items, { icon: "sparkles", text: "" }] })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Πλεονέκτημα</button>}
        </div>
      );
    }
    case "banner": {
      const x = b as B<"banner">;
      const fit = x.fit ?? "cover";
      return (
        <div className="grid gap-3">
          <Step n={1} title="Εικόνες" help="Το έτοιμο εικαστικό, σε έως τρεις διαστάσεις. Κάθε συσκευή παίρνει τη δική της· όπου λείπει, μπαίνει η εικόνα του υπολογιστή.">
            <MediaUrl label="Υπολογιστής" value={x.image} onChange={(v) => set({ ...x, image: v })} help="Οριζόντια, π.χ. 1920×640 px (από 1024 px πλάτος οθόνης)." />
            <MediaUrl label="Tablet (προαιρετική)" value={x.imageTablet ?? ""} onChange={(v) => set({ ...x, imageTablet: v || undefined })} help="Π.χ. 1200×600 px, για οθόνες 641–1023 px." />
            <MediaUrl label="Κινητό (προαιρετική)" value={x.imageMobile ?? ""} onChange={(v) => set({ ...x, imageMobile: v || undefined })} help="Κάθετη ή τετράγωνη, π.χ. 800×800 px, για οθόνες έως 640 px." />
            <Choice label="Πώς μπαίνει η εικόνα" value={fit} onChange={(v) => set({ ...x, fit: v === "cover" ? undefined : v })} options={[{ value: "cover", label: "Γεμίζει το πλαίσιο", help: "Καλύπτει όλο το πλαίσιο· κόβονται οι άκρες της όπου δεν χωρά." }, { value: "natural", label: "Ολόκληρη, στις αναλογίες της", help: "Φαίνεται όλη και μικραίνει μαζί με την οθόνη. Το ύψος βγαίνει από την ίδια την εικόνα." }, { value: "contain", label: "Ολόκληρη μέσα στο πλαίσιο", help: "Φαίνεται όλη μέσα στο ύψος που ορίζεις· μπορεί να μείνει κενό στα πλάγια." }]} />
            {fit !== "natural" && <Choice label="Ύψος πλαισίου" value={x.height ?? "m"} onChange={(v) => set({ ...x, height: v })} options={[{ value: "s", label: "Μικρό" }, { value: "m", label: "Μεσαίο" }, { value: "l", label: "Μεγάλο" }]} />}
            <label className="flex items-start gap-2.5 min-h-11 cursor-pointer text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={!!x.bleed} onChange={(e) => set({ ...x, bleed: e.target.checked || undefined })} className="mt-1 size-5 accent-eu-navy" /><span className="grid"><span className="font-bold">Σε όλο το πλάτος της οθόνης</span><span className="text-eu-ink-3 text-[length:var(--fs-13)]">Από άκρη σε άκρη, χωρίς στρογγυλές γωνίες.</span></span></label>
          </Step>
          <Step n={2} title="Τίτλοι (προαιρετικά)" help="Υπέρτιτλος, τίτλος και υπότιτλος. Άφησέ τα κενά αν τα κείμενα είναι ήδη μέσα στην εικόνα. Χρώματα και αποστάσεις: στις ρυθμίσεις από κάτω.">
            {head}
            <Area label="Υπότιτλος" value={x.body ?? ""} onChange={(v) => set({ ...x, body: v })} max={160} rows={2} />
            <Choice label="Μέγεθος τίτλου" value={x.headSize ?? "m"} onChange={(v) => set({ ...x, headSize: v === "m" ? undefined : v })} options={[{ value: "s", label: "Μικρός" }, { value: "m", label: "Κανονικός" }, { value: "l", label: "Μεγάλος" }]} />
            <Choice label="Πού μπαίνουν τα κείμενα" value={x.textPlace ?? "over"} onChange={(v) => set({ ...x, textPlace: v === "over" ? undefined : v })} options={[{ value: "over", label: "Πάνω στην εικόνα" }, { value: "above", label: "Πάνω από την εικόνα" }, { value: "below", label: "Κάτω από την εικόνα" }]} />
            <Choice label="Στοίχιση κειμένων" value={x.align ?? "left"} onChange={(v) => set({ ...x, align: v })} options={[{ value: "left", label: "Αριστερά" }, { value: "center", label: "Κέντρο" }, { value: "right", label: "Δεξιά" }]} />
            {(x.textPlace ?? "over") === "over" && <Choice label="Σκίαση για να διαβάζεται το κείμενο" value={x.overlay ?? "dark"} onChange={(v) => set({ ...x, overlay: v })} options={[{ value: "dark", label: "Σκούρα (λευκά γράμματα)" }, { value: "light", label: "Ανοιχτή (σκούρα γράμματα)" }, { value: "none", label: "Καμία" }]} help="Χρειάζεται μόνο όταν γράφεις κείμενα πάνω στην εικόνα." />}
          </Step>
          <Step n={3} title="Σύνδεσμος" help="Πού πηγαίνει ο πελάτης: πατώντας οπουδήποτε στην εικόνα ή σε ένα κουμπί με δικό του κείμενο.">
            <LinkField label="Σύνδεσμος της εικόνας" value={x.href ?? ""} onChange={(v) => set({ ...x, href: v || undefined })} />
            <CtaFields label="Κουμπί (προαιρετικό)" value={x.cta} onChange={(v) => set({ ...x, cta: v })} />
          </Step>
        </div>
      );
    }
    case "products-auto": {
      const x = b as B<"products-auto">;
      return (
        <div className="grid gap-4">
          {head}
          <Choice label="Ποια προϊόντα" value={x.source} onChange={(v) => set({ ...x, source: v })} options={AUTO_SOURCES} />
          {!ctx.brandId && <BrandChoice value={x.brand} onChange={(v) => set({ ...x, brand: v, categoryId: undefined, categoryName: undefined })} />}
          <CategoryPicker key={x.brand?.slug ?? "*"} single brandId={ctx.brandId ?? (x.brand ? optBrandId(x.brand.slug) : null)} label="Από κατηγορία" help="Περιόρισε σε μία κατηγορία (π.χ. μόνο Τηλεοράσεις)." value={x.categoryId ? [{ id: x.categoryId, name: x.categoryName ?? "" }] : []} onChange={(v) => set({ ...x, categoryId: v[0]?.id, categoryName: v[0]?.name })} />
          <Choice label="Πόσα" value={String(x.limit) as "4" | "8" | "12"} onChange={(v) => set({ ...x, limit: Number(v) })} options={[{ value: "4", label: "4 (μία σειρά)" }, { value: "8", label: "8 (δύο σειρές)" }, { value: "12", label: "12 (τρεις σειρές)" }]} help="Σε κινητό εμφανίζονται το ένα κάτω από το άλλο." />
          <CtaFields label="Σύνδεσμος «Δες όλα»" value={x.cta} onChange={(v) => set({ ...x, cta: v })} />
        </div>
      );
    }
    case "categories": {
      const x = b as B<"categories">;
      return (
        <div className="grid gap-4">
          {head}
          {!ctx.brandId && <BrandChoice value={x.brand} onChange={(v) => set({ ...x, brand: v, items: [] })} />}
          <Choice label="Ποιες κατηγορίες" value={x.mode} onChange={(v) => set({ ...x, mode: v })} options={[{ value: "auto", label: "Αυτόματα", help: "Οι κατηγορίες με τα περισσότερα προϊόντα της μάρκας — ενημερώνονται μόνες τους." }, { value: "manual", label: "Επιλογή", help: "Μόνο όσες διαλέξεις, με αυτή τη σειρά." }]} />
          {x.mode === "auto" ? (
            <Choice label="Πόσες" value={String(x.limit ?? 6) as "4" | "6" | "8"} onChange={(v) => set({ ...x, limit: Number(v) })} options={[{ value: "4", label: "4" }, { value: "6", label: "6" }, { value: "8", label: "8" }]} />
          ) : (
            <CategoryPicker key={x.brand?.slug ?? "*"} brandId={ctx.brandId ?? (x.brand ? optBrandId(x.brand.slug) : null)} label="Κατηγορίες" value={(x.items ?? []).map((i) => ({ id: i.id, name: i.name }))} onChange={(v) => set({ ...x, items: v.map((c) => ({ ...c, image: x.items?.find((i) => i.id === c.id)?.image })) })} help="Η εικόνα κάθε πλακιδίου είναι αυτόματα από το κορυφαίο προϊόν της κατηγορίας." />
          )}
        </div>
      );
    }
    case "faq": {
      const x = b as B<"faq">;
      const setItem = (i: number, v: Partial<B<"faq">["items"][number]>) => set({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, ...v } : it)) });
      return (
        <div className="grid gap-4">
          {head}
          {x.items.map((it, i) => (
            <Item key={i} title={it.q || `Ερώτηση ${i + 1}`} onUp={i > 0 ? () => set({ ...x, items: swap(x.items, i, -1) }) : undefined} onDown={i < x.items.length - 1 ? () => set({ ...x, items: swap(x.items, i, 1) }) : undefined} onRemove={() => set({ ...x, items: x.items.filter((_, k) => k !== i) })}>
              <Txt label="Ερώτηση" value={it.q} onChange={(v) => setItem(i, { q: v })} max={110} placeholder="π.χ. Πόσα χρόνια εγγύηση έχει το panel OLED;" />
              <Area label="Απάντηση" value={it.a} onChange={(v) => setItem(i, { a: v })} max={500} rows={3} />
            </Item>
          ))}
          {x.items.length < 12 && <button type="button" onClick={() => set({ ...x, items: [...x.items, { q: "", a: "" }] })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Ερώτηση</button>}
        </div>
      );
    }
    case "text": {
      const x = b as B<"text">;
      return (
        <div className="grid gap-4">
          {head}
          <Area label="Κείμενο" value={x.body} onChange={(v) => set({ ...x, body: v })} max={1500} rows={7} help="Άφησε μια κενή γραμμή για νέα παράγραφο." />
          <Choice label="Στοίχιση" value={x.align ?? "left"} onChange={(v) => set({ ...x, align: v })} options={[{ value: "left", label: "Αριστερά" }, { value: "center", label: "Κέντρο" }]} />
        </div>
      );
    }
    case "gallery": {
      const x = b as B<"gallery">;
      const setImg = (i: number, v: Partial<B<"gallery">["images"][number]>) => set({ ...x, images: x.images.map((it, k) => (k === i ? { ...it, ...v } : it)) });
      return (
        <div className="grid gap-4">
          {head}
          <Choice label="Διάταξη" value={x.layout ?? "grid"} onChange={(v) => set({ ...x, layout: v })} options={[{ value: "grid", label: "Πλέγμα", help: "Ίδιο μέγεθος για όλες." }, { value: "mosaic", label: "Mosaic", help: "Η πρώτη εικόνα μεγάλη (θέλει τουλάχιστον 3)." }]} />
          {x.images.map((im, i) => (
            <Item key={i} title={im.caption || `Εικόνα ${i + 1}`} onUp={i > 0 ? () => set({ ...x, images: swap(x.images, i, -1) }) : undefined} onDown={i < x.images.length - 1 ? () => set({ ...x, images: swap(x.images, i, 1) }) : undefined} onRemove={() => set({ ...x, images: x.images.filter((_, k) => k !== i) })}>
              <MediaUrl label="Εικόνα" value={im.src} onChange={(v) => setImg(i, { src: v })} />
              <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
                <Txt label="Λεζάντα" value={im.caption ?? ""} onChange={(v) => setImg(i, { caption: v || undefined })} max={60} help="Και κείμενο για αναγνώστες οθόνης." />
                <LinkField label="Σύνδεσμος (προαιρετικό)" value={im.href ?? ""} onChange={(v) => setImg(i, { href: v || undefined })} />
              </div>
            </Item>
          ))}
          {x.images.length < 6 && <button type="button" onClick={() => set({ ...x, images: [...x.images, { src: "" }] })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Εικόνα</button>}
        </div>
      );
    }
    case "ad": return <AdFields b={b as B<"ad">} set={set} />;
    case "deal-hero": return <DealFields b={b as B<"deal-hero">} set={set} head={head} ctx={ctx} />;
    case "promo-grid": { const x = b as B<"promo-grid">; return <div className="grid gap-4">{head}<Choice label="Πόσες" value={String(x.limit) as "3" | "6" | "9"} onChange={(v) => set({ ...x, limit: Number(v) })} options={[{ value: "3", label: "3" }, { value: "6", label: "6" }, { value: "9", label: "9" }]} help="Μόνο προσφορές με δημοσιευμένη landing page που τρέχουν τώρα." /></div>; }
    case "countdown": return <CountdownFields b={b as B<"countdown">} set={set} head={head} />;
    case "steps": {
      const x = b as B<"steps">;
      const setItem = (i: number, v: Partial<B<"steps">["items"][number]>) => set({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, ...v } : it)) });
      return (
        <div className="grid gap-4">
          {head}
          {x.items.map((it, i) => (
            <Item key={i} title={it.title || `Βήμα ${i + 1}`} onUp={i > 0 ? () => set({ ...x, items: swap(x.items, i, -1) }) : undefined} onDown={i < x.items.length - 1 ? () => set({ ...x, items: swap(x.items, i, 1) }) : undefined} onRemove={() => set({ ...x, items: x.items.filter((_, k) => k !== i) })}>
              <Txt label={`Βήμα ${i + 1} · τίτλος`} value={it.title} onChange={(v) => setItem(i, { title: v })} max={40} />
              <Area label="Κείμενο" value={it.text} onChange={(v) => setItem(i, { text: v })} max={160} rows={2} />
            </Item>
          ))}
          {x.items.length < 5 && <button type="button" onClick={() => set({ ...x, items: [...x.items, { title: "", text: "" }] })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Βήμα</button>}
        </div>
      );
    }
    case "contact": {
      const x = b as B<"contact">;
      const chip = (k: "phone" | "email" | "stores", label: string) => <button type="button" aria-pressed={x[k] !== false && (k !== "stores" || !!x.stores)} onClick={() => set({ ...x, [k]: !(x[k] !== false && (k !== "stores" || !!x.stores)) })} className={`rounded-full border-2 px-4 min-h-10 font-bold text-[length:var(--fs-14)] ${x[k] !== false && (k !== "stores" || !!x.stores) ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line"}`}>{label}</button>;
      return (
        <div className="grid gap-4">
          {head}
          <fieldset className="m-0 p-0 border-0 grid gap-2"><legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Τι δείχνει</legend><div className="flex flex-wrap gap-2">{chip("phone", "Τηλέφωνο")}{chip("email", "Email")}{chip("stores", "Καταστήματα")}</div><span className="text-eu-muted text-[length:var(--fs-13)]">Τηλέφωνο και email έρχονται από τις Ρυθμίσεις → Γενικά — αλλάζεις εκεί και ενημερώνονται παντού.</span></fieldset>
          <Txt label="Ωράριο (προαιρετικό)" value={x.hours ?? ""} onChange={(v) => set({ ...x, hours: v || undefined })} max={60} placeholder="Δευτέρα–Παρασκευή 09:00–17:00" />
        </div>
      );
    }
    case "newsletter": { const x = b as B<"newsletter">; return <div className="grid gap-4">{head}<Area label="Κείμενο" value={x.body ?? ""} onChange={(v) => set({ ...x, body: v || undefined })} max={140} rows={2} help="Το κείμενο συγκατάθεσης έρχεται αυτόματα από το GDPR (ενεργή έκδοση)." /></div>; }
    case "guides": return <ListFields kind="guides" b={b as B<"guides">} set={set} head={head} />;
    case "services": return <ListFields kind="services" b={b as B<"services">} set={set} head={head} />;
    case "callout": {
      const x = b as B<"callout">;
      return (
        <div className="grid gap-4">
          <Choice label="Τύπος" value={x.tone} onChange={(v) => set({ ...x, tone: v })} options={[{ value: "info", label: "Πληροφορία" }, { value: "warning", label: "Προσοχή" }, { value: "success", label: "Επιβεβαίωση" }]} />
          <Txt label="Τίτλος (προαιρετικό)" value={x.title ?? ""} onChange={(v) => set({ ...x, title: v })} max={60} />
          <Area label="Κείμενο" value={x.body} onChange={(v) => set({ ...x, body: v })} max={400} rows={3} />
          <CtaFields label="Κουμπί (προαιρετικό)" value={x.cta} onChange={(v) => set({ ...x, cta: v })} />
        </div>
      );
    }
    case "promo-products": return <PromoProductsFields b={b as B<"promo-products">} set={set} head={head} />;
    case "promo-landing": return <LandingFields b={b as B<"promo-landing">} set={set} />;
    case "coupon": return <CouponFields b={b as B<"coupon">} set={set} head={head} />;
    case "stores": return <StoresFields b={b as B<"stores">} set={set} head={head} />;
    case "cta": {
      const x = b as B<"cta">;
      return (
        <div className="grid gap-4">
          {head}
          <Area label="Κείμενο" value={x.body ?? ""} onChange={(v) => set({ ...x, body: v })} max={180} rows={2} />
          <CtaFields label="Κύριο κουμπί" value={x.primary} onChange={(v) => set({ ...x, primary: v ?? { label: "", href: "" } })} />
          <CtaFields label="Δεύτερο κουμπί (προαιρετικό)" value={x.secondary} onChange={(v) => set({ ...x, secondary: v })} />
        </div>
      );
    }
  }
}


function AdFields({ b, set }: { b: B<"ad">; set: (b: BrandBlock) => void }) {
  const o = useOptions();
  const slotLabel = (k: string) => o?.slots.find((x) => x.key === k)?.label ?? k;
  const state = (a: BlockOptions["ads"][number], now = nowMs()) => (a.status !== "active" ? (a.status === "paused" ? "σε παύση" : "πρόχειρο") : a.endsAt && Date.parse(a.endsAt) < now ? "έληξε" : a.startsAt && Date.parse(a.startsAt) > now ? `από ${fmt(a.startsAt)}` : "ενεργό");
  return (
    <div className="grid gap-4">
      <Choice label="Τι δείχνει" value={b.mode} onChange={(v) => set({ ...b, mode: v })} options={[{ value: "slot", label: "Ό,τι είναι ενεργό σε μια θέση", help: "Εναλλάσσεται αυτόματα με βάση προτεραιότητα και ημερομηνίες — αλλάζεις τα banners από τις Προσφορές χωρίς να ξανανοίξεις τη σελίδα." }, { value: "placement", label: "Ένα συγκεκριμένο banner", help: "Πάντα το ίδιο banner, όσο είναι ενεργό." }]} />
      {b.mode === "slot" ? (
        <Pick label="Θέση" value={b.slot ?? ""} onChange={(v) => set({ ...b, slot: v || undefined })} options={o ? o.slots.map((x) => ({ value: x.key, label: `${x.label} · ${o.ads.filter((a) => a.slot === x.key && a.status === "active").length} ενεργά` })) : null} empty="—" help={b.slot ? `Μέγεθος: ${o?.slots.find((x) => x.key === b.slot)?.size ?? ""}. Για τις πληροφοριακές σελίδες προτίμησε «Πληροφοριακές σελίδες · …».` : undefined} />
      ) : (
        <Pick label="Banner" value={b.placementId ?? ""} onChange={(v, l) => set({ ...b, placementId: v || undefined, placementTitle: l || undefined })} options={o ? o.ads.map((a) => ({ value: a.id, label: `${a.title} · ${slotLabel(a.slot)} · ${state(a)}` })) : null} empty="Δεν υπάρχει κανένα banner — φτιάξε στις Προσφορές → Διαφημιστικές θέσεις." />
      )}
      <label className="flex items-start gap-2.5 min-h-11 cursor-pointer text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={!!b.bleed} onChange={(e) => set({ ...b, bleed: e.target.checked || undefined })} className="mt-1 size-5 accent-eu-navy" /><span className="grid"><span className="font-bold">Σε όλο το πλάτος της οθόνης</span><span className="text-eu-muted text-[length:var(--fs-13)]">Από άκρη σε άκρη, χωρίς περιθώρια και στρογγυλές γωνίες. Ταιριάζει σε φαρδιά εικόνα καμπάνιας (π.χ. 1920×400).</span></span></label>
      <Choice label="Προϊόντα ανά σειρά σε κινητό" value={String(b.perRowMobile ?? "")} onChange={(v) => set({ ...b, perRowMobile: v === "1" ? 1 : v === "2" ? 2 : undefined })} options={[{ value: "", label: "Όπως το banner" }, { value: "1", label: "1", help: "Ένα μεγάλο τετράγωνο ανά σειρά." }, { value: "2", label: "2", help: "Δύο μικρότερα δίπλα-δίπλα." }]} help="Μόνο για banners με τετράγωνα προϊόντων. Ισχύει σε αυτό το σημείο· το banner κρατά τη δική του ρύθμιση αλλού." />
      <Choice label="Προϊόντα ανά σειρά σε υπολογιστή" value={String(b.perRow ?? "")} onChange={(v) => set({ ...b, perRow: v ? Number(v) : undefined })} options={[{ value: "", label: "Όπως το banner" }, ...[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))]} />
      <label className="flex items-start gap-2.5 min-h-11 cursor-pointer text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={b.rotate !== false} onChange={(e) => set({ ...b, rotate: e.target.checked ? undefined : false })} className="mt-1 size-5 accent-eu-navy" /><span className="grid"><span className="font-bold">Άλλα προϊόντα σε κάθε άνοιγμα της σελίδας</span><span className="text-eu-ink-3 text-[length:var(--fs-13)]">Όταν το banner έχει περισσότερα προϊόντα από όσα δείχνει, διαλέγει τυχαία κάθε φορά. Σβηστό = πάντα τα πρώτα. Στην προεπισκόπηση του πρόχειρου και στο site αλλάζουν με ανανέωση.</span></span></label>
      <a href="/admin/prosfores/theseis" target="_blank" rel="noopener noreferrer" className="justify-self-start inline-flex items-center gap-1.5 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline">Διαχείριση banners (Προσφορές → Διαφημιστικές θέσεις) ↗</a>
    </div>
  );
}

/** Τίτλος ενός βήματος της φόρμας: αριθμός, τι ορίζεις εδώ, και μία γραμμή εξήγησης. */
function Step({ n, title, help, children }: { n: number; title: string; help: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border border-eu-line bg-white p-3 @md:p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="size-8 shrink-0 rounded-full bg-eu-navy text-white grid place-items-center font-extrabold text-[length:var(--fs-14)]">{n}</span>
        <span className="grid min-w-0"><span className="font-heading font-bold text-eu-ink text-[length:var(--fs-16)] leading-tight">{title}</span><span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{help}</span></span>
      </div>
      {children}
    </section>
  );
}

/**
 * «Προϊόντα προσφοράς» σε τρία βήματα, με τη σειρά που σκέφτεται ο χρήστης: 1) οι τίτλοι της ζώνης, 2) το σχέδιο και πόσα ανά
 * σειρά σε κάθε συσκευή, 3) το περιεχόμενο — ποια προσφορά και με ποιους κανόνες. Χρώματα και αποστάσεις είναι στις κοινές
 * ρυθμίσεις του component, ακριβώς από κάτω.
 */
/** Τα προϊόντα της προσφοράς ως λίστα με τσεκ: ποια δείχνει αυτή η ζώνη. Κανένα τσεκ = τα διαλέγει μόνη της. */
function OfferProducts({ promotionId, ids, onChange }: { promotionId: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const [got, setGot] = useState<{ id: string; list: PickProduct[] } | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let on = true;
    void promoProductsAction(promotionId).then((l) => { if (on) setGot({ id: promotionId, list: l }); }).catch(() => { if (on) setGot({ id: promotionId, list: [] }); });
    return () => { on = false; };
  }, [promotionId]);
  const list = got?.id === promotionId ? got.list : null;
  if (!list) return <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Φέρνω τα προϊόντα της προσφοράς…</p>;
  if (!list.length) return <p className="m-0 rounded-xl bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">Αυτή η προσφορά δεν έχει κανένα προϊόν με τιμή προσφοράς τώρα, οπότε η ζώνη δεν φαίνεται στο site. Διάλεξε άλλη προσφορά στο βήμα 1 ή βάλε προϊόντα στην προσφορά.</p>;
  const has = new Set(ids), k = q.trim().toLowerCase();
  const view = k ? list.filter((p) => `${p.title} ${p.sku}`.toLowerCase().includes(k)) : list;
  const toggle = (id: string) => onChange(has.has(id) ? ids.filter((x) => x !== id) : ids.length < 12 ? [...ids, id] : ids);
  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)] flex-1 min-w-0">{ids.length ? `${ids.length} από ${list.length} επιλεγμένα (έως 12)` : `Κανένα επιλεγμένο: η ζώνη διαλέγει μόνη της από τα ${list.length}`}</span>
        {ids.length > 0 && <button type="button" onClick={() => onChange([])} className="text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline cursor-pointer">Καθάρισμα</button>}
      </div>
      {list.length > 8 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση με όνομα ή κωδικό" aria-label="Αναζήτηση προϊόντος της προσφοράς" className="rounded-xl border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)]" />}
      <ul className="m-0 p-0 list-none grid gap-1 max-h-80 overflow-y-auto rounded-xl border border-eu-line p-1">
        {view.map((p) => (
          <li key={p.id}>
            <label className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 min-h-12 cursor-pointer ${has.has(p.id) ? "bg-eu-chip" : "hover:bg-eu-surface"}`}>
              <input type="checkbox" checked={has.has(p.id)} disabled={!has.has(p.id) && ids.length >= 12} onChange={() => toggle(p.id)} className="size-5 shrink-0 accent-eu-navy" />
              {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφία */}
              <span className="size-10 shrink-0 rounded-lg bg-white border border-eu-line overflow-hidden grid place-items-center">{p.image && <img src={p.image} alt="" className="max-w-full max-h-full object-contain" />}</span>
              <span className="grid min-w-0 flex-1"><span className="font-semibold text-eu-ink text-[length:var(--fs-14)] leading-snug line-clamp-2">{p.title}</span><span className="font-mono text-eu-muted text-[length:var(--fs-12)] truncate">{p.sku}</span></span>
            </label>
          </li>
        ))}
        {!view.length && <li className="px-2 py-3 text-eu-muted text-[length:var(--fs-14)]">Κανένα προϊόν με αυτή την αναζήτηση.</li>}
      </ul>
    </div>
  );
}

/**
 * Η ζώνη σε μία φόρμα. Πρώτα τι μπαίνει μέσα: δυναμικό banner προσφοράς, έτοιμη εικόνα banner ή μόνο κείμενα.
 * Για προσφορά: προσφορά → εμφάνιση → προϊόντα, και τέλος. Τίτλοι και λοιπά είναι προαιρετικά, κλειστά από κάτω.
 */
function PromoProductsFields({ b, set, head }: { b: B<"promo-products">; set: (b: BrandBlock) => void; head: ReactNode }) {
  const o = useOptions();
  const kind = b.content ?? "offer";
  const designs = [
    { value: "cards", label: "Απλές κάρτες προϊόντων (χωρίς σχέδιο)" },
    ...(o?.ads.filter((a) => a.designed).map((a) => ({ value: `b:${a.id}`, label: `Banner · ${a.title}` })) ?? []),
    ...BANNER_TEMPLATES.map((t) => ({ value: `t:${t.key}`, label: `Έτοιμο πρότυπο · ${t.name}` })),
  ];
  const n = (v: string) => (v ? Number(v) : undefined);
  const auto = { value: "", label: b.design ? "Όπως το σχέδιο" : "Αυτόματα" };
  const picked = b.productIds ?? [];
  const titles = (
    <>
      {head}
      <Txt label="Υπότιτλος" value={b.subtitle ?? ""} onChange={(v) => set({ ...b, subtitle: v || undefined })} max={160} help="Μία-δύο γραμμές κάτω από τον τίτλο. Ο «υπέρτιτλος» είναι η μικρή γραμμή πάνω από τον τίτλο." />
      <div className="grid gap-4 @2xl:grid-cols-3">
        {([["kickerSize", "Μέγεθος υπέρτιτλου"], ["headSize", "Μέγεθος τίτλου"], ["subSize", "Μέγεθος υπότιτλου"]] as const).map(([k, l]) => (
          <Choice key={k} label={l} value={b[k] ?? "m"} onChange={(v) => set({ ...b, [k]: v === "m" ? undefined : v })} options={[{ value: "s", label: "Μικρό" }, { value: "m", label: "Κανονικό" }, { value: "l", label: "Μεγάλο" }]} />
        ))}
      </div>
      <span className="text-eu-muted text-[length:var(--fs-13)]">Χρώματα και αποστάσεις των τίτλων: στις ρυθμίσεις εμφάνισης από κάτω.</span>
    </>
  );
  const button = (
    <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
      <Txt label="Κουμπί · κείμενο" value={b.cta?.label ?? ""} onChange={(v) => set({ ...b, cta: v || b.cta?.href ? { label: v, href: b.cta?.href ?? "" } : undefined })} max={36} help={kind === "offer" ? "Κενό = πάει στη σελίδα της προσφοράς· αν δεν έχει, στο /prosfores." : undefined} />
      {b.cta && <LinkField label="Κουμπί · σύνδεσμος" value={b.cta.href} onChange={(v) => set({ ...b, cta: { label: b.cta!.label, href: v } })} />}
    </div>
  );
  const more = (title: string, children: ReactNode) => (
    <details className="rounded-2xl border border-eu-line bg-white p-3 @md:p-4">
      <summary className="cursor-pointer font-heading font-bold text-eu-ink text-[length:var(--fs-15)] min-h-11 flex items-center">{title}</summary>
      <div className="grid gap-4 pt-3">{children}</div>
    </details>
  );
  return (
    <div className="grid gap-3">
      <Choice label="Τι μπαίνει σε αυτή τη ζώνη" value={kind} onChange={(v) => set({ ...b, content: v === "offer" ? undefined : v })} options={[
        { value: "offer", label: "Δυναμικό banner προσφοράς", help: "Προϊόντα μιας προσφοράς, με το σχέδιο που διαλέγεις. Τιμές και προϊόντα ενημερώνονται μόνα τους." },
        { value: "image", label: "Εικόνα banner", help: "Έτοιμο εικαστικό σε έως 3 φωτογραφίες (υπολογιστής, tablet, κινητό) με σύνδεσμο." },
        { value: "none", label: "Μόνο κείμενα", help: "Υπέρτιτλος, τίτλος, υπότιτλος και, αν θέλεις, ένα κουμπί." },
      ]} />

      {kind === "offer" && (<>
        <Step n={1} title="Προσφορά" help="Από ποια προσφορά έρχονται τα προϊόντα. Η ζώνη φαίνεται μόνο όσο η προσφορά τρέχει.">
          <Pick label="Προσφορά" value={b.promotionId} onChange={(v, l) => set({ ...b, promotionId: v, promotionName: l || undefined, productIds: undefined })} options={o ? o.promos.map((p) => ({ value: p.id, label: `${p.name} · ${p.code}${p.status === "scheduled" ? " · προγραμματισμένη" : ""}${p.endsAt ? ` · έως ${fmt(p.endsAt)}` : ""}` })) : null} empty="Καμία ενεργή ή προγραμματισμένη προσφορά" />
        </Step>
        <Step n={2} title="Εμφάνιση" help="Το σχέδιο banner αυτής της ζώνης και πόσα προϊόντα χωράνε δίπλα-δίπλα σε κάθε συσκευή. Άλλη ζώνη μπορεί να έχει άλλο σχέδιο.">
          <Pick label="Σχέδιο" value={b.design ?? "cards"} onChange={(v) => set({ ...b, design: v && v !== "cards" ? v : undefined })} options={designs} empty="—" />
          <div className="grid gap-4 @2xl:grid-cols-3">
            <Choice label="Υπολογιστής" value={String(b.perRow ?? "")} onChange={(v) => set({ ...b, perRow: n(v) })} options={[auto, ...[2, 3, 4, 5, 6].map((x) => ({ value: String(x), label: String(x) }))]} />
            <Choice label="Tablet" value={String(b.perRowTablet ?? "")} onChange={(v) => set({ ...b, perRowTablet: n(v) })} options={[auto, ...[1, 2, 3, 4].map((x) => ({ value: String(x), label: String(x) }))]} />
            <Choice label="Κινητό" value={String(b.perRowMobile ?? "")} onChange={(v) => set({ ...b, perRowMobile: v === "1" ? 1 : v === "2" ? 2 : undefined })} options={[auto, { value: "1", label: "1" }, { value: "2", label: "2" }]} />
          </div>
          <a href="/admin/prosfores/theseis" target="_blank" rel="noopener noreferrer" className="justify-self-start inline-flex items-center gap-1.5 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline">Φτιάξε ή άλλαξε σχέδιο banner ↗</a>
        </Step>
        <Step n={3} title="Προϊόντα σε αυτή τη ζώνη" help="Τσέκαρε ποια προϊόντα της προσφοράς δείχνει αυτή η ζώνη. Αν δεν τσεκάρεις κανένα, τα διαλέγει μόνη της.">
          {b.promotionId ? <OfferProducts promotionId={b.promotionId} ids={picked} onChange={(ids) => set({ ...b, productIds: ids.length ? ids : undefined })} /> : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Διάλεξε πρώτα προσφορά στο βήμα 1.</p>}
          <Choice label="Πόσα φαίνονται μαζί" value={String(b.limit) as "4" | "8" | "12"} onChange={(v) => set({ ...b, limit: Number(v) })} options={[{ value: "4", label: "4" }, { value: "8", label: "8" }, { value: "12", label: "12" }]} />
          <Choice label="Όταν είναι περισσότερα απ' όσα χωράνε" value={b.rotate === false ? "top" : "mix"} onChange={(v) => set({ ...b, rotate: v === "top" ? false : undefined })} options={[{ value: "mix", label: "Αλλάζουν σε κάθε άνοιγμα της σελίδας", help: "Ισχύει με σχέδιο banner." }, { value: "top", label: "Πάντα τα ίδια", help: picked.length ? "Τα πρώτα της λίστας σου." : "Η μεγαλύτερη έκπτωση πρώτα." }]} />
        </Step>
        {more("Τίτλοι, αντίστροφη μέτρηση, κουμπί (προαιρετικά)", <>
          <span className="text-eu-muted text-[length:var(--fs-13)]">Κενός τίτλος = το όνομα της προσφοράς.</span>
          {titles}
          <Choice label="Αντίστροφη μέτρηση" value={b.countdown === false ? "no" : "yes"} onChange={(v) => set({ ...b, countdown: v === "yes" })} options={[{ value: "yes", label: "Ναι" }, { value: "no", label: "Όχι" }]} help="Μετρά μέχρι τη λήξη της προσφοράς, όταν έχει ημερομηνία λήξης." />
          {button}
        </>)}
      </>)}

      {kind === "image" && (<>
        <Step n={1} title="Εικόνες" help="Το έτοιμο εικαστικό. Κάθε συσκευή παίρνει τη δική της· όπου λείπει, μπαίνει η εικόνα του υπολογιστή.">
          <MediaUrl label="Υπολογιστής" value={b.image ?? ""} onChange={(v) => set({ ...b, image: v || undefined })} help="Οριζόντια, π.χ. 1920×640 px." />
          <MediaUrl label="Tablet (προαιρετική)" value={b.imageTablet ?? ""} onChange={(v) => set({ ...b, imageTablet: v || undefined })} help="Π.χ. 1200×600 px, για οθόνες 641–1023 px." />
          <MediaUrl label="Κινητό (προαιρετική)" value={b.imageMobile ?? ""} onChange={(v) => set({ ...b, imageMobile: v || undefined })} help="Κάθετη ή τετράγωνη, π.χ. 800×800 px." />
        </Step>
        <Step n={2} title="Σύνδεσμος" help="Πού πηγαίνει ο πελάτης όταν πατήσει την εικόνα. Κενό = δεν πατιέται.">
          <LinkField label="Σύνδεσμος της εικόνας" value={b.href ?? ""} onChange={(v) => set({ ...b, href: v || undefined })} />
        </Step>
        {more("Πώς μπαίνει η εικόνα και τίτλοι (προαιρετικά)", <>
          <Choice label="Πώς μπαίνει η εικόνα" value={b.fit ?? "cover"} onChange={(v) => set({ ...b, fit: v === "cover" ? undefined : v })} options={[{ value: "cover", label: "Γεμίζει το πλαίσιο", help: "Κόβονται οι άκρες όπου δεν χωρά." }, { value: "natural", label: "Ολόκληρη, στις αναλογίες της", help: "Το ύψος ακολουθεί την εικόνα." }, { value: "contain", label: "Ολόκληρη μέσα στο πλαίσιο" }]} />
          {(b.fit ?? "cover") !== "natural" && <Choice label="Ύψος πλαισίου" value={b.height ?? "m"} onChange={(v) => set({ ...b, height: v === "m" ? undefined : v })} options={[{ value: "s", label: "Μικρό" }, { value: "m", label: "Μεσαίο" }, { value: "l", label: "Μεγάλο" }]} />}
          {titles}
        </>)}
      </>)}

      {kind === "none" && (<>
        <Step n={1} title="Κείμενα" help="Γράψε ό,τι θέλεις από τα τρία· τα κενά δεν εμφανίζονται.">{titles}</Step>
        {more("Κουμπί (προαιρετικό)", button)}
      </>)}
    </div>
  );
}

function LandingFields({ b, set }: { b: B<"promo-landing">; set: (b: BrandBlock) => void }) {
  const o = useOptions();
  return <Pick label="Landing page" value={b.landingId} onChange={(v, l) => set({ ...b, landingId: v, landingTitle: l || undefined })} options={o ? o.landings.map((l) => ({ value: l.id, label: `${l.title} · /prosfores/${l.slug}${l.endsAt ? ` · έως ${fmt(l.endsAt)}` : ""}` })) : null} empty="Καμία δημοσιευμένη landing page — φτιάξε στις Προσφορές → Landing pages." help="Εικόνα και τίτλος από το hero της landing page· η λήξη από την προσφορά της." />;
}

function CouponFields({ b, set, head }: { b: B<"coupon">; set: (b: BrandBlock) => void; head: ReactNode }) {
  const o = useOptions();
  return (
    <div className="grid gap-4">
      <Pick label="Κουπόνι" value={b.code} onChange={(v) => set({ ...b, code: v })} options={o ? o.coupons.map((c) => ({ value: c.code, label: `${c.code} · ${c.promo}${c.expiresAt ? ` · έως ${fmt(c.expiresAt)}` : ""}` })) : null} empty="Κανένα κοινό κουπόνι σε ισχύ." help="Μόνο κοινά κουπόνια (όχι προσωπικά). Η έκπτωση γράφεται αυτόματα." />
      {head}
      <span className="text-eu-muted text-[length:var(--fs-13)] -mt-2">Κενός τίτλος = η έκπτωση (π.χ. «10 % έκπτωση»).</span>
      <Txt label="Κείμενο (προαιρετικό)" value={b.text ?? ""} onChange={(v) => set({ ...b, text: v || undefined })} max={90} placeholder="Γράψε τον κωδικό στο καλάθι" />
    </div>
  );
}

function StoresFields({ b, set, head }: { b: B<"stores">; set: (b: BrandBlock) => void; head: ReactNode }) {
  const o = useOptions();
  return (
    <div className="grid gap-4">
      {head}
      <Choice label="Ποια καταστήματα" value={b.mode} onChange={(v) => set({ ...b, mode: v })} options={[{ value: "near", label: "Τα πιο κοντινά στον επισκέπτη", help: "Από την περιοχή του (IP ή τοποθεσία που έδωσε) — χωρίς να ζητηθεί άδεια." }, { value: "region", label: "Μιας περιοχής" }]} />
      {b.mode === "region" && <Pick label="Περιοχή" value={b.region ?? ""} onChange={(v) => set({ ...b, region: v || undefined })} options={o ? o.regions.map((r) => ({ value: r, label: r })) : null} empty="Καμία περιοχή." />}
      <Choice label="Πόσα" value={String(b.limit) as "1" | "3" | "6"} onChange={(v) => set({ ...b, limit: Number(v) })} options={[{ value: "1", label: "1" }, { value: "3", label: "3" }, { value: "6", label: "6" }]} help="Στην πλευρική στήλη ταιριάζει 1." />
    </div>
  );
}


function DealFields({ b, set, head, ctx }: { b: B<"deal-hero">; set: (b: BrandBlock) => void; head: ReactNode; ctx: Ctx }) {
  const o = useOptions();
  return (
    <div className="grid gap-4">
      {head}
      <Choice label="Ποιο προϊόν" value={b.source} onChange={(v) => set({ ...b, source: v })} options={[{ value: "promotion", label: "Το κορυφαίο μιας προσφοράς", help: "Το προϊόν με τη μεγαλύτερη έκπτωση της προσφοράς· η λήξη από την προσφορά. Κρύβεται όταν λήξει." }, { value: "product", label: "Ένα προϊόν που διαλέγω" }]} />
      {b.source === "promotion" ? (
        <Pick label="Προσφορά" value={b.promotionId ?? ""} onChange={(v, l) => set({ ...b, promotionId: v, promotionName: l || undefined })} options={o ? o.promos.map((p) => ({ value: p.id, label: `${p.name} · ${p.code}${p.endsAt ? ` · έως ${fmt(p.endsAt)}` : ""}` })) : null} empty="Καμία ενεργή ή προγραμματισμένη προσφορά." />
      ) : (
        <>
          <ProductList single label="Προϊόν" ids={b.productId ? [b.productId] : []} onChange={(ids) => set({ ...b, productId: ids[0] })} info={ctx.info} onInfo={ctx.onInfo} brandId={ctx.brandId} brandName={ctx.brandName} />
          <DateTime label="Λήξη (προαιρετικό)" value={b.endsAt} onChange={(v) => set({ ...b, endsAt: v })} help="Κενό = στο τέλος της ημέρας." />
        </>
      )}
    </div>
  );
}

function CountdownFields({ b, set, head }: { b: B<"countdown">; set: (b: BrandBlock) => void; head: ReactNode }) {
  const o = useOptions();
  return (
    <div className="grid gap-4">
      <Pick label="Προσφορά" value={b.promotionId} onChange={(v, l) => set({ ...b, promotionId: v, promotionName: l || undefined })} options={o ? o.promos.map((p) => ({ value: p.id, label: `${p.name} · ${p.code}${p.endsAt ? ` · έως ${fmt(p.endsAt)}` : " · χωρίς λήξη"}` })) : null} empty="Καμία ενεργή ή προγραμματισμένη προσφορά." help="Χρειάζεται προσφορά με ημερομηνία λήξης." />
      {head}
      <span className="text-eu-muted text-[length:var(--fs-13)] -mt-2">Κενός τίτλος = το όνομα της προσφοράς.</span>
      <Area label="Κείμενο (προαιρετικό)" value={b.body ?? ""} onChange={(v) => set({ ...b, body: v || undefined })} max={140} rows={2} />
      <CtaFields label="Κουμπί (κενό = «Δες την προσφορά» προς τη landing page)" value={b.cta} onChange={(v) => set({ ...b, cta: v })} />
    </div>
  );
}

function ListFields({ kind, b, set, head }: { kind: "guides" | "services"; b: B<"guides"> | B<"services">; set: (b: BrandBlock) => void; head: ReactNode }) {
  const o = useOptions();
  const all = o ? o[kind] : null;
  const picked = b.slugs ?? [];
  return (
    <div className="grid gap-4">
      {head}
      <Choice label={kind === "guides" ? "Ποιοι οδηγοί" : "Ποιες υπηρεσίες"} value={b.mode} onChange={(v) => set({ ...b, mode: v })} options={[{ value: "auto", label: "Αυτόματα", help: kind === "guides" ? "Οι πιο πρόσφατοι οδηγοί." : "Οι βασικές υπηρεσίες, με τη σειρά τους." }, { value: "manual", label: "Επιλογή", help: "Μόνο όσα διαλέξεις, με αυτή τη σειρά." }]} />
      {b.mode === "auto" ? (
        <Choice label="Πόσα" value={String(b.limit ?? (kind === "guides" ? 3 : 4)) as "2" | "3" | "4" | "6"} onChange={(v) => set({ ...b, limit: Number(v) })} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "6", label: "6" }]} />
      ) : all === null ? <span className="text-eu-muted">Φόρτωση…</span> : (
        <fieldset className="m-0 p-0 border-0 grid gap-1.5">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">{kind === "guides" ? "Οδηγοί" : "Υπηρεσίες"}</legend>
          {all.map((x) => { const on = picked.includes(x.slug); return <button key={x.slug} type="button" aria-pressed={on} onClick={() => set({ ...b, slugs: on ? picked.filter((s) => s !== x.slug) : [...picked, x.slug], limit: Math.max(picked.length + (on ? -1 : 1), 1) })} className={`text-left rounded-xl border-2 px-3 min-h-11 font-semibold text-[length:var(--fs-14)] ${on ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line"}`}>{on ? `${picked.indexOf(x.slug) + 1}. ` : ""}{x.title}</button>; })}
        </fieldset>
      )}
    </div>
  );
}
