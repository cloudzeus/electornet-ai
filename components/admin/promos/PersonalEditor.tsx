"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, Play, Plus, Trash2, Heart, RefreshCw, ShoppingCart, Puzzle } from "lucide-react";
import type { PersonalConfig, PersonalKind, PersonalRule } from "@/lib/promo/personal";
import { previewPersonalAction, runPersonalAction, savePersonalAction } from "@/app/admin/(shell)/prosfores/actions";

type Opt = { id: string; label: string };
const input = "w-full min-w-0 rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2 min-w-0";
const hint = "font-normal text-eu-muted text-[length:var(--fs-13)]";
const META: Record<PersonalKind, { title: string; desc: string; Icon: typeof Heart }> = {
  wishlist: { title: "Λίστα επιθυμιών", desc: "Πελάτης με προϊόν στη λίστα του → έκπτωση μόνο σε αυτό το προϊόν.", Icon: Heart },
  replace: { title: "Αντικατάσταση παλιάς συσκευής", desc: "Δηλωμένη συσκευή παλαιότερη από Χ χρόνια, ή φωτογραφία της συσκευής που θέλει να αντικαταστήσει → έκπτωση στην ίδια κατηγορία.", Icon: RefreshCw },
  cart: { title: "Καλάθι που έμεινε", desc: "Προϊόν στο καλάθι χωρίς ολοκλήρωση για Χ ώρες → έκπτωση σε αυτό (το ακριβότερο του καλαθιού).", Icon: ShoppingCart },
  complement: { title: "Συμπληρωματικά μετά από αγορά", desc: "Αγορά σε μια κατηγορία → έκπτωση σε μια άλλη που ταιριάζει (π.χ. τηλεόραση → soundbar).", Icon: Puzzle },
};
type Preview = Awaited<ReturnType<typeof previewPersonalAction>>;

function Num({ l, v, on, help, suffix }: { l: string; v: number | undefined; on: (n: number) => void; help: string; suffix?: string }) {
  return (
    <label className={lbl}><span>{l}</span>
      <span className="flex items-center gap-2"><input inputMode="numeric" className={input} value={v ?? ""} onChange={(e) => on(Number(e.target.value.replace(/\D/g, "")) || 0)} />{suffix && <span className="shrink-0 font-semibold">{suffix}</span>}</span>
      <span className={hint}>{help}</span>
    </label>
  );
}

