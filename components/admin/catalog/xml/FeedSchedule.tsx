"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Save, Send } from "lucide-react";
import { applyPending, saveSchedule } from "@/app/admin/(shell)/catalog/templates/xml/actions";
import { describeSchedule, minEvery, normSchedule, type FeedSchedule } from "@/lib/catalog/xml-import/schedule-core";
import type { SupplierCard } from "@/lib/catalog/xml-import/ui-core";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const field = "min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const when = (s: string | null) => (s ? new Date(s).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" }) : "—");
const EVERY = [15, 30, 60, 120, 240, 360, 720, 1440];
const label = (m: number) => (m < 60 ? `${m} λεπτά` : m === 60 ? "1 ώρα" : `${m / 60} ώρες`);
const pad = (n: number) => String(n).padStart(2, "0");

type Feed = NonNullable<SupplierCard["feed"]>;

/**
 * Βήμα ①: πόσο συχνά ενημερώνεται το σύστημα από το XML (λήψη → έλεγχος με SoftOne → εφαρμογή στα υπάρχοντα είδη)
 * και το «Εφαρμογή αλλαγών (N)» για όσα έχουν αλλαγές που δεν πέρασαν ακόμη.
 */
export function FeedSchedulePanel({ feed, disabled, onChanged }: { feed: Feed; disabled: boolean; onChanged: (note: string) => void }) {
  const [s, setS] = useState<FeedSchedule>(feed.schedule);
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const floor = minEvery(feed.minFetchMin);
  const options = [...new Set([floor, ...EVERY.filter((m) => m >= floor)])].sort((a, b) => a - b);
  const dirty = JSON.stringify(normSchedule(s, feed.minFetchMin)) !== JSON.stringify(feed.schedule);

  const save = async () => {
    setBusy("save"); setErr(null);
    const r = await saveSchedule(feed.id, s);
    setBusy(null);
    if ("error" in r) return setErr(r.error);
    setS(r.schedule);
    onChanged(`Αυτόματη ενημέρωση: ${describeSchedule(r.schedule)}.`);
  };
  const apply = async () => {
    setBusy("apply"); setErr(null);
    const r = await applyPending(feed.id);
    setBusy(null);
    if ("error" in r) return setErr(r.error);
    onChanged(r.queued ? `${r.queued.toLocaleString("el-GR")} προϊόντα μπήκαν στην ουρά για εφαρμογή σε SoftOne και eshop.` : "Δεν υπάρχουν αλλαγές για εφαρμογή.");
  };

  return (
    <div data-help="xml.supplier.schedule" className="grid gap-2 rounded-lg bg-eu-surface p-2.5 min-w-0">
      <span className="flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><CalendarClock className="size-4 text-eu-blue" aria-hidden /> Ενημέρωση από το XML</span>
      <div className="flex flex-wrap items-end gap-2 min-w-0">
        <label className="grid gap-1 min-w-0">
          <span className="sr-only">Πρόγραμμα</span>
          <select value={s.mode} disabled={disabled || !!busy} className={field}
            onChange={(e) => setS(e.target.value === "every" ? { mode: "every", min: Math.max(floor, 60) } : e.target.value === "daily" ? { mode: "daily", at: [6, 0] } : { mode: "manual" })}>
            <option value="manual">Χειροκίνητα</option>
            <option value="every">Κάθε…</option>
            <option value="daily">Καθημερινά στις…</option>
          </select>
        </label>
        {s.mode === "every" && (
          <label className="grid gap-1 min-w-0">
            <span className="sr-only">Κάθε πόσο</span>
            <select value={s.min} disabled={disabled || !!busy} className={field} onChange={(e) => setS({ mode: "every", min: Number(e.target.value) })}>
              {options.map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </label>
        )}
        {s.mode === "daily" && (
          <label className="grid gap-1 min-w-0">
            <span className="sr-only">Ώρα</span>
            <input type="time" value={`${pad(s.at[0])}:${pad(s.at[1])}`} disabled={disabled || !!busy} className={field}
              onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); if (Number.isFinite(h) && Number.isFinite(m)) setS({ mode: "daily", at: [h, m] }); }} />
          </label>
        )}
        <button type="button" onClick={save} disabled={disabled || !!busy || !dirty} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>
          {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση
        </button>
      </div>
      <span className="text-eu-muted text-[length:var(--fs-12)] [overflow-wrap:anywhere]">
        {feed.schedule.mode === "manual"
          ? "Χειροκίνητα: το σύστημα ενημερώνεται μόνο όταν πατάς «Νέο τρέξιμο»."
          : <>Κάθε φορά: λήψη του XML → έλεγχος με SoftOne → εφαρμογή των αλλαγών στα <b>υπάρχοντα</b> είδη (SoftOne και eshop). Τα νέα είδη μένουν για έγκριση στα «Νέα είδη». Τελευταία: {when(feed.lastAutoAt)} · Επόμενη: {feed.active ? when(feed.nextAt) : "— (ανενεργό)"}</>}
        {feed.minFetchMin > 15 ? ` Ποτέ πιο συχνά από ${label(feed.minFetchMin)} (όριο του προμηθευτή).` : ""}
      </span>
      <div className="flex flex-wrap items-center gap-2" data-help="xml.supplier.apply">
        <button type="button" onClick={apply} disabled={disabled || !!busy || !feed.pending || !feed.active} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>
          {busy === "apply" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Εφαρμογή αλλαγών ({feed.pending.toLocaleString("el-GR")})
        </button>
        <span className="text-eu-muted text-[length:var(--fs-12)] min-w-0">Υπάρχοντα είδη με αλλαγές από το XML ή διορθώσεις σου που δεν έχουν περάσει ακόμη — μετά τον «Έλεγχο με SoftOne».</span>
      </div>
      {err && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{err}</span>}
    </div>
  );
}
