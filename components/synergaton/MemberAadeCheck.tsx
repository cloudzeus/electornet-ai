"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, CheckCircle2, CircleAlert, CircleHelp, Loader2, ShieldCheck } from "lucide-react";
import { checkMemberAade, type AadeRow } from "@/app/synergaton/actions";
import { Badge, btn, Callout, Card, CardHead, fmtDateTime } from "./ui";

type Result = { rows: AadeRow[]; active: boolean; activity: string | null; checkedAt: string };

/** Έλεγχος των στοιχείων του μέλους (ΑΦΜ, επωνυμία, έδρα, Δ.Ο.Υ.) στο μητρώο της ΑΑΔΕ, σε σύγκριση με όσα έχει το SoftOne της Euronics. */
export function MemberAadeCheck() {
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    setErr(null);
    const r = await checkMemberAade();
    if (!r.ok) { setErr(r.error); setRes(null); return; }
    setRes(r);
  });
  const diffs = res?.rows.filter((r) => r.same === false) ?? [];
  return (
    <Card data-help="portal.aade-check">
      <CardHead icon={ShieldCheck} title="Επικύρωση στοιχείων στην ΑΑΔΕ" sub="Συγκρίνουμε την καρτέλα σας στο SoftOne της Euronics με το μητρώο της ΑΑΔΕ (ΑΦΜ, επωνυμία, έδρα, Δ.Ο.Υ.)."
        action={<button type="button" onClick={run} disabled={pending} className={btn(res ? "ghost" : "primary", "sm")}>{pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <BadgeCheck className="size-4" aria-hidden />}{pending ? "Έλεγχος…" : res ? "Νέος έλεγχος" : "Έλεγχος στην ΑΑΔΕ"}</button>} />
      <div className="p-4 sm:p-5 grid gap-3">
        {err && <Callout tone="bad">{err}</Callout>}
        {!res && !err && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Ο έλεγχος διαβάζει μόνο τα δημόσια στοιχεία της επιχείρησης από την ΑΑΔΕ· δεν αλλάζει τίποτα.</p>}
        {res && (
          <>
            {!res.active ? <Callout tone="bad" title="Ο ΑΦΜ εμφανίζεται ανενεργός στην ΑΑΔΕ">Μιλήστε με τον υπεύθυνο συνεργατών της Euronics.</Callout>
              : diffs.length ? <Callout tone="warn" title={`${diffs.length === 1 ? "Ένα στοιχείο διαφέρει" : `${diffs.length} στοιχεία διαφέρουν`} από την ΑΑΔΕ`}>Τα στοιχεία αυτά αλλάζουν μόνο από την Euronics. Ενημερώθηκε το ιστορικό σας· για διόρθωση μιλήστε με τον υπεύθυνο συνεργατών.</Callout>
              : <Callout tone="good" title="Τα στοιχεία συμφωνούν με την ΑΑΔΕ">Ενεργός ΑΦΜ{res.activity ? ` · ${res.activity}` : ""}.</Callout>}
            <p className="m-0 hidden sm:grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_7rem] gap-3 px-3 text-eu-ink-3 text-[length:var(--fs-12)]" aria-hidden><span /><span>ΑΑΔΕ</span><span>SoftOne Euronics</span><span /></p>
            <ul className="m-0 p-0 list-none grid gap-2">
              {res.rows.map((r) => (
                <li key={r.label} className={`rounded-xl border p-3 grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_7rem] sm:items-center sm:gap-3 text-[length:var(--fs-14)] ${r.same === false ? "border-amber-300 bg-amber-50" : "border-eu-line"}`}>
                  <b className="text-eu-ink">{r.label}</b>
                  <span className="min-w-0 break-words"><span className="sm:hidden text-eu-ink-3 text-[length:var(--fs-12)]">ΑΑΔΕ: </span>{r.aade ?? "—"}</span>
                  <span className="min-w-0 break-words text-eu-ink-2"><span className="sm:hidden text-eu-ink-3 text-[length:var(--fs-12)]">SoftOne: </span>{r.ours ?? "—"}</span>
                  <span className="justify-self-start">{r.same === true ? <Badge tone="good" icon={false}><CheckCircle2 className="size-3.5" aria-hidden />Ίδιο</Badge> : r.same === false ? <Badge tone="warn" icon={false}><CircleAlert className="size-3.5" aria-hidden />Διαφέρει</Badge> : <Badge tone="neutral" icon={false}><CircleHelp className="size-3.5" aria-hidden />Λείπει</Badge>}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Έλεγχος {fmtDateTime(res.checkedAt)}</p>
          </>
        )}
      </div>
    </Card>
  );
}
