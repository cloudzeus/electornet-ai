"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, Download, Plus, Printer, Undo2, User } from "lucide-react";
import { recordConsentByEmail } from "@/app/admin/(shell)/gdpr/actions";
import { CHANNEL_LABEL, METHOD_LABEL, SOURCE_LABEL, STAFF_METHODS, STAFF_TOPICS, TOPIC_LABEL, label as nameOf, textKeyForTopic } from "@/lib/gdpr/topics";

export type LedgerRow = { id: string; at: string; email: string | null; customer: { id: string; name: string } | null; topic: string; channel: string; granted: boolean; method: string; source: string; staff: boolean; by: string | null; note: string | null; shown: string | null; textTitle: string | null; textVersion: string | null; textHash: string | null; ip: string | null; device: string; url: string | null; confirmedAt: string | null };
type Form = { email: string; topic: string; channel: string; granted: boolean; method: string; note: string };
const EMPTY: Form = { email: "", topic: "newsletter", channel: "email", granted: true, method: "store-form", note: "" };
const dt = (s: string) => new Date(s).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue bg-white w-full aria-[invalid=true]:border-eu-red";
const lab = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)] content-start";
const btn = "inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50";
const btn2 = "inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-line px-3.5 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50";
const COLS = "@3xl:grid-cols-[112px_minmax(0,1.5fr)_minmax(0,1fr)_104px_minmax(0,1fr)_20px]";

function FieldError({ err, f }: { err: { field: string; error: string } | null; f: string }) {
  return err?.field === f ? <span role="alert" className="font-normal text-eu-red text-[length:var(--fs-13)]">{err.error}</span> : null;
}

