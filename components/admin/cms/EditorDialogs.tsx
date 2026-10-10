"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import QRCode from "qrcode";
import {
  ArrowDownUp, CalendarClock, Check, CircleAlert, Copy, History, Keyboard, Loader2, Minus, Pencil, Plus, QrCode, Rocket, Send, Trash2, Undo2, X,
} from "lucide-react";
import type { ListChange } from "@/lib/cms/list-diff";
import type { HomeHealth } from "@/lib/cms/home-health";
import type { PublishEntry, Review, Scenario } from "@/lib/cms/doc-plans";
import type { Issue } from "@/lib/cms/brand-store-check";
import { deleteScenarioAction, historyAction, plansAction, previewLinkAction, saveScenarioAction, scheduleScenarioAction, type PlanRef } from "@/app/admin/(shell)/cms/plans-actions";
import { DateTime } from "./brand/fields";

const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const btn = "inline-flex items-center justify-center gap-2 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue font-extrabold`;
const ghost = `${btn} border-2 border-eu-line text-eu-ink-2 hover:border-eu-navy`;

/** Παράθυρο (native dialog): Esc και κουμπί κλεισίματος, κύλιση μόνο στο σώμα, πλήρες πλάτος σε κινητό. */
export function Modal({ title, icon, onClose, children, footer, wide }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // χωρίς close() στο cleanup: στο StrictMode θα έκλεινε αμέσως (το event close → onClose)· στο unmount φεύγει μόνο του
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-label={title} className={`m-auto ${wide ? "w-[min(60rem,calc(100vw-1rem))]" : "w-[min(40rem,calc(100vw-1rem))]"} max-h-[calc(100dvh-1rem)] rounded-2xl p-0 backdrop:bg-black/50 bg-white @container`}>
      <div className="grid grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-1rem)]">
        <div className="flex items-center gap-2 px-4 min-h-14 border-b border-eu-line">
          {icon}
          <h2 className="m-0 flex-1 min-w-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="overflow-y-auto p-4 grid gap-4 content-start">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-eu-line bg-white">{footer}</div>}
      </div>
    </dialog>
  );
}

/**
 * Κοινά παράθυρα των editors σελίδων (αρχική, σελίδες μαρκών): έλεγχος & δημοσίευση, σενάρια, ιστορικό,
 * σύνδεσμος/QR προεπισκόπησης, πλήκτρα. Η σελίδα δίνει τα ονόματα (`noun`) και πώς μετρά διαφορές.
 */
export type Noun = { the: string; of: string; order: string };

const defaultIssueKey = (e: Issue) => (e.anchor?.startsWith("blk-") ? `blk:${e.anchor.slice(4)}` : "");

/* ---------------- δημοσίευση: τι αλλάζει, έλεγχοι, τώρα / αργότερα / για έγκριση ---------------- */
const CH: Record<ListChange<unknown>["type"], { t: string; I: typeof Plus; c: string }> = {
  added: { t: "Νέο", I: Plus, c: "bg-eu-green/15 text-eu-green" },
  removed: { t: "Αφαιρέθηκε", I: Minus, c: "bg-eu-red/10 text-eu-red" },
  changed: { t: "Αλλαγή", I: Pencil, c: "bg-eu-chip text-eu-blue" },
  order: { t: "Σειρά", I: ArrowDownUp, c: "bg-eu-amber/15 text-eu-ink-2" },
};

