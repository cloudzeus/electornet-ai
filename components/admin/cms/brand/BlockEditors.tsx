"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Camera, Cpu, Eye, Leaf, Plus, Shield, Sparkles, Wifi, X, Zap } from "lucide-react";
import type { AutoSource, BrandBlock, Cta } from "@/lib/cms/brand-store";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { ProductList } from "./ProductPicker";
import { Area, DateTime, LinkField, MediaUrl, StringList, Txt } from "./fields";
import { CategoryPicker } from "./CategoryPicker";

type Ctx = { brandId: string; brandName: string; info: Record<string, PickProduct>; onInfo: (p: PickProduct[]) => void };
type B<T extends BrandBlock["type"]> = Extract<BrandBlock, { type: T }>;

/** Περιγραφή κάθε τύπου ενότητας — εμφανίζεται στην προσθήκη και πάνω από τη φόρμα της. */
export const BLOCK_INFO: Record<BrandBlock["type"], { label: string; help: string }> = {
  "new-arrivals": { label: "Νέα προϊόντα", help: "Τα 3–4 νεότερα ή πιο εντυπωσιακά προϊόντα, σε μεγάλες κάρτες." },
  series: { label: "Σειρές", help: "Οι οικογένειες προϊόντων της μάρκας (π.χ. OLED, Galaxy, Bespoke), καθεμία με εικόνα, κείμενο και σύνδεσμο." },
  offers: { label: "Προσφορές", help: "Προϊόντα σε προσφορά με αντίστροφη μέτρηση μέχρι τη λήξη." },
  story: { label: "Ιστορία", help: "Μεγάλη εικόνα με κείμενο — για μια τεχνολογία ή καμπάνια. Προαιρετικό κουμπί." },
  tech: { label: "Τεχνολογία", help: "3–4 πλακίδια με εικονίδιο: τι κάνει τη μάρκα ξεχωριστή." },
  support: { label: "Εγγύηση & υποστήριξη", help: "Στοιχεία εγγύησης/service και έτοιμες ερωτήσεις που ανοίγουν τον Ερμή." },
  video: { label: "Βίντεο", help: "Βίντεο που παίζει αθόρυβα σε επανάληψη, με λεζάντα." },
  announcement: { label: "Ανακοίνωση", help: "Λεπτή λωρίδα στο χρώμα της μάρκας, με σύνδεσμο και προαιρετική αντίστροφη μέτρηση. Ιδανική πάνω από το hero." },
  usp: { label: "Πλεονεκτήματα", help: "Λωρίδα με 2–4 σύντομα πλεονεκτήματα και εικονίδια (εγγύηση, παράδοση, δόσεις)." },
  banner: { label: "Banner", help: "Μεγάλη εικόνα με τίτλο, κείμενο και κουμπί πάνω της. Μπορεί να έχει άλλη εικόνα για κινητό." },
  "products-auto": { label: "Προϊόντα (αυτόματα)", help: "Πλέγμα προϊόντων που ενημερώνεται μόνο του από τον κατάλογο: νεότερα, σε προσφορά, κορυφαία, οικονομικά ή διαθέσιμα — όλα ή μίας κατηγορίας." },
  categories: { label: "Κατηγορίες", help: "Πλακίδια με τις κατηγορίες της μάρκας (εικόνα + πλήθος), προς τη λίστα με φίλτρο μάρκας. Αυτόματα ή όσες διαλέξεις." },
  faq: { label: "Συχνές ερωτήσεις", help: "Ερωτήσεις που ανοίγουν με ένα πάτημα. Βοηθούν και στη Google (FAQ)." },
  text: { label: "Κείμενο", help: "Τίτλος και παράγραφοι — για ιστορία της μάρκας, οδηγίες, ανακοινώσεις." },
  gallery: { label: "Gallery", help: "2–6 εικόνες σε πλέγμα ή «mosaic» με την πρώτη μεγάλη, με λεζάντες και συνδέσμους." },
  cta: { label: "Κάλεσμα σε δράση", help: "Ζώνη στο χρώμα της μάρκας με τίτλο και 1–2 κουμπιά (π.χ. «Κλείσε επίδειξη», «Βρες κατάστημα»)." },
};
/** σειρά στο «Προσθήκη ενότητας», ομαδοποιημένα */
export const BLOCK_GROUPS: { label: string; types: BrandBlock["type"][] }[] = [
  { label: "Προϊόντα", types: ["products-auto", "new-arrivals", "offers", "series", "categories"] },
  { label: "Εικόνα & βίντεο", types: ["banner", "story", "gallery", "video"] },
  { label: "Κείμενο & πληροφορίες", types: ["text", "tech", "faq", "support"] },
  { label: "Λωρίδες & κουμπιά", types: ["announcement", "usp", "cta"] },
];
export const AUTO_SOURCES: { value: AutoSource; label: string; help: string }[] = [
  { value: "newest", label: "Νεότερα", help: "Τα πιο πρόσφατα στον κατάλογο." },
  { value: "offers", label: "Σε προσφορά", help: "Με ενεργή προσφορά τιμής, μεγαλύτερη έκπτωση πρώτα." },
  { value: "top", label: "Κορυφαία", help: "Τα ακριβότερα — συνήθως οι ναυαρχίδες." },
  { value: "value", label: "Οικονομικά", help: "Από τη χαμηλότερη τιμή." },
  { value: "in-stock", label: "Διαθέσιμα τώρα", help: "Με απόθεμα στην κεντρική αποθήκη." },
];

