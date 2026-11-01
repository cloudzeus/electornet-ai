"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Dialog as D } from "@base-ui/react/dialog";
import { Building2, Check, CheckCircle2, Loader2, Search, Sparkles, X } from "lucide-react";
import { interestLookup, interestSubmit } from "@/app/synergaton/actions";
import { INTEREST_BANKS, INTEREST_ERP, INTEREST_ESHOP, INTEREST_KINDS, INTEREST_METHODS, suggestMethod, type Opt } from "@/lib/partner-portal/interest-options";
import { btn, Callout, focusRing } from "./ui";
import { Field, inputCls, ProgressLine } from "./wizard";

const STEPS = [
  { key: "afm", title: "Η επιχείρησή σας", hint: "Ψάχνουμε τον ΑΦΜ στα μέλη της Euronics." },
  { key: "contact", title: "Στοιχεία επαφής", hint: "Σε ποιον να μιλήσουμε για τη σύνδεση." },
  { key: "kinds", title: "Τι θέλετε να συνδέσετε", hint: "Διαλέξτε όσα σας ενδιαφέρουν." },
  { key: "systems", title: "Τα συστήματά σας", hint: "Τράπεζες, ERP και eshop που χρησιμοποιείτε." },
  { key: "method", title: "Τρόπος διασύνδεσης", hint: "Πώς θα φτάνει το απόθεμά σας σε εμάς." },
] as const;

type Form = { afm: string; businessName: string; contactName: string; email: string; phone: string; kinds: string[]; banks: string[]; erp: string; eshop: string; method: string; notes: string; website: string };
const EMPTY: Form = { afm: "", businessName: "", contactName: "", email: "", phone: "", kinds: [], banks: [], erp: "", eshop: "", method: "", notes: "", website: "" };

/**
 * «Εκδήλωση ενδιαφέροντος»: κουμπί που ανοίγει modal-wizard 5 βημάτων (ΑΦΜ → επαφή → είδος → συστήματα → τρόπος).
 * Ο έλεγχος ΑΦΜ λέει μόνο αν είναι μέλος και την επωνυμία. Η αίτηση αποθηκεύεται και φαίνεται στη διαχείριση.
 */
