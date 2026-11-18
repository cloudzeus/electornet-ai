"use client";

import { SxStyleTag } from "@/components/ui/SxStyleTag";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { CalendarClock, Check, ChevronLeft, Eye, Image as ImageIcon, LayoutTemplate, Loader2, Monitor, MousePointerClick, PaintBucket, ShoppingBag, Smartphone, Type, X } from "lucide-react";
import { SLOTS } from "@/lib/promo/landing-blocks";
import { BANNER_ANIMS, BANNER_PRESETS, DEFAULT_BANNER_DESIGN, MAX_BANNER_PRODUCTS, BANNER_TEMPLATES, STICKER_POSITIONS, PER_ROW, POST_STYLES, PRICE_SHAPES, TILE_ANIMS, applyLook, bannerDesignIssue, type BannerDesign, type BannerProduct, type BannerTemplate } from "@/lib/promo/banner-design";
import { savePlacementAction, type PlacementInput } from "@/app/admin/(shell)/prosfores/actions";
import { BANNER_ELEMENTS } from "@/lib/promo/banner-design";
import { bannerCutoutsNowAction, bannerPreviewProductsAction, bannerSampleProductsAction, bannerTemplatesAction, deleteBannerTemplateAction, saveBannerTemplateAction } from "@/app/admin/(shell)/prosfores/theseis/actions";
import { DesignedBanner } from "@/components/promo/DesignedBanner";
import { StatusPill } from "@/components/admin/settings/ui";
import { ImageUrlField } from "./ImageUrlField";
import { StickerPicker } from "@/components/admin/stickers/StickerPicker";
import type { StickerParams } from "@/lib/stickers/model";
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
export function BannerEditor({ initial, stats, promos, landings, categories, sticker: sticker0 }: { /** τα στοιχεία του sticker που έχει ήδη το banner */ sticker: StickerParams | null; initial: Doc; stats: { impressions: number; clicks: number } | null; promos: Opt[]; landings: Opt[]; categories: Opt[] }) {
  const router = useRouter();
  const [d, setD] = useState<Doc>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [tab, setTab] = useState<Tab>(initial.design || !initial.id ? "text" : "image");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  // τι δείχνει η προεπισκόπηση στα τετράγωνα post: ένα τετράγωνο μεγάλο (για να το σχεδιάσεις) ή όλο το banner όπως μπαίνει στη θέση του
  const [view, setView] = useState<"tile" | "all">("tile");
  // «Αφαίρεση φόντου τώρα»: κατάσταση και μήνυμα· το `cut` ξαναδιαβάζει τα προϊόντα της προεπισκόπησης όταν τελειώσει
  const [cut, setCut] = useState(0);
  const [cutMsg, setCutMsg] = useState<string | null>(null);
  const [cutting, setCutting] = useState(false);
  const [products, setProducts] = useState<BannerProduct[]>([]);
  // το banner δεν έχει δικά του προϊόντα να δείξει → η προεπισκόπηση παίρνει δείγμα, για να μη μένει άδεια
  const [sample, setSample] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [browse, setBrowse] = useState(false);
  const [sticker, setSticker] = useState<StickerParams | null>(sticker0);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [mine, setMine] = useState<BannerTemplate[]>([]);
  const [tplOpen, setTplOpen] = useState(false);
  useEffect(() => { void bannerTemplatesAction().then(setMine).catch(() => {}); }, []);
  const [busy, start] = useTransition();
  const set = (p: Partial<Doc>) => setD((x) => ({ ...x, ...p }));
  const g = d.design;
  const setG = (p: Partial<BannerDesign>) => setD((x) => (x.design ? { ...x, design: { ...x.design, ...p } } : x));
  const setBg = (p: Partial<BannerDesign["bg"]>) => g && setG({ bg: { ...g.bg, ...p } });
  const setP = (p: Partial<BannerDesign["products"]>) => g && setG({ products: { ...g.products, ...p } });
  const dirty = JSON.stringify(d) !== saved;
  const slot = SLOTS.find((s) => s.key === d.slot) ?? SLOTS[0];
  const square = d.slot === "info-aside";

  // Σύρσιμο και αλλαγή μεγέθους πάνω στην προεπισκόπηση: κάθε στοιχείο με data-drag (μάρκα, τίτλος, φωτογραφία, τιμή, sticker, σήμα…)
  // επιλέγεται με ένα πάτημα και σύρεται μέσα στο κουτί του. Όσο σύρεται κινείται το ίδιο το στοιχείο (element.style)· στο άφημα
  // η θέση γράφεται στο σχέδιο (design.free) σε % και ισχύει και στο site.
  const [sel, setSel] = useState<string | null>(null);
  const free = g?.free ?? {};
  const setFree = (k: string, f: { x: number; y: number; s: number } | null) => { const next = { ...free }; if (f) next[k] = f; else delete next[k]; setG({ free: next }); };
  const centerOf = (el: HTMLElement) => { const box = (el.offsetParent as HTMLElement).getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: ((r.left + r.width / 2 - box.left) / box.width) * 100, y: ((r.top + r.height / 2 - box.top) / box.height) * 100 }; };
  const dragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
    const box = (el?.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const key = el?.dataset.drag;
    if (!el || !box || !key || !g) { setSel(null); return; }
    e.preventDefault();
    setSel(key);
    if (key === "image") setDim({ w: Math.round((el.offsetWidth / box.width) * 100), h: Math.round((el.offsetHeight / box.height) * 100), framed: getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" });
    const s = free[key]?.s ?? 1;
    // το στοιχείο ακολουθεί το δάχτυλο από το σημείο που το έπιασες (όχι από το κέντρο του)
    const c0 = centerOf(el), grab = { x: ((e.clientX - box.left) / box.width) * 100 - c0.x, y: ((e.clientY - box.top) / box.height) * 100 - c0.y };
    let xy: { x: number; y: number } | null = null;
    const move = (ev: PointerEvent) => {
      xy = { x: ((ev.clientX - box.left) / box.width) * 100 - grab.x, y: ((ev.clientY - box.top) / box.height) * 100 - grab.y };
      el.style.cssText = `position:absolute;left:${xy.x}%;top:${xy.y}%;right:auto;bottom:auto;translate:-50% -50%;scale:${s};z-index:30`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      el.removeAttribute("style");
      if (xy) setFree(key, { ...xy, s });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  // αλλαγή μεγέθους του επιλεγμένου: αν δεν έχει ακόμη δική του θέση, κρατά εκεί που είναι τώρα
  const resize = (s: number) => {
    if (!sel) return;
    const el = document.querySelector<HTMLElement>(`[data-help="banner.drag"] [data-drag="${sel}"]`);
    const at = free[sel] ?? (el ? centerOf(el) : null);
    if (at) setFree(sel, { x: at.x, y: at.y, s });
  };
  const moved = Object.keys(free).length > 0 || Object.keys(g?.holder ?? {}).length > 0;
  // πλαίσιο της φωτογραφίας προϊόντος: το μέγεθος που έχει τώρα στην οθόνη (για την αρχική θέση των ρυθμιστών) και οι αλλαγές του
  const holder = g?.holder ?? {};
  const setHolder = (p: Partial<typeof holder>) => setG({ holder: { ...holder, ...p } });
  const [dim, setDim] = useState<{ w: number; h: number; framed: boolean }>({ w: 60, h: 45, framed: true });
  const one = !!g && g.layout === "posts" && view === "tile";

  // τα προϊόντα της προεπισκόπησης: ξαναδιαβάζονται (με λίγη αναμονή) όταν αλλάξει η πηγή, η λίστα ή η προσφορά
  const pkey = g ? `${g.products.source}|${g.products.ids.join(",")}|${g.products.max}|${g.products.cutout}|${d.promotionId ?? ""}|${cut}` : "";
  useEffect(() => {
    if (!g || g.products.source === "none") { const t = setTimeout(() => setProducts([]), 0); return () => clearTimeout(t); }
    let on = true;
    const t = setTimeout(() => { void bannerPreviewProductsAction(g, d.promotionId).then(async (r) => {
      const fill = r.length ? [] : await bannerSampleProductsAction(g).catch(() => []);
      if (on) { setProducts(r.length ? r : fill); setSample(!r.length && fill.length > 0); }
    }).catch(() => {}); }, 300);
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
          {g && (
            <div data-help="banner.templates" className="grid gap-2 rounded-xl bg-eu-surface p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-expanded={tplOpen} onClick={() => setTplOpen((x) => !x)} className="inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink text-[length:var(--fs-13)] hover:border-eu-navy"><LayoutTemplate className="size-4 text-eu-blue" aria-hidden /> Πρότυπα ({BANNER_TEMPLATES.length + mine.length})</button>
                <button type="button" onClick={async () => { const name = window.prompt("Όνομα προτύπου (π.χ. «Black Friday slider»). Κρατά την εμφάνιση — όχι τα κείμενα και τα προϊόντα."); if (!name) return; const r = await saveBannerTemplateAction(name, g); if (r.ok) { setMine((m) => [r.template, ...m.filter((x) => x.key !== r.template.key)]); setMsg({ ok: true, t: `Το πρότυπο «${r.template.name}» αποθηκεύτηκε.` }); } else setMsg({ ok: false, t: r.error }); }} className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-9 font-bold text-eu-blue text-[length:var(--fs-13)] hover:bg-white">Αποθήκευση ως πρότυπο</button>
              </div>
              {tplOpen && (
                <ul className="m-0 p-0 list-none grid gap-1.5">
                  {[...mine, ...BANNER_TEMPLATES].map((t) => (
                    <li key={`${t.builtIn ? "b" : "m"}-${t.key}`} className="flex items-start gap-2 rounded-lg bg-white border border-eu-line p-2">
                      <span className="grid min-w-0 flex-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{t.name}{!t.builtIn && <span className="ml-1.5 rounded-full bg-eu-chip text-eu-blue font-bold px-2 py-0.5 text-[length:var(--fs-12)]">δικό σου</span>}</span>{t.help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{t.help}</span>}</span>
                      <button type="button" onClick={() => { setG(applyLook(g, t.look)); setTplOpen(false); setMsg({ ok: true, t: `Εφαρμόστηκε το «${t.name}». Κείμενα και προϊόντα έμειναν όπως ήταν.` }); }} className="shrink-0 rounded-full bg-eu-navy text-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue">Εφαρμογή</button>
                      {!t.builtIn && <button type="button" aria-label={`Διαγραφή προτύπου «${t.name}»`} onClick={async () => { if (!window.confirm(`Να διαγραφεί το πρότυπο «${t.name}»; Τα banners που το χρησιμοποίησαν δεν αλλάζουν.`)) return; await deleteBannerTemplateAction(t.key); setMine((m) => m.filter((x) => x.key !== t.key)); }} className="shrink-0 grid place-items-center size-11 md:size-9 rounded-full text-eu-red hover:bg-eu-red/10"><X className="size-4" aria-hidden /></button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
              <div className="grid gap-1">
                <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Sticker πάνω στο banner <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">— σε κάθε τετράγωνο post, ή στη γωνία της λωρίδας</span></span>
                <StickerPicker value={g.stickerKey} onChange={(v, o) => { setG({ stickerKey: v }); setSticker(o?.params ?? null); }} />
                {g.stickerKey && <Choice label="Θέση του sticker" value={g.stickerPos} options={STICKER_POSITIONS} onChange={(v) => { const next = { ...free }; delete next.sticker; setG({ stickerPos: v, free: next }); }} />}
              </div>
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
              <Choice label="Διάταξη" value={g.layout} options={[{ key: "strip", label: "Λωρίδα", help: "Κείμενο αριστερά, έως 3 προϊόντα δεξιά." }, { key: "posts", label: "Τετράγωνα post", help: "Ένα τετράγωνο ανά προϊόν (έως 12, 2–6 ανά σειρά), στη μορφή των post της καμπάνιας: βάλε στο «Φόντο» το τετράγωνο εικαστικό με το σήμα." }]} onChange={(v) => setG({ layout: v })} />
              {g.layout === "posts" && <div data-help="banner.tiles" className="grid gap-3"><Choice label="Στυλ τετραγώνου" value={g.postStyle} options={POST_STYLES} onChange={(v) => setG({ postStyle: v })} />
              <Choice label="Σχήμα τιμής" value={g.priceShape} options={PRICE_SHAPES} onChange={(v) => setG({ priceShape: v })} />
              <Choice label="Κίνηση στο τετράγωνο" value={g.tileAnim} options={TILE_ANIMS} onChange={(v) => setG({ tileAnim: v })} /><Check2 on={g.slider} onChange={(v) => setG({ slider: v })}>Slider: ένα προϊόν τη φορά, αλλάζει μόνο του κάθε 4,5″ (με βέλη, τελείες και παύση)</Check2></div>}
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
                  <Choice label="Πόσα φαίνονται" value={String(g.products.max)} options={(g.layout === "posts" ? [1, 2, 3, 4, 5, 6, 8, 10, 12] : [1, 2, 3]).map((n) => ({ key: String(n), label: String(n), ...(n === 1 ? { help: "Ένα μεγάλο προϊόν, με κουκκίδες." } : {}) }))} onChange={(v) => setP({ max: Number(v) })} />
                  {g.layout === "posts" && g.products.max > 1 && <Choice label="Ανά σειρά σε υπολογιστή" value={String(g.products.perRow)} options={PER_ROW.map((n) => ({ key: String(n), label: String(n), ...(n >= 5 ? { help: "Μικρά τετράγωνα: κράτα σύντομα κείμενα." } : {}) }))} onChange={(v) => setP({ perRow: Number(v) })} />}
                  {g.layout === "posts" && g.products.max > 1 && !g.slider && <Choice label="Ανά σειρά σε κινητό" value={String(g.products.perRowMobile ?? 2)} options={[{ key: "1", label: "1", help: "Ένα μεγάλο τετράγωνο ανά σειρά: διαβάζεται καλύτερα, πιάνει περισσότερο ύψος." }, { key: "2", label: "2", help: "Δύο μικρότερα δίπλα-δίπλα." }]} onChange={(v) => setP({ perRowMobile: v === "1" ? 1 : 2 })} />}
                  {g.layout === "strip" && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Φαίνονται όσα χωράνε άνετα: σε κινητό και στενές θέσεις μόνο το πρώτο, σε μεσαίο πλάτος δύο, και τρία μόνο σε πολύ φαρδύ banner.</p>}
                  <F l="Λέξη πάνω από την τιμή" help="Κενό = μόνο η τιμή."><input className={input} maxLength={12} value={g.products.priceLabel} onChange={(e) => setP({ priceLabel: e.target.value })} /></F>
                  <div className="grid"><Check2 on={g.products.showBrand} onChange={(v) => setP({ showBrand: v })}>Μάρκα</Check2><Check2 on={g.products.showEnergy} onChange={(v) => setP({ showEnergy: v })}>Ενεργειακή κλάση (όπου υπάρχει)</Check2><Check2 on={g.products.showWas} onChange={(v) => setP({ showWas: v })}>Αρχική τιμή διαγραμμένη (όταν έχει έκπτωση)</Check2><Check2 on={g.products.cutout} onChange={(v) => setP({ cutout: v })}>Αφαίρεση φόντου από τη φωτογραφία του προϊόντος</Check2></div>
                  {g.products.max === 1 && <F l={g.layout === "posts" && g.postStyle === "podium" ? "Χαρακτηριστικά (με εικονίδιο)" : "Κουκκίδες δίπλα στο προϊόν"} help={g.layout === "posts" && g.postStyle === "podium" ? "Ένα ανά γραμμή, έως 4, σύντομα. Π.χ. «Wi-Fi», «Σε 5 μεγέθη κούπας»." : "Μία ανά γραμμή, έως 5. Π.χ. «10 κιλών», «1400 στροφών»."}><textarea rows={4} className={`${input} py-2`} value={g.products.bullets.join("\n")} onChange={(e) => setP({ bullets: e.target.value.split("\n").slice(0, 5) })} /></F>}
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
          {g && sample && g.products.source !== "none" && (
            <p role="status" className="m-0 flex items-start gap-2 rounded-xl bg-eu-amber/15 px-3 py-2.5 text-eu-ink text-[length:var(--fs-14)]"><span><b>Βλέπεις δείγμα προϊόντων.</b> {g.products.source === "promotion" ? (d.promotionId ? "Η προσφορά αυτού του banner δεν έχει προϊόντα τώρα (έληξε, δεν ξεκίνησε ή είναι άδεια), άρα στο site το banner δεν δείχνει προϊόντα." : "Το banner δεν έχει προσφορά: διάλεξε μία στο «Πού και πότε».") : "Δεν έχεις διαλέξει προϊόντα: πρόσθεσέ τα στην καρτέλα «Προϊόντα»."} Το δείγμα είναι μόνο για να σχεδιάσεις.</span></p>
          )}
          {g?.layout === "posts" && (
            <div data-help="banner.view" className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div role="radiogroup" aria-label="Τι δείχνει η προεπισκόπηση" className="inline-flex rounded-full border border-eu-line bg-white p-1">
                {([["tile", "Ένα τετράγωνο"], ["all", "Όλο το banner"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)} className={`rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] cursor-pointer ${view === k ? "bg-eu-navy text-white" : "text-eu-ink-2 hover:bg-eu-surface"}`}>{l}</button>)}
              </div>
              <span className="flex-1 basis-64 text-eu-ink-3 text-[length:var(--fs-13)]">{view === "tile" ? "Σχεδιάζεις ένα τετράγωνο σε μεγάλο μέγεθος. Όλα τα τετράγωνα του banner παίρνουν την ίδια εμφάνιση." : `Όλο το banner όπως μπαίνει στη θέση του: ${g.slider ? "ένα τη φορά (slider)" : `${g.products.perRow} ανά σειρά σε υπολογιστή, ${g.products.perRowMobile ?? 2} σε κινητό`}. Το αλλάζεις στην καρτέλα «Προϊόντα».`}</span>
            </div>
          )}
          {g && g.products.source !== "none" && g.products.cutout && products.some((p) => p.image && !p.cutout) && (
            <p data-help="banner.cutout" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-eu-chip px-3 py-2 text-eu-navy text-[length:var(--fs-14)]">
              <span className="flex-1 basis-64"><b>{products.filter((p) => p.image && !p.cutout).length === 1 ? "1 προϊόν έχει" : `${products.filter((p) => p.image && !p.cutout).length} προϊόντα έχουν`} ακόμη τη φωτογραφία με το φόντο της</b> (το λευκό πλαίσιο). Το φόντο φεύγει μόνο του όταν αποθηκεύσεις το banner, ή τώρα με το κουμπί: περίπου 2 δευτερόλεπτα το καθένα.{cutMsg && <span className="block font-bold">{cutMsg}</span>}</span>
              <button type="button" disabled={cutting} onClick={() => { setCutting(true); setCutMsg(null); void bannerCutoutsNowAction(products.filter((p) => p.image && !p.cutout).map((p) => p.id)).then((r) => { setCutMsg(r.made ? `Έγινε σε ${r.made}.${r.failed ? ` Σε ${r.failed} δεν βγήκε καθαρό και έμεινε η αρχική φωτογραφία.` : ""}` : "Δεν βγήκε καθαρό αποτέλεσμα: μένει η αρχική φωτογραφία."); setCut((n) => n + 1); }).catch(() => setCutMsg("Δεν έγινε. Δοκίμασε ξανά.")).finally(() => setCutting(false)); }} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50 cursor-pointer">{cutting ? "Αφαιρώ το φόντο…" : "Αφαίρεση φόντου τώρα"}</button>
            </p>
          )}
          {g && (
            <div className="grid gap-2 rounded-xl bg-eu-chip px-3 py-2.5 text-eu-navy text-[length:var(--fs-14)]">
              <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex-1 basis-64"><b>Πιάσε και σύρε ό,τι έχει διακεκομμένο πλαίσιο</b>{g.layout === "posts" ? ": μάρκα, τίτλο, φωτογραφία, τιμή, sticker, σήμα, ενεργειακή κλάση." : ": στη λωρίδα σύρεται το sticker."} Πάτα ένα στοιχείο για να αλλάξεις και το μέγεθός του. Ισχύει και στο site.</span>
                {moved && <button type="button" onClick={() => { setG({ free: {}, holder: {} }); setSel(null); }} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy cursor-pointer">Επαναφορά όλων</button>}
              </p>
              {sel && (
                <div data-help="banner.resize" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white border border-eu-line px-3 py-2">
                  <b className="text-eu-ink">{BANNER_ELEMENTS[sel] ?? sel}</b>
                  <label className="flex flex-1 basis-56 items-center gap-2 font-bold text-eu-ink-2">Μέγεθος
                    <input type="range" min={30} max={300} step={5} value={Math.round((free[sel]?.s ?? 1) * 100)} onChange={(e) => resize(Number(e.target.value) / 100)} className="flex-1 min-h-11 accent-eu-navy" aria-label={`Μέγεθος: ${BANNER_ELEMENTS[sel] ?? sel}`} />
                    <span className="tabular-nums w-12 text-right">{Math.round((free[sel]?.s ?? 1) * 100)} %</span>
                  </label>
                  {free[sel] && <button type="button" onClick={() => setFree(sel, null)} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy cursor-pointer">Επαναφορά στοιχείου</button>}
                </div>
              )}
              {sel === "image" && g.layout === "posts" && (
                <div data-help="banner.holder" className="grid gap-2 rounded-lg bg-white border border-eu-line px-3 py-2.5">
                  <span className="grid"><b className="text-eu-ink">Πλαίσιο της φωτογραφίας</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">Αν το προϊόν αφήνει κενά γύρω του, στένεψε το πλαίσιο, βγάλε το λευκό φόντο ή αφαίρεσε το φόντο της φωτογραφίας.</span></span>
                  <div className="grid gap-x-4 gap-y-1 @xl:grid-cols-2">
                    {([["w", "Πλάτος πλαισίου", 15, 100, dim.w], ["h", "Ύψος πλαισίου", 15, 95, dim.h], ["pad", "Περιθώριο μέσα", 0, 12, 3]] as const).map(([k, l, lo, hi, def]) => (
                      <label key={k} className="flex items-center gap-2 font-bold text-eu-ink-2"><span className="w-32 shrink-0">{l}</span>
                        <input type="range" min={lo} max={hi} step={1} value={holder[k] ?? def} onChange={(e) => setHolder({ [k]: Number(e.target.value) })} className="flex-1 min-w-0 min-h-11 accent-eu-navy" />
                        <span className="tabular-nums w-12 text-right">{holder[k] ?? def} %</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 cursor-pointer"><input type="checkbox" className="size-5 accent-eu-navy" checked={holder.frame ?? dim.framed} onChange={(e) => setHolder({ frame: e.target.checked })} />Λευκό πλαίσιο πίσω από τη φωτογραφία</label>
                    <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 cursor-pointer"><input type="checkbox" className="size-5 accent-eu-navy" checked={!!holder.cover} onChange={(e) => setHolder({ cover: e.target.checked })} />Γέμισε το πλαίσιο (κόβει τις άκρες)</label>
                    {Object.keys(holder).length > 0 && <button type="button" onClick={() => setG({ holder: {} })} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy cursor-pointer">Επαναφορά πλαισίου</button>}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="rounded-2xl border border-eu-line bg-eu-line-2 p-3 @md:p-5">
            <div className={`mx-auto ${one ? "max-w-[26rem]" : square ? "max-w-80" : device === "mobile" ? "max-w-[22.5rem]" : ""}`}>
              {g ? <div data-help="banner.drag" onPointerDown={dragStart} onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); }} className="[&_[data-drag]]:pointer-events-auto [&_[data-drag]]:cursor-grab [&_[data-drag]]:touch-none [&_[data-drag]]:outline-dashed [&_[data-drag]]:outline-2 [&_[data-drag]]:outline-offset-2 [&_[data-drag]]:outline-white/70 [&_[data-drag]]:[outline-color:color-mix(in_srgb,currentColor_55%,transparent)]">{sel && <SelMark k={sel} />}<DesignedBanner d={one ? { ...g, slider: false } : g} products={one ? products.slice(0, 1) : products} shape={square ? "square" : "wide"} href={d.href ?? (d.landingId ? "#" : null)} sticker={g.stickerKey ? sticker : null} /></div>
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

/** Το επιλεγμένο στοιχείο της προεπισκόπησης: έντονο συνεχές πλαίσιο, για να φαίνεται ποιο αλλάζει μέγεθος. */
function SelMark({ k }: { k: string }) {
  return <SxStyleTag id={`sel-${k}`} css={`[data-help="banner.drag"] [data-drag="${k}"]{outline:3px solid #f1c400 !important;outline-offset:3px}`} />;
}
