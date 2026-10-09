"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, CalendarDays, Film, ImagePlus, Loader2, Package, Plus, RotateCcw, Save, Search, Send, Trash2, Type, X } from "lucide-react";
import { CinematicHero } from "@/components/widgets/CinematicHero";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import type { Settings } from "@/lib/cms/settings";
import { priceLong } from "@/lib/format";
import { MAX_SLIDES, emptySlide, slideStatus, toHeroSlide, validateDoc, type HeroDoc, type HeroSlideDoc, type ProductInfo, type SlideIssue, type SlideTone } from "@/lib/cms/hero-slides-model";
import { publishHeroAction, revertHeroAction, saveHeroAction, searchHeroProductsAction } from "./actions";

const TONE: Record<SlideTone, string> = { live: "bg-eu-green/12 text-eu-green", soon: "bg-eu-blue/10 text-eu-blue", ended: "bg-eu-red/10 text-eu-red", permanent: "bg-eu-yellow/40 text-eu-navy", off: "bg-eu-surface text-eu-muted" };
const input = "w-full rounded-lg border border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white outline-none focus:border-eu-blue disabled:bg-eu-surface disabled:text-eu-muted";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-bold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50";
const small = "inline-flex items-center gap-1 rounded-full border border-eu-line font-bold text-[length:var(--fs-13)] px-3 min-h-11 hover:border-eu-navy";
const unopt = (u: string) => u.startsWith("http");
type Media = "image" | "imageMobile" | "video";

/** Πεδίο με ετικέτα, ορατή εξήγηση και μήνυμα λάθους ακριβώς από κάτω. */
function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 min-w-0">
      <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">{label}</span>
      {children}
      {help && <span className="text-eu-muted text-[length:var(--fs-13)]">{help}</span>}
      {error && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{error}</span>}
    </div>
  );
}

function MediaRow({ title, help, url, video, onPick, onClear, error, children }: { title: string; help: string; url: string | null; video?: boolean; onPick: () => void; onClear?: () => void; error?: string; children?: ReactNode }) {
  return (
    <Field label={title} help={help} error={error}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative size-16 shrink-0 rounded-lg overflow-hidden bg-eu-surface grid place-items-center">
          {url && !video && <Image src={url} alt="" fill sizes="64px" className="object-cover" unoptimized={unopt(url)} />}
          {url && video && <Film className="size-6 text-eu-navy" aria-hidden />}
          {!url && <ImagePlus className="size-6 text-eu-muted" aria-hidden />}
        </span>
        <button type="button" onClick={onPick} className={small}><ImagePlus className="size-4" aria-hidden /> {url ? "Αλλαγή" : "Επιλογή από τη βιβλιοθήκη"}</button>
        {url && onClear && <button type="button" onClick={onClear} className={small}><X className="size-4" aria-hidden /> Αφαίρεση</button>}
      </div>
      {children}
    </Field>
  );
}

