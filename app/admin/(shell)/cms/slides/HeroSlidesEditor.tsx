"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ChevronDown, Film, ImagePlus, Loader2, Package, Plus, RotateCcw, Save, Search, Send, Smartphone, Trash2, X } from "lucide-react";
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

function SlideForm({ s, issues, info, onChange, onMedia, onProduct, onRemove }: { s: HeroSlideDoc; issues: SlideIssue[]; info: ProductInfo | null; onChange: (p: Partial<HeroSlideDoc>) => void; onMedia: (m: Media) => void; onProduct: (id: string | null, p?: ProductInfo) => void; onRemove: () => void }) {
  const err = (f: SlideIssue["field"]) => issues.filter((i) => i.field === f).map((i) => i.message).join(" ") || undefined;
  const lines = [0, 1, 2].map((k) => s.title[k] ?? "");
  const bullets = [0, 1, 2].map((k) => s.bullets[k] ?? "");
  const setLine = (k: number, v: string) => onChange({ title: lines.map((x, j) => (j === k ? v : x)) });
  const setBullet = (k: number, v: string) => onChange({ bullets: bullets.map((x, j) => (j === k ? v : x)) });
  const setSecondary = (p: { label?: string; href?: string }) => { const next = { label: s.secondary?.label ?? "", href: s.secondary?.href ?? "", ...p }; onChange({ secondary: next.label || next.href ? next : null }); };
  const legend = "font-heading font-bold text-eu-ink text-[length:var(--fs-16)] mb-1";
  const set = "grid gap-3 min-w-0 m-0 p-0 border-0";
  return (
    <div className="grid gap-5 border-t border-eu-line p-3 @md:p-4">
      <fieldset className={set}>
        <legend className={legend}>Πότε φαίνεται</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5" checked={s.active} onChange={(e) => onChange({ active: e.target.checked })} /> Ενεργό</label>
          <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5" checked={s.permanent} onChange={(e) => onChange({ permanent: e.target.checked, ...(e.target.checked ? { from: null, to: null } : {}) })} /> Μόνιμο</label>
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Τα μόνιμα δεν έχουν ημερομηνίες: εμφανίζονται μόνο όταν δεν υπάρχει άλλο ενεργό slide, ώστε η αρχική να μη μείνει ποτέ χωρίς hero.</p>
        <div className="grid gap-3 @sm:grid-cols-2">
          <Field label="Πρώτη ημέρα" help="Κενό = από τώρα" error={err("dates")}><input type="date" className={input} disabled={s.permanent} value={s.from ?? ""} onChange={(e) => onChange({ from: e.target.value || null })} /></Field>
          <Field label="Τελευταία ημέρα" help="Κενό = χωρίς λήξη· μετρά ολόκληρη η ημέρα"><input type="date" className={input} disabled={s.permanent} value={s.to ?? ""} onChange={(e) => onChange({ to: e.target.value || null })} /></Field>
        </div>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Κείμενα</legend>
        <Field label="Μικρός τίτλος" help="Η κίτρινη ετικέτα πάνω από τον τίτλο, π.χ. «Φθινόπωρο 2026 · ψυγεία»."><input className={input} maxLength={60} value={s.kicker} onChange={(e) => onChange({ kicker: e.target.value })} /></Field>
        <Field label="Μεγάλος τίτλος" help="Έως 3 σύντομες γραμμές — κάθε γραμμή μένει μόνη της." error={err("title")}>
          <div className="grid gap-2">{lines.map((v, k) => <input key={k} aria-label={`Γραμμή ${k + 1}`} placeholder={`Γραμμή ${k + 1}`} className={input} maxLength={40} value={v} onChange={(e) => setLine(k, e.target.value)} />)}</div>
        </Field>
        <Field label="Κείμενο" help="Μία–δύο προτάσεις κάτω από τον τίτλο."><textarea className={`${input} min-h-24 py-2`} maxLength={300} value={s.body} onChange={(e) => onChange({ body: e.target.value })} /></Field>
        <Field label="Σημεία (προαιρετικά)" help="Έως 3 σύντομα, κάτω από τα κουμπιά, π.χ. «Δωρεάν μεταφορά».">
          <div className="grid gap-2 @sm:grid-cols-3">{bullets.map((v, k) => <input key={k} aria-label={`Σημείο ${k + 1}`} className={input} maxLength={40} value={v} onChange={(e) => setBullet(k, e.target.value)} />)}</div>
        </Field>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Κουμπιά</legend>
        <Field label="Κύριο κουμπί (κίτρινο)" help="Σύνδεσμος: σελίδα του site (π.χ. /k/leykes-syskeyes/psygeia) ή https://…" error={err("primary")}>
          <div className="grid gap-2 @sm:grid-cols-2"><input aria-label="Κείμενο κύριου κουμπιού" placeholder="Κείμενο" className={input} maxLength={60} value={s.primary.label} onChange={(e) => onChange({ primary: { ...s.primary, label: e.target.value } })} /><input aria-label="Σύνδεσμος κύριου κουμπιού" placeholder="/k/…" className={input} value={s.primary.href} onChange={(e) => onChange({ primary: { ...s.primary, href: e.target.value } })} /></div>
        </Field>
        <Field label="Δεύτερο κουμπί (προαιρετικό)" help="Άφησε και τα δύο κενά αν δεν χρειάζεται." error={err("secondary")}>
          <div className="grid gap-2 @sm:grid-cols-2"><input aria-label="Κείμενο δεύτερου κουμπιού" placeholder="Κείμενο" className={input} maxLength={60} value={s.secondary?.label ?? ""} onChange={(e) => setSecondary({ label: e.target.value })} /><input aria-label="Σύνδεσμος δεύτερου κουμπιού" placeholder="/odigoi/…" className={input} value={s.secondary?.href ?? ""} onChange={(e) => setSecondary({ href: e.target.value })} /></div>
        </Field>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Εικόνα, βίντεο, προϊόν</legend>
        <MediaRow title="Φωτογραφία φόντου" help="Οριζόντια, τουλάχιστον 1600 px πλάτος. Μπαίνει αχνή πίσω από το κείμενο." url={s.image.url || null} onPick={() => onMedia("image")} error={err("image")}>
          <input aria-label="Τι δείχνει η φωτογραφία" placeholder="Τι δείχνει η φωτογραφία (π.χ. «Κουζίνα με inox ψυγείο»)" className={input} maxLength={160} value={s.image.alt} onChange={(e) => onChange({ image: { ...s.image, alt: e.target.value } })} />
        </MediaRow>
        <MediaRow title="Φωτογραφία για κινητά (προαιρετική)" help="Κάθετη, για οθόνες έως 767 px. Χωρίς αυτήν το κινητό δείχνει την οριζόντια." url={s.imageMobile?.url ?? null} onPick={() => onMedia("imageMobile")} onClear={() => onChange({ imageMobile: null })} />
        <MediaRow title="Βίντεο φόντου (προαιρετικό)" help="Σύντομο mp4 χωρίς ήχο, σε επανάληψη. Δεν παίζει με «εξοικονόμηση δεδομένων» ή «λιγότερη κίνηση» — τότε μένει η φωτογραφία." url={s.video?.url ?? null} video onPick={() => onMedia("video")} onClear={() => onChange({ video: null })} />
        <ProductField s={s} info={info} onPick={(id, p) => onProduct(id, p)} onClear={() => onProduct(null)} />
      </fieldset>

      <button type="button" onClick={onRemove} className={`${btn} justify-self-start border border-eu-red/40 text-eu-red hover:bg-eu-red/10`}><Trash2 className="size-4" aria-hidden /> Διαγραφή slide</button>
    </div>
  );
}