export function PublishDialog<T>({ noun, issueKey = defaultIssueKey, firstTime, changes, nameOf, nameOfKey, onRevert, health, errors, warnings, canPublish, busy, review, onClose, onPublish, onSchedule, onSubmitReview, onGo }: {
  noun: Noun; issueKey?: (i: Issue) => string; firstTime: boolean; changes: ListChange<T>[]; nameOf: (it: T) => string; nameOfKey: (key: string) => string; onRevert: (c: ListChange<T>) => void;
  health: HomeHealth; errors: Issue[]; warnings: Issue[]; canPublish: boolean; busy: boolean; review: Review | null;
  onClose: () => void; onPublish: () => void; onSchedule: (iso: string, name: string) => void; onSubmitReview: (note: string) => void; onGo: (key: string) => void;
}) {
  const [mode, setMode] = useState<"now" | "later">("now");
  const [at, setAtRaw] = useState<string | undefined>(undefined);
  const [laterOk, setLaterOk] = useState(false);
  const setAt = (v: string | undefined) => { setAtRaw(v); setLaterOk(!!v && Date.parse(v) > Date.now() + 60_000); };
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const empties = Object.entries(health.empty);
  const checks = [
    ...errors.map((e) => ({ key: issueKey(e), msg: `${e.where}: ${e.msg}`, level: "error" as const })),
    ...empties.map(([key, why]) => ({ key, msg: `«${nameOfKey(key)}» δεν θα φαίνεται: ${why}`, level: "warn" as const })),
    ...health.issues.map((i) => ({ key: i.key, msg: i.msg, level: "warn" as const })),
    ...warnings.map((e) => ({ key: issueKey(e), msg: `${e.where}: ${e.msg}`, level: "warn" as const })),
  ];
  const blocked = errors.length > 0;
  return (
    <Modal wide title={canPublish ? (firstTime ? `Πρώτη δημοσίευση ${noun.of}` : "Έλεγχος πριν τη δημοσίευση") : "Υποβολή για έγκριση"} icon={canPublish ? <Rocket className="size-5 text-eu-blue" aria-hidden /> : <Send className="size-5 text-eu-blue" aria-hidden />} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={ghost}>Άκυρο</button>
        {canPublish
          ? mode === "now"
            ? <button type="button" onClick={onPublish} disabled={busy || blocked} className={primary}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />} Δημοσίευση τώρα</button>
            : <button type="button" onClick={() => at && onSchedule(at, name)} disabled={busy || blocked || !laterOk} className={primary}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />} Προγραμματισμός</button>
          : <button type="button" onClick={() => onSubmitReview(note)} disabled={busy || (!firstTime && !changes.length)} className={primary}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Υποβολή για έγκριση</button>}
      </>}>
      {review && canPublish && (
        <p className="m-0 rounded-xl bg-eu-chip px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><b>{review.byName}</b> ζήτησε έγκριση {when(review.at)}{review.note ? <> — «{review.note}»</> : null}</p>
      )}
      <section className="grid gap-2" aria-label="Τι αλλάζει">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{firstTime ? "Τι γίνεται" : `Τι αλλάζει (${changes.length})`}</h3>
        {firstTime ? <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Οι επισκέπτες θα δουν ό,τι βλέπεις στην προεπισκόπηση· από εδώ και πέρα οι αλλαγές ανεβαίνουν με «Δημοσίευση».</p>
          : !changes.length ? <p className="m-0 text-eu-muted">Καμία αλλαγή από τη δημοσιευμένη έκδοση.</p>
          : <ul className="m-0 p-0 list-none grid gap-1.5">
              {changes.map((c) => {
                const k = CH[c.type];
                return (
                  <li key={`${c.type}:${c.key}`} className="flex items-center gap-2 rounded-xl border border-eu-line px-2 py-1.5 min-h-14">
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 font-extrabold text-[length:var(--fs-13)] ${k.c}`}><k.I className="size-3.5" aria-hidden />{k.t}</span>
                    <span className="grid min-w-0 flex-1 text-[length:var(--fs-14)]">
                      <span className="font-bold text-eu-ink leading-snug">{c.type === "order" ? noun.order : nameOf(c.item)}</span>
                      <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{c.type === "changed" ? c.what.join(" · ") : c.type === "order" ? (c.moved.length ? `Μετακινήθηκαν: ${c.moved.map(nameOfKey).join(", ")}` : "Άλλαξε η σειρά") : c.type === "added" ? "Προστέθηκε" : "Αφαιρέθηκε"}</span>
                    </span>
                    {c.type !== "order" && c.type !== "removed" && <button type="button" onClick={() => onGo(c.key)} className="shrink-0 rounded-full px-3 min-h-11 font-bold text-eu-blue text-[length:var(--fs-13)] hover:bg-eu-surface">Δες</button>}
                    <button type="button" onClick={() => onRevert(c)} aria-label={`Αναίρεση: ${c.type === "order" ? "σειρά" : nameOf(c.item)}`} title="Αναίρεση μόνο αυτής της αλλαγής" className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface"><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>
                  </li>
                );
              })}
            </ul>}
      </section>

      <section className="grid gap-2" aria-label="Έλεγχοι">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Έλεγχοι</h3>
        {checks.length ? (
          <ul className="m-0 p-0 list-none grid gap-1.5">
            {checks.map((x, i) => (
              <li key={i} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${x.level === "error" ? "bg-eu-red/10 text-eu-red font-bold" : "bg-eu-amber/15 text-eu-ink-2"}`}>
                <CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden /><span className="flex-1 min-w-0">{x.msg}</span>
                {x.key && <button type="button" onClick={() => onGo(x.key)} className="shrink-0 underline font-bold min-h-6">Διόρθωση</button>}
              </li>
            ))}
          </ul>
        ) : <p className="m-0 inline-flex items-center gap-2 rounded-xl bg-eu-green/10 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><Check className="size-4 text-eu-green" aria-hidden /> Όλα εντάξει — καμία κενή ζώνη, λήξη ή προϊόν χωρίς απόθεμα.</p>}
        {blocked && <p className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">Τα κόκκινα θέλουν διόρθωση πριν τη δημοσίευση.</p>}
      </section>

      {canPublish ? (
        <section className="grid gap-2" aria-label="Πότε">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Πότε</h3>
          <div role="radiogroup" className="grid @md:grid-cols-2 gap-2">
            {([["now", "Τώρα", "Οι επισκέπτες το βλέπουν αμέσως."], ["later", "Σε συγκεκριμένη ώρα", "Π.χ. Παρασκευή 00:00 για καμπάνια· δημοσιεύεται μόνο του."]] as const).map(([v, t, d]) => (
              <label key={v} className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 min-h-14 cursor-pointer ${mode === v ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-navy/50"}`}>
                <input type="radio" name="pub-when" checked={mode === v} onChange={() => setMode(v)} className="mt-1 size-4 accent-eu-navy" />
                <span className="grid"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{t}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{d}</span></span>
              </label>
            ))}
          </div>
          {mode === "later" && (
            <div className="grid gap-3 rounded-xl bg-eu-surface p-3">
              <DateTime label="Ημερομηνία και ώρα δημοσίευσης" value={at} onChange={setAt} help={at && !laterOk ? "Διάλεξε ώρα στο μέλλον." : `Δημοσιεύεται ${noun.the} όπως είναι τώρα· όσα αλλάξεις μετά μένουν στο πρόχειρο.`} />
              <label className="grid gap-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Όνομα (προαιρετικό)</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="π.χ. Black Friday" className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white" /></label>
            </div>
          )}
        </section>
      ) : (
        <label className="grid gap-1">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Σημείωμα για όποιον εγκρίνει (προαιρετικό)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="π.χ. Νέες προσφορές για το Σαββατοκύριακο — να ανέβει ως την Παρασκευή." className="w-full rounded-xl border-2 border-eu-line px-3 py-2 text-[length:var(--fs-16)] bg-white" />
          <span className="text-eu-muted text-[length:var(--fs-13)]">Δεν έχεις δικαίωμα δημοσίευσης· όσοι έχουν θα δουν το αίτημα στην κορυφή αυτής της σελίδας.</span>
        </label>
      )}
    </Modal>
  );
}

