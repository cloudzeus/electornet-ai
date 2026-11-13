"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { CalendarClock, Check, ChevronLeft, Eye, Image as ImageIcon, LayoutTemplate, Loader2, Monitor, MousePointerClick, PaintBucket, ShoppingBag, Smartphone, Type, X } from "lucide-react";
import { SLOTS } from "@/lib/promo/landing-blocks";
import { BANNER_ANIMS, BANNER_PRESETS, DEFAULT_BANNER_DESIGN, MAX_BANNER_PRODUCTS, bannerDesignIssue, type BannerDesign, type BannerProduct } from "@/lib/promo/banner-design";
import { savePlacementAction, type PlacementInput } from "@/app/admin/(shell)/prosfores/actions";
import { bannerPreviewProductsAction } from "@/app/admin/(shell)/prosfores/theseis/actions";
import { DesignedBanner } from "@/components/promo/DesignedBanner";
import { StatusPill } from "@/components/admin/settings/ui";
import { ImageUrlField } from "./ImageUrlField";
import { ProductBrowser, type BrowseProduct } from "./ProductBrowser";

type Opt = { id: string; label: string };
type Doc = PlacementInput & { design: BannerDesign | null };
type Tab = "text" | "bg" | "products" | "image" | "where";
const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none font-normal";
const ST: Record<string, string> = { draft: "Πρόχειρο — δεν φαίνεται", active: "Ενεργό", paused: "Σε παύση", archived: "Αρχείο" };
const localDt = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function F({ l, help, children }: { l: string; help?: string; children: ReactNode }) {
  return <label className="grid gap-1 min-w-0 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><span>{l}</span>{children}{help && <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">{help}</span>}</label>;
}
/** Επιλογή ενός από λίγα: κουμπιά με εξήγηση στο title. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string; help?: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-1 min-w-0">
      <legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{options.map((o) => <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={`rounded-xl border-2 px-3 min-h-11 font-bold text-[length:var(--fs-13)] ${value === o.key ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-navy/50"}`}>{o.label}</button>)}</div>
      {options.find((o) => o.key === value)?.help && <span className="text-eu-muted text-[length:var(--fs-13)]">{options.find((o) => o.key === value)!.help}</span>}
    </fieldset>
  );
}
function Color({ l, value, onChange }: { l: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex items-center gap-2 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-11 rounded-lg border-2 border-eu-line bg-white p-0.5 cursor-pointer" />{l}<span className="font-mono font-normal text-eu-muted text-[length:var(--fs-12)]">{value}</span></label>;
}
function Check2({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <label className="inline-flex items-center gap-2 min-h-11 text-eu-ink-2 text-[length:var(--fs-14)] cursor-pointer"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-eu-navy" />{children}</label>;
}

/**
 * Editor ενός banner (όπως τα hero slides): ρυθμίσεις σε καρτέλες αριστερά, το banner ζωντανά δεξιά στο σχήμα της θέσης του.
 * «Σχεδιασμένο εδώ» = φόντο με κίνηση + σήμα καμπάνιας + κείμενα + προϊόντα του καταλόγου (τιμή και φωτογραφία τη στιγμή
 * της προβολής)· «Έτοιμη εικόνα» = όπως πριν. Η προεπισκόπηση είναι το ίδιο component που βλέπει ο πελάτης.
 */