/** Οι τέσσερις κανόνες, προεπισκόπηση και έκδοση. */
export function PersonalEditor({ initial, stats, categories }: { initial: PersonalConfig; stats: { kind: PersonalKind; issued: number; used: number }[]; categories: Opt[] }) {
  const router = useRouter();
  const [cfg, setCfg] = useState(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const setRule = (k: PersonalKind, p: Partial<PersonalRule>) => { setPreview(null); setCfg((c) => ({ ...c, rules: { ...c.rules, [k]: { ...c.rules[k], ...p } } })); };
  const save = () => start(async () => { const r = await savePersonalAction(cfg); if (!r.ok) return setMsg({ ok: false, t: r.error }); setCfg(r.config); setMsg({ ok: true, t: "Αποθηκεύτηκε. Η έκδοση γίνεται αυτόματα κάθε πρωί." }); router.refresh(); });
  const doPreview = () => start(async () => setPreview(await previewPersonalAction(cfg)));
  const run = () => confirm("Έκδοση προσωπικών κωδικών τώρα, με τις αποθηκευμένες ρυθμίσεις;") && start(async () => { const r = await runPersonalAction(); setMsg({ ok: true, t: `Εκδόθηκαν ${r.issued} κωδικοί · ${r.emailed} email.` }); router.refresh(); });

  return (
    <div className="grid gap-4">
      {msg && <p role="status" className={`m-0 rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-3">
        {(Object.keys(META) as PersonalKind[]).map((k) => {
          const r = cfg.rules[k], M = META[k], st = stats.find((s) => s.kind === k);
          return (
            <section key={k} className={`rounded-2xl border-2 p-4 grid gap-3 content-start ${r.enabled ? "border-eu-navy bg-white" : "border-eu-line bg-white"}`}>
              <div className="flex items-start gap-3">
                <span className={`size-10 shrink-0 rounded-xl grid place-items-center ${r.enabled ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-muted"}`}><M.Icon className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-16)]">{M.title}</h3>
                  <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{M.desc}</p>
                  {st && st.issued > 0 && <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-13)]">90 ημέρες: {st.issued} κωδικοί · {st.used} χρησιμοποιήθηκαν ({Math.round((st.used / st.issued) * 100)} %)</p>}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 min-h-11 font-bold text-[length:var(--fs-15)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={r.enabled} onChange={(e) => setRule(k, { enabled: e.target.checked })} /> {r.enabled ? "Ενεργός" : "Κλειστός"}</label>
              {r.enabled && (
                <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3">
                  <Num l="Έκπτωση" v={r.percent} on={(n) => setRule(k, { percent: n })} suffix="%" help="Στο προϊόν / την κατηγορία της αφορμής μόνο." />
                  <Num l="Ισχύς κωδικού" v={r.validDays} on={(n) => setRule(k, { validDays: n })} suffix="ημέρες" help="Από την ημέρα έκδοσης." />
                  <Num l="Περίοδος αναμονής" v={r.cooldownDays} on={(n) => setRule(k, { cooldownDays: n })} suffix="ημέρες" help="Ο ίδιος πελάτης δεν ξαναπαίρνει κωδικό για την ίδια αφορμή πριν περάσει." />
                  {r.minPrice != null && <Num l="Ελάχιστη τιμή προϊόντος" v={r.minPrice} on={(n) => setRule(k, { minPrice: n })} suffix="€" help="Για φθηνότερα προϊόντα δεν βγαίνει κωδικός." />}
                  {r.minAgeYears != null && <Num l="Συσκευή παλαιότερη από" v={r.minAgeYears} on={(n) => setRule(k, { minAgeYears: n })} suffix="χρόνια" help="Από την ημερομηνία αγοράς ή την εκτίμηση της φωτογραφίας." />}
                  {r.idleHours != null && <Num l="Μετά από" v={r.idleHours} on={(n) => setRule(k, { idleHours: n })} suffix="ώρες" help="Χωρίς αλλαγή στο καλάθι και χωρίς παραγγελία." />}
                  {r.withinDays != null && <Num l="Αγορές των τελευταίων" v={r.withinDays} on={(n) => setRule(k, { withinDays: n })} suffix="ημερών" help="Πόσο πίσω κοιτάμε στις παραγγελίες." />}
                </div>
              )}
              {r.enabled && k === "complement" && (
                <div className="grid gap-2">
                  <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Ζεύγη: αγόρασε από → έκπτωση σε</span>
                  {(r.pairs ?? []).map((p, i) => (
                    <div key={i} className="grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center rounded-xl bg-eu-surface p-2">
                      <select aria-label="Αγόρασε από" className={input} value={p.from} onChange={(e) => setRule(k, { pairs: r.pairs!.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })}><option value="">Αγόρασε από…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                      <select aria-label="Έκπτωση σε" className={input} value={p.to} onChange={(e) => setRule(k, { pairs: r.pairs!.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })}><option value="">Έκπτωση σε…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                      <button type="button" aria-label="Αφαίρεση ζεύγους" onClick={() => setRule(k, { pairs: r.pairs!.filter((_, j) => j !== i) })} className="justify-self-end size-11 grid place-items-center rounded-full hover:bg-eu-red/10 text-eu-red"><Trash2 className="size-4" aria-hidden /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setRule(k, { pairs: [...(r.pairs ?? []), { from: "", to: "" }] })} className="justify-self-start inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)]"><Plus className="size-4" aria-hidden /> Ζεύγος</button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid grid-cols-1 @3xl:grid-cols-2 gap-3">
        <label className="grid gap-1 min-w-0"><span className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={cfg.sendEmail} onChange={(e) => setCfg({ ...cfg, sendEmail: e.target.checked })} /> Αποστολή email με τον κωδικό</span><span className={hint}>Μόνο σε πελάτες με συναίνεση για προωθητικά. Όλοι βλέπουν τον κωδικό στο «Οι προσφορές μου».</span></label>
        <Num l="Μέγιστο ανά πελάτη σε κάθε έκδοση" v={cfg.maxPerCustomer} on={(n) => setCfg({ ...cfg, maxPerCustomer: n })} help="Για να μη γεμίσει ένας πελάτης κωδικούς." />
      </section>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={doPreview} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Eye className="size-4" aria-hidden /> Προεπισκόπηση</button>
        <button type="button" disabled={busy} onClick={save} className="rounded-full bg-eu-navy text-white px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] disabled:opacity-40">{busy ? "…" : "Αποθήκευση"}</button>
        <button type="button" disabled={busy} onClick={run} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Play className="size-4" aria-hidden /> Έκδοση τώρα</button>
      </div>
      {preview && (
        <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3" aria-live="polite">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-16)]">Με αυτές τις ρυθμίσεις: {preview.total} κωδικοί σε {preview.customers} πελάτες</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{(Object.keys(META) as PersonalKind[]).map((k) => `${META[k].title}: ${preview.byKind[k] ?? 0}`).join(" · ")}</p>
          {preview.sample.length > 0 ? (
            <ul className="m-0 p-0 list-none grid grid-cols-1 @3xl:grid-cols-2 gap-2">
              {preview.sample.map((x, i) => <li key={i} className="rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)] min-w-0"><span className="block font-bold text-eu-ink truncate">{x.who}</span><span className="block text-eu-ink-2">{x.reason}: <strong>{x.target}</strong></span><span className="block text-eu-muted text-[length:var(--fs-13)]">{META[x.kind as PersonalKind].title}</span></li>)}
            </ul>
          ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Κανείς δεν πληροί τα κριτήρια σήμερα — άλλαξε κανόνες ή περίμενε να μαζευτούν δεδομένα (λίστες, συσκευές, παραγγελίες).</p>}
        </section>
      )}
    </div>
  );
}
