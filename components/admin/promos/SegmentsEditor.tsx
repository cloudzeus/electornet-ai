"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Pencil, X, Users, Send, Archive, Calculator } from "lucide-react";
import type { SegmentRules } from "@/lib/promo/segments";
import { archiveSegmentAction, issueSegmentCouponsAction, previewSegmentAction, saveSegmentAction, type SegmentInput } from "@/app/admin/(shell)/prosfores/actions";
import { Hint } from "./Help";

type Opt = { id: string; label: string };
type Row = { id: string; name: string; description: string | null; rules: SegmentRules; members: number; computedAt: string | null; summary: string };
const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2";
const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v.replace(",", ".")) || 0));
const PRESETS: { name: string; rules: SegmentRules }[] = [
  { name: "Συνδρομητές newsletter", rules: { newsletter: true } },
  { name: "Πιστοί πελάτες (3+ αγορές)", rules: { minOrders: 3 } },
  { name: "Ανενεργοί 6 μηνών", rules: { minOrders: 1, noOrderForDays: 180 } },
  { name: "Χωρίς αγορά ακόμη", rules: { maxOrders: 0 } },
  { name: "Γενέθλια αυτόν τον μήνα", rules: { birthdayThisMonth: true } },
];

/** Λίστα και επεξεργασία κοινών, μέτρηση μελών, κουπόνια σε κοινό. */
export function SegmentsEditor({ segments, categories, coupons }: { segments: Row[]; categories: Opt[]; coupons: Opt[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<SegmentInput | null>(null);
  const [count, setCount] = useState<{ count: number; consent: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [issue, setIssue] = useState<{ segmentId: string; promotionCode: string; send: boolean } | null>(null);
  const [busy, start] = useTransition();
  const r = edit?.rules ?? {};
  const setR = (p: Partial<SegmentRules>) => { setCount(null); setEdit((e) => (e ? { ...e, rules: { ...e.rules, ...p } } : e)); };
  const list = (v: string) => v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const open = (x: SegmentInput) => { setMsg(null); setCount(null); setEdit(x); };
  const measure = () => edit && start(async () => setCount(await previewSegmentAction(edit.rules)));
  const save = () => edit && start(async () => { const res = await saveSegmentAction(edit); if (!res.ok) return setMsg({ ok: false, t: res.error }); setMsg({ ok: true, t: `Αποθηκεύτηκε · ${res.count} μέλη τώρα.` }); setEdit(null); router.refresh(); });
  const archive = (id: string) => confirm("Απόσυρση του κοινού;") && start(async () => { const res = await archiveSegmentAction(id); setMsg(res.ok ? { ok: true, t: "Αποσύρθηκε." } : { ok: false, t: res.error }); router.refresh(); });
  const runIssue = () => issue && start(async () => {
    const res = await issueSegmentCouponsAction(issue);
    setMsg(res.ok ? { ok: true, t: `${res.members} μέλη · ${res.issued} νέοι κωδικοί · ${res.existing} είχαν ήδη · ${res.emailed} email${res.noConsent ? ` · ${res.noConsent} χωρίς συναίνεση (μόνο κωδικός, χωρίς email)` : ""}.` } : { ok: false, t: res.error });
    setIssue(null); router.refresh();
  });

  return (
    <div className="grid gap-4">
      {msg && <p role="status" className={`m-0 rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
      {!edit && (
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={() => open({ id: null, name: "", description: null, rules: {} })} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)]"><Plus className="size-4" aria-hidden /> Νέο κοινό</button>
          <span className="text-eu-muted text-[length:var(--fs-14)]">ή ξεκίνα από:</span>
          {PRESETS.map((p) => <button key={p.name} type="button" onClick={() => open({ id: null, name: p.name, description: null, rules: p.rules })} className="rounded-full border-2 border-eu-line px-3 min-h-11 font-semibold text-[length:var(--fs-14)] hover:border-eu-navy">{p.name}</button>)}
        </div>
      )}
      {edit && (
        <section className="rounded-2xl bg-white border-2 border-eu-navy p-4 @md:p-5 grid gap-4">
          <div className="flex items-center justify-between"><h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-16)]">{edit.id ? "Επεξεργασία κοινού" : "Νέο κοινό"}</h3><button type="button" aria-label="Κλείσιμο" onClick={() => setEdit(null)} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button></div>
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
            <label className={lbl}><span>Όνομα</span><input className={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className={lbl}><span>Περιγραφή (εσωτερική)</span><input className={input} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value || null })} /></label>
          </div>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Συμπλήρωσε μόνο όσα θέλεις — πρέπει να ισχύουν <strong>όλα μαζί</strong>. Κενό = δεν μετράει.</p>
          <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-3">
            <label className={lbl}><span>Newsletter</span><select className={input} value={r.newsletter == null ? "" : r.newsletter ? "yes" : "no"} onChange={(e) => setR({ newsletter: e.target.value === "" ? undefined : e.target.value === "yes" })}><option value="">Δεν μετράει</option><option value="yes">Συνδρομητές</option><option value="no">Όχι συνδρομητές</option></select></label>
            <label className={lbl}><span>Παραγγελίες από</span><input inputMode="numeric" className={input} value={r.minOrders ?? ""} onChange={(e) => setR({ minOrders: num(e.target.value) })} /></label>
            <label className={lbl}><span>Παραγγελίες έως</span><input inputMode="numeric" className={input} value={r.maxOrders ?? ""} onChange={(e) => setR({ maxOrders: num(e.target.value) })} /></label>
            <label className={lbl}><span>Συνολικές αγορές από (€)</span><input inputMode="decimal" className={input} value={r.minSpent ?? ""} onChange={(e) => setR({ minSpent: num(e.target.value) })} /></label>
            <label className={lbl}><span>Αγόρασαν τις τελευταίες … ημέρες</span><input inputMode="numeric" className={input} value={r.orderedWithinDays ?? ""} onChange={(e) => setR({ orderedWithinDays: num(e.target.value) })} /></label>
            <label className={lbl}><span>Χωρίς αγορά για … ημέρες</span><input inputMode="numeric" className={input} value={r.noOrderForDays ?? ""} onChange={(e) => setR({ noOrderForDays: num(e.target.value) })} /></label>
            <label className={lbl}><span>Νέοι λογαριασμοί (ημέρες)</span><input inputMode="numeric" className={input} value={r.joinedWithinDays ?? ""} onChange={(e) => setR({ joinedWithinDays: num(e.target.value) })} /></label>
            <label className={lbl}><span className="inline-flex items-center gap-1">Ταχυδρομικοί κώδικες <Hint k="zips" /></span><input className={input} value={(r.zips ?? []).join(", ")} onChange={(e) => setR({ zips: list(e.target.value) })} placeholder="π.χ. 54, 151" /></label>
            <label className={lbl}><span>Ετικέτες πελάτη</span><input className={input} value={(r.tags ?? []).join(", ")} onChange={(e) => setR({ tags: list(e.target.value) })} placeholder="π.χ. b2b, vip" /></label>
            <fieldset className="m-0 p-0 border-0 grid gap-1"><legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Βαθμίδα πιστότητας</legend><div className="flex flex-wrap gap-2">{["bronze", "silver", "gold"].map((t) => <label key={t} className="inline-flex items-center gap-1.5 min-h-11 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={!!r.tiers?.includes(t)} onChange={(e) => setR({ tiers: e.target.checked ? [...(r.tiers ?? []), t] : (r.tiers ?? []).filter((x) => x !== t) })} />{t}</label>)}</div></fieldset>
            <label className="inline-flex items-center gap-2 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-ink-2 self-end"><input type="checkbox" className="size-5 accent-eu-navy" checked={!!r.birthdayThisMonth} onChange={(e) => setR({ birthdayThisMonth: e.target.checked || undefined })} /> Γενέθλια αυτόν τον μήνα</label>
          </div>
          <div className="grid gap-1.5"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Αγόρασαν κάποτε από (μία από αυτές)</span>
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">{categories.map((c) => { const on = !!r.boughtCategories?.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => setR({ boughtCategories: on ? (r.boughtCategories ?? []).filter((x) => x !== c.id) : [...(r.boughtCategories ?? []), c.id] })} className={`rounded-full px-3 min-h-10 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{c.label}</button>; })}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy} onClick={measure} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Calculator className="size-4" aria-hidden /> Πόσοι ταιριάζουν;</button>
            {count && <span role="status" className="font-bold text-eu-ink text-[length:var(--fs-15)]">{count.count.toLocaleString("el-GR")} πελάτες τώρα · {count.consent.toLocaleString("el-GR")} με συναίνεση για προωθητικά email</span>}
            <button type="button" disabled={busy || !edit.name.trim()} onClick={save} className="ml-auto rounded-full bg-eu-navy text-white px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] disabled:opacity-40">{busy ? "…" : "Αποθήκευση"}</button>
          </div>
        </section>
      )}
      {issue && (
        <section className="rounded-2xl bg-white border-2 border-eu-yellow p-4 grid gap-3">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-16)]">Προσωπικά κουπόνια στο κοινό «{segments.find((s) => s.id === issue.segmentId)?.name}»</h3>
          {coupons.length ? <>
            <label className={lbl}><span>Προσφορά-κουπόνι</span><select className={`${input} max-w-lg`} value={issue.promotionCode} onChange={(e) => setIssue({ ...issue, promotionCode: e.target.value })}>{coupons.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label className="inline-flex items-center gap-2 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><input type="checkbox" className="size-5 accent-eu-navy" checked={issue.send} onChange={(e) => setIssue({ ...issue, send: e.target.checked })} /> Αποστολή email (μόνο σε όσους έχουν δώσει συναίνεση)</label>
            <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κάθε μέλος παίρνει έναν μοναδικό κωδικό μίας χρήσης· όσα έχουν ήδη από αυτή την προσφορά δεν παίρνουν δεύτερο.</p>
            <div className="flex gap-2"><button type="button" disabled={busy} onClick={runIssue} className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] disabled:opacity-40"><Send className="size-4" aria-hidden /> {busy ? "Έκδοση…" : "Έκδοση"}</button><button type="button" onClick={() => setIssue(null)} className="rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)]">Άκυρο</button></div>
          </> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Φτιάξε πρώτα μια ενεργή προσφορά-κουπόνι.</p>}
        </section>
      )}
      <ul className="m-0 p-0 list-none grid grid-cols-1 @3xl:grid-cols-2 gap-3">
        {segments.map((s) => (
          <li key={s.id} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2">
            <div className="flex items-start justify-between gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-16)] inline-flex items-center gap-1.5"><Users className="size-4 text-eu-blue" aria-hidden />{s.name}</span><span className="rounded-full bg-eu-chip text-eu-navy px-2.5 py-0.5 font-bold text-[length:var(--fs-13)] tabular-nums whitespace-nowrap">{s.members.toLocaleString("el-GR")} μέλη</span></div>
            {s.description && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{s.description}</p>}
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]">{s.summary}</p>
            {s.computedAt && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">μέτρηση {new Date(s.computedAt).toLocaleString("el-GR")} · τα μέλη ενημερώνονται μόνα τους</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => open({ id: s.id, name: s.name, description: s.description, rules: s.rules })} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Pencil className="size-4" aria-hidden /> Αλλαγή</button>
              <button type="button" onClick={() => setIssue({ segmentId: s.id, promotionCode: coupons[0]?.id ?? "", send: true })} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Send className="size-4" aria-hidden /> Κουπόνια</button>
              <button type="button" disabled={busy} onClick={() => archive(s.id)} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-red hover:text-eu-red"><Archive className="size-4" aria-hidden /> Απόσυρση</button>
            </div>
          </li>
        ))}
        {!segments.length && !edit && <li className="text-eu-muted text-[length:var(--fs-14)]">Κανένα κοινό ακόμη — ξεκίνα από ένα έτοιμο παραπάνω.</li>}
      </ul>
    </div>
  );
}