export function HeroSlidesEditor({ initial, hasPublished, publishedAt: pubAt, products: p0, settings, canUpload }: { initial: HeroDoc; hasPublished: boolean; publishedAt: string | null; products: Record<string, ProductInfo>; settings: Settings; canUpload: boolean }) {
  const [doc, setDoc] = useState<HeroDoc>(initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [published, setPublished] = useState(hasPublished);
  const [publishedAt, setPublishedAt] = useState(pubAt);
  const [products, setProducts] = useState(p0);
  const [openId, setOpenId] = useState<string | null>(initial.slides[0]?.id ?? null);
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
  const remove = (id: string) => { if (confirm("Διαγραφή του slide; Φεύγει από το site με την επόμενη δημοσίευση.")) setDoc((d) => ({ slides: d.slides.filter((s) => s.id !== id) })); };
  const add = () => { const s = emptySlide(); setDoc((d) => ({ slides: [...d.slides, s] })); setOpenId(s.id); };
  const loaded = (d: HeroDoc) => { setDoc(d); setSavedJson(JSON.stringify(d)); };

  const save = () => start(async () => { const r = await saveHeroAction(doc); loaded(r.doc); setMsg({ ok: true, text: "Το πρόχειρο αποθηκεύτηκε. Το site αλλάζει μόνο με τη «Δημοσίευση»." }); });
  const publish = () => {
    const v = validateDoc(doc);
    setIssues(v);
    if (Object.keys(v).length) { setOpenId(Object.keys(v)[0]); setMsg({ ok: false, text: "Διόρθωσε τα σημειωμένα πεδία και ξαναπάτα «Δημοσίευση»." }); return; }
    start(async () => {
      const r = await publishHeroAction(doc);
      if (!r.ok) { setIssues(r.issues); setOpenId(Object.keys(r.issues)[0] ?? null); setMsg({ ok: false, text: "Διόρθωσε τα σημειωμένα πεδία και ξαναπάτα «Δημοσίευση»." }); return; }
      loaded(r.doc); setPublished(true); setPublishedAt(r.publishedAt); setIssues({});
      setMsg({ ok: true, text: "Δημοσιεύτηκε — το βλέπουν τώρα οι επισκέπτες." });
    });
  };
  const revert = () => { if (confirm("Ακύρωση όλων των αλλαγών; Το πρόχειρο γυρίζει σε ό,τι δείχνει τώρα το site.")) start(async () => { const r = await revertHeroAction(); loaded(r.doc); setIssues({}); setMsg({ ok: true, text: "Το πρόχειρο γύρισε στο δημοσιευμένο." }); }); };

  const open = doc.slides.find((s) => s.id === openId) ?? null;
  const preview = open ? toHeroSlide(open, open.productId ? products[open.productId] ?? null : null) : null;
  const when = publishedAt ? new Date(publishedAt).toLocaleString("el-GR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="grid gap-4 min-w-0">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 py-2 bg-white/95 backdrop-blur border-b border-eu-line">
        <span className="mr-auto text-[length:var(--fs-14)] text-eu-ink-3 min-w-0">
          {dirty ? <b className="text-eu-red">Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί.</b> : published ? `Δημοσιευμένο${when ? ` · ${when}` : ""}` : "Δεν έχει δημοσιευτεί ακόμη — η αρχική δείχνει τα αρχικά slides."}
        </span>
        <button type="button" onClick={save} disabled={pending || !dirty} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση πρόχειρου</button>
        {published && <button type="button" onClick={revert} disabled={pending} className={`${btn} text-eu-ink-3 hover:bg-eu-surface`}><RotateCcw className="size-4" aria-hidden /> Επαναφορά</button>}
        <button type="button" onClick={publish} disabled={pending} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}><Send className="size-4" aria-hidden /> Δημοσίευση</button>
      </div>
      {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}

      <div className="grid gap-4 @5xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] items-start">
        <ol className="m-0 p-0 list-none grid gap-2 min-w-0">
          {doc.slides.map((s, k) => {
            const st = slideStatus(s, now), isOpen = s.id === openId, iss = issues[s.id] ?? [];
            return (
              <li key={s.id} className={`rounded-2xl border bg-white min-w-0 ${isOpen ? "border-eu-navy" : iss.length ? "border-eu-red" : "border-eu-line"}`}>
                <div className="flex items-center gap-1 p-2">
                  <button type="button" onClick={() => setOpenId(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex flex-1 min-w-0 items-center gap-3 text-left min-h-11">
                    <span className="relative size-12 shrink-0 rounded-lg overflow-hidden bg-eu-surface">{s.image.url && <Image src={s.image.url} alt="" fill sizes="48px" className="object-cover" unoptimized={unopt(s.image.url)} />}</span>
                    <span className="min-w-0">
                      <span className="block font-bold text-eu-ink truncate text-[length:var(--fs-15)]">{s.title.filter((t) => t.trim()).join(" ") || "Χωρίς τίτλο"}</span>
                      <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${TONE[st.tone]}`}>{st.label}</span>
                      {iss.length > 0 && <span className="ml-1.5 text-eu-red font-bold text-[length:var(--fs-12)]">Θέλει διόρθωση</span>}
                    </span>
                    <ChevronDown className={`size-4 ml-auto shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  <button type="button" aria-label="Μετακίνηση πιο πάνω" disabled={k === 0} onClick={() => move(s.id, -1)} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" aria-label="Μετακίνηση πιο κάτω" disabled={k === doc.slides.length - 1} onClick={() => move(s.id, 1)} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                </div>
                {isOpen && (
                  <SlideForm s={s} issues={iss} info={s.productId ? products[s.productId] ?? null : null} onChange={(p) => patch(s.id, p)} onMedia={(field) => setPicker({ id: s.id, field })} onRemove={() => remove(s.id)}
                    onProduct={(id, info) => { if (id && info) setProducts((m) => ({ ...m, [id]: info })); patch(s.id, { productId: id, cutout: null, productHref: null }); }} />
                )}
              </li>
            );
          })}
          {doc.slides.length < MAX_SLIDES && <li><button type="button" onClick={add} className={`${btn} w-full border-2 border-dashed border-eu-line text-eu-navy hover:border-eu-navy`}><Plus className="size-4" aria-hidden /> Νέο slide</button></li>}
        </ol>

        <div className="grid gap-2 min-w-0 @5xl:sticky @5xl:top-16">
          <div className="inline-flex items-center gap-1.5 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><Smartphone className="size-4" aria-hidden /> Προεπισκόπηση</div>
          {preview ? (
            <div className="@container rounded-xl overflow-hidden">
              <SettingsProvider settings={settings}><CinematicHero key={JSON.stringify(preview)} slides={[preview]} /></SettingsProvider>
            </div>
          ) : <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-3 text-[length:var(--fs-14)]">Άνοιξε ένα slide για να το δεις όπως θα φανεί.</p>}
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το πραγματικό hero της αρχικής με τα στοιχεία του πρόχειρου. Στο site, δίπλα του μπαίνουν η προσφορά ημέρας, το κοντινότερο κατάστημα και οι υπηρεσίες.</p>
        </div>
      </div>

      {picker && (
        <MediaPickerDialog accept={[picker.field === "video" ? "video" : "image"]} canWrite={canUpload} onClose={() => setPicker(null)}
          onSelect={(a) => {
            const x = a[0];
            if (x) {
              const s = doc.slides.find((y) => y.id === picker.id);
              if (picker.field === "image") patch(picker.id, { image: { url: x.url, alt: s?.image.alt || x.alt || "" } });
              else if (picker.field === "imageMobile") patch(picker.id, { imageMobile: { url: x.url } });
              else patch(picker.id, { video: { url: x.url } });
            }
            setPicker(null);
          }} />
      )}
    </div>
  );
}
