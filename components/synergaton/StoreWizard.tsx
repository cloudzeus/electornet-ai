"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { saveStoreProfile } from "@/app/synergaton/actions";
import { checkProfile, DAYS, STORE_SERVICES, type Hours, type StoreProfile } from "@/lib/partner-portal/store-profile";
import { Badge, btn, Callout, focusRing } from "./ui";
import { ConfirmModal, Field, inputCls, Wizard, WizardNav, type WizardStep } from "./wizard";

const STEPS: WizardStep[] = [
  { key: "contact", title: "Επικοινωνία", hint: "Πώς σας βρίσκουν οι πελάτες. Φαίνονται στη σελίδα του καταστήματος και στο email παραλαβής." },
  { key: "hours", title: "Ωράριο", hint: "Οι ημέρες και ώρες λειτουργίας. Το eshop δείχνει «Ανοιχτό έως…» και ποτέ δεν υπόσχεται παραλαβή όταν είστε κλειστά." },
  { key: "services", title: "Υπηρεσίες", hint: "Τι προσφέρει το κατάστημα. Η «Παραλαβή παραγγελιών» το κάνει επιλογή στο checkout." },
  { key: "review", title: "Έλεγχος & αποθήκευση", hint: "Δείτε τι αλλάζει πριν το αποθηκεύσετε." },
];
const LABEL: Record<keyof StoreProfile, string> = { phone: "Σταθερό", mobile: "Κινητό", email: "Email", hours: "Ωράριο", services: "Υπηρεσίες", notes: "Σημείωμα για πελάτες" };
const fmtHours = (h: Hours) => (h.length ? DAYS.filter(([d]) => h.some((x) => x.day === d)).map(([d, n]) => h.filter((x) => x.day === d).map((x) => `${n.slice(0, 3)} ${x.open}–${x.close}`).join(", ")).join(" · ") : "—");
const fmtVal = (k: keyof StoreProfile, v: StoreProfile[keyof StoreProfile]) => (k === "hours" ? fmtHours(v as Hours) : k === "services" ? ((v as string[]).map((s) => STORE_SERVICES.find((x) => x.key === s)?.label ?? s).join(", ") || "—") : (v as string) || "—");

