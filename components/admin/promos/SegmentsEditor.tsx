"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Pencil, X, Users, Send, Archive, Loader2, Mail, Repeat, Moon, ShoppingBag, Cake, Tag } from "lucide-react";
import type { SegmentRules } from "@/lib/promo/segments";
import { archiveSegmentAction, issueSegmentCouponsAction, previewSegmentAction, saveSegmentAction, type SegmentInput } from "@/app/admin/(shell)/prosfores/actions";
import { Hint } from "./Help";

type Opt = { id: string; label: string };
type Row = { id: string; name: string; description: string | null; rules: SegmentRules; members: number; computedAt: string | null; summary: string; usedIn: number };
const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 content-start text-[length:var(--fs-14)] font-bold text-eu-ink-2";
const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v.replace(",", ".")) || 0));
const PRESETS: { name: string; desc: string; I: typeof Mail; rules: SegmentRules }[] = [
  { name: "Συνδρομητές newsletter", desc: "Για κουπόνια και early access σε όσους διαβάζουν τα email μας.", I: Mail, rules: { newsletter: true } },
  { name: "Πιστοί πελάτες (3+ αγορές)", desc: "Ανταμοιβή όσων επιστρέφουν — π.χ. αποκλειστική τιμή μέλους.", I: Repeat, rules: { minOrders: 3 } },
  { name: "Ανενεργοί 6 μηνών", desc: "Αγόρασαν κάποτε αλλά όχι το τελευταίο εξάμηνο — κουπόνι επιστροφής.", I: Moon, rules: { minOrders: 1, noOrderForDays: 180 } },
  { name: "Χωρίς αγορά ακόμη", desc: "Έφτιαξαν λογαριασμό χωρίς να αγοράσουν — κίνητρο πρώτης αγοράς.", I: ShoppingBag, rules: { maxOrders: 0 } },
  { name: "Γενέθλια αυτόν τον μήνα", desc: "Δώρο γενεθλίων: προσωπικό κουπόνι κάθε μήνα.", I: Cake, rules: { birthdayThisMonth: true } },
];

/**
 * Κοινά πελατών: έτοιμα πρότυπα για γρήγορη αρχή, επεξεργασία με κριτήρια σε ομάδες και ζωντανή μέτρηση δίπλα (πόσοι
 * ταιριάζουν, πόσοι με συναίνεση, % της βάσης), και κάρτες κοινών με μέλη, χρήση σε προσφορές και ενέργειες.
 */