/* ---------------- σενάρια & προγραμματισμός ---------------- */
const STATUS: Record<Scenario<unknown>["status"], { t: string; c: string }> = {
  saved: { t: "Αποθηκευμένο", c: "bg-eu-surface text-eu-ink-2" },
  scheduled: { t: "Προγραμματισμένο", c: "bg-eu-chip text-eu-blue" },
  published: { t: "Δημοσιεύτηκε", c: "bg-eu-green/15 text-eu-green" },
  failed: { t: "Δεν δημοσιεύτηκε", c: "bg-eu-amber/15 text-eu-ink-2" },
};

export function PlansDialog<T>({ planRef, doc, diffCount, canWrite, canPublish, onLoad, onClose, onChanged }: { planRef: PlanRef; doc: T; diffCount: (a: T, b: T) => number; canWrite: boolean; canPublish: boolean; onLoad: (d: T, label: string) => void; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = useState<Scenario<T>[] | null>(null);
  const [name, setName] = useState("");
  const [at, setAt] = useState<string | undefined>(undefined);
  const [edit, setEdit] = useState<{ id: string; at?: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const [ref0] = useState(planRef); // σταθερό για το effect
  const load = () => plansAction(ref0).then((p) => setList(p.scenarios as Scenario<T>[]));
  useEffect(() => { void plansAction(ref0).then((p) => setList(p.scenarios as Scenario<T>[])); }, [ref0]);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await fn(); setMsg(r); if (r.ok) { await load(); onChanged(); } });
  return (
    <Modal wide title="Σενάρια & προγραμματισμός" icon={<CalendarClock className="size-5 text-eu-blue" aria-hidden />} onClose={onClose}>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Ένα σενάριο είναι ολόκληρη η σελίδα αποθηκευμένη με όνομα (π.χ. «Black Friday»). Ετοίμασέ το από πριν και όρισε πότε θα δημοσιευτεί — ανεβαίνει μόνο του στην ώρα του.</p>
      {canWrite && (
        <section className="grid gap-3 rounded-2xl border border-eu-line p-3" aria-label="Νέο σενάριο">
          <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Αποθήκευση του τωρινού πρόχειρου ως σενάριο</h3>
          <label className="grid gap-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Όνομα</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="π.χ. Black Friday 2026" className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white" /></label>
          {canPublish && <DateTime label="Δημοσίευση στις (προαιρετικό)" value={at} onChange={setAt} help="Κενό = μένει αποθηκευμένο, χωρίς ώρα." />}
          <button type="button" disabled={busy || !name.trim()} onClick={() => run(async () => { const r = await saveScenarioAction(planRef, name, doc, at ?? null); if (r.ok) { setName(""); setAt(undefined); } return r; })} className={`${primary} justify-self-start`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} {at ? "Αποθήκευση & προγραμματισμός" : "Αποθήκευση σεναρίου"}</button>
        </section>
      )}
      {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold ${msg.ok ? "bg-eu-green/10 text-eu-ink-2" : "bg-eu-red/10 text-eu-red"}`}>{msg.message}</p>}
      <section className="grid gap-2" aria-label="Σενάρια">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Σενάρια</h3>
        {!list ? <span className="inline-flex items-center gap-2 text-eu-muted min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</span>
          : !list.length ? <p className="m-0 text-eu-muted">Δεν υπάρχει κανένα σενάριο ακόμη.</p>
          : <ul className="m-0 p-0 list-none grid gap-2">
              {list.map((s) => (
                <li key={s.id} className="grid gap-2 rounded-xl border border-eu-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-15)] min-w-0">{s.name}</span>
                    <span className={`rounded-full px-2 py-0.5 font-extrabold text-[length:var(--fs-13)] ${STATUS[s.status].c}`}>{STATUS[s.status].t}{s.status === "scheduled" && s.publishAt ? ` · ${when(s.publishAt)}` : s.status === "published" && s.publishedAt ? ` · ${when(s.publishedAt)}` : ""}</span>
                  </div>
                  <span className="text-eu-muted text-[length:var(--fs-13)]">{s.byName} · {when(s.createdAt)} · {diffCount(s.doc, doc) ? `${diffCount(s.doc, doc)} διαφορές από το πρόχειρο` : "ίδιο με το πρόχειρο"}{s.note ? ` · ${s.note}` : ""}</span>
                  <div className="flex flex-wrap gap-1">
                    {canWrite && <button type="button" onClick={() => onLoad(s.doc, `σενάριο «${s.name}»`)} className={ghost}>Φόρτωση στο πρόχειρο</button>}
                    {canPublish && s.status !== "published" && (edit?.id === s.id
                      ? <span className="grid gap-2 basis-full rounded-xl bg-eu-surface p-3">
                          <DateTime label="Δημοσίευση στις" value={edit.at} onChange={(v) => setEdit({ id: s.id, at: v })} />
                          <span className="flex flex-wrap gap-2"><button type="button" disabled={busy || !edit.at} onClick={() => run(() => scheduleScenarioAction(planRef, s.id, edit.at!))} className={primary}>Αποθήκευση ώρας</button><button type="button" onClick={() => setEdit(null)} className={ghost}>Άκυρο</button></span>
                        </span>
                      : <button type="button" onClick={() => setEdit({ id: s.id, at: s.publishAt ?? undefined })} className={ghost}><CalendarClock className="size-4" aria-hidden /> {s.status === "scheduled" ? "Άλλαξε ώρα" : "Προγραμμάτισε"}</button>)}
                    {canPublish && s.status === "scheduled" && <button type="button" disabled={busy} onClick={() => run(() => scheduleScenarioAction(planRef, s.id, null))} className={ghost}>Ακύρωση προγραμματισμού</button>}
                    {canWrite && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Διαγραφή του σεναρίου «${s.name}»;`)) run(() => deleteScenarioAction(planRef, s.id)); }} aria-label={`Διαγραφή: ${s.name}`} className={`${btn} text-eu-red hover:bg-eu-red/10 ml-auto`}><Trash2 className="size-4" aria-hidden /> Διαγραφή</button>}
                  </div>
                </li>
              ))}
            </ul>}
      </section>
    </Modal>
  );
}

