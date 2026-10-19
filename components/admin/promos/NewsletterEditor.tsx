"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { stylesToClasses } from "@/lib/ui/inline-styles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Check, CircleAlert, Copy, Eye, FlaskConical, Loader2, Mail, Monitor, MoreHorizontal, Pause, Pencil, Play, Plus, Save, Search, Send, Smartphone, Sparkles, Square, X } from "lucide-react";
import { ImageUrlField } from "./ImageUrlField";
import { sx } from "@/components/ui/sx";
import { HARD, LIMITS, MAX_PRODUCTS, NEWSLETTER_STATUS, athensLocal, type CopyField, type NewsletterForm } from "@/lib/newsletter/edit";
import { cancel, createFromCampaign, createFromPromotion, duplicate, estimateRecipients, previewHtml, resume, rewriteWithAi, saveNewsletter, schedule, searchProducts, stop, testSend } from "@/app/admin/(shell)/prosfores/newsletter/actions";

export type ProductInfo = { title: string; brand: string; price: number | null; image: string | null; listed: boolean };
export type EditorData = {
  id: string;
  form: NewsletterForm;
  contentHash: string;
  testHash: string | null;
  testSentAt: string | null;
  testSentCount: number;
  /** ρυθμισμένος πάροχος email (Ρυθμίσεις → Email) */
  transport: boolean;
  /** γιατί η προσφορά/καμπάνια δεν επιτρέπει αποστολή τώρα (ή null) */
  sourceProblem: string | null;
  /** πλήθος διευθύνσεων της εσωτερικής λίστας δοκιμής (audience.emails) — null αν δεν υπάρχει */
  restricted: number | null;
  products: Record<string, ProductInfo>;
  segments: { id: string; label: string }[];
  me: string;
  staff: { email: string; name: string }[];
  html: string;
  /** nonce του CSP της σελίδας, για την προεπισκόπηση */
  nonce?: string;
};

const field = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-10 text-[length:var(--fs-14)] outline-none focus:border-eu-blue";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 disabled:opacity-45 disabled:cursor-not-allowed";
const ghost = `${btn} border border-eu-line bg-white text-eu-ink-2 hover:border-eu-navy`;
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const iconBtn = "inline-flex items-center justify-center rounded-full size-11 md:size-8 text-eu-ink-3 hover:text-eu-navy hover:bg-eu-surface disabled:opacity-30 disabled:cursor-not-allowed";
const card = "grid gap-3 rounded-2xl bg-white border border-eu-line p-3 @md:p-4 min-w-0";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]";
const helpTxt = "m-0 font-normal text-eu-ink-3 text-[length:var(--fs-12)] leading-snug";
const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
const athensText = (iso: string) => new Date(iso).toLocaleString("el-GR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Athens" });

// ---------------------------------------------------------------- κοινά

/** Παράθυρο διαλόγου: Esc / κλικ έξω κλείνει, εστίαση στο πρώτο στοιχείο. Στο κινητό ανεβαίνει από κάτω. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const hid = useId();
  // μία φορά στο άνοιγμα (όχι σε κάθε render — αλλιώς η εστίαση «πηδά» όσο γράφεις)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>("input:not([disabled]), select, textarea") ?? ref.current?.querySelector<HTMLElement>("button:not([disabled])"))?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid items-end sm:place-items-center bg-black/45 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={hid} className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 grid gap-3 max-h-[90dvh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h2 id={hid} className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className={iconBtn}><X className="size-4" aria-hidden /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Πεδίο κειμένου με μετρητή (προτεινόμενο όριο), εξήγηση από κάτω και προαιρετικό «Ξαναγράψε με AI». */
function TextField({ label, help, value, onChange, limit, hard, multiline, rows = 4, ai, aiBusy, required, "data-help": dataHelp }: {
  label: string; help: string; value: string; onChange: (v: string) => void; limit?: number; hard: number; multiline?: boolean; rows?: number;
  ai?: () => void; aiBusy?: boolean; required?: boolean; "data-help"?: string;
}) {
  const id = useId();
  const over = limit != null && value.length > limit;
  const tooLong = value.length > hard;
  const props = { id, value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value), "aria-describedby": `${id}-h ${id}-c`, "aria-invalid": tooLong || undefined, required };
  return (
    <div data-help={dataHelp} className="grid gap-1 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <label htmlFor={id} className="font-bold text-eu-ink text-[length:var(--fs-13)]">{label}{required && <span className="text-eu-red" aria-hidden> *</span>}</label>
        <span className="flex items-center gap-2">
          {limit != null && <span id={`${id}-c`} className={`tabular-nums text-[length:var(--fs-12)] ${tooLong ? "text-eu-red font-bold" : over ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{value.length}/{limit}{over && !tooLong ? " · πάνω από το προτεινόμενο" : ""}{tooLong ? ` · όριο ${hard}` : ""}</span>}
          {ai && <button type="button" onClick={ai} disabled={aiBusy} className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-8 font-bold text-eu-blue text-[length:var(--fs-12)] hover:bg-eu-chip disabled:opacity-45">{aiBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} Ξαναγράψε με AI</button>}
        </span>
      </div>
      {multiline ? <textarea {...props} rows={rows} className={`${field} py-2 leading-normal`} /> : <input {...props} className={field} />}
      <p id={`${id}-h`} className={helpTxt}>{help}</p>
    </div>
  );
}

/** Προεπισκόπηση σε iframe (χωρίς scripts): υπολογιστής 600px / κινητό 375px. */
export function NewsletterPreview({ html, busy, nonce, "data-help": dataHelp }: { html: string; busy?: boolean; /** nonce του CSP της σελίδας (το srcDoc το κληρονομεί) */ nonce?: string; "data-help"?: string }) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  return (
    <section data-help={dataHelp} aria-label="Προεπισκόπηση" className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`${h3} inline-flex items-center gap-1.5`}><Eye className="size-4 text-eu-blue" aria-hidden /> Προεπισκόπηση{busy && <Loader2 className="size-4 animate-spin text-eu-muted" aria-label="Ενημέρωση" />}</h3>
        <div role="radiogroup" aria-label="Μέγεθος οθόνης" className="inline-flex rounded-full border border-eu-line bg-white p-0.5">
          {([["desktop", "Υπολογιστής", Monitor], ["mobile", "Κινητό", Smartphone]] as const).map(([k, l, I]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] ${mode === k ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:text-eu-navy"}`}><I className="size-3.5" aria-hidden /> {l}</button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-eu-line bg-eu-surface p-2 grid grid-cols-[minmax(0,1fr)] justify-items-center overflow-hidden min-w-0">
        <iframe title="Προεπισκόπηση του email" srcDoc={stylesToClasses(html, nonce)} sandbox="allow-popups allow-popups-to-escape-sandbox" className={`block bg-white rounded-lg border-0 min-w-0 h-[70dvh] min-h-[480px] max-w-full ${mode === "mobile" ? "w-[375px]" : "w-full"}`} />
      </div>
      <p className={helpTxt}>Τιμές και προϊόντα όπως είναι τώρα· στην αποστολή ξαναδιαβάζονται και ό,τι δεν φαίνεται πια στο site αφαιρείται.</p>
    </section>
  );
}