export function BannerEditor({ initial, stats, promos, landings, categories }: { initial: Doc; stats: { impressions: number; clicks: number } | null; promos: Opt[]; landings: Opt[]; categories: Opt[] }) {
  const router = useRouter();
  const [d, setD] = useState<Doc>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [tab, setTab] = useState<Tab>(initial.design || !initial.id ? "text" : "image");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [products, setProducts] = useState<BannerProduct[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [browse, setBrowse] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const set = (p: Partial<Doc>) => setD((x) => ({ ...x, ...p }));
  const g = d.design;
  const setG = (p: Partial<BannerDesign>) => setD((x) => (x.design ? { ...x, design: { ...x.design, ...p } } : x));
  const setBg = (p: Partial<BannerDesign["bg"]>) => g && setG({ bg: { ...g.bg, ...p } });
  const setP = (p: Partial<BannerDesign["products"]>) => g && setG({ products: { ...g.products, ...p } });
  const dirty = JSON.stringify(d) !== saved;
  const slot = SLOTS.find((s) => s.key === d.slot) ?? SLOTS[0];
  const square = d.slot === "info-aside";

  // τα προϊόντα της προεπισκόπησης: ξαναδιαβάζονται (με λίγη αναμονή) όταν αλλάξει η πηγή, η λίστα ή η προσφορά
  const pkey = g ? `${g.products.source}|${g.products.ids.join(",")}|${g.products.max}|${d.promotionId ?? ""}` : "";
  useEffect(() => {
    if (!g || g.products.source === "none") { const t = setTimeout(() => setProducts([]), 0); return () => clearTimeout(t); }
    let on = true;
    const t = setTimeout(() => { void bannerPreviewProductsAction(g, d.promotionId).then((r) => { if (on) setProducts(r); }).catch(() => {}); }, 300);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- μόνο όταν αλλάξει το κλειδί των προϊόντων
  }, [pkey]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const issue = g ? bannerDesignIssue(g, d.promotionId) : d.image ? null : "Διάλεξε εικόνα.";
  const save = () => start(async () => {
    setMsg(null);
    const r = await savePlacementAction({ ...d, title: d.title.trim() || g?.title || "Banner" });
    if (!r.ok) { setMsg({ ok: false, t: r.error }); return; }
    const next = { ...d, id: r.id, title: d.title.trim() || g?.title || "Banner" };
    setD(next); setSaved(JSON.stringify(next));
    setMsg({ ok: true, t: d.status === "active" ? "Αποθηκεύτηκε. Η βιτρίνα ενημερώνεται σε λίγα δευτερόλεπτα." : "Αποθηκεύτηκε ως πρόχειρο. Για να φανεί, κάνε την κατάσταση «Ενεργό» στο «Πού και πότε»." });
    if (!d.id) router.replace(`/admin/prosfores/theseis/${r.id}`);
  });
  const onProduct = (p: BrowseProduct) => { if (!g) return; const has = g.products.ids.includes(p.id); if (!has && g.products.ids.length >= MAX_BANNER_PRODUCTS) return; setPicked((m) => ({ ...m, [p.id]: p.title })); setP({ ids: has ? g.products.ids.filter((x) => x !== p.id) : [...g.products.ids, p.id] }); };

  const tabs: { key: Tab; label: string; I: typeof Type }[] = g
    ? [{ key: "text", label: "Κείμενο", I: Type }, { key: "bg", label: "Φόντο", I: PaintBucket }, { key: "products", label: "Προϊόντα", I: ShoppingBag }, { key: "where", label: "Πού και πότε", I: CalendarClock }]
    : [{ key: "image", label: "Εικόνα", I: ImageIcon }, { key: "where", label: "Πού και πότε", I: CalendarClock }];
  const cur = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;
  const pill = d.status === "active" ? (["live", "Ενεργό"] as const) : d.status === "paused" ? (["incomplete", "Σε παύση"] as const) : (["off", "Πρόχειρο — δεν φαίνεται"] as const);

  return (
    <div className="@container grid gap-3 min-w-0">
      <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2 bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link href="/admin/prosfores/theseis" className="inline-flex items-center gap-0.5 text-eu-blue font-bold text-[length:var(--fs-13)] min-h-11 md:min-h-8 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Banners</Link>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] min-w-0 truncate">{d.title || g?.title || "Νέο banner"}</h2>
          <StatusPill status={pill[0]} text={pill[1]} />
          {stats && <span className="inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-12)] tabular-nums"><span className="inline-flex items-center gap-0.5" title="Προβολές"><Eye className="size-3.5" aria-hidden />{stats.impressions.toLocaleString("el-GR")}</span><span className="inline-flex items-center gap-0.5" title="Κλικ"><MousePointerClick className="size-3.5" aria-hidden />{stats.clicks.toLocaleString("el-GR")}</span></span>}
          <button data-help="banner.save" type="button" onClick={save} disabled={busy || !dirty} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-4 min-h-11 md:min-h-9 hover:bg-eu-blue disabled:opacity-45">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{dirty ? "Αποθήκευση" : "Αποθηκευμένο"}</button>
        </div>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`m-0 rounded-xl px-3 py-2 font-semibold text-[length:var(--fs-13)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
      </div>

      <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(21rem,27rem)_minmax(0,1fr)] gap-4 items-start">
        <div data-help="banner.form" className="grid gap-3 min-w-0 rounded-xl bg-white border border-eu-line p-3">
          <Choice label="Τι είναι το banner" value={g ? "design" : "image"} options={[{ key: "design", label: "Σχεδιασμένο εδώ", help: "Φόντο με κίνηση, κείμενα και προϊόντα με την τωρινή τιμή τους. Προσαρμόζεται μόνο του σε κινητό." }, { key: "image", label: "Έτοιμη εικόνα", help: "Ανεβάζεις την εικόνα του γραφίστα. Θέλει και δεύτερη εικόνα για κινητό." }]}
            onChange={(v) => { if (v === "design" && !g) { set({ design: DEFAULT_BANNER_DESIGN }); setTab("text"); } if (v === "image" && g && window.confirm("Το σχέδιο (κείμενα, φόντο, προϊόντα) θα χαθεί με την αποθήκευση. Συνέχεια;")) { set({ design: null }); setTab("image"); } }} />
          <div className="flex flex-wrap gap-1 border-b border-eu-line pb-2" role="tablist" aria-label="Ρυθμίσεις banner">
            {tabs.map((t) => <button key={t.key} type="button" role="tab" aria-selected={cur === t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] ${cur === t.key ? "bg-eu-navy text-white" : "text-eu-ink-2 hover:bg-eu-surface"}`}><t.I className="size-4" aria-hidden />{t.label}</button>)}
          </div>

          {g && cur === "text" && (
            <div className="grid gap-3">
              <ImageUrlField label="Σήμα καμπάνιας (προαιρετικό)" value={g.logo ?? ""} onChange={(v) => setG({ logo: v || null })} help="Π.χ. το «Black Friday» σε PNG με διαφάνεια. Μπαίνει πάνω από τον τίτλο." />
              <F l="Μικρός τίτλος" help="Μία-δύο λέξεις πάνω από τον τίτλο, στο χρώμα έμφασης."><input className={input} maxLength={40} value={g.kicker} onChange={(e) => setG({ kicker: e.target.value })} placeholder="π.χ. Μόνο αυτή την εβδομάδα" /></F>
              <F l="Τίτλος" help={`${g.title.length}/80 — σύντομος διαβάζεται καλύτερα.`}><input className={input} maxLength={80} value={g.title} onChange={(e) => setG({ title: e.target.value })} /></F>
              <F l="Κείμενο (προαιρετικό)"><textarea rows={2} className={`${input} py-2`} maxLength={160} value={g.body} onChange={(e) => setG({ body: e.target.value })} /></F>
              <F l="Κουμπί" help="Κενό = χωρίς κουμπί. Το πού πηγαίνει ορίζεται στο «Πού και πότε»."><input className={input} maxLength={30} value={g.cta} onChange={(e) => setG({ cta: e.target.value })} /></F>
            </div>
          )}

          {g && cur === "bg" && (
            <div className="grid gap-4">
              <fieldset className="m-0 p-0 border-0 grid gap-1">
                <legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Γρήγορη αρχή</legend>
                <div className="flex flex-wrap gap-1.5">{BANNER_PRESETS.map((p) => <button key={p.key} type="button" onClick={() => setG({ ink: p.apply.ink, accent: p.apply.accent, bg: { ...g.bg, ...p.apply.bg } })} className="rounded-xl border-2 border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-13)] hover:border-eu-navy">{p.label}</button>)}</div>
              </fieldset>
              <div className="grid gap-2"><Color l="Χρώμα φόντου" value={g.bg.color} onChange={(v) => setBg({ color: v })} /><Color l="Χρώμα τιμής και κουμπιού" value={g.accent} onChange={(v) => setG({ accent: v })} /></div>
              <Choice label="Χρώμα κειμένων" value={g.ink} options={[{ key: "light", label: "Λευκά", help: "Για σκούρο φόντο." }, { key: "dark", label: "Σκούρα", help: "Για ανοιχτό φόντο." }]} onChange={(v) => setG({ ink: v })} />
              <Choice label="Κίνηση φόντου" value={g.bg.anim} options={BANNER_ANIMS} onChange={(v) => setBg({ anim: v })} />
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η κίνηση σταματά μόνη της σε όσους έχουν κλείσει τις κινήσεις στη συσκευή τους.</p>
              <ImageUrlField label="Εικόνα φόντου (προαιρετικό)" value={g.bg.image ?? ""} onChange={(v) => setBg({ image: v || null })} help="Π.χ. το κενό φόντο της καμπάνιας. Καλύπτει όλο το banner και κόβεται στις άκρες." />
              <F l="Video φόντου (προαιρετικό)" help="Διεύθυνση .mp4 από τη βιβλιοθήκη media. Παίζει χωρίς ήχο, σε επανάληψη, πάνω από την εικόνα."><input className={input} value={g.bg.video ?? ""} onChange={(e) => setBg({ video: e.target.value || null })} placeholder="https://euronics.b-cdn.net/….mp4" /></F>
            </div>
          )}

          {g && cur === "products" && (
            <div className="grid gap-3">
              <Choice label="Διάταξη" value={g.layout} options={[{ key: "strip", label: "Λωρίδα", help: "Κείμενο αριστερά, έως 3 προϊόντα δεξιά." }, { key: "posts", label: "Τετράγωνα post", help: "Ένα τετράγωνο ανά προϊόν (έως 4), στη μορφή των post της καμπάνιας: βάλε στο «Φόντο» το τετράγωνο εικαστικό με το σήμα." }]} onChange={(v) => setG({ layout: v })} />
              <Choice label="Προϊόντα στο banner" value={g.products.source} options={[{ key: "none", label: "Χωρίς", help: "Μόνο κείμενο και φόντο." }, { key: "promotion", label: "Της προσφοράς", help: "Τα προϊόντα της προσφοράς του banner με τη μεγαλύτερη έκπτωση — αλλάζουν μόνα τους." }, { key: "manual", label: "Τα διαλέγω εγώ", help: `Έως ${MAX_BANNER_PRODUCTS} προϊόντα του καταλόγου.` }]} onChange={(v) => setP({ source: v })} />
              {g.products.source === "promotion" && !d.promotionId && <p className="m-0 rounded-xl bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-13)] font-semibold">Δεν έχεις διαλέξει προσφορά. <button type="button" onClick={() => setTab("where")} className="underline text-eu-blue font-bold">Διάλεξέ τη στο «Πού και πότε»</button></p>}
              {g.products.source === "manual" && (
                <div className="grid gap-2">
                  {g.products.ids.length > 0 && <ul className="m-0 p-0 list-none grid gap-1.5">{g.products.ids.map((id) => { const p = products.find((x) => x.id === id); return (
                    <li key={id} className="flex items-center gap-2 rounded-xl border border-eu-line p-1.5">
                      {p?.image ? <img src={p.image} alt="" className="size-10 rounded-md object-contain bg-white shrink-0" /> : <span className="size-10 rounded-md bg-eu-surface shrink-0" />}
                      <span className="min-w-0 flex-1 grid"><span className="font-bold text-eu-ink text-[length:var(--fs-13)] truncate">{p ? p.title : picked[id] ?? "Φόρτωση…"}</span>{p && <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{p.price.toLocaleString("el-GR")} € τώρα</span>}</span>
                      <button type="button" onClick={() => setP({ ids: g.products.ids.filter((x) => x !== id) })} aria-label="Αφαίρεση" className="size-11 md:size-9 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
                    </li>
                  ); })}</ul>}
                  <button type="button" onClick={() => setBrowse((x) => !x)} aria-expanded={browse} className="rounded-xl border border-dashed border-eu-ink-3/50 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy hover:text-eu-navy">{browse ? "Κλείσιμο καταλόγου" : g.products.ids.length >= MAX_BANNER_PRODUCTS ? `Έχεις ${MAX_BANNER_PRODUCTS} — αφαίρεσε ένα για να αλλάξεις` : "+ Προϊόν από τον κατάλογο"}</button>
                </div>
              )}
              {g.products.source !== "none" && (
                <>
                  <Choice label="Πόσα φαίνονται" value={String(g.products.max) as "1" | "2" | "3" | "4"} options={[{ key: "1", label: "1", help: "Ένα μεγάλο προϊόν, με κουκκίδες." }, { key: "2", label: "2" }, { key: "3", label: "3" }, ...(g.layout === "posts" ? [{ key: "4" as const, label: "4" }] : [])]} onChange={(v) => setP({ max: Number(v) })} />
                  <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Σε κινητό και στενές θέσεις φαίνεται μόνο το πρώτο.</p>
                  <F l="Λέξη πάνω από την τιμή" help="Κενό = μόνο η τιμή."><input className={input} maxLength={12} value={g.products.priceLabel} onChange={(e) => setP({ priceLabel: e.target.value })} /></F>
                  <div className="grid"><Check2 on={g.products.showBrand} onChange={(v) => setP({ showBrand: v })}>Μάρκα</Check2><Check2 on={g.products.showEnergy} onChange={(v) => setP({ showEnergy: v })}>Ενεργειακή κλάση (όπου υπάρχει)</Check2><Check2 on={g.products.showWas} onChange={(v) => setP({ showWas: v })}>Αρχική τιμή διαγραμμένη (όταν έχει έκπτωση)</Check2></div>
                  {g.products.max === 1 && <F l="Κουκκίδες δίπλα στο προϊόν" help="Μία ανά γραμμή, έως 5. Π.χ. «10 κιλών», «1400 στροφών»."><textarea rows={4} className={`${input} py-2`} value={g.products.bullets.join("\n")} onChange={(e) => setP({ bullets: e.target.value.split("\n").slice(0, 5) })} /></F>}
                  <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Τιμή και φωτογραφία διαβάζονται από τον κατάλογο τη στιγμή που φορτώνει η σελίδα — δεν χρειάζεται να ξαναφτιάξεις το banner όταν αλλάξει η τιμή.</p>
                </>
              )}
            </div>
          )}

          {!g && cur === "image" && (
            <div className="grid gap-3">
              <ImageUrlField label="Εικόνα" value={d.image ?? ""} onChange={(v) => set({ image: v || null })} help={`Μέγεθος: ${slot.size}`} />
              <ImageUrlField label="Εικόνα για κινητό (προαιρετικά)" value={d.imageMobile ?? ""} onChange={(v) => set({ imageMobile: v || null })} />
            </div>
          )}

          {cur === "where" && (
            <div className="grid gap-3">
              <F l="Θέση" help={`Μέγεθος θέσης: ${slot.size}`}><select className={input} value={d.slot} onChange={(e) => set({ slot: e.target.value })}>{SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></F>
              <F l="Κατάσταση" help="«Ενεργό» = φαίνεται, αν είναι μέσα στις ημερομηνίες και η προσφορά του τρέχει."><select className={input} value={d.status} onChange={(e) => set({ status: e.target.value as Doc["status"] })}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
              <F l="Όνομα (εσωτερικό)" help="Για να το βρίσκεις στη λίστα· ο πελάτης δεν το βλέπει."><input className={input} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={g?.title || "Banner"} /></F>
              <F l="Προσφορά" help="Το banner φαίνεται μόνο όσο η προσφορά είναι ενεργή· όταν λήξει κρύβεται μόνο του."><select className={input} value={d.promotionId ?? ""} onChange={(e) => set({ promotionId: e.target.value || null })}><option value="">— χωρίς —</option>{promos.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></F>
              <F l="Πού πηγαίνει: landing page"><select className={input} value={d.landingId ?? ""} onChange={(e) => set({ landingId: e.target.value || null })}><option value="">— χωρίς —</option>{landings.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></F>
              <F l="ή σύνδεσμος" help="Μια σελίδα του site (/k/…) ή εξωτερικός (https://)."><input className={input} value={d.href ?? ""} onChange={(e) => set({ href: e.target.value || null })} placeholder="/k/… ή https://…" /></F>
              <F l="Περιγραφή για αναγνώστες οθόνης" help="Τι δείχνει το banner, σε μία φράση."><input className={input} value={d.alt ?? ""} onChange={(e) => set({ alt: e.target.value || null })} /></F>
              <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                <F l="Από" help="Κενό = από τώρα."><input type="datetime-local" className={input} value={localDt(d.startsAt)} onChange={(e) => set({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></F>
                <F l="Έως" help="Κενό = μέχρι να το σταματήσεις."><input type="datetime-local" className={input} value={localDt(d.endsAt)} onChange={(e) => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></F>
              </div>
              <F l="Προτεραιότητα" help="Όταν δύο banners είναι ενεργά στην ίδια θέση, φαίνεται αυτό με τον μικρότερο αριθμό."><input inputMode="numeric" className={input} value={d.priority} onChange={(e) => set({ priority: Number(e.target.value) || 100 })} /></F>
              {(d.slot === "listing-top" || d.slot === "pdp-below-buybox") && (
                <fieldset className="m-0 p-0 border-0 grid gap-1.5"><legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Μόνο στις κατηγορίες (κενό = σε όλες)</legend>
                  <div className="flex flex-wrap gap-1.5">{categories.map((c) => { const on = d.categories.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => set({ categories: on ? d.categories.filter((x) => x !== c.id) : [...d.categories, c.id] })} className={`rounded-full px-3 min-h-11 md:min-h-9 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{c.label}</button>; })}</div>
                </fieldset>
              )}
            </div>
          )}
        </div>

        {/* ο κατάλογος θέλει πλάτος (κατηγορία → μάρκα → προϊόν): ανοίγει σε όλο το πλάτος, πάνω από τις δύο στήλες */}
        {g && browse && cur === "products" && g.products.source === "manual" && (
          <section aria-label="Επιλογή προϊόντων" className="@4xl:col-span-2 @4xl:order-first rounded-xl bg-white border-2 border-eu-navy p-3 grid gap-2 min-w-0">
            <div className="flex items-center gap-2"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Διάλεξε προϊόντα <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">· {g.products.ids.length} από {MAX_BANNER_PRODUCTS}</span></h3><button type="button" onClick={() => setBrowse(false)} className="ml-auto inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><Check className="size-4" aria-hidden /> Έτοιμο</button></div>
            <ProductBrowser mode="products" selected={new Set(g.products.ids)} onProduct={onProduct} />
          </section>
        )}
        <div data-help="banner.preview" className="grid gap-2 min-w-0 @4xl:sticky @4xl:top-16">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-2"><LayoutTemplate className="size-4" aria-hidden />{slot.label}<span className="font-normal text-eu-muted">· {slot.size}</span></span>
            <div className="flex gap-1 rounded-full bg-white border border-eu-line p-1" role="radiogroup" aria-label="Συσκευή προεπισκόπησης">
              {(["desktop", "mobile"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={device === v} onClick={() => setDevice(v)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] ${device === v ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{v === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}{v === "desktop" ? "Υπολογιστής" : "Κινητό"}</button>)}
            </div>
          </div>
          <div className="rounded-2xl border border-eu-line bg-eu-line-2 p-3 @md:p-5">
            <div className={`mx-auto ${square ? "max-w-80" : device === "mobile" ? "max-w-[22.5rem]" : ""}`}>
              {g ? <DesignedBanner d={g} products={products} shape={square ? "square" : "wide"} href={d.href ?? (d.landingId ? "#" : null)} />
                : d.image ? <img src={device === "mobile" && d.imageMobile ? d.imageMobile : d.image} alt={d.alt ?? ""} className="block w-full h-auto rounded-2xl" />
                : <div className="grid place-items-center rounded-2xl border-2 border-dashed border-eu-line bg-white min-h-40 text-eu-muted text-[length:var(--fs-14)]">Διάλεξε εικόνα για να τη δεις εδώ</div>}
            </div>
          </div>
          <p className={`m-0 text-[length:var(--fs-13)] ${issue ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{issue ? `Για να ενεργοποιηθεί: ${issue}` : g ? "Έτσι θα το δει ο πελάτης. Οι τιμές είναι οι τωρινές του καταλόγου." : "Έτσι θα το δει ο πελάτης."}</p>
        </div>
      </div>
    </div>
  );
}
