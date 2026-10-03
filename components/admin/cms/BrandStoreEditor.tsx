"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, CircleAlert, ExternalLink, Loader2, Monitor, RotateCcw, Rocket, Smartphone, TriangleAlert, Undo2, X, Check } from "lucide-react";
import type { BrandBlock, BrandStore } from "@/lib/cms/brand-store";
import { ZONES } from "@/lib/cms/brand-store";

/** Στις σελίδες μαρκών: όλα εκτός από τα «Καταστήματα» (ταιριάζουν στις πληροφοριακές σελίδες). */
const BRAND_TYPES: BrandBlock["type"][] = ["new-arrivals", "series", "offers", "story", "tech", "support", "video", "announcement", "usp", "banner", "products-auto", "categories", "faq", "text", "gallery", "cta", "ad", "promo-products", "promo-landing", "coupon"];
import { checkStore, type Issue } from "@/lib/cms/brand-store-check";
import { publishAction, revertAction, saveDraftAction, unpublishAction, type PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { StatusPill, ResultBanner } from "@/components/admin/settings/ui";
import { ProductList } from "./brand/ProductPicker";
import { StylePanel } from "./brand/StylePanel";
import { ZoneBlocks } from "./ZoneBlocks";
import { Area, LinkField, MediaUrl, Txt } from "./brand/fields";
import { PickerBrand } from "./brand/ImagePicker";
import { LogoField } from "./brand/LogoField";

type Props = { initial: BrandStore; published: BrandStore | null; savedAt: string; brand: { id: string; name: string; logo: string | null }; info: Record<string, PickProduct> };
type SaveState = "idle" | "pending" | "saving" | "error";

function Section({ id, title, help, children, aside }: { id: string; title: string; help?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4 scroll-mt-40 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h3 id={`${id}-h`} className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{title}</h3>{help && <p className="m-0 mt-0.5 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug max-w-[70ch]">{help}</p>}</div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** σύγκριση περιεχομένου ανεξάρτητα από τη σειρά των κλειδιών (η βάση jsonb τα αναδιατάσσει) */
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

export function BrandStoreEditor({ initial, published: pub, savedAt: initSavedAt, brand, info: initInfo }: Props) {
  const router = useRouter();
  const [s, setS] = useState<BrandStore>(initial);
  const [info, setInfo] = useState(initInfo);
  const [save, setSave] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState(initSavedAt);
  const [published, setPublished] = useState(!!pub);
  const [pubJson, setPubJson] = useState(pub ? stable(pub) : "");
  const savedJson = useRef(stable(initial));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pv, setPv] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: Issue[] } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [busy, start] = useTransition();
  const latest = useRef(s);
  const changed = published && stable(s) !== pubJson;

  const onInfo = useCallback((list: PickProduct[]) => setInfo((x) => ({ ...x, ...Object.fromEntries(list.map((p) => [p.id, p])) })), []);
  const ctx = { brandId: brand.id, brandName: s.name, info, onInfo };
  const set = (patch: Partial<BrandStore>) => setS((x) => ({ ...x, ...patch }));
  const setHero = (patch: Partial<BrandStore["hero"]>) => setS((x) => ({ ...x, hero: { ...x.hero, ...patch } }));

  // αυτόματη αποθήκευση στο πρόχειρο, 1,2″ μετά την τελευταία αλλαγή — οι πελάτες δεν βλέπουν τίποτα μέχρι τη δημοσίευση
  const flush = useCallback(async () => {
    setSave("saving");
    const r = await saveDraftAction(latest.current.slug, latest.current);
    if (!r.ok) { setSave("error"); return false; }
    savedJson.current = stable(latest.current);
    setSave("idle"); setSavedAt(r.at!); setPv((v) => v + 1);
    return true;
  }, []);
  useEffect(() => {
    latest.current = s;
    if (stable(s) === savedJson.current) return; // τίποτα καινούργιο (και στο πρώτο render)
    const t0 = setTimeout(() => setSave("pending"), 0);
    const t = setTimeout(() => { void flush(); }, 1200);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [s, flush]);
  useEffect(() => {
    if (save === "idle") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  const { errors, warnings } = checkStore(s);
  const go = (anchor?: string) => { if (!anchor) return; setView("edit"); if (anchor.startsWith("blk-")) setOpen((o) => new Set(o).add(anchor.slice(4))); setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const publish = () => {
    if (errors.length) { setShowIssues(true); setResult({ ok: false, message: `Υπάρχουν ${errors.length} θέματα που πρέπει να διορθωθούν πριν τη δημοσίευση.`, errors }); return; }
    if (!window.confirm(`Δημοσίευση της σελίδας ${s.name}; Οι πελάτες θα τη δουν αμέσως στο /brands/${s.slug}.`)) return;
    start(async () => {
      if (save !== "idle" && !(await flush())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
      const r = await publishAction(s.slug);
      setResult(r);
      if (r.ok) { setPublished(true); setPubJson(stable(latest.current)); router.refresh(); }
    });
  };
  const unpub = () => { if (!window.confirm("Απόσυρση της σελίδας; Η μάρκα θα δείχνει μόνο τον κατάλογο. Το πρόχειρο μένει και μπορείς να ξαναδημοσιεύσεις.")) return; start(async () => { setResult(await unpublishAction(s.slug)); setPublished(false); setPubJson(""); setPv((v) => v + 1); router.refresh(); }); };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές του πρόχειρου και να γυρίσει στη δημοσιευμένη έκδοση;")) return; start(async () => { setResult(await revertAction(s.slug)); router.refresh(); window.location.reload(); }); };

  const saveText = save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : `Πρόχειρο αποθηκεύτηκε ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}`;
  const status = !published ? (["off", "Πρόχειρο — δεν φαίνεται"] as const) : changed ? (["incomplete", "Δημοσιευμένη · αλλαγές στο πρόχειρο"] as const) : (["live", "Δημοσιευμένη"] as const);

  const editor = (
    <div className="grid gap-4 min-w-0">
      <nav aria-label="Ενότητες σελίδας" className="flex flex-wrap gap-2">
        {[["sec-identity", "Ταυτότητα & Google"], ["sec-theme", "Χρώματα"], ["sec-hero", "Hero"], ["sec-blocks", `Ενότητες & ζώνες (${s.blocks.length})`]].map(([id, l]) => <a key={id} href={`#${id}`} className="inline-flex items-center rounded-full bg-white border border-eu-line px-3 min-h-10 font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:border-eu-blue hover:text-eu-blue">{l}</a>)}
      </nav>

      <Section id="sec-identity" title="Ταυτότητα & Google" help="Πώς εμφανίζεται η μάρκα στην κορυφή της σελίδας και στα αποτελέσματα της Google.">
        <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
          <Txt label="Όνομα μάρκας" value={s.name} onChange={(v) => set({ name: v })} max={30} help="Σε κείμενα της σελίδας («Όλα τα προϊόντα LG»)." />
          <Txt label="Wordmark (κείμενο αντί λογοτύπου)" value={s.wordmark} onChange={(v) => set({ wordmark: v })} max={20} help="Χρησιμοποιείται όταν δεν υπάρχει λογότυπο." />
          <Txt label="Slogan" value={s.tagline} onChange={(v) => set({ tagline: v })} max={50} placeholder="π.χ. Life's Good" help="Στη σελίδα /brands, κάτω από το όνομα." />
        </div>
        <LogoField value={{ logo: s.logo, logoAspect: s.logoAspect }} onChange={(v) => set({ logo: v.logo, logoAspect: v.logoAspect })} brandLogo={brand.logo} bg={s.theme.bg} dark={s.theme.mode === "dark"} name={s.wordmark || s.name} />
        <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4 items-start">
          <div className="grid gap-4">
            <Txt label="Τίτλος για Google" value={s.seo.title} onChange={(v) => set({ seo: { ...s.seo, title: v } })} max={60} />
            <Area label="Περιγραφή για Google" value={s.seo.description} onChange={(v) => set({ seo: { ...s.seo, description: v } })} max={155} rows={3} />
          </div>
          <div className="rounded-xl border border-eu-line p-3 grid gap-0.5 min-w-0" aria-label="Προεπισκόπηση στη Google">
            <span className="text-eu-muted text-[length:var(--fs-13)]">Έτσι περίπου στη Google</span>
            <span className="text-[#1a0dab] text-[length:var(--fs-18)] leading-snug line-clamp-1 break-all">{s.seo.title || "—"}</span>
            <span className="text-[#006621] text-[length:var(--fs-13)] truncate">euronics.gr › brands › {s.slug}</span>
            <span className="text-eu-ink-3 text-[length:var(--fs-14)] line-clamp-2">{s.seo.description || "—"}</span>
          </div>
        </div>
      </Section>

      <Section id="sec-theme" title="Χρώματα της μάρκας" help="Όλη η σελίδα παίρνει αυτά τα χρώματα· το μενού, το καλάθι και ο Ερμής μένουν στα χρώματα της Euronics.">
        <StylePanel theme={s.theme} onTheme={(t) => set({ theme: t })} website={s.website ?? ""} onWebsite={(v) => set({ website: v })} name={s.wordmark || s.name} />
      </Section>

      <Section id="sec-hero" title="Hero" help="Το πρώτο που βλέπει ο επισκέπτης: τίτλος σε τρεις γραμμές (η τελευταία στο χρώμα της μάρκας), ένα κείμενο, ένα κουμπί και το κορυφαίο προϊόν να «αιωρείται».">
        <Txt label="Μικρός τίτλος δίπλα στο λογότυπο" value={s.hero.kicker} onChange={(v) => setHero({ kicker: v })} max={40} placeholder="π.χ. LG στη Euronics" />
        <div className="grid @xl:grid-cols-3 gap-x-4 gap-y-3">
          {[0, 1, 2].map((i) => <Txt key={i} label={`Τίτλος · γραμμή ${i + 1}${i === 2 ? " (χρώμα μάρκας)" : ""}`} value={s.hero.title[i] ?? ""} onChange={(v) => { const t = [...s.hero.title]; while (t.length < 3) t.push(""); t[i] = v; setHero({ title: t.filter((x, k) => x || k < 3) }); }} max={18} />)}
        </div>
        <span className="text-eu-muted text-[length:var(--fs-13)] -mt-2">Λίγες, δυνατές λέξεις ανά γραμμή — σε κινητό ο τίτλος είναι πολύ μεγάλος.</span>
        <Area label="Κείμενο" value={s.hero.body} onChange={(v) => setHero({ body: v })} max={220} rows={3} help="2 προτάσεις: τι προσφέρει η μάρκα και γιατί να την αγοράσεις από τη Euronics." />
        <div className="grid @xl:grid-cols-2 gap-x-5 gap-y-4">
          <Txt label="Κουμπί · κείμενο" value={s.hero.cta.label} onChange={(v) => setHero({ cta: { ...s.hero.cta, label: v } })} max={36} />
          <LinkField label="Κουμπί · σύνδεσμος" value={s.hero.cta.href} onChange={(v) => setHero({ cta: { ...s.hero.cta, href: v } })} />
        </div>
        <ProductList single label="Προϊόν του hero" help="Φαίνεται μεγάλο, χωρίς φόντο (cutout) όπου υπάρχει. Διάλεξε το πιο αντιπροσωπευτικό, με καλή φωτογραφία." ids={s.hero.productId ? [s.hero.productId] : []} onChange={(ids) => setHero({ productId: ids[0] ?? "" })} info={info} onInfo={onInfo} brandId={brand.id} brandName={s.name} />
        <MediaUrl label="Εικόνα φόντου (προαιρετική)" value={s.hero.image ?? ""} onChange={(v) => setHero({ image: v || undefined })} help="Μπαίνει αχνά πίσω από όλο το hero. Οριζόντια, τουλάχιστον 1920 px." />
      </Section>

      <Section id="sec-blocks" title="Ενότητες & ζώνες" help="Η σελίδα έχει τρεις ζώνες. Σε κάθε ζώνη οι ενότητες εμφανίζονται με αυτή τη σειρά. Μπορείς να κρύψεις μια ενότητα χωρίς να τη σβήσεις ή να ορίσεις πότε θα φαίνεται.">
        <ZoneBlocks blocks={s.blocks} setBlocks={(fn) => setS((x) => ({ ...x, blocks: fn(x.blocks) }))} zones={ZONES} defaultZone="main" errors={errors} brandName={s.name} ctx={ctx} open={open} setOpen={setOpen} adding={adding} setAdding={setAdding} markers={{ main: { before: "↑ Hero (επάνω, από την ενότητα «Hero»)" }, bottom: { after: "↓ «Όλα τα προϊόντα» της μάρκας (κατάλογος με φίλτρα)" } }} allowed={BRAND_TYPES} />
      </Section>
    </div>
  );

  return (
    <PickerBrand.Provider value={{ brandId: brand.id, brandName: s.name }}>
    <div className="grid gap-4 min-w-0">
      {/* κεφαλίδα: κατάσταση, αποθήκευση, δημοσίευση — πάντα ορατή */}
      <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-3 bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/admin/cms/brand-stores" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Σελίδες μαρκών</Link>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)] min-w-0">{s.name}</h2>
          <StatusPill status={status[0]} text={status[1]} />
          <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>{save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}{saveText}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={publish} disabled={busy || (published && !changed)} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-4 @md:px-5 min-h-12 hover:bg-eu-blue disabled:opacity-50 flex-1 @md:flex-none min-w-0">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{!published ? "Δημοσίευση" : changed ? "Δημοσίευση αλλαγών" : "Χωρίς αλλαγές για δημοσίευση"}</button>
          <button type="button" onClick={() => setShowIssues((x) => !x)} aria-expanded={showIssues} title="Έλεγχος πριν τη δημοσίευση" className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 px-4 min-h-12 font-bold text-[length:var(--fs-14)] ${errors.length ? "border-eu-red text-eu-red" : warnings.length ? "border-eu-amber text-eu-amber" : "border-eu-green text-eu-green"}`}>{errors.length ? <CircleAlert className="size-4" aria-hidden /> : warnings.length ? <TriangleAlert className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}{errors.length ? <>{errors.length}<span className="hidden @md:inline"> για διόρθωση</span></> : warnings.length ? <>{warnings.length}<span className="hidden @md:inline"> συστάσεις</span></> : "Έτοιμη"}<span className="sr-only @md:hidden">{errors.length ? " για διόρθωση" : warnings.length ? " συστάσεις" : ""}</span></button>
        </div>
        {result && <div className="relative"><ResultBanner ok={result.ok}><span className="block pr-8">{result.message}</span></ResultBanner><button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button></div>}
        {showIssues && (errors.length > 0 || warnings.length > 0) && (
          <ul className="m-0 p-0 list-none grid gap-1 max-h-[40vh] overflow-y-auto rounded-xl bg-white border border-eu-line p-2">
            {[...errors.map((e) => ({ ...e, err: true })), ...warnings.map((w) => ({ ...w, err: false }))].map((x, k) => (
              <li key={k}><button type="button" onClick={() => go(x.anchor)} className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 min-h-11 hover:bg-eu-surface">{x.err ? <CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden /> : <TriangleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />}<span className="text-[length:var(--fs-14)]"><b>{x.where}:</b> {x.msg}</span></button></li>
            ))}
          </ul>
        )}
        {/* μικρές/μεσαίες οθόνες: επεξεργασία ή προεπισκόπηση */}
        <div className="@7xl:hidden grid grid-cols-2 gap-1 rounded-full bg-white border border-eu-line p-1" role="tablist" aria-label="Προβολή">
          {(["edit", "preview"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full min-h-10 font-bold text-[length:var(--fs-14)] ${view === v ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{v === "edit" ? "Επεξεργασία" : "Προεπισκόπηση"}</button>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
          <a href={`/brands/${s.slug}?preview=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Προεπισκόπηση <ExternalLink className="size-4" aria-hidden /></a>
          {published && changed && <button type="button" onClick={revert} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Undo2 className="size-4" aria-hidden /> Ακύρωση αλλαγών</button>}
          {published && <button type="button" onClick={unpub} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-eu-red text-[length:var(--fs-14)] hover:bg-eu-red/10"><RotateCcw className="size-4" aria-hidden /> Απόσυρση</button>}
      </div>

      <div className="grid grid-cols-1 @7xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
        <div className={view === "edit" ? "min-w-0" : "hidden @7xl:block min-w-0"}>{editor}</div>
        <div className={view === "preview" ? "min-w-0" : "hidden @7xl:block min-w-0"}><Preview src={`/brands/${s.slug}?preview=1`} v={pv} device={device} setDevice={setDevice} saving={save !== "idle"} /></div>
      </div>
    </div>
    </PickerBrand.Provider>
  );
}

/** Ζωντανή προεπισκόπηση του πρόχειρου (iframe), σε πλάτος υπολογιστή (σμίκρυνση) ή κινητού. */
export function Preview({ src, v, device, setDevice, saving }: { src: string; v: number; device: "desktop" | "mobile"; setDevice: (d: "desktop" | "mobile") => void; saving: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const target = device === "desktop" ? 1280 : 390;
  const scale = w ? Math.min(1, w / target) : 1;
  const h = 760;
  return (
    <div className="@7xl:sticky @7xl:top-44 grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-2">Προεπισκόπηση πρόχειρου{saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}</span>
        <div className="flex gap-1 rounded-full bg-white border border-eu-line p-1" role="radiogroup" aria-label="Συσκευή">
          {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] ${device === d ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{d === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}{d === "desktop" ? "Υπολογιστής" : "Κινητό"}</button>)}
        </div>
      </div>
      <div ref={box} className="rounded-2xl border border-eu-line bg-eu-line-2 overflow-hidden" style={{ height: h * scale + (device === "mobile" ? 0 : 0) }}>
        <div style={{ width: target, height: h, transform: `scale(${scale})`, transformOrigin: "top left", margin: device === "mobile" && w > target ? "0 auto" : undefined }}>
          <iframe key={v} title="Προεπισκόπηση σελίδας" src={`${src}${src.includes("?") ? "&" : "?"}v=${v}`} className="block bg-white" style={{ width: target, height: h, border: 0 }} />
        </div>
      </div>
      <span className="text-eu-muted text-[length:var(--fs-13)]">Ανανεώνεται μόνη της μετά από κάθε αλλαγή. Οι πελάτες δεν βλέπουν το πρόχειρο.</span>
    </div>
  );
}