// ---------------------------------------------------------------- κουμπί δημιουργίας

/** «Newsletter» στην καρτέλα προσφοράς / καμπάνιας: φτιάχνει πρόχειρο (με AI) και ανοίγει τον editor. */
export function NewsletterCreateButton({ kind, sourceId, "data-help": dataHelp }: { kind: "promotion" | "campaign"; sourceId: string; "data-help"?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span data-help={dataHelp} className="inline-grid gap-1 justify-items-start">
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const r = kind === "promotion" ? await createFromPromotion(sourceId) : await createFromCampaign(sourceId);
        if (!r.ok) { setErr(r.error); return; }
        router.push(`/admin/prosfores/newsletter/${r.id}`);
      })} className={ghost}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />} {pending ? "Ετοιμάζεται πρόχειρο…" : "Newsletter"}
      </button>
      {err && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-12)]">{err}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- editor (πρόχειρο)

type Dialog = null | { kind: "test" } | { kind: "schedule" } | { kind: "confirm"; at: string; recipients: number; night: boolean; when: string | null };

/**
 * Επεξεργασία πρόχειρου newsletter: αριστερά τα πεδία (με μετρητές και εξήγηση), δεξιά ζωντανή προεπισκόπηση
 * (σε στενή οθόνη: καρτέλες), κάτω μπάρα ενεργειών. Αποστολή/προγραμματισμός μόνο μετά από δοκιμή της τελευταίας εκδοχής.
 */