/** Μητρώο συναινέσεων: λίστα με αποδεικτικά ανά γραμμή και καταγραφή συναίνεσης ή ανάκλησης που δηλώθηκε εκτός site. */
export function ConsentLedger({ rows, total, textInForce, canWrite, canExport, exportHref }: { rows: LedgerRow[]; total: number; textInForce: Record<string, { title: string; version: string }>; canWrite: boolean; canExport: boolean; exportHref: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState<{ field: string; error: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const open = (f: Form) => { setForm(f); setErr(null); setMsg(null); requestAnimationFrame(() => { box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); box.current?.querySelector<HTMLElement>(f.email ? "#cf-method" : "#cf-email")?.focus(); }); };
  const set = (p: Partial<Form>) => { setForm((f) => (f ? { ...f, ...p } : f)); setErr(null); };
  const channels = STAFF_TOPICS.find((t) => t.topic === form?.topic)?.channels ?? [];
  const text = form ? textInForce[textKeyForTopic(form.topic) ?? ""] : undefined;
  const save = () => form && start(async () => {
    const r = await recordConsentByEmail(form);
    if (!r.ok) { setErr(r); document.getElementById(`cf-${r.field}`)?.focus(); return; }
    setMsg(`${form.granted ? "Η συναίνεση" : "Η ανάκληση"} καταγράφηκε για ${form.email.trim().toLowerCase()}${r.linked ? " και φαίνεται στην καρτέλα του πελάτη" : " (δεν έχει λογαριασμό)"}.`);
    setForm(null);
  });
  return (
    <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Μητρώο συναινέσεων</h3>
        <div className="flex flex-wrap gap-2">
          {canExport && <a href={exportHref} data-help="gdpr.export" className={btn2}><Download className="size-4" aria-hidden /> Εξαγωγή CSV</a>}
          {canWrite && <button type="button" data-help="gdpr.record" onClick={() => open(EMPTY)} className={btn}><Plus className="size-4" aria-hidden /> Καταγραφή συναίνεσης</button>}
        </div>
      </div>
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-14)] px-3 py-2 flex items-center gap-2"><Check className="size-4 shrink-0" aria-hidden /> {msg}</p>}
      {form && (
        <div ref={box} className="rounded-2xl border-2 border-eu-blue p-4 grid gap-3 scroll-mt-24">
          <div><div className="font-bold text-eu-ink text-[length:var(--fs-16)]">{form.granted ? "Καταγραφή συναίνεσης" : "Καταγραφή ανάκλησης"}</div><p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Για ό,τι δηλώθηκε εκτός site: έντυπη φόρμα, τηλέφωνο ή επιστολή. Μπαίνει νέα γραμμή στο μητρώο με το όνομά σου.</p></div>
          <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-3">
            <label className={lab}>Email του ανθρώπου<input id="cf-email" type="email" autoComplete="off" placeholder="onoma@example.gr" value={form.email} aria-invalid={err?.field === "email"} onChange={(e) => set({ email: e.target.value })} className={field} /><FieldError err={err} f="email" /></label>
            <label className={lab}>Θέμα<select id="cf-topic" value={form.topic} aria-invalid={err?.field === "topic"} onChange={(e) => { const t = STAFF_TOPICS.find((x) => x.topic === e.target.value)!; set({ topic: t.topic, channel: t.channels.includes(form.channel) ? form.channel : t.channels[0] }); }} className={field}>{STAFF_TOPICS.map((t) => <option key={t.topic} value={t.topic}>{nameOf(TOPIC_LABEL, t.topic)}</option>)}</select><FieldError err={err} f="topic" /></label>
            <label className={lab}>Κανάλι<select value={form.channel} onChange={(e) => set({ channel: e.target.value })} className={field}>{channels.map((c) => <option key={c} value={c}>{nameOf(CHANNEL_LABEL, c)}</option>)}</select></label>
            <label className={lab}>Απόφαση<select value={form.granted ? "1" : "0"} onChange={(e) => set({ granted: e.target.value === "1" })} className={field}><option value="1">Έδωσε συναίνεση</option><option value="0">Την ανακάλεσε</option></select></label>
            <label className={lab}>Πώς τη δήλωσε<select id="cf-method" value={form.method} aria-invalid={err?.field === "method"} onChange={(e) => set({ method: e.target.value })} className={field}>{STAFF_METHODS.map((m) => <option key={m} value={m}>{nameOf(METHOD_LABEL, m)}</option>)}</select><FieldError err={err} f="method" /></label>
            <label className={lab}>Πού βρίσκεται το αποδεικτικό<input id="cf-note" value={form.note} maxLength={500} placeholder="φόρμα αρ. 214, κατάστημα Χαλανδρίου" aria-invalid={err?.field === "note"} onChange={(e) => set({ note: e.target.value })} className={field} /><FieldError err={err} f="note" /></label>
          </div>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{text ? <>Θα δεθεί με το κείμενο «{text.title}», έκδοση {text.version}.</> : "Αυτό το θέμα δεν έχει δικό του κείμενο συναίνεσης."}{form.topic === "newsletter" && <> {form.granted ? "Μπαίνει στους συνδρομητές χωρίς email επιβεβαίωσης." : "Βγαίνει από τους συνδρομητές και δεν λαμβάνει άλλα newsletter."}</>}</p>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={save} className={btn}><Check className="size-4" aria-hidden /> {pending ? "Καταγραφή…" : "Καταγραφή στο μητρώο"}</button><button type="button" onClick={() => setForm(null)} className={btn2}>Άκυρο</button></div>
        </div>
      )}
      <div data-help="gdpr.ledger" className="grid min-w-0">
        <div aria-hidden className={`hidden @3xl:grid ${COLS} gap-x-3 pb-2 font-bold text-eu-muted text-[length:var(--fs-13)]`}><span>Πότε</span><span>Ποιος</span><span>Θέμα και κανάλι</span><span>Απόφαση</span><span>Πώς</span><span /></div>
        <ul className="m-0 p-0 list-none">
          {rows.map((r) => { const staffCan = canWrite && r.granted && !!r.email && STAFF_TOPICS.some((t) => t.topic === r.topic && t.channels.includes(r.channel)); return (
            <li key={r.id} className="border-t border-eu-line-2">
              <details className="group">
                <summary className={`grid grid-cols-[minmax(0,1fr)_auto] ${COLS} gap-x-3 gap-y-0.5 items-center py-2.5 min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden rounded-lg hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue text-[length:var(--fs-14)]`}>
                  <span className="min-w-0 @3xl:order-2"><span className="block truncate font-bold text-eu-ink">{r.email ?? r.customer?.name ?? "Επισκέπτης χωρίς λογαριασμό"}</span><span className="block truncate text-eu-muted text-[length:var(--fs-13)]">{r.customer ? r.customer.name : r.email ? "χωρίς λογαριασμό" : "ταυτοποίηση με συσκευή"}</span></span>
                  <span className="@3xl:order-4"><span className={`inline-block rounded-full px-2.5 py-0.5 font-bold text-[length:var(--fs-13)] ${r.granted ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{r.granted ? "Συναίνεση" : "Ανάκληση"}</span></span>
                  <span className="min-w-0 truncate text-eu-ink-2 @3xl:order-3">{nameOf(TOPIC_LABEL, r.topic)} · {nameOf(CHANNEL_LABEL, r.channel)}</span>
                  <span className="tabular-nums text-eu-muted @3xl:text-eu-ink-2 text-[length:var(--fs-13)] @3xl:order-1 justify-self-end @3xl:justify-self-start">{dt(r.at)}</span>
                  <span className="hidden @3xl:block min-w-0 @3xl:order-5"><span className="block truncate text-eu-ink-2">{nameOf(METHOD_LABEL, r.method)}</span><span className="block truncate text-eu-muted text-[length:var(--fs-13)]">{nameOf(SOURCE_LABEL, r.source)}{r.staff ? " · από προσωπικό" : ""}</span></span>
                  <ChevronDown className="hidden @3xl:block size-4 text-eu-muted group-open:rotate-180 @3xl:order-6" aria-hidden />
                </summary>
                <div className="rounded-xl bg-eu-surface p-3 mb-2.5 grid gap-3 text-[length:var(--fs-14)]">
                  <dl className="m-0 grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-x-4 gap-y-2 [&_dt]:text-eu-muted [&_dt]:text-[length:var(--fs-13)] [&_dd]:m-0 [&_dd]:text-eu-ink [&_dd]:break-words">
                    <div><dt>Κείμενο που ίσχυε</dt><dd>{r.textTitle ? `${r.textTitle}, έκδοση ${r.textVersion}` : r.textHash ? "Το κείμενο της οθόνης (βλ. παρακάτω)" : <span className="text-eu-amber font-bold">Δεν κρατήθηκε κείμενο</span>}</dd></div>
                    <div><dt>Πώς δηλώθηκε</dt><dd>{nameOf(METHOD_LABEL, r.method)} · {nameOf(SOURCE_LABEL, r.source)}{r.by ? ` · ${r.by}` : r.staff ? " · από προσωπικό" : ""}{r.confirmedAt ? ` · επιβεβαίωση ${dt(r.confirmedAt)}` : ""}</dd></div>
                    <div><dt>{r.staff ? "Συσκευή του υπαλλήλου" : "Συσκευή"}</dt><dd>{r.device || "—"}</dd></div>
                    <div><dt>{r.staff ? "IP του υπαλλήλου" : "IP"}</dt><dd className="font-mono text-[length:var(--fs-13)]">{r.ip ?? "—"}</dd></div>
                    {r.url && <div className="@xl:col-span-2"><dt>Σελίδα</dt><dd className="break-all">{r.url}</dd></div>}
                    {r.note && <div className="@xl:col-span-2"><dt>Πού βρίσκεται το αποδεικτικό</dt><dd>{r.note}</dd></div>}
                    {r.shown && <div className="@xl:col-span-2 @4xl:col-span-4"><dt>Κείμενο όπως φάνηκε στην οθόνη</dt><dd>{r.shown}</dd></div>}
                    {r.textHash && <div className="@xl:col-span-2 @4xl:col-span-4"><dt>Αποτύπωμα κειμένου (sha256)</dt><dd className="font-mono text-[length:var(--fs-13)] break-all">{r.textHash}</dd></div>}
                  </dl>
                  {(r.customer || staffCan) && <div className="flex flex-wrap gap-2">
                    {r.customer && <Link href={`/admin/customers/${r.customer.id}?tab=consents`} className={`${btn2} bg-white`}><User className="size-4" aria-hidden /> Καρτέλα πελάτη</Link>}
                    {r.customer && canExport && <Link href={`/admin/customers/${r.customer.id}/consent-proof`} target="_blank" className={`${btn2} bg-white`}><Printer className="size-4" aria-hidden /> Απόδειξη για εκτύπωση</Link>}
                    {staffCan && <button type="button" onClick={() => open({ email: r.email!, topic: r.topic, channel: r.channel, granted: false, method: "phone", note: "" })} className={`${btn2} bg-white`}><Undo2 className="size-4" aria-hidden /> Ανάκληση εκ μέρους του</button>}
                  </div>}
                </div>
              </details>
            </li>
          ); })}
          {!rows.length && <li className="border-t border-eu-line-2 py-6 text-eu-muted text-[length:var(--fs-14)]">{total ? "Καμία εγγραφή σε αυτή τη σελίδα." : "Καμία εγγραφή με αυτά τα φίλτρα. Καθάρισε τα φίλτρα για να δεις όλο το μητρώο."}</li>}
        </ul>
      </div>
    </section>
  );
}