export function StoreWizard({ storeId, initial, storeName }: { storeId: string; initial: StoreProfile; storeName: string }) {
  const router = useRouter();
  const [p, setP] = useState<StoreProfile>(initial);
  const [cur, setCur] = useState(0);
  const [blurred, setBlurred] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [serverErr, setServerErr] = useState<{ error: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  const errors = { ...checkProfile(p), ...(serverErr?.fields ?? {}) };
  const show = (k: string) => (blurred.has(k) || cur === 3 ? errors[k] : undefined);
  const touch = (k: string) => setBlurred((s) => new Set(s).add(k));
  const stepErr = (i: number) => (i === 0 ? ["phone", "mobile", "email"] : i === 1 ? Object.keys(errors).filter((k) => k === "hours" || /^h\d$/.test(k)) : i === 2 ? ["notes"] : []).filter((k) => errors[k]);
  const changed = useMemo(() => (Object.keys(LABEL) as (keyof StoreProfile)[]).filter((k) => JSON.stringify(p[k]) !== JSON.stringify(initial[k])), [p, initial]);
  const done = new Set(STEPS.filter((_, i) => i < 3 && !stepErr(i).length && (i < cur || saved)).map((s) => s.key));

  const setHours = (h: Hours) => setP((x) => ({ ...x, hours: [...h].sort((a, b) => ((a.day || 7) - (b.day || 7)) || a.open.localeCompare(b.open)) }));
  const toggleDay = (d: number) => setHours(p.hours.some((h) => h.day === d) ? p.hours.filter((h) => h.day !== d) : [...p.hours, { day: d, open: "09:00", close: d === 6 ? "18:00" : "21:00" }]);
  const copyMon = () => { const mon = p.hours.filter((h) => h.day === 1); if (!mon.length) return; setHours([...p.hours.filter((h) => ![2, 3, 4, 5].includes(h.day)), ...[2, 3, 4, 5].flatMap((d) => mon.map((m) => ({ ...m, day: d })))]); };

  const save = () => start(async () => {
    setServerErr(null);
    const r = await saveStoreProfile(storeId, p);
    setConfirm(false);
    if (!r.ok) { setServerErr({ error: r.error, fields: r.fields }); return; }
    setSaved(r.changed); router.refresh();
  });

  return (
    <>
      <Wizard title={`Προφίλ καταστήματος ${storeName}`} steps={STEPS} current={cur} done={done} onStep={setCur}
        footer={<WizardNav onBack={cur ? () => setCur(cur - 1) : undefined} busy={pending}
          onNext={cur < 3 ? () => { stepErr(cur).forEach(touch); if (!stepErr(cur).length) setCur(cur + 1); } : () => setConfirm(true)}
          nextLabel={cur < 3 ? "Συνέχεια" : changed.length ? `Αποθήκευση ${changed.length === 1 ? "1 αλλαγής" : `${changed.length} αλλαγών`}` : "Καμία αλλαγή"}
          nextDisabled={cur === 3 && (!changed.length || Object.keys(errors).length > 0)}
          note={stepErr(cur).length ? `${stepErr(cur).length} ${stepErr(cur).length === 1 ? "πεδίο θέλει" : "πεδία θέλουν"} διόρθωση` : changed.length ? `${changed.length} ${changed.length === 1 ? "αλλαγή" : "αλλαγές"} σε εκκρεμότητα` : "Χωρίς αλλαγές"} />}>
        {serverErr && <div className="mb-4"><Callout tone="bad">{serverErr.error}</Callout></div>}
        {saved && cur === 3 && <div className="mb-4"><Callout tone="good" title={saved.length ? "Αποθηκεύτηκε — ισχύει ήδη στο eshop" : "Δεν υπήρχαν αλλαγές"}>{saved.length ? `Άλλαξαν: ${saved.map((k) => LABEL[k as keyof StoreProfile]).join(", ")}.` : null}</Callout></div>}

        {cur === 0 && (
          <div className="grid gap-4 md:grid-cols-2 max-w-[48rem]">
            <Field id="phone" label="Σταθερό τηλέφωνο" help="10 ψηφία, π.χ. 210 123 4567" error={show("phone")}>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} onBlur={() => touch("phone")} className={inputCls(!!show("phone"))} aria-invalid={!!show("phone")} />
            </Field>
            <Field id="mobile" label="Κινητό" help="Για ειδοποιήσεις παραλαβής (δεν φαίνεται στους πελάτες αν υπάρχει σταθερό)" error={show("mobile")}>
              <input id="mobile" type="tel" inputMode="tel" value={p.mobile} onChange={(e) => setP({ ...p, mobile: e.target.value })} onBlur={() => touch("mobile")} className={inputCls(!!show("mobile"))} aria-invalid={!!show("mobile")} />
            </Field>
            <div className="md:col-span-2"><Field id="email" label="Email καταστήματος" help="Εδώ έρχονται οι παραγγελίες παραλαβής" error={show("email")}>
              <input id="email" type="email" inputMode="email" autoComplete="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} onBlur={() => touch("email")} className={inputCls(!!show("email"))} aria-invalid={!!show("email")} />
            </Field></div>
          </div>
        )}

        {cur === 1 && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2"><button type="button" onClick={copyMon} className={btn("secondary", "sm")}><Copy className="size-4" aria-hidden /> Ίδιο ωράριο Δευ–Παρ</button></div>
            <ul className="m-0 p-0 list-none grid gap-2">
              {DAYS.map(([d, name]) => {
                const slots = p.hours.filter((h) => h.day === d), open = slots.length > 0, e = show(`h${d}`);
                return (
                  <li key={d} className={`rounded-xl border-2 px-3 py-2.5 grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center ${e ? "border-[#e0786e]" : "border-eu-line"}`}>
                    <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                      <input type="checkbox" checked={open} onChange={() => toggleDay(d)} className="size-5 accent-[#122a58]" />
                      <span className="font-bold text-[length:var(--fs-14)]">{name}</span>
                    </label>
                    {open ? (
                      <div className="grid gap-2">
                        {slots.map((h, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <label className="sr-only" htmlFor={`o${d}${i}`}>{name}: άνοιγμα</label>
                            <input id={`o${d}${i}`} type="time" value={h.open} onBlur={() => touch(`h${d}`)} onChange={(ev) => setHours(p.hours.map((x) => (x === h ? { ...x, open: ev.target.value } : x)))} className={`${inputCls()} !w-32 tabular-nums`} />
                            <span aria-hidden>–</span>
                            <label className="sr-only" htmlFor={`c${d}${i}`}>{name}: κλείσιμο</label>
                            <input id={`c${d}${i}`} type="time" value={h.close} onBlur={() => touch(`h${d}`)} onChange={(ev) => setHours(p.hours.map((x) => (x === h ? { ...x, close: ev.target.value } : x)))} className={`${inputCls()} !w-32 tabular-nums`} />
                            {i === 0 && slots.length < 2 && <button type="button" onClick={() => setHours([...p.hours, { day: d, open: "17:30", close: "21:00" }])} className={btn("ghost", "sm")} aria-label={`${name}: δεύτερο διάστημα (διακεκομμένο)`}><Plus className="size-4" aria-hidden /> Διακεκομμένο</button>}
                            {i > 0 && <button type="button" onClick={() => setHours(p.hours.filter((x) => x !== h))} className={`grid place-items-center size-11 rounded-full text-eu-ink-3 hover:bg-eu-surface-2 ${focusRing}`} aria-label={`${name}: αφαίρεση διαστήματος`}><Trash2 className="size-4" aria-hidden /></button>}
                          </div>
                        ))}
                        {e && <p role="alert" className="m-0 text-[#b3261e] font-bold text-[length:var(--fs-13)]">{e}</p>}
                      </div>
                    ) : <span className="text-eu-muted text-[length:var(--fs-14)]">Κλειστό</span>}
                  </li>
                );
              })}
            </ul>
            {show("hours") && <Callout tone="bad">{show("hours")}</Callout>}
          </div>
        )}

        {cur === 2 && (
          <div className="grid gap-5">
            <fieldset className="m-0 p-0 border-0 grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Υπηρεσίες</legend>
              {STORE_SERVICES.map((s) => {
                const on = p.services.includes(s.key);
                return (
                  <label key={s.key} className={`flex items-start gap-3 rounded-xl border-2 p-3 min-h-14 cursor-pointer transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-eu-blue/40 ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-muted-3"}`}>
                    <input type="checkbox" checked={on} onChange={() => setP({ ...p, services: on ? p.services.filter((x) => x !== s.key) : [...p.services, s.key] })} className="sr-only" />
                    <span className={`grid place-items-center size-5 rounded-md border-2 shrink-0 mt-0.5 ${on ? "bg-eu-navy border-eu-navy text-white" : "border-eu-muted-3"}`} aria-hidden>{on && <Check className="size-3.5" />}</span>
                    <span><b className="block text-[length:var(--fs-14)]">{s.label}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">{s.help}</span></span>
                  </label>
                );
              })}
            </fieldset>
            {!p.services.includes("click-collect") && <Callout tone="warn">Χωρίς «Παραλαβή παραγγελιών» το κατάστημα δεν εμφανίζεται ως επιλογή στο checkout.</Callout>}
            <Field id="notes" label="Σημείωμα για τους πελάτες" help="π.χ. «Είσοδος από την πίσω πλευρά, parking στο υπόγειο»" error={show("notes")} counter={`${p.notes.length}/600`}>
              <textarea id="notes" rows={3} value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} onBlur={() => touch("notes")} className={`${inputCls(!!show("notes"))} py-3 min-h-28`} />
            </Field>
          </div>
        )}

        {cur === 3 && (
          <div className="grid gap-4">
            {Object.keys(errors).length > 0 && <Callout tone="bad" title="Υπάρχουν πεδία που θέλουν διόρθωση">{Object.entries(errors).map(([k, v]) => <p key={k}>· {v}</p>)}</Callout>}
            <ul className="m-0 p-0 list-none grid gap-2">
              {(Object.keys(LABEL) as (keyof StoreProfile)[]).map((k) => {
                const ch = changed.includes(k);
                return (
                  <li key={k} className={`rounded-xl px-3.5 py-3 grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] ${ch ? "bg-[#fffbea] border-2 border-eu-yellow" : "bg-eu-surface"}`}>
                    <span className="font-bold text-[length:var(--fs-13)] text-eu-ink-2 flex items-center gap-2">{LABEL[k]}{ch && <Badge tone="brand" icon={false}>αλλαγή</Badge>}</span>
                    <span className="min-w-0 text-[length:var(--fs-14)] break-words">{ch ? <><s className="text-eu-muted">{fmtVal(k, initial[k])}</s><br /><b>{fmtVal(k, p[k])}</b></> : fmtVal(k, p[k])}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Wizard>
      <ConfirmModal open={confirm} title="Αποθήκευση αλλαγών;" confirmLabel="Ναι, αποθήκευση" busy={pending} onConfirm={save} onCancel={() => setConfirm(false)}>
        <p className="m-0">Οι αλλαγές ισχύουν αμέσως στο euronics.gr για το <b>{storeName}</b>:</p>
        <ul className="m-0 pl-5">{changed.map((k) => <li key={k}><b>{LABEL[k]}</b>: {fmtVal(k, p[k])}</li>)}</ul>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Κρατάμε ιστορικό: ποιος άλλαξε τι και πότε.</p>
      </ConfirmModal>
    </>
  );
}