function ProductField({ s, info, onPick, onClear }: { s: HeroSlideDoc; info: ProductInfo | null; onPick: (id: string, p: ProductInfo) => void; onClear: () => void }) {
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
  const current = info ? `${info.title}${info.price ? ` · ${priceLong(info.price)}` : ""}` : s.cutout ? "Το αρχικό προϊόν του slide (χωρίς σύνδεση με τον κατάλογο)" : null;
  return (
    <Field label="Προϊόν (προαιρετικό)" help="Η φωτογραφία του χωρίς φόντο «επιπλέει» στο slide, με σύνδεσμο στη σελίδα του και την τρέχουσα τιμή του καταλόγου.">
      {current && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-chip text-eu-navy font-bold px-3 py-1.5 text-[length:var(--fs-14)] min-w-0"><Package className="size-4 shrink-0" aria-hidden /><span className="truncate">{current}</span></span>
          <button type="button" onClick={onClear} className={small}><X className="size-4" aria-hidden /> Αφαίρεση</button>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
        <input aria-label="Αναζήτηση προϊόντος" value={q} onChange={(e) => search(e.target.value)} placeholder="Όνομα ή κωδικός προϊόντος…" className={`${input} pl-9`} />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-eu-muted" aria-hidden />}
      </div>
      {res.length > 0 && (
        <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto rounded-xl border border-eu-line divide-y divide-eu-line">
          {res.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p.id, { title: p.title, slug: p.slug, cutout: p.cutout, price: p.price }); setQ(""); setRes([]); }} className="w-full flex items-center gap-2 text-left px-3 py-2 min-h-11 hover:bg-eu-chip">
                <span className="relative size-10 shrink-0 rounded bg-eu-surface overflow-hidden">{p.cutout && <Image src={p.cutout} alt="" fill sizes="40px" className="object-contain" unoptimized={unopt(p.cutout)} />}</span>
                <span className="min-w-0"><span className="block font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{p.title}</span><span className="block text-eu-muted text-[length:var(--fs-13)]">{p.sku}{p.price ? ` · ${priceLong(p.price)}` : ""}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

/**
 * Προεπισκόπηση σε πραγματική κλίμακα: ο hero ζωγραφίζεται στο πλάτος που έχει στην αρχική (880 px) και μικραίνει
 * ώστε να χωρά στη στήλη — έτσι οι γραμμές του τίτλου σπάνε ακριβώς όπως στο site.
 */
const SITE_W = 880;
function ScaledPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, h: 0 });
  useEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const fit = () => { const scale = Math.min(1, o.clientWidth / SITE_W); setBox({ scale, h: i.offsetHeight * scale }); };
    const ro = new ResizeObserver(fit);
    ro.observe(o); ro.observe(i);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="relative w-full overflow-hidden rounded-xl" style={{ height: box.h || undefined }}>
      <div ref={inner} className="@container origin-top-left" style={{ width: SITE_W, transform: `scale(${box.scale})` }}>{children}</div>
    </div>
  );
}

type Tab = "text" | "media" | "when";
const TABS: { id: Tab; label: string; icon: typeof Type; fields: SlideIssue["field"][] }[] = [
  { id: "text", label: "Κείμενα", icon: Type, fields: ["title", "primary", "secondary"] },
  { id: "media", label: "Εικόνα", icon: ImagePlus, fields: ["image"] },
  { id: "when", label: "Πότε", icon: CalendarDays, fields: ["dates"] },
];