export function InterestButton({ className, children }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? btn("brand", "lg")}>
        {children ?? <><Sparkles className="size-5" aria-hidden /> Εκδήλωση ενδιαφέροντος</>}
      </button>
      <InterestModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function InterestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [cur, setCur] = useState(0);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [member, setMember] = useState<{ checked: string; name: string | null } | null>(null);
  const [sent, setSent] = useState<{ member: boolean } | null>(null);
  const [pending, start] = useTransition();
  const head = useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => { const rest = { ...e }; delete rest[k]; return rest; }); };
  const afmDigits = f.afm.replace(/\D/g, "");
  const checked = member?.checked === afmDigits;
  const suggested = suggestMethod(f.erp, f.eshop);

  useEffect(() => { head.current?.focus(); }, [cur, sent]);
  const reset = () => { setF(EMPTY); setCur(0); setErrs({}); setErr(null); setMember(null); setSent(null); };
  const close = () => { if (pending) return; onClose(); if (sent) setTimeout(reset, 250); };

  const lookup = () => start(async () => {
    setErr(null);
    const r = await interestLookup(f.afm);
    if (!r.ok) { setErrs({ afm: r.error }); setMember(null); return; }
    setMember({ checked: r.afm, name: r.member?.name ?? null });
  });

  /** έλεγχοι του τρέχοντος βήματος (ίδιοι κανόνες με τον server) */
  function stepErrors(i: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (i === 0) {
      if (!checked) e.afm = "Πατήστε «Αναζήτηση» για να ελέγξουμε τον ΑΦΜ.";
      else if (!member?.name && f.businessName.trim().length < 2) e.businessName = "Γράψτε την επωνυμία της επιχείρησης.";
    }
    if (i === 1) {
      if (f.contactName.trim().length < 3) e.contactName = "Γράψτε ονοματεπώνυμο.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Γράψτε ένα έγκυρο email.";
      if (!/^\d{10,14}$/.test(f.phone.replace(/[\s()+-]/g, ""))) e.phone = "Γράψτε τηλέφωνο με 10 ψηφία.";
    }
    if (i === 2 && !f.kinds.length) e.kinds = "Διαλέξτε τουλάχιστον ένα.";
    if (i === 3) { if (!f.erp) e.erp = "Διαλέξτε σύστημα."; if (!f.eshop) e.eshop = "Διαλέξτε απάντηση."; }
    if (i === 4 && !f.method) e.method = "Διαλέξτε τρόπο.";
    return e;
  }
  const next = () => {
    const e = stepErrors(cur);
    setErrs(e);
    if (Object.keys(e).length) return;
    if (cur < STEPS.length - 1) { if (cur === 3 && !f.method) set("method", suggested); setCur(cur + 1); return; }
    start(async () => {
      setErr(null);
      const r = await interestSubmit(f);
      if (!r.ok) {
        setErr(r.error);
        if (r.fields) { setErrs(r.fields); setCur(Math.min(...Object.keys(r.fields).map((k) => FIELD_STEP[k] ?? cur))); }
        return;
      }
      setSent({ member: r.member });
    });
  };

  const step = STEPS[cur];
  return (
    <D.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-[60] bg-eu-navy/55 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <D.Popup className="fixed z-[60] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[min(40rem,calc(100vw-2rem))] max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl outline-none overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 sm:data-open:zoom-in-95 motion-reduce:animate-none">
          <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-eu-line">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-eu-blue font-bold uppercase tracking-wide text-[length:var(--fs-12)]">Εκδήλωση ενδιαφέροντος{!sent && ` · Βήμα ${cur + 1} από ${STEPS.length}`}</p>
              <D.Title ref={head} tabIndex={-1} className="m-0 mt-0.5 font-heading font-extrabold text-eu-ink text-[length:var(--fs-22)] leading-tight outline-none">{sent ? "Ευχαριστούμε!" : step.title}</D.Title>
              {!sent && <D.Description className="m-0 mt-0.5 text-eu-ink-3 text-[length:var(--fs-14)]">{step.hint}</D.Description>}
            </div>
            <D.Close disabled={pending} className={`grid place-items-center size-11 -mr-2 -mt-1 rounded-full text-eu-ink-3 hover:bg-eu-chip shrink-0 ${focusRing}`} aria-label="Κλείσιμο"><X className="size-5" aria-hidden /></D.Close>
          </div>
          {!sent && <div className="px-5 pt-3"><ProgressLine pct={((cur + 1) / STEPS.length) * 100} /></div>}

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {err && <div className="mb-4"><Callout tone="bad">{err}</Callout></div>}
            {sent ? (
              <div className="grid gap-4 justify-items-center text-center py-4">
                <span className="grid place-items-center size-16 rounded-full bg-eu-green text-white animate-in zoom-in-50 duration-300 motion-reduce:animate-none"><CheckCircle2 className="size-9" aria-hidden /></span>
                <p className="m-0 text-eu-ink text-[length:var(--fs-16)] max-w-[34rem]">Λάβαμε την αίτησή σας. Ο υπεύθυνος συνεργατών της Euronics θα επικοινωνήσει μαζί σας στο <b>{f.email}</b> ή στο <b>{f.phone}</b> για τα επόμενα βήματα της διασύνδεσης.</p>
                {!sent.member && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[34rem]">Ο ΑΦΜ δεν είναι ακόμη στα μέλη· θα σας μιλήσουμε πρώτα για την ένταξη στο δίκτυο.</p>}
              </div>
            ) : cur === 0 ? (
              <div className="grid gap-4">
                <Field id="int-afm" label="ΑΦΜ επιχείρησης" required error={errs.afm} help="9 ψηφία, χωρίς EL.">
                  <div className="flex gap-2 min-w-0">
                    <input id="int-afm" inputMode="numeric" autoComplete="off" maxLength={11} value={f.afm} onChange={(e) => { set("afm", e.target.value); setMember(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }} aria-invalid={!!errs.afm} aria-describedby={errs.afm ? "int-afm-err" : "int-afm-help"} placeholder="π.χ. 094012345" className={`${inputCls(!!errs.afm)} tabular-nums tracking-wider`} />
                    <button type="button" onClick={lookup} disabled={pending || afmDigits.length !== 9} className={`${btn("primary")} shrink-0`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}<span>Αναζήτηση</span></button>
                  </div>
                </Field>
                <div aria-live="polite">
                  {checked && member?.name && (
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-eu-green/40 bg-[#f1faf3] p-3.5 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
                      <span className="grid place-items-center size-10 rounded-xl bg-eu-green text-white shrink-0"><Building2 className="size-5" aria-hidden /></span>
                      <span className="min-w-0"><span className="block text-eu-ink-3 text-[length:var(--fs-12)] font-bold">Μέλος Euronics</span><span className="block font-bold text-eu-ink text-[length:var(--fs-15)] break-words">{member.name}</span></span>
                    </div>
                  )}
                  {checked && !member?.name && (
                    <div className="grid gap-3 animate-in fade-in-0 motion-reduce:animate-none">
                      <Callout tone="info" title="Ο ΑΦΜ δεν είναι στα μέλη">Μπορείτε να συνεχίσετε· θα σας μιλήσουμε πρώτα για την ένταξη στο δίκτυο Euronics.</Callout>
                      <Field id="int-name" label="Επωνυμία επιχείρησης" required error={errs.businessName}>
                        <input id="int-name" autoComplete="organization" value={f.businessName} onChange={(e) => set("businessName", e.target.value)} aria-invalid={!!errs.businessName} className={inputCls(!!errs.businessName)} />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            ) : cur === 1 ? (
              <div className="grid gap-4">
                <Field id="int-contact" label="Ονοματεπώνυμο" required error={errs.contactName}>
                  <input id="int-contact" autoComplete="name" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} aria-invalid={!!errs.contactName} className={inputCls(!!errs.contactName)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="int-email" label="Email" required error={errs.email}>
                    <input id="int-email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errs.email} className={inputCls(!!errs.email)} />
                  </Field>
                  <Field id="int-phone" label="Τηλέφωνο" required error={errs.phone}>
                    <input id="int-phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errs.phone} className={inputCls(!!errs.phone)} />
                  </Field>
                </div>
                {/* honeypot */}
                <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden"><input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} name="website" /></div>
              </div>
            ) : cur === 2 ? (
              <Choices legend="Είδος διασύνδεσης" multi opts={INTEREST_KINDS} value={f.kinds} onChange={(v) => set("kinds", v)} error={errs.kinds} />
            ) : cur === 3 ? (
              <div className="grid gap-6">
                <Choices legend="Τράπεζες ή πάροχοι πληρωμών (POS, e-commerce)" help="Προαιρετικό· διαλέξτε όσα ισχύουν." multi opts={INTEREST_BANKS} value={f.banks} onChange={(v) => set("banks", v)} />
                <Choices legend="ERP: πού κρατάτε αποθήκη και τιμολόγηση" opts={INTEREST_ERP} value={f.erp ? [f.erp] : []} onChange={(v) => set("erp", v[0] ?? "")} error={errs.erp} />
                <Choices legend="Πλατφόρμα ηλεκτρονικού εμπορίου" opts={INTEREST_ESHOP} value={f.eshop ? [f.eshop] : []} onChange={(v) => set("eshop", v[0] ?? "")} error={errs.eshop} />
              </div>
            ) : (
              <div className="grid gap-5">
                <Choices legend="Τρόπος διασύνδεσης" opts={INTEREST_METHODS} value={f.method ? [f.method] : []} onChange={(v) => set("method", v[0] ?? "")} error={errs.method} recommended={suggested} cols={1} />
                <Field id="int-notes" label="Κάτι ακόμη που θέλετε να ξέρουμε" counter={`${f.notes.length}/2000`}>
                  <textarea id="int-notes" rows={3} maxLength={2000} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputCls()} py-2.5 min-h-24`} placeholder="π.χ. πόσα καταστήματα έχετε, ποιος είναι ο τεχνικός σας" />
                </Field>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t border-eu-line bg-eu-surface pb-[max(1rem,env(safe-area-inset-bottom))]">
            {sent ? <button type="button" onClick={close} className={`${btn("primary")} ml-auto`}>Κλείσιμο</button> : (
              <>
                <button type="button" onClick={() => setCur(cur - 1)} disabled={!cur || pending} className={`${btn("ghost")} ${cur ? "" : "invisible"}`}>Πίσω</button>
                <button type="button" onClick={next} disabled={pending} className={btn(cur === STEPS.length - 1 ? "brand" : "primary")}>
                  {pending && cur === STEPS.length - 1 && <Loader2 className="size-4 animate-spin" aria-hidden />}{cur === STEPS.length - 1 ? "Αποστολή" : "Συνέχεια"}
                </button>
              </>
            )}
          </div>
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}

const FIELD_STEP: Record<string, number> = { afm: 0, businessName: 0, contactName: 1, email: 1, phone: 1, kinds: 2, erp: 3, eshop: 3, method: 4 };

function Choices({ legend, help, opts, value, onChange, multi, error, recommended, cols = 2 }: { legend: string; help?: string; opts: Opt[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean; error?: string; recommended?: string; cols?: 1 | 2 }) {
  const id = `int-${legend.length}-${opts[0]?.value}`;
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-2.5 min-w-0" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-2">{legend}</legend>
      {help && <p className="m-0 -mt-1 text-eu-ink-3 text-[length:var(--fs-13)]">{help}</p>}
      <div className={`grid gap-2 ${cols === 2 ? "sm:grid-cols-2" : ""}`}>
        {opts.map((o) => {
          const on = value.includes(o.value);
          // πολλαπλή: το «Κανένα» αποκλείει τα υπόλοιπα και αντίστροφα
          const toggle = () => { if (!multi) return onChange([o.value]); const solo = o.value.startsWith("no-"); onChange(on ? value.filter((v) => v !== o.value) : solo ? [o.value] : [...value.filter((v) => !v.startsWith("no-")), o.value]); };
          return (
            <label key={o.value} className={`relative flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 min-h-14 cursor-pointer transition-colors duration-150 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-eu-blue/40 ${on ? "border-eu-navy bg-eu-chip" : error ? "border-[#e0786e] bg-white" : "border-eu-line bg-white hover:border-eu-muted-3"}`}>
              <input type={multi ? "checkbox" : "radio"} name={id} value={o.value} checked={on} onChange={toggle} className="sr-only" />
              {multi
                ? <span className={`grid place-items-center size-5 rounded-md border-2 shrink-0 ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-muted-3"}`} aria-hidden>{on && <Check className="size-3.5" />}</span>
                : <span className={`grid place-items-center size-5 rounded-full border-2 shrink-0 ${on ? "border-eu-navy" : "border-eu-muted-3"}`} aria-hidden>{on && <span className="size-2.5 rounded-full bg-eu-navy" />}</span>}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-[length:var(--fs-14)] text-eu-ink">{o.label}{recommended === o.value && <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow text-eu-navy px-2 py-0.5 text-[length:var(--fs-11)] font-extrabold"><Sparkles className="size-3" aria-hidden />Σας ταιριάζει</span>}</span>
                {o.hint && <span className="block text-eu-ink-3 text-[length:var(--fs-12)] leading-snug">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && <p id={`${id}-err`} role="alert" className="m-0 text-[#b3261e] text-[length:var(--fs-13)] font-bold">{error}</p>}
    </fieldset>
  );
}