/* ---------------- ιστορικό δημοσιεύσεων ---------------- */
export function HistoryDialog<T>({ planRef, noun, doc, diffCount, canWrite, onLoad, onClose }: { planRef: PlanRef; noun: Noun; doc: T; diffCount: (a: T, b: T) => number; canWrite: boolean; onLoad: (d: T, label: string) => void; onClose: () => void }) {
  const [list, setList] = useState<PublishEntry<T>[] | null>(null);
  const [ref0] = useState(planRef); // σταθερό για το effect
  useEffect(() => { void historyAction(ref0).then((l) => setList(l as PublishEntry<T>[])); }, [ref0]);
  return (
    <Modal title="Ιστορικό δημοσιεύσεων" icon={<History className="size-5 text-eu-blue" aria-hidden />} onClose={onClose}>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κάθε δημοσίευση {noun.of}, με ποιος και πότε. «Φόρτωση στο πρόχειρο» τη φέρνει πίσω για έλεγχο — στο site αλλάζει μόνο με νέα «Δημοσίευση».</p>
      {!list ? <span className="inline-flex items-center gap-2 text-eu-muted min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</span>
        : !list.length ? <p className="m-0 text-eu-muted">Δεν υπάρχει ακόμη δημοσίευση.</p>
        : <ol className="m-0 p-0 list-none grid gap-2">
            {list.map((h, i) => {
              const n = diffCount(h.doc, doc);
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-eu-line px-3 py-2 min-h-14">
                  <span className="grid min-w-0 flex-1">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{when(h.at)}{i === 0 && <span className="ml-2 rounded-full bg-eu-green/15 text-eu-green px-2 py-0.5 text-[length:var(--fs-13)] font-extrabold">στο site τώρα</span>}</span>
                    <span className="text-eu-muted text-[length:var(--fs-13)]">{h.by ?? "αυτόματα (προγραμματισμός)"} · {n ? `${n} διαφορές από το πρόχειρο` : "ίδια με το πρόχειρο"}</span>
                  </span>
                  {canWrite && n > 0 && <button type="button" onClick={() => onLoad(h.doc, `δημοσίευση ${when(h.at)}`)} className={ghost}><Undo2 className="size-4" aria-hidden /> Φόρτωση στο πρόχειρο</button>}
                </li>
              );
            })}
          </ol>}
    </Modal>
  );
}