/** Η φόρμα ενός slide σε τρεις σύντομες καρτέλες — ποτέ όλα τα πεδία μαζί. */
function SlideForm({ s, issues, info, tab, onTab, onChange, onMedia, onProduct, onRemove }: { s: HeroSlideDoc; issues: SlideIssue[]; info: ProductInfo | null; tab: Tab; onTab: (t: Tab) => void; onChange: (p: Partial<HeroSlideDoc>) => void; onMedia: (m: Media) => void; onProduct: (id: string | null, p?: ProductInfo) => void; onRemove: () => void }) {
  const err = (f: SlideIssue["field"]) => issues.filter((i) => i.field === f).map((i) => i.message).join(" ") || undefined;
  const lines = [0, 1, 2].map((k) => s.title[k] ?? "");
  const bullets = [0, 1, 2].map((k) => s.bullets[k] ?? "");
  const setLine = (k: number, v: string) => onChange({ title: lines.map((x, j) => (j === k ? v : x)) });
  const setBullet = (k: number, v: string) => onChange({ bullets: bullets.map((x, j) => (j === k ? v : x)) });
  const setSecondary = (p: { label?: string; href?: string }) => { const next = { label: s.secondary?.label ?? "", href: s.secondary?.href ?? "", ...p }; onChange({ secondary: next.label || next.href ? next : null }); };
  return (
    <div className="grid gap-3 min-w-0">
      <div role="tablist" aria-label="Στοιχεία του slide" className="grid grid-cols-3 gap-1 rounded-full bg-eu-surface p-1">
        {TABS.map((t) => {
          const on = tab === t.id, bad = issues.some((i) => t.fields.includes(i.field));
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onTab(t.id)} className={`inline-flex items-center justify-center gap-1.5 rounded-full min-h-11 font-bold text-[length:var(--fs-14)] ${on ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}>
              <t.icon className="size-4" aria-hidden /> {t.label}{bad && <span className="size-2 rounded-full bg-eu-red" aria-label="θέλει διόρθωση" />}
            </button>
          );
        })}
      </div>

      {tab === "text" && (
        <div role="tabpanel" className="grid gap-3">
          <Field label="Μικρός τίτλος" help="Η κίτρινη ετικέτα, π.χ. «Φθινόπωρο 2026 · ψυγεία»."><input className={input} maxLength={60} value={s.kicker} onChange={(e) => onChange({ kicker: e.target.value })} /></Field>
          <Field label="Μεγάλος τίτλος" help="Έως 3 σύντομες γραμμές." error={err("title")}>
            <div className="grid gap-1.5">{lines.map((v, k) => <input key={k} aria-label={`Γραμμή ${k + 1}`} placeholder={`Γραμμή ${k + 1}`} className={input} maxLength={40} value={v} onChange={(e) => setLine(k, e.target.value)} />)}</div>
          </Field>
          <Field label="Κείμενο"><textarea className={`${input} min-h-20 py-2`} maxLength={300} value={s.body} onChange={(e) => onChange({ body: e.target.value })} /></Field>
          <Field label="Κουμπί" help="Σύνδεσμος: σελίδα του site (/k/…) ή https://…" error={err("primary")}>
            <div className="grid gap-1.5 @sm:grid-cols-2"><input aria-label="Κείμενο κουμπιού" placeholder="Δες τα ψυγεία" className={input} maxLength={60} value={s.primary.label} onChange={(e) => onChange({ primary: { ...s.primary, label: e.target.value } })} /><input aria-label="Σύνδεσμος κουμπιού" placeholder="/k/…" className={input} value={s.primary.href} onChange={(e) => onChange({ primary: { ...s.primary, href: e.target.value } })} /></div>
          </Field>
          <details className="group rounded-xl border border-eu-line" open={!!s.secondary || bullets.some(Boolean) || !!err("secondary")}>
            <summary className="cursor-pointer list-none px-3 min-h-11 flex items-center font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Περισσότερα: δεύτερο κουμπί, σημεία</summary>
            <div className="grid gap-3 px-3 pb-3">
              <Field label="Δεύτερο κουμπί" help="Κενό = χωρίς δεύτερο κουμπί." error={err("secondary")}>
                <div className="grid gap-1.5 @sm:grid-cols-2"><input aria-label="Κείμενο δεύτερου κουμπιού" placeholder="Οδηγός επιλογής" className={input} maxLength={60} value={s.secondary?.label ?? ""} onChange={(e) => setSecondary({ label: e.target.value })} /><input aria-label="Σύνδεσμος δεύτερου κουμπιού" placeholder="/odigoi/…" className={input} value={s.secondary?.href ?? ""} onChange={(e) => setSecondary({ href: e.target.value })} /></div>
              </Field>
              <Field label="Σημεία κάτω από τα κουμπιά" help="Έως 3, π.χ. «Δωρεάν μεταφορά».">
                <div className="grid gap-1.5">{bullets.map((v, k) => <input key={k} aria-label={`Σημείο ${k + 1}`} className={input} maxLength={40} value={v} onChange={(e) => setBullet(k, e.target.value)} />)}</div>
              </Field>
            </div>
          </details>
        </div>
      )}

      {tab === "media" && (
        <div role="tabpanel" className="grid gap-4">
          <MediaRow title="Φωτογραφία φόντου" help="Οριζόντια, ≥ 1600 px πλάτος." url={s.image.url || null} onPick={() => onMedia("image")} error={err("image")}>
            <input aria-label="Τι δείχνει η φωτογραφία" placeholder="Τι δείχνει η φωτογραφία" className={input} maxLength={160} value={s.image.alt} onChange={(e) => onChange({ image: { ...s.image, alt: e.target.value } })} />
          </MediaRow>
          <ProductField s={s} info={info} onPick={(id, p) => onProduct(id, p)} onClear={() => onProduct(null)} />
          <details className="rounded-xl border border-eu-line" open={!!s.imageMobile || !!s.video}>
            <summary className="cursor-pointer list-none px-3 min-h-11 flex items-center font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Περισσότερα: φωτογραφία κινητού, βίντεο</summary>
            <div className="grid gap-4 px-3 pb-3">
              <MediaRow title="Φωτογραφία για κινητά" help="Κάθετη. Χωρίς αυτήν το κινητό δείχνει την οριζόντια." url={s.imageMobile?.url ?? null} onPick={() => onMedia("imageMobile")} onClear={() => onChange({ imageMobile: null })} />
              <MediaRow title="Βίντεο φόντου" help="Σύντομο mp4 χωρίς ήχο· η φωτογραφία μένει για αργές συνδέσεις." url={s.video?.url ?? null} video onPick={() => onMedia("video")} onClear={() => onChange({ video: null })} />
            </div>
          </details>
        </div>
      )}

      {tab === "when" && (
        <div role="tabpanel" className="grid gap-3">
          <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5" checked={s.active} onChange={(e) => onChange({ active: e.target.checked })} /> Ενεργό</label>
          <div className="grid gap-3 @sm:grid-cols-2">
            <Field label="Από" help="Κενό = από τώρα" error={err("dates")}><input type="date" className={input} disabled={s.permanent} value={s.from ?? ""} onChange={(e) => onChange({ from: e.target.value || null })} /></Field>
            <Field label="Έως (και)" help="Κενό = χωρίς λήξη"><input type="date" className={input} disabled={s.permanent} value={s.to ?? ""} onChange={(e) => onChange({ to: e.target.value || null })} /></Field>
          </div>
          <label className="inline-flex items-start gap-2 min-h-11 text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 mt-0.5" checked={s.permanent} onChange={(e) => onChange({ permanent: e.target.checked, ...(e.target.checked ? { from: null, to: null } : {}) })} /> <span><b>Μόνιμο</b> — χωρίς ημερομηνίες· βγαίνει μόνο όταν δεν υπάρχει άλλο ενεργό slide, ώστε η αρχική να μην είναι ποτέ άδεια.</span></label>
          <button type="button" onClick={onRemove} className={`${btn} justify-self-start border border-eu-red/40 text-eu-red hover:bg-eu-red/10`}><Trash2 className="size-4" aria-hidden /> Διαγραφή slide</button>
        </div>
      )}
    </div>
  );
}

export function HeroSlidesEditor({ initial, hasPublished, publishedAt: pubAt, products: p0, settings, canUpload }: { initial: HeroDoc; hasPublished: boolean; publishedAt: string | null; products: Record<string, ProductInfo>; settings: Settings; canUpload: boolean }) {
  const [doc, setDoc] = useState<HeroDoc>(initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [published, setPublished] = useState(hasPublished);
  const [publishedAt, setPublishedAt] = useState(pubAt);
  const [products, setProducts] = useState(p0);
  const [selId, setSelId] = useState<string | null>(initial.slides[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("text");
  const [issues, setIssues] = useState<Record<string, SlideIssue[]>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState<{ id: string; field: Media } | null>(null);
  const [pending, start] = useTransition();
  const now = useMemo(() => new Date(), []);
  const dirty = JSON.stringify(doc) !== savedJson;

  const patch = (id: string, p: Partial<HeroSlideDoc>) => setDoc((d) => ({ slides: d.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const move = (id: string, dir: -1 | 1) => setDoc((d) => {
    const i = d.slides.findIndex((s) => s.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= d.slides.length) return d;
    const a = [...d.slides]; [a[i], a[j]] = [a[j], a[i]];
    return { slides: a };
  });
  const remove = (id: string) => {
    if (!confirm("Διαγραφή του slide; Φεύγει από το site με την επόμενη δημοσίευση.")) return;
    const rest = doc.slides.filter((s) => s.id !== id);
    setDoc({ slides: rest }); setSelId(rest[0]?.id ?? null);
  };
  const add = () => { const s = emptySlide(); setDoc((d) => ({ slides: [...d.slides, s] })); setSelId(s.id); setTab("text"); };
  const loaded = (d: HeroDoc) => { setDoc(d); setSavedJson(JSON.stringify(d)); };
  const firstBad = (v: Record<string, SlideIssue[]>) => { const id = Object.keys(v)[0]; if (!id) return; setSelId(id); setTab(TABS.find((t) => v[id].some((i) => t.fields.includes(i.field)))?.id ?? "text"); };

  const save = () => start(async () => { const r = await saveHeroAction(doc); loaded(r.doc); setMsg({ ok: true, text: "Αποθηκεύτηκε ως πρόχειρο. Το site αλλάζει μόνο με «Δημοσίευση»." }); });
  const publish = () => {
    const v = validateDoc(doc);
    setIssues(v);
    if (Object.keys(v).length) { firstBad(v); setMsg({ ok: false, text: "Κάποια πεδία θέλουν διόρθωση (κόκκινη τελεία στην καρτέλα)." }); return; }
    start(async () => {
      const r = await publishHeroAction(doc);
      if (!r.ok) { setIssues(r.issues); firstBad(r.issues); setMsg({ ok: false, text: "Κάποια πεδία θέλουν διόρθωση (κόκκινη τελεία στην καρτέλα)." }); return; }
      loaded(r.doc); setPublished(true); setPublishedAt(r.publishedAt); setIssues({});
      setMsg({ ok: true, text: "Δημοσιεύτηκε — το βλέπουν τώρα οι επισκέπτες." });
    });
  };
  const revert = () => { if (confirm("Ακύρωση όλων των αλλαγών; Το πρόχειρο γυρίζει σε ό,τι δείχνει τώρα το site.")) start(async () => { const r = await revertHeroAction(); loaded(r.doc); setIssues({}); setSelId(r.doc.slides[0]?.id ?? null); setMsg({ ok: true, text: "Το πρόχειρο γύρισε στο δημοσιευμένο." }); }); };

  const sel = doc.slides.find((s) => s.id === selId) ?? null;
  const selIdx = sel ? doc.slides.indexOf(sel) : -1;
  const preview = sel ? toHeroSlide(sel, sel.productId ? products[sel.productId] ?? null : null) : null;
  const when = publishedAt ? new Date(publishedAt).toLocaleString("el-GR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="grid gap-3 min-w-0">
      {/* γραμμή ενεργειών */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 py-2 bg-white/95 backdrop-blur border-b border-eu-line">
        <span className="mr-auto text-[length:var(--fs-14)] text-eu-ink-3 min-w-0">
          {dirty ? <b className="text-eu-red">Μη αποθηκευμένες αλλαγές</b> : published ? `Δημοσιευμένο${when ? ` · ${when}` : ""}` : "Δεν έχει δημοσιευτεί ακόμη"}
        </span>
        {published && <button type="button" onClick={revert} disabled={pending} className={`${btn} text-eu-ink-3 hover:bg-eu-surface`}><RotateCcw className="size-4" aria-hidden /> Επαναφορά</button>}
        <button type="button" onClick={save} disabled={pending || !dirty} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>
        <button type="button" onClick={publish} disabled={pending} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}><Send className="size-4" aria-hidden /> Δημοσίευση</button>
      </div>
      {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}

      {/* λωρίδα slides: όλα με μια ματιά */}
      <ol className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))] @md:[grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]" aria-label="Slides με τη σειρά προβολής">
        {doc.slides.map((s, k) => {
          const st = slideStatus(s, now), on = s.id === selId, bad = !!issues[s.id]?.length;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => setSelId(s.id)} aria-current={on} className={`w-full text-left rounded-xl border-2 bg-white p-1.5 min-h-11 ${on ? "border-eu-navy" : bad ? "border-eu-red" : "border-eu-line hover:border-eu-navy/50"}`}>
                <span className="relative block aspect-[16/7] rounded-lg overflow-hidden bg-eu-navy">
                  {s.image.url && <Image src={s.image.url} alt="" fill sizes="180px" className="object-cover opacity-60" unoptimized={unopt(s.image.url)} />}
                  <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 text-[length:var(--fs-12)] font-bold text-eu-navy tabular-nums">{k + 1}</span>
                </span>
                <span className="block mt-1 font-bold text-eu-ink truncate text-[length:var(--fs-14)]">{s.title.filter((t) => t.trim()).join(" ") || "Χωρίς τίτλο"}</span>
                <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${TONE[st.tone]}`}>{bad ? "Θέλει διόρθωση" : st.label}</span>
              </button>
            </li>
          );
        })}
        {doc.slides.length < MAX_SLIDES && (
          <li><button type="button" onClick={add} className="w-full h-full min-h-20 rounded-xl border-2 border-dashed border-eu-line text-eu-navy font-bold inline-flex items-center justify-center gap-1.5 hover:border-eu-navy text-[length:var(--fs-14)]"><Plus className="size-4" aria-hidden /> Νέο slide</button></li>
        )}
      </ol>

      {sel ? (
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-start">
          {/* προεπισκόπηση: πάντα ορατή δίπλα (ή πάνω) από τη φόρμα */}
          <div className="grid gap-2 min-w-0 @4xl:sticky @4xl:top-16">
            <div className="flex items-center gap-2">
              <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mr-auto">Slide {selIdx + 1} από {doc.slides.length} · όπως θα φανεί</span>
              <button type="button" aria-label="Νωρίτερα στη σειρά" disabled={selIdx <= 0} onClick={() => move(sel.id, -1)} className="size-11 grid place-items-center rounded-full border border-eu-line hover:border-eu-navy disabled:opacity-30"><ArrowLeft className="size-4" aria-hidden /></button>
              <button type="button" aria-label="Αργότερα στη σειρά" disabled={selIdx >= doc.slides.length - 1} onClick={() => move(sel.id, 1)} className="size-11 grid place-items-center rounded-full border border-eu-line hover:border-eu-navy disabled:opacity-30"><ArrowRight className="size-4" aria-hidden /></button>
            </div>
            <ScaledPreview>
              <SettingsProvider settings={settings}><CinematicHero key={JSON.stringify(preview)} slides={[preview!]} /></SettingsProvider>
            </ScaledPreview>
          </div>
          <div className="rounded-2xl border border-eu-line bg-white p-3 min-w-0">
            <SlideForm s={sel} issues={issues[sel.id] ?? []} info={sel.productId ? products[sel.productId] ?? null : null} tab={tab} onTab={setTab}
              onChange={(p) => patch(sel.id, p)} onMedia={(field) => setPicker({ id: sel.id, field })} onRemove={() => remove(sel.id)}
              onProduct={(id, info) => { if (id && info) setProducts((m) => ({ ...m, [id]: info })); patch(sel.id, { productId: id, cutout: null, productHref: null }); }} />
          </div>
        </div>
      ) : (
        <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-3 text-[length:var(--fs-14)]">Πάτησε «Νέο slide» για να ξεκινήσεις.</p>
      )}

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