export function SegmentsEditor({ segments, categories, coupons, customers }: { segments: Row[]; categories: Opt[]; coupons: Opt[]; customers: number }) {
  const router = useRouter();
  const [edit, setEdit] = useState<SegmentInput | null>(null);
  const [count, setCount] = useState<{ count: number; consent: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [issue, setIssue] = useState<{ segmentId: string; promotionCode: string; send: boolean } | null>(null);
  const [busy, start] = useTransition();
  const [measuring, startMeasure] = useTransition();
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dlg.current; if (issue && d && !d.open) d.showModal(); if (!issue && d?.open) d.close(); }, [issue]);
  const r = edit?.rules ?? {};
  const setR = (p: Partial<SegmentRules>) => setEdit((e) => (e ? { ...e, rules: { ...e.rules, ...p } } : e));
  const list = (v: string) => v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const open = (x: SegmentInput) => { setMsg(null); setCount(null); setEdit(x); requestAnimationFrame(() => document.getElementById("seg-edit")?.scrollIntoView({ block: "start" })); };
  // ζωντανή μέτρηση: λίγο μετά από κάθε αλλαγή κριτηρίου
  const rulesKey = JSON.stringify(edit?.rules ?? null);
  useEffect(() => {
    if (!edit) return;
    const t = setTimeout(() => startMeasure(async () => setCount(await previewSegmentAction(JSON.parse(rulesKey)))), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- μετρά μόνο όταν αλλάζουν τα κριτήρια
  }, [rulesKey]);
  const save = () => edit && start(async () => { const res = await saveSegmentAction(edit); if (!res.ok) return setMsg({ ok: false, t: res.error }); setMsg({ ok: true, t: `Αποθηκεύτηκε · ${res.count} μέλη τώρα.` }); setEdit(null); router.refresh(); });
  const archive = (id: string) => confirm("Απόσυρση του κοινού; Οι προσφορές που το χρησιμοποιούν δεν θα βρίσκουν πια μέλη.") && start(async () => { const res = await archiveSegmentAction(id); setMsg(res.ok ? { ok: true, t: "Αποσύρθηκε." } : { ok: false, t: res.error }); router.refresh(); });
  const runIssue = () => issue && start(async () => {
    const res = await issueSegmentCouponsAction(issue);
    setMsg(res.ok ? { ok: true, t: `${res.members} μέλη · ${res.issued} νέοι κωδικοί · ${res.existing} είχαν ήδη · ${res.emailed} email${res.noConsent ? ` · ${res.noConsent} χωρίς συναίνεση (μόνο κωδικός, χωρίς email)` : ""}.` } : { ok: false, t: res.error });
    setIssue(null); router.refresh();
  });
  const pct = (n: number) => (customers ? Math.round((n / customers) * 1000) / 10 : 0);
  const field = (label: string, el: React.ReactNode, help?: string) => <label className={lbl}><span>{label}</span>{el}{help && <span className="font-normal text-eu-muted text-[length:var(--fs-12)]">{help}</span>}</label>;

  return (
    <div className="grid gap-4">
      {msg && <p role="status" className={`m-0 rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}

      {edit ? (
        <section id="seg-edit" data-help="promo.segments.editor" className="scroll-mt-4 grid gap-4 items-start @4xl:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="rounded-2xl bg-white border-2 border-eu-navy p-3 @md:p-4 grid gap-4 min-w-0">
            <div className="flex items-center justify-between gap-2"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{edit.id ? "Επεξεργασία κοινού" : "Νέο κοινό"}</h3><button type="button" aria-label="Κλείσιμο" onClick={() => setEdit(null)} className="size-10 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button></div>
            <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
              {field("Όνομα", <input className={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />)}
              {field("Περιγραφή (εσωτερική)", <input className={input} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value || null })} />)}
            </div>
            <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]">Συμπλήρωσε μόνο όσα θέλεις — ισχύουν <strong>όλα μαζί</strong>. Κενό = δεν μετράει.</p>
            <fieldset className="m-0 rounded-xl border border-eu-line p-3 grid gap-3"><legend className="px-1 font-extrabold text-eu-navy text-[length:var(--fs-14)]">Αγορές</legend>
              <div className="grid grid-cols-2 @3xl:grid-cols-3 gap-3">
                {field("Παραγγελίες από", <input inputMode="numeric" className={input} value={r.minOrders ?? ""} onChange={(e) => setR({ minOrders: num(e.target.value) })} />)}
                {field("Παραγγελίες έως", <input inputMode="numeric" className={input} value={r.maxOrders ?? ""} onChange={(e) => setR({ maxOrders: num(e.target.value) })} />, "0 = δεν έχουν αγοράσει")}
                {field("Συνολικές αγορές από (€)", <input inputMode="decimal" className={input} value={r.minSpent ?? ""} onChange={(e) => setR({ minSpent: num(e.target.value) })} />)}
                {field("Αγόρασαν τις τελευταίες … ημέρες", <input inputMode="numeric" className={input} value={r.orderedWithinDays ?? ""} onChange={(e) => setR({ orderedWithinDays: num(e.target.value) })} />)}
                {field("Χωρίς αγορά για … ημέρες", <input inputMode="numeric" className={input} value={r.noOrderForDays ?? ""} onChange={(e) => setR({ noOrderForDays: num(e.target.value) })} />)}
              </div>
              <div className="grid gap-1.5"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Αγόρασαν κάποτε από (μία από αυτές)</span>
                {(() => {
                  const chip = (c: Opt) => { const on = !!r.boughtCategories?.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => setR({ boughtCategories: on ? (r.boughtCategories ?? []).filter((x) => x !== c.id) : [...(r.boughtCategories ?? []), c.id] })} className={`rounded-full px-3 min-h-9 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line hover:border-eu-blue"}`}>{c.label.replace(/^— /, "")}</button>; };
                  const roots = categories.filter((c) => !c.label.startsWith("— ")), subs = categories.filter((c) => c.label.startsWith("— "));
                  const picked = subs.filter((c) => r.boughtCategories?.includes(c.id)).length;
                  return <>
                    <div className="flex flex-wrap gap-1.5">{roots.map(chip)}</div>
                    {subs.length > 0 && <details open={picked > 0} className="group"><summary className="cursor-pointer list-none inline-flex items-center min-h-9 font-bold text-eu-blue text-[length:var(--fs-13)] [&::-webkit-details-marker]:hidden">Υποκατηγορίες ({subs.length}){picked ? ` · ${picked} επιλεγμένες` : ""}</summary><div className="mt-1.5 flex flex-wrap gap-1.5">{subs.map(chip)}</div></details>}
                  </>;
                })()}
              </div>
            </fieldset>
            <fieldset className="m-0 rounded-xl border border-eu-line p-3 grid gap-3"><legend className="px-1 font-extrabold text-eu-navy text-[length:var(--fs-14)]">Λογαριασμός</legend>
              <div className="grid grid-cols-2 @3xl:grid-cols-3 gap-3 items-end">
                {field("Newsletter", <select className={input} value={r.newsletter == null ? "" : r.newsletter ? "yes" : "no"} onChange={(e) => setR({ newsletter: e.target.value === "" ? undefined : e.target.value === "yes" })}><option value="">Δεν μετράει</option><option value="yes">Συνδρομητές</option><option value="no">Όχι συνδρομητές</option></select>)}
                {field("Νέοι λογαριασμοί (ημέρες)", <input inputMode="numeric" className={input} value={r.joinedWithinDays ?? ""} onChange={(e) => setR({ joinedWithinDays: num(e.target.value) })} />)}
                <label className="inline-flex items-center gap-2 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><input type="checkbox" className="size-5 accent-eu-navy" checked={!!r.birthdayThisMonth} onChange={(e) => setR({ birthdayThisMonth: e.target.checked || undefined })} /> Γενέθλια αυτόν τον μήνα</label>
              </div>
              <fieldset className="m-0 p-0 border-0 grid gap-1"><legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Βαθμίδα πιστότητας</legend><div className="flex flex-wrap gap-x-4">{([["bronze", "Bronze"], ["silver", "Silver"], ["gold", "Gold"]] as const).map(([t, l]) => <label key={t} className="inline-flex items-center gap-1.5 min-h-11 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={!!r.tiers?.includes(t)} onChange={(e) => setR({ tiers: e.target.checked ? [...(r.tiers ?? []), t] : (r.tiers ?? []).filter((x) => x !== t) })} />{l}</label>)}</div></fieldset>
            </fieldset>
            <fieldset className="m-0 rounded-xl border border-eu-line p-3 grid grid-cols-1 @xl:grid-cols-2 gap-3"><legend className="px-1 font-extrabold text-eu-navy text-[length:var(--fs-14)]">Περιοχή & ετικέτες</legend>
              <label className={lbl}><span className="inline-flex items-center gap-1">Ταχυδρομικοί κώδικες <Hint k="zips" /></span><input className={input} value={(r.zips ?? []).join(", ")} onChange={(e) => setR({ zips: list(e.target.value) })} placeholder="π.χ. 54, 151" /><span className="font-normal text-eu-muted text-[length:var(--fs-12)]">Αρχή ΤΚ: «54» = όλη η Θεσσαλονίκη.</span></label>
              {field("Ετικέτες πελάτη", <input className={input} value={(r.tags ?? []).join(", ")} onChange={(e) => setR({ tags: list(e.target.value) })} placeholder="π.χ. b2b, vip" />)}
            </fieldset>
          </div>
          <aside aria-live="polite" className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 @4xl:[@media(min-height:760px)]:sticky @4xl:top-4">
            <span className="font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide inline-flex items-center gap-1.5">Ταιριάζουν τώρα {measuring && <Loader2 className="size-3.5 animate-spin" aria-label="μέτρηση" />}</span>
            <div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-32)] leading-none tabular-nums">{count ? count.count.toLocaleString("el-GR") : "…"}</div>
            {count && <>
              <div className="h-2 rounded-full bg-eu-surface overflow-hidden" aria-hidden><div className="h-full rounded-full bg-eu-blue" style={{ width: `${Math.min(100, pct(count.count))}%` }} /></div>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{pct(count.count).toLocaleString("el-GR")} % των {customers.toLocaleString("el-GR")} ενεργών πελατών · <b className="text-eu-ink">{count.consent.toLocaleString("el-GR")}</b> με συναίνεση για προωθητικά email</p>
            </>}
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Η μέτρηση ενημερώνεται μόνη της· μετά την αποθήκευση τα μέλη αλλάζουν αυτόματα όσο αλλάζουν οι πελάτες.</p>
            <button type="button" disabled={busy || !edit.name.trim()} onClick={save} className="rounded-full bg-eu-navy text-white px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] disabled:opacity-40">{busy ? "Αποθήκευση…" : "Αποθήκευση"}</button>
            {!edit.name.trim() && <span className="text-eu-muted text-[length:var(--fs-12)] -mt-2">Δώσε όνομα για αποθήκευση.</span>}
            <button type="button" onClick={() => setEdit(null)} className="rounded-full border-2 border-eu-line px-5 min-h-11 font-bold text-[length:var(--fs-14)]">Ακύρωση</button>
          </aside>
        </section>
      ) : (
        <section data-help="promo.segments.templates" aria-labelledby="seg-tpl" className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="seg-tpl" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Ξεκίνα από έτοιμο κοινό</h3>
            <button type="button" onClick={() => open({ id: null, name: "", description: null, rules: {} })} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέο κοινό από την αρχή</button>
          </div>
          <ul className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-5 gap-2">
            {PRESETS.map((p) => (
              <li key={p.name}><button type="button" onClick={() => open({ id: null, name: p.name, description: null, rules: p.rules })} className="w-full h-full text-left grid gap-1 content-start rounded-2xl bg-white border border-eu-line p-3 hover:border-eu-blue">
                <p.I className="size-5 text-eu-blue" aria-hidden /><span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug">{p.name}</span><span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{p.desc}</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}

      <dialog ref={dlg} onClose={() => setIssue(null)} aria-label="Προσωπικά κουπόνια σε κοινό" className="m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl p-0 backdrop:bg-black/40">
        {issue && (
          <div className="bg-white p-4 @md:p-5 grid gap-3">
            <div className="flex items-start justify-between gap-2"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Προσωπικά κουπόνια στο «{segments.find((s) => s.id === issue.segmentId)?.name}»</h3><button type="button" aria-label="Κλείσιμο" onClick={() => setIssue(null)} className="size-10 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button></div>
            {coupons.length ? <>
              <label className={lbl}><span>Προσφορά-κουπόνι</span><select className={input} value={issue.promotionCode} onChange={(e) => setIssue({ ...issue, promotionCode: e.target.value })}>{coupons.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
              <label className="inline-flex items-center gap-2 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><input type="checkbox" className="size-5 accent-eu-navy" checked={issue.send} onChange={(e) => setIssue({ ...issue, send: e.target.checked })} /> Αποστολή email (μόνο σε όσους έχουν δώσει συναίνεση)</label>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κάθε μέλος παίρνει έναν μοναδικό κωδικό μίας χρήσης· όσα έχουν ήδη από αυτή την προσφορά δεν παίρνουν δεύτερο.</p>
              <div className="flex gap-2"><button type="button" disabled={busy} onClick={runIssue} className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] disabled:opacity-40"><Send className="size-4" aria-hidden /> {busy ? "Έκδοση…" : "Έκδοση"}</button><button type="button" onClick={() => setIssue(null)} className="rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)]">Άκυρο</button></div>
            </> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Φτιάξε πρώτα μια ενεργή προσφορά-κουπόνι.</p>}
          </div>
        )}
      </dialog>

      <section data-help="promo.segments.list" aria-labelledby="seg-list" className="grid gap-2">
        <h3 id="seg-list" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Τα κοινά σου ({segments.length})</h3>
        {segments.length ? (
          <ul className="m-0 p-0 list-none grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-3 gap-3">
            {segments.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white border border-eu-line p-3 grid gap-2 content-start">
                <div className="flex items-start justify-between gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5 min-w-0"><Users className="size-4 shrink-0 text-eu-blue" aria-hidden /><span className="truncate">{s.name}</span></span><span className="shrink-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{s.members.toLocaleString("el-GR")}</span></div>
                <div className="h-1.5 rounded-full bg-eu-surface overflow-hidden" aria-hidden><div className="h-full rounded-full bg-eu-blue" style={{ width: `${Math.min(100, pct(s.members))}%` }} /></div>
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{s.summary}</p>
                <p className="m-0 flex flex-wrap gap-x-3 text-eu-muted text-[length:var(--fs-12)]"><span>{pct(s.members).toLocaleString("el-GR")} % των πελατών</span><span className="inline-flex items-center gap-1"><Tag className="size-3" aria-hidden />{s.usedIn ? `σε ${s.usedIn} ${s.usedIn === 1 ? "προσφορά" : "προσφορές"}` : "σε καμία προσφορά"}</span>{s.computedAt && <span>μέτρηση {new Date(s.computedAt).toLocaleDateString("el-GR")}</span>}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => open({ id: s.id, name: s.name, description: s.description, rules: s.rules })} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><Pencil className="size-3.5" aria-hidden /> Αλλαγή</button>
                  <button type="button" onClick={() => setIssue({ segmentId: s.id, promotionCode: coupons[0]?.id ?? "", send: true })} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><Send className="size-3.5" aria-hidden /> Κουπόνια</button>
                  <button type="button" disabled={busy} onClick={() => archive(s.id)} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] text-eu-ink-3 hover:text-eu-red"><Archive className="size-3.5" aria-hidden /> Απόσυρση</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 rounded-2xl bg-white border border-dashed border-eu-line p-4 text-eu-muted text-[length:var(--fs-14)]">Κανένα κοινό ακόμη — ξεκίνα από ένα έτοιμο παραπάνω ή «Νέο κοινό από την αρχή».</p>}
      </section>
    </div>
  );
}