export function NewsletterEditor({ d }: { d: EditorData }) {
  const router = useRouter();
  const [form, setForm] = useState<NewsletterForm>(d.form);
  const [saved, setSaved] = useState(() => JSON.stringify(d.form));
  const [hash, setHash] = useState(d.contentHash);
  const [products, setProducts] = useState<Record<string, ProductInfo>>(d.products);
  const [html, setHtml] = useState(d.html);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<CopyField | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [schedErr, setSchedErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [acting, startAct] = useTransition();

  const dirty = JSON.stringify(form) !== saved;
  const tested = !!d.testHash && d.testHash === hash;
  const set = (p: Partial<NewsletterForm>) => { setForm((f) => ({ ...f, ...p })); setMsg(null); };

  // προειδοποίηση πριν φύγει με μη αποθηκευμένες αλλαγές
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ζωντανή προεπισκόπηση: απόδοση στον server χωρίς αποθήκευση, 700 ms μετά την τελευταία αλλαγή
  const seq = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setPreviewBusy(true);
      const r = await previewHtml(d.id, form).catch(() => null);
      if (my !== seq.current) return;
      setPreviewBusy(false);
      if (r?.ok) setHtml(r.html);
    }, 700);
    return () => clearTimeout(t);
  }, [form, d.id]);

  const save = useCallback(() => startSave(async () => {
    const r = await saveNewsletter(d.id, form);
    if (!r.ok) { setErrors(r.errors); setMsg(null); return; }
    setErrors([]);
    setSaved(JSON.stringify(form));
    setHash(r.contentHash);
    setMsg({ tone: "ok", text: r.tested ? "Αποθηκεύτηκε." : d.testHash ? "Αποθηκεύτηκε — το περιεχόμενο άλλαξε, χρειάζεται νέα δοκιμαστική αποστολή." : "Αποθηκεύτηκε." });
    router.refresh();
  }), [d.id, d.testHash, form, router]);

  // ⌘S / Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty && !saving) save(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dirty, saving, save]);

  const ai = (f: CopyField) => {
    setAiBusy(f);
    rewriteWithAi(d.id, f, form.productIds).then((r) => {
      setAiBusy(null);
      if (!r.ok) { setMsg({ tone: "bad", text: r.error }); return; }
      if (f === "subject") set({ subject: r.text });
      else if (f === "preheader") set({ preheader: r.text });
      else if (f === "intro") set({ intro: r.text });
      else if (form.cta) set({ cta: { ...form.cta, label: r.text } });
    }, () => setAiBusy(null));
  };

  // λόγοι που κλειδώνουν τις ενέργειες (με σειρά προτεραιότητας)
  const noTransport = !d.transport;
  const testWhy = noTransport ? "Δεν έχει ρυθμιστεί πάροχος email." : dirty ? "Αποθηκεύστε πρώτα τις αλλαγές." : null;
  const sendWhy = testWhy ?? d.sourceProblem ?? (!tested ? "Χρειάζεται δοκιμαστική αποστολή μετά την τελευταία αλλαγή." : null);

  // κινητό: η μία «επόμενη» ενέργεια και η κατάσταση σε μία γραμμή
  const [sheet, setSheet] = useState(false);
  const next: "save" | "test" | "send" | null = dirty ? "save" : !tested && !testWhy ? "test" : !sendWhy ? "send" : null;
  const testedAt = d.testSentAt ? ` ${new Date(d.testSentAt).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Athens" })}` : "";
  const dirtyOrTest = dirty ? "Μη αποθηκευμένες αλλαγές" : tested ? `Δοκιμάστηκε${testedAt}` : d.testHash ? "Άλλαξε μετά τη δοκιμή — χρειάζεται νέα" : "Δεν έχει γίνει δοκιμή";
  const statusText = msg?.text ?? (next === null && (noTransport || sendWhy) ? (noTransport ? "Χωρίς πάροχο email" : sendWhy!) : dirtyOrTest);

  const openConfirm = (at: string) => startAct(async () => {
    const r = await estimateRecipients(d.id, at);
    if (!r.ok) {
      if (at === "now") { setDialog(null); setMsg({ tone: "bad", text: r.error }); } else setSchedErr(r.error);
      return;
    }
    setSchedErr(null);
    setDialog({ kind: "confirm", at, recipients: r.recipients, night: r.night, when: r.when });
  });

  return (
    <div className="grid gap-3 min-w-0">
      {/* καρτέλες σε στενή οθόνη */}
      <div role="tablist" aria-label="Προβολή" className="@5xl:hidden grid grid-cols-2 rounded-full border border-eu-line bg-white p-0.5">
        {([["edit", "Επεξεργασία", Pencil], ["preview", "Προεπισκόπηση", Eye]] as const).map(([k, l, I]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex items-center justify-center gap-1.5 rounded-full min-h-11 font-bold text-[length:var(--fs-13)] ${tab === k ? "bg-eu-navy text-white" : "text-eu-ink-3"}`}><I className="size-4" aria-hidden /> {l}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start min-w-0">
        <div className={`${tab === "preview" ? "hidden @5xl:grid" : "grid"} gap-4 min-w-0`}>
          {errors.length > 0 && (
            <div role="alert" className="rounded-xl border border-eu-red/40 bg-eu-red/5 p-3 grid gap-1">
              <p className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-red text-[length:var(--fs-13)]"><CircleAlert className="size-4" aria-hidden /> Δεν αποθηκεύτηκε</p>
              <ul className="m-0 pl-5 text-eu-ink-2 text-[length:var(--fs-13)]">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          <section className={card} aria-labelledby="nb-h">
            <h3 id="nb-h" className={h3}>Θέμα & εισαγωγή</h3>
            <TextField data-help="newsletter.title" label="Εσωτερικός τίτλος" required value={form.title} onChange={(v) => set({ title: v })} hard={HARD.title} help="Τον βλέπουν μόνο οι συνάδελφοι στη λίστα· δεν φαίνεται στο email." />
            <TextField data-help="newsletter.subject" label="Θέμα" required value={form.subject} onChange={(v) => set({ subject: v })} limit={LIMITS.subject} hard={HARD.subject} ai={() => ai("subject")} aiBusy={aiBusy === "subject"} help="Η πρώτη γραμμή στα εισερχόμενα. Έως 60 χαρακτήρες για να μην κόβεται στο κινητό· ό,τι αριθμό γράφει (%, €, ημερομηνία) πρέπει να ισχύει." />
            <TextField data-help="newsletter.preheader" label="Preheader" value={form.preheader} onChange={(v) => set({ preheader: v })} limit={LIMITS.preheader} hard={HARD.preheader} ai={() => ai("preheader")} aiBusy={aiBusy === "preheader"} help="Το γκρι κείμενο δίπλα ή κάτω από το θέμα στα εισερχόμενα — συμπληρώνει το θέμα, δεν το επαναλαμβάνει." />
            <TextField data-help="newsletter.intro" label="Εισαγωγή" multiline value={form.intro} onChange={(v) => set({ intro: v })} limit={LIMITS.intro} hard={HARD.intro} ai={() => ai("intro")} aiBusy={aiBusy === "intro"} help="2–3 προτάσεις κάτω από την κεφαλίδα. Κενή γραμμή = νέα παράγραφος. Κενό πεδίο = χωρίς εισαγωγή." />
          </section>

          <section data-help="newsletter.hero" className={card} aria-labelledby="nh-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="nh-h" className={h3}>Κεφαλίδα</h3>
              <label className="inline-flex items-center gap-2 min-h-11 md:min-h-8 font-bold text-eu-ink-2 text-[length:var(--fs-13)] cursor-pointer">
                <input type="checkbox" checked={!!form.hero} onChange={(e) => set({ hero: e.target.checked ? { image: "", alt: "", href: form.cta?.href ?? "/prosfores", headline: form.title.replace(/^Newsletter · /, ""), sub: "" } : null })} className="accent-eu-navy size-4" /> Με κεφαλίδα
              </label>
            </div>
            {form.hero ? (
              <div className="grid gap-3">
                <ImageUrlField label="Εικόνα (προαιρετική)" value={form.hero.image} onChange={(v) => set({ hero: { ...form.hero!, image: v } })} help="Από τη βιβλιοθήκη ή διεύθυνση https://… · πλάτος 1200px ή περισσότερο. Χωρίς εικόνα: μπλε κεφαλίδα με τον τίτλο." />
                {form.hero.image && <TextField label="Περιγραφή εικόνας (alt)" value={form.hero.alt} onChange={(v) => set({ hero: { ...form.hero!, alt: v } })} hard={HARD.alt} help="Φαίνεται όταν το πρόγραμμα email δεν δείχνει εικόνες (συχνά στο Outlook)." />}
                <TextField label="Τίτλος" required value={form.hero.headline} onChange={(v) => set({ hero: { ...form.hero!, headline: v } })} hard={HARD.headline} help="Μεγάλα γράμματα κάτω από την εικόνα (ή μέσα στη μπλε κεφαλίδα)." />
                <TextField label="Υπότιτλος" value={form.hero.sub} onChange={(v) => set({ hero: { ...form.hero!, sub: v } })} hard={HARD.sub} help="Π.χ. ο μηχανισμός και η λήξη: «Έως −20 % · Ισχύει έως 31/10»." />
                <TextField label="Σύνδεσμος" required value={form.hero.href} onChange={(v) => set({ hero: { ...form.hero!, href: v } })} hard={HARD.href} help="Πού πάει το πάτημα στην κεφαλίδα: σελίδα του site (/prosfores/…) ή https://…. Μπαίνουν αυτόματα τα UTM." />
              </div>
            ) : <p className={helpTxt}>Χωρίς κεφαλίδα το email ξεκινά από την εισαγωγή.</p>}
          </section>

          <Products data-help="newsletter.products" ids={form.productIds} products={products} onChange={(ids) => set({ productIds: ids })} onFound={(p) => setProducts((x) => ({ ...x, ...p }))} />

          <section data-help="newsletter.cta" className={card} aria-labelledby="nk-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="nk-h" className={h3}>Κουμπί</h3>
              <label className="inline-flex items-center gap-2 min-h-11 md:min-h-8 font-bold text-eu-ink-2 text-[length:var(--fs-13)] cursor-pointer">
                <input type="checkbox" checked={!!form.cta} onChange={(e) => set({ cta: e.target.checked ? { label: "Δείτε την προσφορά", href: form.hero?.href ?? "/prosfores" } : null })} className="accent-eu-navy size-4" /> Με κουμπί
              </label>
            </div>
            {form.cta ? (
              <div className="grid gap-3">
                <TextField label="Κείμενο κουμπιού" required value={form.cta.label} onChange={(v) => set({ cta: { ...form.cta!, label: v } })} limit={LIMITS.cta} hard={HARD.cta} ai={() => ai("cta")} aiBusy={aiBusy === "cta"} help="Ρήμα + τι θα βρει: «Δείτε την προσφορά», «Όλα τα κλιματιστικά». Έως 24 χαρακτήρες." />
                <TextField label="Σύνδεσμος" required value={form.cta.href} onChange={(v) => set({ cta: { ...form.cta!, href: v } })} hard={HARD.href} help="Συνήθως η landing page της προσφοράς (/prosfores/…). Επιτρέπονται σελίδες του site, https://… και mailto:." />
              </div>
            ) : <p className={helpTxt}>Χωρίς κουμπί στο τέλος.</p>}
          </section>

          <section data-help="newsletter.audience" className={card} aria-labelledby="na-h">
            <h3 id="na-h" className={h3}>Κοινό</h3>
            {d.restricted != null && (
              <p className="m-0 rounded-lg bg-eu-amber/10 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]"><strong>Περιορισμένο κοινό (δοκιμή):</strong> στέλνεται μόνο σε {d.restricted} συγκεκριμένες διευθύνσεις, εφόσον έχουν συναίνεση. Δεν αλλάζει από εδώ.</p>
            )}
            <fieldset className="m-0 p-0 border-0 grid gap-2">
              <legend className="sr-only">Σε ποιους στέλνεται</legend>
              <label className="flex items-start gap-2 rounded-lg border border-eu-line px-3 py-2 cursor-pointer min-h-11 has-[:checked]:border-eu-navy has-[:checked]:bg-eu-chip/50">
                <input type="radio" name="aud" checked={!form.segmentId} onChange={() => set({ segmentId: null })} className="mt-1 accent-eu-navy size-4 shrink-0" />
                <span className="grid"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Όλοι με συναίνεση</span><span className={helpTxt}>Επιβεβαιωμένοι συνδρομητές newsletter και πελάτες που δέχονται προσφορές — ένα email ανά διεύθυνση, χωρίς όσους διαγράφηκαν.</span></span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-eu-line px-3 py-2 cursor-pointer min-h-11 has-[:checked]:border-eu-navy has-[:checked]:bg-eu-chip/50">
                <input type="radio" name="aud" checked={!!form.segmentId} disabled={!d.segments.length} onChange={() => set({ segmentId: d.segments[0]?.id ?? null })} className="mt-1 accent-eu-navy size-4 shrink-0" />
                <span className="grid gap-1.5 min-w-0 flex-1">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Κοινό πελατών</span>
                  <span className={helpTxt}>Μόνο πελάτες του κοινού που έχουν συναίνεση· οι συνδρομητές χωρίς λογαριασμό μένουν εκτός. {d.segments.length ? "" : "Δεν υπάρχει ακόμη κοινό — φτιάξτε στη Στόχευση → Κοινά πελατών."}</span>
                  {form.segmentId && (
                    <select aria-label="Κοινό πελατών" value={form.segmentId} onChange={(e) => set({ segmentId: e.target.value })} className={field}>
                      {d.segments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  )}
                </span>
              </label>
            </fieldset>
            <p className={helpTxt}>Το ακριβές πλήθος φαίνεται στην επιβεβαίωση πριν από την αποστολή· οι παραλήπτες «παγώνουν» τη στιγμή που ξεκινά.</p>
          </section>
        </div>

        <div className={`${tab === "edit" ? "hidden @5xl:block" : "block"} @5xl:sticky @5xl:top-4 min-w-0`}>
          <NewsletterPreview data-help="newsletter.preview" html={html} busy={previewBusy} nonce={d.nonce} />
        </div>
      </div>

      {/* μπάρα ενεργειών */}
      <div data-help="newsletter.actions" className="hidden md:grid sticky bottom-0 z-20 rounded-t-2xl border border-eu-line bg-white/95 backdrop-blur px-3 py-2.5 gap-2 shadow-[0_-6px_18px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]" aria-live="polite">
          {dirty ? <span className="inline-flex items-center gap-1.5 font-bold text-eu-amber"><AlertTriangle className="size-4" aria-hidden /> Μη αποθηκευμένες αλλαγές</span>
            : tested ? <span className="inline-flex items-center gap-1.5 font-bold text-eu-green"><Check className="size-4" aria-hidden /> Δοκιμάστηκε{d.testSentAt ? ` ${new Date(d.testSentAt).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Athens" })}` : ""}{d.testSentCount ? ` · ${d.testSentCount} ${d.testSentCount === 1 ? "διεύθυνση" : "διευθύνσεις"}` : ""}</span>
            : <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink-3"><FlaskConical className="size-4" aria-hidden /> {d.testHash ? "Άλλαξε μετά τη δοκιμή — χρειάζεται νέα" : "Δεν έχει γίνει δοκιμή"}</span>}
          {msg && <span role={msg.tone === "bad" ? "alert" : "status"} className={`font-bold ${msg.tone === "ok" ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || saving} className={dirty ? primary : ghost}>{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>
          <button type="button" data-help="newsletter.test" onClick={() => setDialog({ kind: "test" })} disabled={!!testWhy || acting} aria-describedby="nl-why" className={!dirty && !tested && !testWhy ? primary : ghost}><FlaskConical className="size-4" aria-hidden /> Δοκιμαστική αποστολή</button>
          <span className="hidden @md:block flex-1" />
          <button type="button" onClick={() => openConfirm("now")} disabled={!!sendWhy || acting} aria-describedby="nl-why" className={ghost}>{acting && dialog === null ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Αποστολή τώρα</button>
          <button type="button" onClick={() => setDialog({ kind: "schedule" })} disabled={!!sendWhy || acting} aria-describedby="nl-why" className={!sendWhy ? primary : ghost}><CalendarClock className="size-4" aria-hidden /> Προγραμματισμός</button>
        </div>
        {(sendWhy || noTransport) && (
          <p id="nl-why" className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">
            {noTransport ? <>Η αποστολή είναι κλειδωμένη: δεν έχει ρυθμιστεί πάροχος email. <Link href="/admin/settings/email" className="font-bold text-eu-blue underline">Ρυθμίσεις → Email</Link></> : <>Αποστολή / προγραμματισμός: {sendWhy}</>}
          </p>
        )}
      </div>

      {/* κινητό (< md): μία συμπαγής γραμμή — η επόμενη ενέργεια + «Περισσότερα». Είναι sticky μέσα στη ροή, άρα το τελευταίο πεδίο δεν κρύβεται. */}
      <div data-help="newsletter.actions-mobile" className="md:hidden sticky bottom-0 z-20 flex items-center gap-2 rounded-t-2xl border border-eu-line bg-white/95 backdrop-blur px-2.5 py-2 shadow-[0_-6px_18px_rgba(0,0,0,0.06)] min-w-0">
        <span className={`min-w-0 flex-1 truncate font-bold text-[length:var(--fs-13)] ${msg ? (msg.tone === "ok" ? "text-eu-green" : "text-eu-red") : dirty ? "text-eu-amber" : tested ? "text-eu-green" : "text-eu-ink-3"}`} title={statusText} aria-live="polite">{statusText}</span>
        {next === "save" && <button type="button" onClick={save} disabled={saving} className={`${primary} shrink-0`}>{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>}
        {next === "test" && <button type="button" onClick={() => setDialog({ kind: "test" })} disabled={acting} className={`${primary} shrink-0`}><FlaskConical className="size-4" aria-hidden /> Δοκιμή</button>}
        {next === "send" && <button type="button" onClick={() => setSheet(true)} className={`${primary} shrink-0`}><Send className="size-4" aria-hidden /> Αποστολή…</button>}
        <button type="button" data-help="newsletter.more" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet} className={`${ghost} shrink-0 !px-3 min-w-11`}><MoreHorizontal className="size-4" aria-hidden /><span className="sr-only">Περισσότερα</span><span aria-hidden className="hidden min-[400px]:inline">Περισσότερα</span></button>
      </div>
      {sheet && (
        <Modal title="Ενέργειες" onClose={() => setSheet(false)}>
          <p className={`m-0 font-bold text-[length:var(--fs-14)] ${dirty ? "text-eu-amber" : tested ? "text-eu-green" : "text-eu-ink-3"}`}>{dirtyOrTest}</p>
          {msg && <p role={msg.tone === "bad" ? "alert" : "status"} className={`m-0 font-bold text-[length:var(--fs-13)] ${msg.tone === "ok" ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
          <div className="grid gap-2">
            <button type="button" onClick={() => { setSheet(false); save(); }} disabled={!dirty || saving} className={`${dirty ? primary : ghost} w-full`}><Save className="size-4" aria-hidden /> Αποθήκευση</button>
            <button type="button" onClick={() => { setSheet(false); setDialog({ kind: "test" }); }} disabled={!!testWhy || acting} className={`${!dirty && !tested && !testWhy ? primary : ghost} w-full`}><FlaskConical className="size-4" aria-hidden /> Δοκιμαστική αποστολή</button>
            <button type="button" onClick={() => { setSheet(false); openConfirm("now"); }} disabled={!!sendWhy || acting} className={`${ghost} w-full`}><Send className="size-4" aria-hidden /> Αποστολή τώρα</button>
            <button type="button" onClick={() => { setSheet(false); setDialog({ kind: "schedule" }); }} disabled={!!sendWhy || acting} className={`${!sendWhy ? primary : ghost} w-full`}><CalendarClock className="size-4" aria-hidden /> Προγραμματισμός</button>
          </div>
          {(sendWhy || noTransport) && (
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">
              {noTransport ? <>Η αποστολή είναι κλειδωμένη: δεν έχει ρυθμιστεί πάροχος email. <Link href="/admin/settings/email" className="font-bold text-eu-blue underline">Ρυθμίσεις → Email</Link></> : <>Αποστολή / προγραμματισμός: {sendWhy}</>}
            </p>
          )}
        </Modal>
      )}

      {dialog?.kind === "test" && <TestDialog id={d.id} me={d.me} staff={d.staff} onClose={() => setDialog(null)} onDone={(text) => { setDialog(null); setMsg({ tone: "ok", text }); router.refresh(); }} />}
      {dialog?.kind === "schedule" && <ScheduleDialog busy={acting} error={schedErr} onClose={() => { setDialog(null); setSchedErr(null); }} onNext={openConfirm} />}
      {dialog?.kind === "confirm" && (
        <Modal title={dialog.at === "now" ? "Αποστολή τώρα;" : "Προγραμματισμός;"} onClose={() => setDialog(null)}>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[length:var(--fs-14)]">
            <dt className="text-eu-muted">Θέμα</dt><dd className="m-0 font-bold text-eu-ink break-words">{form.subject}</dd>
            <dt className="text-eu-muted">Παραλήπτες</dt><dd className="m-0 font-bold text-eu-ink tabular-nums">περίπου {dialog.recipients.toLocaleString("el-GR")}</dd>
            <dt className="text-eu-muted">Πότε</dt><dd className="m-0 text-eu-ink">{dialog.when ? `${athensText(dialog.when)} (ώρα Ελλάδας)` : "Μέσα στο επόμενο λεπτό"}</dd>
          </dl>
          {dialog.night && <p className="m-0 inline-flex gap-1.5 rounded-lg bg-eu-amber/10 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 shrink-0 text-eu-amber mt-0.5" aria-hidden /> Η ώρα πέφτει μέσα στο 22:00–08:00. Τα emails της νύχτας χάνονται ανάμεσα στα πρωινά — προτιμήστε 10:00–13:00 ή 18:00–20:00.</p>}
          {dialog.recipients === 0 && <p className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">Κανένας παραλήπτης με συναίνεση — η αποστολή δεν θα γίνει.</p>}
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Κάθε newsletter στέλνεται μία φορά. {dialog.at === "now" ? "Μετά την έναρξη μπορείτε μόνο να τη διακόψετε." : "Μέχρι την ώρα του μπορείτε να το ακυρώσετε."}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={acting || dialog.recipients === 0} onClick={() => startAct(async () => {
              const r = await schedule(d.id, dialog.at);
              if (!r.ok) { setDialog(null); setMsg({ tone: "bad", text: r.error }); return; }
              setDialog(null);
              router.refresh();
            })} className={primary}>{acting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} {dialog.at === "now" ? `Αποστολή σε ${dialog.recipients.toLocaleString("el-GR")}` : "Προγραμματισμός"}</button>
            <button type="button" onClick={() => setDialog(null)} className={ghost}>Άκυρο</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Προϊόντα: αναζήτηση (μόνο όσα φαίνονται στο site), σειρά με ↑ ↓, αφαίρεση — όλα με κουμπιά, άρα και με πληκτρολόγιο. */
function Products({ ids, products, onChange, onFound, "data-help": dataHelp }: { ids: string[]; products: Record<string, ProductInfo>; onChange: (ids: string[]) => void; onFound: (p: Record<string, ProductInfo>) => void; "data-help"?: string }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; title: string; brand: string; price: number; listPrice: number | null; image: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");
  const seq = useRef(0);
  useEffect(() => {
    const s = q.trim();
    const my = ++seq.current;
    if (s.length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchProducts(s).catch(() => []);
      if (my !== seq.current) return;
      setSearching(false);
      setFound(r);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setNote(`${products[ids[i]]?.title ?? "Προϊόν"}: θέση ${j + 1} από ${ids.length}.`);
    focusLater(`np-${ids[i]}-${dir < 0 ? "up" : "down"}`);
  };
  const remove = (i: number) => {
    const id = ids[i];
    onChange(ids.filter((x) => x !== id));
    setNote(`Αφαιρέθηκε: ${products[id]?.title ?? "προϊόν"}.`);
    focusLater(ids[i + 1] ? `np-${ids[i + 1]}-rm` : "np-search");
  };
  const add = (p: (typeof found)[number]) => {
    if (ids.includes(p.id) || ids.length >= MAX_PRODUCTS) return;
    onFound({ [p.id]: { title: p.title, brand: p.brand, price: p.price, image: p.image, listed: true } });
    onChange([...ids, p.id]);
    setNote(`Προστέθηκε: ${p.title}.`);
  };
  const shown = q.trim().length >= 2 ? found : [];
  return (
    <section data-help={dataHelp} className={card} aria-labelledby="np-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="np-h" className={h3}>Προϊόντα</h3>
        <span className={`tabular-nums text-[length:var(--fs-12)] ${ids.length >= MAX_PRODUCTS ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{ids.length}/{MAX_PRODUCTS}</span>
      </div>
      <p className={helpTxt}>Κάρτες με φωτογραφία και τιμή, 2 ανά σειρά (1 στο κινητό). Προτείνονται 4–6. Στην αποστολή οι τιμές ξαναδιαβάζονται.</p>
      {ids.length === 0 ? <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Χωρίς προϊόντα — το email δείχνει μόνο κεφαλίδα, κείμενο και κουμπί.</p> : (
        <ol className="m-0 p-0 list-none divide-y divide-eu-line rounded-lg border border-eu-line">
          {ids.map((id, i) => {
            const p = products[id];
            const sThumb = sx({ backgroundImage: p?.image ? `url("${p.image}")` : undefined });
            return (
              <li key={id} className="flex items-center gap-2 px-2 py-1.5 min-w-0">
                {sThumb.node}
                <span className="w-5 shrink-0 text-center tabular-nums text-eu-muted text-[length:var(--fs-12)]">{i + 1}</span>
                {p?.image ? <span className={`size-10 shrink-0 rounded-md border border-eu-line bg-white bg-center bg-contain bg-no-repeat ${sThumb.className}`} aria-hidden /> : <span className="size-10 shrink-0 rounded-md bg-eu-surface" aria-hidden />}
                <span className="grid min-w-0 flex-1 text-[length:var(--fs-13)]">
                  <span className="font-bold text-eu-ink break-words">{p ? p.title : "Άγνωστο προϊόν"}</span>
                  <span className="text-eu-muted text-[length:var(--fs-12)]">{p ? `${p.brand}${p.price ? ` · ${eur(p.price)}` : ""}` : id}</span>
                  {p && !p.listed && <span className="inline-flex items-center gap-1 text-eu-amber font-bold text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5" aria-hidden /> Δεν φαίνεται πια στο site — θα παραλειφθεί</span>}
                </span>
                <span className="flex shrink-0">
                  <button id={`np-${id}-up`} type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Πάνω: ${p?.title ?? id}`} className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
                  <button id={`np-${id}-down`} type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label={`Κάτω: ${p?.title ?? id}`} className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
                  <button id={`np-${id}-rm`} type="button" onClick={() => remove(i)} aria-label={`Αφαίρεση: ${p?.title ?? id}`} className={`${iconBtn} hover:!text-eu-red`}><X className="size-4" aria-hidden /></button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="grid gap-1.5">
        <label className="relative">
          <span className="sr-only">Αναζήτηση προϊόντος για προσθήκη</span>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
          <input id="np-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} disabled={ids.length >= MAX_PRODUCTS} placeholder={ids.length >= MAX_PRODUCTS ? `Έως ${MAX_PRODUCTS} προϊόντα` : "Προσθήκη: τίτλος, κωδικός ή EAN"} className={`${field} pl-8`} />
          {searching && q.trim().length >= 2 && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-eu-muted" aria-hidden />}
        </label>
        {q.trim().length >= 2 && !searching && shown.length === 0 && <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Κανένα προϊόν που φαίνεται στο site με αυτή την αναζήτηση.</p>}
        {shown.length > 0 && (
          <ul className="m-0 p-0 list-none grid gap-1 max-h-72 overflow-y-auto rounded-lg border border-eu-line bg-eu-surface/60 p-1.5">
            {shown.map((p) => {
              const has = ids.includes(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2 rounded-md bg-white border border-eu-line px-2 py-1 min-w-0">
                  <span className="grid min-w-0 flex-1 text-[length:var(--fs-13)]"><span className="font-bold text-eu-ink break-words">{p.title}</span><span className="text-eu-muted text-[length:var(--fs-12)]">{p.brand} · {eur(p.price)}{p.listPrice ? ` (αντί ${eur(p.listPrice)})` : ""}</span></span>
                  <button type="button" onClick={() => add(p)} disabled={has || ids.length >= MAX_PRODUCTS} className={`${btn} border border-eu-line bg-white hover:border-eu-navy shrink-0`}>{has ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {has ? "Υπάρχει" : "Προσθήκη"}</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{note}</p>
    </section>
  );
}

/** Δοκιμαστική αποστολή: πάντα στο email του χρήστη, προαιρετικά και σε συναδέλφους (μόνο ενεργό προσωπικό). */
function TestDialog({ id, me, staff, onClose, onDone }: { id: string; me: string; staff: { email: string; name: string }[]; onClose: () => void; onDone: (text: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const others = staff.filter((s) => s.email.toLowerCase() !== me.toLowerCase() && (!q.trim() || `${s.name} ${s.email}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 50);
  return (
    <Modal title="Δοκιμαστική αποστολή" onClose={onClose}>
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]">Στέλνεται ακριβώς όπως θα το λάβουν οι πελάτες, με θέμα «[ΔΟΚΙΜΗ] …». Ελέγξτε εικόνες, τιμές και συνδέσμους σε υπολογιστή και κινητό. Μετά τη δοκιμή ξεκλειδώνει η αποστολή.</p>
      <p className="m-0 inline-flex items-center gap-2 rounded-lg bg-eu-surface px-3 py-2 text-[length:var(--fs-14)]"><Check className="size-4 text-eu-green" aria-hidden /> Στο email σας: <strong className="break-all">{me}</strong></p>
      {staff.length > 1 && (
        <div className="grid gap-1.5">
          <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">Και σε συναδέλφους (προαιρετικά, έως 9)</span>
          <label className="relative"><span className="sr-only">Αναζήτηση συναδέλφου</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Όνομα ή email" className={`${field} pl-8`} /></label>
          <ul className="m-0 p-0 list-none grid gap-1 max-h-56 overflow-y-auto">
            {others.map((s) => (
              <li key={s.email}>
                <label className="flex items-center gap-2 rounded-md border border-eu-line px-2.5 py-1.5 cursor-pointer min-h-11 text-[length:var(--fs-13)]">
                  <input type="checkbox" checked={picked.includes(s.email)} disabled={!picked.includes(s.email) && picked.length >= 9} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.email] : p.filter((x) => x !== s.email)))} className="accent-eu-navy size-4 shrink-0" />
                  <span className="grid min-w-0"><span className="font-bold text-eu-ink">{s.name}</span><span className="text-eu-muted text-[length:var(--fs-12)] break-all">{s.email}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <p className={helpTxt}>Η δοκιμή πηγαίνει μόνο σε διευθύνσεις προσωπικού — ποτέ σε πελάτες.</p>
        </div>
      )}
      {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => {
          const r = await testSend(id, picked);
          if (!r.ok) { setErr(r.error); return; }
          onDone(`Η δοκιμή στάλθηκε σε ${1 + picked.length} ${picked.length ? "διευθύνσεις" : "διεύθυνση"}.`);
        })} className={primary}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Αποστολή δοκιμής</button>
        <button type="button" onClick={onClose} className={ghost}>Άκυρο</button>
      </div>
    </Modal>
  );
}

/** Επιλογή ημερομηνίας/ώρας (ώρα Ελλάδας) πριν από την επιβεβαίωση. */
function ScheduleDialog({ busy, error, onClose, onNext }: { busy: boolean; error: string | null; onClose: () => void; onNext: (at: string) => void }) {
  const [at, setAt] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    return `${athensLocal.fromDate(d).slice(0, 10)}T10:00`;
  });
  const [bounds] = useState(() => ({ min: athensLocal.fromDate(new Date(Date.now() + 6 * 60_000)), max: athensLocal.fromDate(new Date(Date.now() + 30 * 86_400_000)) }));
  return (
    <Modal title="Προγραμματισμός αποστολής" onClose={onClose}>
      <label className="grid gap-1">
        <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">Ημερομηνία και ώρα (ώρα Ελλάδας)</span>
        <input type="datetime-local" value={at} min={bounds.min} max={bounds.max} onChange={(e) => setAt(e.target.value)} className={field} />
        <span className={helpTxt}>Από 5 λεπτά έως 30 ημέρες μπροστά. Καλύτερες ώρες: 10:00–13:00 ή 18:00–20:00· αποφύγετε 22:00–08:00.</span>
      </label>
      {error && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !at} onClick={() => onNext(at)} className={primary}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />} Συνέχεια</button>
        <button type="button" onClick={onClose} className={ghost}>Άκυρο</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- μετά την αποστολή

/**
 * Κατάσταση και ενέργειες για newsletter που δεν είναι πια πρόχειρο: Ακύρωση (προγραμματισμένο), Διακοπή (σε αποστολή / παύση),
 * Συνέχεια (παύση με παραλήπτες στην ουρά — ή πριν την έναρξη, μόνο με το περιεχόμενο της δοκιμής), Αντίγραφο (πάντα — νέο πρόχειρο για νέα αποστολή). Όσο στέλνεται, ανανεώνεται μόνο του.
 */
export function NewsletterControls({ id, status, scheduledAt, reason, resumable, resumeNote, queued, "data-help": dataHelp }: { id: string; status: string; scheduledAt: string | null; reason: string | null; resumable: boolean; resumeNote?: string | null; queued: number; "data-help"?: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState<null | "cancel" | "stop" | "resume">(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const st = NEWSLETTER_STATUS[status] ?? { label: status, tone: "neutral", help: "" };

  useEffect(() => {
    if (status !== "sending" && status !== "scheduled") return;
    const t = setInterval(() => router.refresh(), status === "sending" ? 15_000 : 60_000);
    return () => clearInterval(t);
  }, [status, router]);

  const TEXT = {
    cancel: "Ακύρωση: το newsletter δεν θα σταλεί. Για αλλαγές και νέο προγραμματισμό φτιάξτε «Αντίγραφο».",
    stop: `Διακοπή: όσοι δεν έχουν λάβει ακόμη το email${queued ? ` (${queued.toLocaleString("el-GR")})` : ""} δεν θα το λάβουν. Δεν αναιρείται.`,
    resume: `Συνέχεια: στέλνεται σε όσους είναι ακόμη στην ουρά${queued ? ` (${queued.toLocaleString("el-GR")})` : ""}. Όσοι το έλαβαν ήδη δεν το ξαναλαμβάνουν.`,
  };
  const LABEL = { cancel: "Ακύρωση αποστολής", stop: "Διακοπή", resume: "Συνέχεια" };
  const run = (a: "cancel" | "stop" | "resume") => start(async () => {
    const r = a === "cancel" ? await cancel(id) : a === "stop" ? await stop(id) : await resume(id);
    if (!r.ok) { setErr(r.error); return; }
    setAsk(null); setErr(null); router.refresh();
  });
  const copy = () => start(async () => {
    const r = await duplicate(id);
    if (!r.ok) { setErr(r.error); return; }
    router.push(`/admin/prosfores/newsletter/${r.id}`);
  });
  const toneCls = st.tone === "warn" ? "border-eu-amber/50 bg-eu-amber/5" : st.tone === "bad" ? "border-eu-red/30 bg-eu-red/5" : st.tone === "good" ? "border-eu-green/30 bg-eu-green/5" : "border-eu-line bg-white";
  return (
    <section data-help={dataHelp} aria-label="Κατάσταση αποστολής" className={`grid gap-2 rounded-2xl border p-3 @md:p-4 ${toneCls}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5 min-w-0">
          <p className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{st.label}{status === "scheduled" && scheduledAt ? ` · ${athensText(scheduledAt)}` : ""}</p>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">
            {status === "scheduled" ? "Θα σταλεί αυτόματα (ώρα Ελλάδας). Το περιεχόμενο δεν αλλάζει πια — για αλλαγές: «Ακύρωση αποστολής» και μετά «Αντίγραφο»."
              : status === "sending" ? "Στέλνεται σε πακέτα κάθε λεπτό· η σελίδα ανανεώνεται μόνη της."
              : status === "paused" ? <>Η αποστολή σταμάτησε: <strong className="text-eu-ink-2">{reason ?? "άγνωστος λόγος"}</strong>{resumable ? "" : ` — ${(resumeNote ?? "Δεν έμεινε κανείς στην ουρά").replace(/[.\s]+$/, "")}· «Διακοπή» για να κλείσει.`}</>
              : status === "cancelled" ? <>Δεν στάλθηκε (ή διακόπηκε){reason ? <>: <strong className="text-eu-ink-2">{reason}</strong></> : "."} Για νέα αποστολή: «Αντίγραφο».</>
              : "Ολοκληρώθηκε. Κάθε newsletter στέλνεται μία φορά — για νέα αποστολή: «Αντίγραφο»."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {status === "paused" && resumable && <button type="button" onClick={() => setAsk("resume")} className={ghost}><Play className="size-4" aria-hidden /> Συνέχεια</button>}
          {status === "scheduled" && <button type="button" onClick={() => setAsk("cancel")} className={`${ghost} hover:!border-eu-red hover:text-eu-red`}><X className="size-4" aria-hidden /> Ακύρωση αποστολής</button>}
          {(status === "sending" || status === "paused") && <button type="button" onClick={() => setAsk("stop")} className={`${ghost} hover:!border-eu-red hover:text-eu-red`}>{status === "sending" ? <Pause className="size-4" aria-hidden /> : <Square className="size-4" aria-hidden />} Διακοπή</button>}
          <button type="button" onClick={copy} disabled={pending} className={ghost}>{pending && !ask ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Copy className="size-4" aria-hidden />} Αντίγραφο</button>
        </div>
      </div>
      {ask && (
        <div className="grid gap-2 rounded-lg bg-white border border-eu-line p-2.5">
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)]">{TEXT[ask]}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={pending} onClick={() => run(ask)} className={`${btn} ${ask === "resume" ? "bg-eu-navy" : "bg-eu-red"} text-white`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {LABEL[ask]}</button>
            <button type="button" onClick={() => setAsk(null)} className={ghost}>Πίσω</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">{err}</p>}
    </section>
  );
}