export const TECH_ICONS = { cpu: Cpu, eye: Eye, zap: Zap, wifi: Wifi, shield: Shield, sparkles: Sparkles, leaf: Leaf, camera: Camera } as const;
const ICON_LABEL: Record<keyof typeof TECH_ICONS, string> = { cpu: "Επεξεργαστής", eye: "Εικόνα", zap: "Ενέργεια", wifi: "Σύνδεση", shield: "Ασφάλεια", sparkles: "AI / νέο", leaf: "Οικολογία", camera: "Κάμερα" };

const newId = () => `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function newBlock(type: BrandBlock["type"], brand: string): BrandBlock {
  const id = newId();
  const ends = new Date(Date.now() + 14 * 86_400_000); ends.setHours(23, 59, 0, 0);
  switch (type) {
    case "new-arrivals": return { id, type, kicker: "Νέα προϊόντα", title: "Μόλις έφτασαν", productIds: [] };
    case "series": return { id, type, kicker: "Σειρές", title: "Διάλεξε τη σειρά σου", items: [{ name: "", blurb: "", image: "", productIds: [] }] };
    case "offers": return { id, type, kicker: `Προσφορές ${brand}`, title: "Για λίγες μέρες", productIds: [], endsAt: ends.toISOString() };
    case "story": return { id, type, kicker: "", title: "", image: "", body: "", align: "right" };
    case "tech": return { id, type, kicker: "Τεχνολογία", title: `Γιατί ${brand}`, items: [{ icon: "sparkles", title: "", blurb: "" }] };
    case "support": return { id, type, facts: [`Επίσημη εγγύηση ${brand}`], askAris: [] };
    case "video": return { id, type, src: "", poster: "", caption: "" };
    case "announcement": return { id, type, zone: "top", text: `Νέα σειρά ${brand} — δες τη πρώτος στα καταστήματα Euronics`, href: "" };
    case "usp": return { id, type, zone: "top", items: [{ icon: "shield", text: `Επίσημη εγγύηση ${brand}` }, { icon: "zap", text: "Παράδοση σε 1–3 ημέρες" }, { icon: "sparkles", text: "Έως 24 άτοκες δόσεις" }] };
    case "banner": return { id, type, kicker: "", title: "", body: "", image: "", align: "left", overlay: "dark", height: "m" };
    case "products-auto": return { id, type, kicker: brand, title: "Τα νεότερα", source: "newest", limit: 8 };
    case "categories": return { id, type, kicker: "Κατηγορίες", title: `Όλος ο κόσμος της ${brand}`, mode: "auto", limit: 6 };
    case "faq": return { id, type, zone: "bottom", kicker: "Ερωτήσεις", title: "Συχνές ερωτήσεις", items: [{ q: "", a: "" }] };
    case "text": return { id, type, kicker: "", title: "", body: "", align: "left" };
    case "gallery": return { id, type, kicker: "", title: "", images: [{ src: "" }, { src: "" }, { src: "" }], layout: "grid" };
    case "cta": return { id, type, zone: "bottom", title: `Δες τα ${brand} από κοντά`, body: "Σε κάθε κατάστημα Euronics, με επίδειξη και συμβουλή.", primary: { label: "Βρες κατάστημα", href: "/katastimata" } };
  }
}

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

/** Η φόρμα μιας ενότητας ανάλογα με τον τύπο της. */
export function BlockFields({ b, set, ctx }: { b: BrandBlock; set: (b: BrandBlock) => void; ctx: Ctx }): ReactNode {
  const head = !["support", "video", "announcement", "usp"].includes(b.type) && (
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
      return (
        <div className="grid gap-4">
          {head}
          <Area label="Κείμενο" value={x.body ?? ""} onChange={(v) => set({ ...x, body: v })} max={160} rows={2} />
          <MediaUrl label="Εικόνα" value={x.image} onChange={(v) => set({ ...x, image: v })} help="Οριζόντια, τουλάχιστον 1920×800 px. Το κείμενο μπαίνει από πάνω — άφησε «ήσυχο» χώρο στην πλευρά του κειμένου." />
          <MediaUrl label="Εικόνα για κινητό (προαιρετική)" value={x.imageMobile ?? ""} onChange={(v) => set({ ...x, imageMobile: v || undefined })} help="Κάθετη/τετράγωνη εκδοχή για οθόνες έως 640 px. Κενό = η ίδια εικόνα, κομμένη." />
          <Choice label="Θέση κειμένου" value={x.align ?? "left"} onChange={(v) => set({ ...x, align: v })} options={[{ value: "left", label: "Αριστερά" }, { value: "center", label: "Κέντρο" }, { value: "right", label: "Δεξιά" }]} />
          <Choice label="Σκίαση για να διαβάζεται το κείμενο" value={x.overlay ?? "dark"} onChange={(v) => set({ ...x, overlay: v })} options={[{ value: "dark", label: "Σκούρα (λευκά γράμματα)" }, { value: "light", label: "Ανοιχτή (σκούρα γράμματα)" }, { value: "none", label: "Καμία" }]} />
          <Choice label="Ύψος" value={x.height ?? "m"} onChange={(v) => set({ ...x, height: v })} options={[{ value: "s", label: "Μικρό" }, { value: "m", label: "Μεσαίο" }, { value: "l", label: "Μεγάλο" }]} />
          <CtaFields label="Κουμπί" value={x.cta} onChange={(v) => set({ ...x, cta: v })} />
        </div>
      );
    }
    case "products-auto": {
      const x = b as B<"products-auto">;
      return (
        <div className="grid gap-4">
          {head}
          <Choice label="Ποια προϊόντα" value={x.source} onChange={(v) => set({ ...x, source: v })} options={AUTO_SOURCES} />
          <CategoryPicker single brandId={ctx.brandId} label="Από κατηγορία" help="Περιόρισε σε μία κατηγορία (π.χ. μόνο Τηλεοράσεις)." value={x.categoryId ? [{ id: x.categoryId, name: x.categoryName ?? "" }] : []} onChange={(v) => set({ ...x, categoryId: v[0]?.id, categoryName: v[0]?.name })} />
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
          <Choice label="Ποιες κατηγορίες" value={x.mode} onChange={(v) => set({ ...x, mode: v })} options={[{ value: "auto", label: "Αυτόματα", help: "Οι κατηγορίες με τα περισσότερα προϊόντα της μάρκας — ενημερώνονται μόνες τους." }, { value: "manual", label: "Επιλογή", help: "Μόνο όσες διαλέξεις, με αυτή τη σειρά." }]} />
          {x.mode === "auto" ? (
            <Choice label="Πόσες" value={String(x.limit ?? 6) as "4" | "6" | "8"} onChange={(v) => set({ ...x, limit: Number(v) })} options={[{ value: "4", label: "4" }, { value: "6", label: "6" }, { value: "8", label: "8" }]} />
          ) : (
            <CategoryPicker brandId={ctx.brandId} label="Κατηγορίες" value={(x.items ?? []).map((i) => ({ id: i.id, name: i.name }))} onChange={(v) => set({ ...x, items: v.map((c) => ({ ...c, image: x.items?.find((i) => i.id === c.id)?.image })) })} help="Η εικόνα κάθε πλακιδίου είναι αυτόματα από το κορυφαίο προϊόν της κατηγορίας." />
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