/* ---------------- σύνδεσμος προεπισκόπησης + QR ---------------- */
export function ShareDialog({ planRef, noun, onClose }: { planRef: PlanRef; noun: Noun; onClose: () => void }) {
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ref0] = useState(planRef); // σταθερό για το effect
  useEffect(() => { void previewLinkAction(ref0).then(async (l) => { setLink(l); setQr(await QRCode.toDataURL(l.url, { margin: 1, width: 480, color: { dark: "#0b1f44", light: "#ffffff" } })); }); }, [ref0]);
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* χωρίς πρόσβαση στο πρόχειρο: ο σύνδεσμος φαίνεται για αντιγραφή με το χέρι */ } };
  return (
    <Modal title="Προεπισκόπηση σε κινητό ή για έγκριση" icon={<QrCode className="size-5 text-eu-blue" aria-hidden />} onClose={onClose}>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Σκάναρε με την κάμερα του κινητού ή στείλε τον σύνδεσμο σε συνάδελφο: βλέπει το <b>τωρινό πρόχειρο</b> χωρίς λογαριασμό. Οι πελάτες δεν το βλέπουν.</p>
      {!link ? <span className="inline-flex items-center gap-2 text-eu-muted min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Δημιουργία συνδέσμου…</span> : (
        <div className="grid @md:grid-cols-[14rem_minmax(0,1fr)] gap-4 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR από data URL */}
          {qr ? <img src={qr} alt={`QR για την προεπισκόπηση ${noun.of}`} width={224} height={224} className="justify-self-center size-56 rounded-xl border border-eu-line" /> : <span className="size-56 rounded-xl bg-eu-surface" />}
          <div className="grid gap-2 min-w-0">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Σύνδεσμος</span>
            <span className="rounded-xl bg-eu-surface px-3 py-2 font-mono text-[length:var(--fs-13)] break-all select-all">{link.url}</span>
            <button type="button" onClick={copy} className={`${primary} justify-self-start`}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Αντιγράφηκε" : "Αντιγραφή"}</button>
            <span className="text-eu-muted text-[length:var(--fs-13)]">Ισχύει έως {when(link.expires)}.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- συντομεύσεις πλήκτρων ---------------- */
export const SHORTCUTS: [string, string][] = [
  ["J / K", "Επόμενο / προηγούμενο στοιχείο"],
  ["Alt + ↑ / ↓", "Μετακίνηση του στοιχείου (στον χάρτη)"],
  ["H", "Εμφάνιση / απόκρυψη του επιλεγμένου"],
  ["Esc", "Κλείσιμο ρυθμίσεων ή παραθύρου"],
  ["Ctrl/⌘ + Z", "Αναίρεση"],
  ["Ctrl/⌘ + ⇧ + Z", "Επανάληψη"],
  ["Ctrl/⌘ + S", "Αποθήκευση τώρα (γίνεται και μόνη της)"],
  ["Ctrl/⌘ + Enter", "Έλεγχος & δημοσίευση"],
  ["?", "Αυτή η λίστα"],
];
export function KeysDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Συντομεύσεις πλήκτρων" icon={<Keyboard className="size-5 text-eu-blue" aria-hidden />} onClose={onClose}>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 items-center">
        {SHORTCUTS.map(([k, d]) => <div key={k} className="contents"><dt><kbd className="inline-block rounded-lg border border-eu-line border-b-2 bg-eu-surface px-2 py-1 font-mono font-bold text-eu-ink text-[length:var(--fs-13)] whitespace-nowrap">{k}</kbd></dt><dd className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]">{d}</dd></div>)}
      </dl>
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Οι συντομεύσεις δεν λειτουργούν όσο γράφεις σε πεδίο (εκτός από Ctrl/⌘ + S και Enter).</p>
    </Modal>
  );
}

