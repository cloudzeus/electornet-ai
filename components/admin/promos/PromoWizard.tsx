"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Lock, Search, X, Plus, Check, AlertTriangle, ShieldCheck, Store, Sparkles, ChevronLeft, ChevronRight, Ban } from "lucide-react";
import type { PromoDraft, DraftAnalysis } from "@/lib/promo/admin";
import type { PromoTarget } from "@/lib/promo/engine";
import { TEMPLATES, STACKING_LABEL, STATUS_LABEL, autoLabel, describePromo, type PromoStatus } from "@/lib/promo/catalog";
import { HelpPanel, Hint } from "./Help";
import { STEP_HELP } from "@/lib/promo/help";
import { analyzeAction, rootCategoriesAction, saveAction, searchTargetsAction } from "@/app/admin/(shell)/prosfores/actions";

type Svc = { slug: string; title: string; price: number };
const STEPS = ["Πρότυπο", "Προϊόντα", "Κανόνες", "Εμφάνιση", "Έλεγχος"] as const;
const GROUPS: { key: string; label: string }[] = [
  { key: "price", label: "Έκπτωση τιμής" }, { key: "qty", label: "Πολλά τεμάχια" }, { key: "extra", label: "Παροχές" }, { key: "coupon", label: "Κουπόνια" }, { key: "held", label: "Ανενεργά μέχρι διευκρίνιση" },
];
const toEur = (c?: number | null) => (c == null ? "" : String(c / 100));
const toCents = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && s.trim() !== "" ? Math.round(v * 100) : undefined; };
const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const localDt = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const label = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2";

function Field({ l, children, hint, info }: { l: string; children: ReactNode; hint?: string; info?: string }) {
  return <label className={label}><span className="inline-flex items-center gap-1">{l}{info && <Hint k={info} />}</span>{children}{hint && <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">{hint}</span>}</label>;
}

/** Ο οδηγός: πρότυπο → προϊόντα → κανόνες → εμφάνιση → έλεγχος. Ό,τι συμπληρώνεται εδώ τρέχει στην ίδια μηχανή με το καλάθι. */
export function PromoWizard({ initial, names: initialNames, status, code, canApprove, services, startStep = 0 }: { initial: PromoDraft; names: Record<string, string>; status: PromoStatus | null; code: string | null; canApprove: boolean; services: Svc[]; startStep?: number }) {
  const router = useRouter();
  const [d, setD] = useState<PromoDraft>(initial);
  const [step, setStep] = useState(startStep);
  const [names, setNames] = useState(initialNames);
  const [analysis, setAnalysis] = useState<DraftAnalysis | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, start] = useTransition();
  const set = (patch: Partial<PromoDraft>) => setD((x) => ({ ...x, ...patch }));
  const setReward = (patch: Partial<PromoDraft["reward"]>) => setD((x) => ({ ...x, reward: { ...x.reward, ...patch } }));
  const setRules = (patch: Partial<PromoDraft["rules"]>) => setD((x) => ({ ...x, rules: { ...x.rules, ...patch } }));
  const isCoupon = d.mechanism.startsWith("coupon");
  const svcTitle = services.find((s) => s.slug === d.reward.serviceSlug)?.title;
  const summary = describePromo(d, { gift: names[d.reward.giftProductId ?? ""], service: svcTitle?.toLocaleLowerCase("el-GR") });

  useEffect(() => {
    if (step !== 4) return;
    let live = true;
    void analyzeAction(d).then((a) => { if (live) setAnalysis(a); });
    return () => { live = false; };
  }, [step, d]);

  const pickTemplate = (key: string) => {
    const t = TEMPLATES.find((x) => x.key === key)!;
    if (t.held) return;
    setD((x) => ({ ...x, template: t.key, mechanism: t.mechanism, stacking: x.id ? x.stacking : t.stacking, reward: structuredClone(t.reward), rules: { ...structuredClone(t.rules ?? {}), ...pickKeep(x.rules) } }));
    setStep(1);
  };

  const save = (intent: "draft" | "publish") => start(async () => {
    setMsg(null);
    const r = await saveAction(d, intent);
    if (!r.ok) { setMsg({ tone: "err", text: (r.errors ?? ["Δεν αποθηκεύτηκε."]).join(" ") }); return; }
    const st = r.status ? STATUS_LABEL[r.status].label : "";
    setMsg({ tone: "ok", text: intent === "publish" ? (r.status === "pending" ? `Στάλθηκε για έγκριση (${r.approval?.join(", ")}).` : `Δημοσιεύτηκε · ${st}. Η βιτρίνα ενημερώνεται.`) : `Αποθηκεύτηκε · ${st}.` });
    if (!d.id && r.id) router.replace(`/admin/prosfores/${r.id}?step=${step}`);
    else router.refresh();
    if (r.id) set({ id: r.id });
  });

  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/prosfores" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλες οι προσφορές</Link>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{d.name || (d.id ? "Προσφορά" : "Νέα προσφορά")}</h2>
          <div className="text-eu-ink-3 text-[length:var(--fs-14)]">{code && <span className="font-mono">{code} · </span>}{status && <span className="font-bold">{STATUS_LABEL[status].label} · </span>}{summary}</div>
        </div>
      </div>

      <ol className="m-0 p-0 list-none grid grid-cols-5 gap-1.5" aria-label="Βήματα">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className={`w-full rounded-xl px-2 min-h-12 text-left border-2 ${i === step ? "border-eu-navy bg-eu-navy text-white" : i < step ? "border-eu-line bg-eu-chip text-eu-navy" : "border-eu-line bg-white text-eu-muted"}`}>
              <span className="block text-[length:var(--fs-13)] font-bold">{i + 1}</span>
              <span className="block font-extrabold text-[length:var(--fs-14)] truncate">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <HelpPanel key={step} id={`wizard-${step}`} topic={STEP_HELP[step]} compact />

      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-5 min-w-0">
        {step === 0 && (
          <div className="grid gap-5">
            {GROUPS.map((g) => (
              <div key={g.key} className="grid gap-2">
                <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{g.label}</h3>
                <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 gap-2.5">
                  {TEMPLATES.filter((t) => t.group === g.key).map((t) => (
                    <button key={t.key} type="button" onClick={() => pickTemplate(t.key)} disabled={!!t.held} aria-pressed={d.template === t.key}
                      className={`text-left rounded-2xl border-2 p-4 grid gap-1 ${t.held ? "border-dashed border-eu-line bg-eu-surface cursor-not-allowed" : d.template === t.key ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                      <span className="font-extrabold text-eu-ink text-[length:var(--fs-16)] inline-flex items-center gap-1.5">{t.held && <Lock className="size-4 text-eu-muted" aria-hidden />}{t.title}</span>
                      <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{t.blurb}</span>
                      <span className="text-eu-muted text-[length:var(--fs-13)] italic">π.χ. {t.example}</span>
                      {t.held && <span className="text-eu-amber font-bold text-[length:var(--fs-13)]">{t.held}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 1 && <TargetsStep d={d} set={set} setReward={setReward} names={names} setNames={setNames} services={services} />}

        {step === 2 && (
          <div className="grid gap-5">
            <RewardFields d={d} setReward={setReward} />
            <p className="m-0 rounded-xl bg-eu-surface px-4 py-3 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed">
              Ισχύει για{" "}
              <select aria-label="Πελάτες" value={d.rules.customers ?? "all"} onChange={(e) => setRules({ customers: e.target.value as "all" })} className="inline rounded-lg border-2 border-eu-line px-2 min-h-10 bg-white font-bold">
                <option value="all">όλους τους πελάτες</option><option value="new">την πρώτη αγορά</option><option value="registered">τα μέλη (με λογαριασμό)</option>
              </select>
              , σε καλάθι από{" "}
              <input aria-label="Ελάχιστη αξία σε €" inputMode="decimal" value={toEur(d.rules.minValue)} onChange={(e) => setRules({ minValue: toCents(e.target.value) })} placeholder="0" className="inline-block w-24 rounded-lg border-2 border-eu-line px-2 min-h-10 bg-white font-bold text-right" /> €
              {" "}και από{" "}
              <input aria-label="Ελάχιστα τεμάχια" inputMode="numeric" value={d.rules.minQty ?? ""} onChange={(e) => setRules({ minQty: Number(e.target.value) || undefined })} placeholder="1" className="inline-block w-16 rounded-lg border-2 border-eu-line px-2 min-h-10 bg-white font-bold text-right" /> τεμάχια,{" "}
              <select aria-label="Κανάλι" value={(d.rules.channels ?? []).join(",")} onChange={(e) => setRules({ channels: e.target.value ? (e.target.value.split(",") as ("online" | "click-collect")[]) : undefined })} className="inline rounded-lg border-2 border-eu-line px-2 min-h-10 bg-white font-bold">
                <option value="">με αποστολή ή παραλαβή</option><option value="online">μόνο με αποστολή</option><option value="click-collect">μόνο παραλαβή από κατάστημα</option>
              </select>.
            </p>
            <p className="m-0 -mt-3 flex flex-wrap gap-x-4 gap-y-1 text-eu-muted text-[length:var(--fs-13)]">
              <span className="inline-flex items-center">Πελάτες <Hint k="customers" /></span><span className="inline-flex items-center">Ελάχιστη αξία <Hint k="minValue" /></span><span className="inline-flex items-center">Τεμάχια <Hint k="minQty" /></span><span className="inline-flex items-center">Κανάλι <Hint k="channels" /></span>
            </p>
            <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
              <Field info="startsAt" l="Έναρξη" hint="Κενό = αμέσως μόλις δημοσιευτεί"><input type="datetime-local" className={input} value={localDt(d.startsAt)} onChange={(e) => set({ startsAt: fromLocal(e.target.value) })} /></Field>
              <Field info="endsAt" l="Λήξη" hint="Κενό = χωρίς λήξη (δεν συνιστάται)"><input type="datetime-local" className={input} value={localDt(d.endsAt)} onChange={(e) => set({ endsAt: fromLocal(e.target.value) })} /></Field>
              <Field info="maxUses" l="Μέγιστες χρήσεις συνολικά"><input inputMode="numeric" className={input} value={d.maxUses ?? ""} onChange={(e) => set({ maxUses: Number(e.target.value) || null })} placeholder="απεριόριστες" /></Field>
              <Field info="maxPerCustomer" l="Ανά πελάτη"><input inputMode="numeric" className={input} value={d.maxPerCustomer ?? ""} onChange={(e) => set({ maxPerCustomer: Number(e.target.value) || null })} placeholder="απεριόριστες" /></Field>
              <Field info="budget" l="Budget (€)" hint="Όταν εξαντληθεί, η προσφορά σταματά μόνη της."><input inputMode="decimal" className={input} value={d.budgetEur ?? ""} onChange={(e) => set({ budgetEur: Number(e.target.value.replace(",", ".")) || null })} placeholder="χωρίς όριο" /></Field>
              <Field info="priority" l="Προτεραιότητα" hint="Μικρότερος αριθμός = εξετάζεται πρώτη"><input inputMode="numeric" className={input} value={d.priority} onChange={(e) => set({ priority: Number(e.target.value) || 100 })} /></Field>
            </div>
            <fieldset className="m-0 p-0 border-0 grid gap-2">
              <legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1 inline-flex items-center gap-1">Μαζί με άλλες προσφορές <Hint k="stacking" /></legend>
              {(Object.keys(STACKING_LABEL) as (keyof typeof STACKING_LABEL)[]).map((k) => (
                <label key={k} className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer ${d.stacking === k ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
                  <input type="radio" name="stacking" checked={d.stacking === k} onChange={() => set({ stacking: k })} className="mt-1 size-5 accent-eu-navy" />
                  <span><span className="block font-bold text-eu-ink text-[length:var(--fs-15)]">{STACKING_LABEL[k].label}</span><span className="block text-eu-ink-3 text-[length:var(--fs-14)]">{STACKING_LABEL[k].help}</span></span>
                </label>
              ))}
            </fieldset>
            <details className="rounded-xl border border-eu-line p-3">
              <summary className="cursor-pointer font-bold text-eu-ink-2 text-[length:var(--fs-14)] min-h-8">Περιοχή, πληρωμή, παράδοση</summary>
              <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3 mt-3">
                <Field info="zips" l="Ταχυδρομικοί κώδικες" hint="Χωρισμένοι με κόμμα· δέχεται προθέματα (π.χ. 151)"><input className={input} value={(d.rules.zips ?? []).join(", ")} onChange={(e) => setRules({ zips: e.target.value.split(/[,\s]+/).filter(Boolean) })} /></Field>
                <Field info="payment" l="Τρόποι πληρωμής" hint="π.χ. card, iris, cod"><input className={input} value={(d.rules.payment ?? []).join(", ")} onChange={(e) => setRules({ payment: e.target.value.split(/[,\s]+/).filter(Boolean) })} /></Field>
                <Field info="delivery" l="Τρόποι παράδοσης" hint="courier, click-collect, appointment"><input className={input} value={(d.rules.delivery ?? []).join(", ")} onChange={(e) => setRules({ delivery: e.target.value.split(/[,\s]+/).filter(Boolean) })} /></Field>
              </div>
            </details>
            {isCoupon && (
              <Field info="coupon" l="Κοινός κωδικός κουπονιού" hint="Προαιρετικό: για προσωπικούς / μοναδικούς κωδικούς χρησιμοποίησε την καρτέλα «Κουπόνια» μετά την αποθήκευση.">
                <input className={`${input} font-mono uppercase`} value={d.couponCode ?? ""} onChange={(e) => set({ couponCode: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") || null })} placeholder="π.χ. WELCOME10" />
              </Field>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5">
            <Field l="Όνομα (εσωτερικό)" hint="Φαίνεται στο διαχειριστικό, στις αναφορές και στο παραστατικό."><input className={input} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="π.χ. Black Friday · τηλεοράσεις −20 %" /></Field>
            <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4 items-start">
              <Field info="tagLabel" l="Ετικέτα στη βιτρίνα" hint={`Κενό = αυτόματη: «${autoLabel({ ...d, tagLabel: null }, svcTitle)}»`}><input className={input} value={d.tagLabel ?? ""} maxLength={28} onChange={(e) => set({ tagLabel: e.target.value || null })} /></Field>
              <div className="grid gap-1">
                <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Έτσι φαίνεται στην κάρτα</span>
                <div className="rounded-2xl border border-eu-line p-4 flex items-center gap-3">
                  <span className="size-16 rounded-xl bg-eu-surface grid place-items-center text-eu-muted"><Store className="size-6" aria-hidden /></span>
                  <div className="grid gap-1">
                    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 font-extrabold text-[length:var(--fs-13)] ${d.mechanism.startsWith("price") || d.mechanism === "special-price" ? "bg-eu-red text-white" : "bg-eu-navy text-white"}`}>{autoLabel(d, svcTitle)}</span>
                    <span className="text-eu-muted text-[length:var(--fs-13)]">έως 2 ετικέτες ανά κάρτα · countdown όταν λήγει σε ≤ 3 ημέρες</span>
                  </div>
                </div>
              </div>
            </div>
            <Field info="terms" l="Όροι (εμφανίζονται στον πελάτη και γράφονται στο παραστατικό)">
              <textarea rows={5} className={`${input} py-2`} value={d.termsText ?? ""} onChange={(e) => set({ termsText: e.target.value || null })} />
            </Field>
            <button type="button" onClick={() => set({ termsText: termsFor(d, summary) })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-chip"><Sparkles className="size-4" aria-hidden /> Σύνταξη όρων από τα στοιχεία</button>
          </div>
        )}

        {step === 4 && <ReviewStep d={d} a={analysis} summary={summary} canApprove={canApprove} />}
      </section>

      {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`m-0 rounded-xl px-4 py-3 font-semibold text-[length:var(--fs-14)] ${msg.tone === "err" ? "bg-eu-red/10 text-eu-red" : "bg-eu-green/10 text-eu-green"}`}>{msg.text}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><ChevronLeft className="size-4" aria-hidden /> Πίσω</button>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !d.name.trim()} onClick={() => save("draft")} title={!d.name.trim() ? "Δώσε όνομα στο βήμα «Εμφάνιση»" : undefined} className="rounded-full border-2 border-eu-navy text-eu-navy px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] hover:bg-eu-chip disabled:opacity-40">{d.id && status && status !== "draft" ? "Αποθήκευση αλλαγών" : "Αποθήκευση πρόχειρου"}</button>
          {step < 4 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} className="inline-flex items-center gap-1 rounded-full bg-eu-navy text-white px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] hover:bg-eu-blue">Επόμενο <ChevronRight className="size-4" aria-hidden /></button>
          ) : (
            <button type="button" disabled={busy || !analysis || analysis.errors.length > 0} onClick={() => save("publish")} className="rounded-full bg-eu-yellow text-eu-navy px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-yellow-dark disabled:opacity-40">
              {busy ? "Γίνεται…" : analysis?.approval.needed && !canApprove ? "Υποβολή για έγκριση" : status && ["active", "scheduled", "paused"].includes(status) ? "Δημοσίευση νέας έκδοσης" : "Δημοσίευση"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const pickKeep = (r: PromoDraft["rules"]) => ({ customers: r.customers, channels: r.channels, zips: r.zips });

function termsFor(d: PromoDraft, summary: string) {
  const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" }) : null);
  const parts = [
    `Προσφορά: ${summary}.`,
    d.startsAt || d.endsAt ? `Ισχύει ${dt(d.startsAt) ? `από ${dt(d.startsAt)} ` : ""}${dt(d.endsAt) ? `έως ${dt(d.endsAt)}` : ""} ή έως εξαντλήσεως των αποθεμάτων.` : "Ισχύει έως εξαντλήσεως των αποθεμάτων.",
    d.stacking === "no-price" ? "Δεν συνδυάζεται με άλλες εκπτώσεις τιμής στο ίδιο προϊόν." : d.stacking === "exclusive" ? "Δεν συνδυάζεται με άλλες προσφορές ή κουπόνια." : "",
    d.maxPerCustomer ? `Έως ${d.maxPerCustomer} ${d.maxPerCustomer === 1 ? "φορά" : "φορές"} ανά πελάτη.` : "",
    d.mechanism === "gift" ? "Το δώρο δεν ανταλλάσσεται με χρήματα· σε επιστροφή του κύριου προϊόντος επιστρέφεται και το δώρο." : "",
    "Η εταιρεία διατηρεί το δικαίωμα τροποποίησης ή λήξης της προσφοράς. Η προηγούμενη τιμή είναι η χαμηλότερη των τελευταίων 30 ημερών.",
  ];
  return parts.filter(Boolean).join(" ");
}

function RewardFields({ d, setReward }: { d: PromoDraft; setReward: (p: Partial<PromoDraft["reward"]>) => void }) {
  const r = d.reward;
  const num = (v: string) => Number(v.replace(",", ".")) || undefined;
  switch (d.mechanism) {
    case "price-percent": case "coupon-percent":
      return <Field l="Ποσοστό έκπτωσης (%)"><input inputMode="decimal" className={`${input} max-w-40`} value={r.percent ?? ""} onChange={(e) => setReward({ percent: num(e.target.value) })} /></Field>;
    case "price-amount": case "coupon-amount":
      return <Field l={d.mechanism === "price-amount" ? "Έκπτωση ανά τεμάχιο (€)" : "Έκπτωση στο καλάθι (€)"}><input inputMode="decimal" className={`${input} max-w-40`} value={toEur(r.amount)} onChange={(e) => setReward({ amount: toCents(e.target.value) })} /></Field>;
    case "n-plus-m":
      return <div className="flex flex-wrap gap-3"><Field l="Αγοράζεις"><input inputMode="numeric" className={`${input} w-28`} value={r.buy ?? ""} onChange={(e) => setReward({ buy: Number(e.target.value) || undefined })} /></Field><Field l="Παίρνεις δωρεάν"><input inputMode="numeric" className={`${input} w-28`} value={r.get ?? ""} onChange={(e) => setReward({ get: Number(e.target.value) || undefined })} /></Field></div>;
    case "nth-discount":
      return <div className="flex flex-wrap gap-3"><Field l="Ποιο τεμάχιο"><select className={`${input} w-32`} value={r.nth ?? 2} onChange={(e) => setReward({ nth: Number(e.target.value) })}><option value={2}>2ο</option><option value={3}>3ο</option><option value={4}>4ο</option></select></Field><Field l="Έκπτωση (%)"><input inputMode="decimal" className={`${input} w-28`} value={r.percent ?? ""} onChange={(e) => setReward({ percent: num(e.target.value) })} /></Field></div>;
    case "qty-tiers": {
      const tiers = r.tiers ?? [];
      const upd = (i: number, p: Partial<{ minQty: number; percent: number }>) => setReward({ tiers: tiers.map((t, j) => (j === i ? { ...t, ...p } : t)) });
      return (
        <div className="grid gap-2">
          <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Κλίμακες</span>
          {tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[length:var(--fs-15)]">
              από <input aria-label="Τεμάχια" inputMode="numeric" className={`${input} w-20`} value={t.minQty} onChange={(e) => upd(i, { minQty: Number(e.target.value) || 0 })} /> τεμ. → −
              <input aria-label="Ποσοστό" inputMode="decimal" className={`${input} w-20`} value={t.percent} onChange={(e) => upd(i, { percent: num(e.target.value) ?? 0 })} /> %
              <button type="button" aria-label="Αφαίρεση κλίμακας" onClick={() => setReward({ tiers: tiers.filter((_, j) => j !== i) })} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
            </div>
          ))}
          <button type="button" onClick={() => setReward({ tiers: [...tiers, { minQty: (tiers.at(-1)?.minQty ?? 1) + 2, percent: (tiers.at(-1)?.percent ?? 0) + 5 }] })} className="justify-self-start inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)]"><Plus className="size-4" aria-hidden /> Κλίμακα</button>
        </div>
      );
    }
    case "gift":
      return <Field l="Τεμάχια δώρου"><input inputMode="numeric" className={`${input} max-w-32`} value={r.giftQty ?? 1} onChange={(e) => setReward({ giftQty: Number(e.target.value) || 1 })} /></Field>;
    default:
      return null;
  }
}

function Picker({ kind, onPick, placeholder }: { kind: "product" | "brand" | "category"; onPick: (x: { id: string; label: string; sub?: string }) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: string; label: string; sub?: string }[]>([]);
  useEffect(() => {
    if (kind === "product" && q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => { void searchTargetsAction(kind, q).then((r) => { if (live) setRes(r); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [kind, q]);
  const shown = kind === "product" && q.trim().length < 2 ? [] : res;
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
        <input aria-label={placeholder} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${input} pl-9`} />
      </div>
      {shown.length > 0 && (
        <ul className="m-0 p-0 list-none max-h-72 overflow-y-auto rounded-xl border border-eu-line divide-y divide-eu-line">
          {shown.map((x) => (
            <li key={x.id}><button type="button" onClick={() => onPick(x)} className="w-full text-left px-3 py-2 min-h-11 hover:bg-eu-chip"><span className="block font-bold text-eu-ink text-[length:var(--fs-14)]">{x.label}</span>{x.sub && <span className="block text-eu-muted text-[length:var(--fs-13)]">{x.sub}</span>}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TargetsStep({ d, set, setReward, names, setNames, services }: { d: PromoDraft; set: (p: Partial<PromoDraft>) => void; setReward: (p: Partial<PromoDraft["reward"]>) => void; names: Record<string, string>; setNames: (f: (n: Record<string, string>) => Record<string, string>) => void; services: Svc[] }) {
  const [kind, setKind] = useState<"product" | "brand" | "category">("category");
  const [exclude, setExclude] = useState(false);
  const add = (x: { id: string; label: string; sub?: string }) => {
    setNames((n) => ({ ...n, [x.id]: x.sub && kind === "product" ? `${x.label} · ${x.sub}` : x.label }));
    if (d.targets.some((t) => t.refId === x.id && t.exclude === exclude)) return;
    set({ targets: [...d.targets.filter((t) => t.refId !== x.id), { kind, refId: x.id, exclude }] });
  };
  const remove = (t: PromoTarget) => set({ targets: d.targets.filter((x) => !(x.refId === t.refId && x.exclude === t.exclude)) });
  const whole = async () => { const roots = await rootCategoriesAction(); setNames((n) => ({ ...n, ...Object.fromEntries(roots.map((r) => [r.id, r.name])) })); set({ targets: [...d.targets.filter((t) => t.exclude), ...roots.map((r) => ({ kind: "category" as const, refId: r.id, exclude: false }))] }); };
  const KIND = { product: "Προϊόν", brand: "Μάρκα", category: "Κατηγορία" } as const;
  const specialPrices = Object.entries(d.reward.price ?? {});

  return (
    <div className="grid gap-5">
      {d.mechanism === "special-price" ? (
        <div className="grid gap-3">
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Πρόσθεσε προϊόντα και γράψε την τελική τιμή (με ΦΠΑ). Για πολλά προϊόντα χρησιμοποίησε την <Link href="/admin/prosfores/excel" className="font-bold text-eu-blue hover:underline">εισαγωγή από Excel</Link>.</p>
          <Picker kind="product" placeholder="Αναζήτηση προϊόντος: τίτλος, κωδικός, EAN" onPick={(x) => { setNames((n) => ({ ...n, [x.id]: `${x.label} · ${x.sub ?? ""}` })); if (!(x.id in (d.reward.price ?? {}))) setReward({ price: { ...(d.reward.price ?? {}), [x.id]: 0 } }); }} />
          {specialPrices.length > 0 && (
            <ul className="m-0 p-0 list-none grid gap-2">
              {specialPrices.map(([id, c]) => (
                <li key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-eu-line p-2 pl-3">
                  <span className="flex-1 min-w-[200px] text-[length:var(--fs-14)] font-semibold text-eu-ink">{names[id] ?? id}</span>
                  <input aria-label="Ειδική τιμή σε €" inputMode="decimal" defaultValue={c ? toEur(c) : ""} onBlur={(e) => setReward({ price: { ...(d.reward.price ?? {}), [id]: toCents(e.target.value) ?? 0 } })} className={`${input} w-32 text-right`} placeholder="τιμή €" />
                  <button type="button" aria-label="Αφαίρεση" onClick={() => { const { [id]: _x, ...rest } = d.reward.price ?? {}; void _x; setReward({ price: rest }); }} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["category", "brand", "product"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] border-2 ${kind === k ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line"}`}>{KIND[k]}</button>
            ))}
            <label className="ml-2 inline-flex items-center gap-2 text-[length:var(--fs-14)] font-bold text-eu-ink-2 min-h-11"><input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} className="size-5 accent-eu-red" /> Ως εξαίρεση</label><Hint k="exclude" />
            <button type="button" onClick={whole} className="ml-auto inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Store className="size-4" aria-hidden /> Όλο το κατάστημα</button><Hint k="wholeStore" />
          </div>
          <Picker key={kind} kind={kind} onPick={add} placeholder={kind === "product" ? "Τίτλος, κωδικός ή EAN" : kind === "brand" ? "Όνομα μάρκας" : "Όνομα κατηγορίας (κενό = κύριες)"} />
          <div className="grid gap-2">
            {(["include", "exclude"] as const).map((g) => {
              const list = d.targets.filter((t) => (g === "exclude") === t.exclude);
              if (!list.length) return null;
              return (
                <div key={g} className="grid gap-1.5">
                  <span className={`font-extrabold text-[length:var(--fs-13)] uppercase tracking-wide ${g === "exclude" ? "text-eu-red" : "text-eu-navy"}`}>{g === "exclude" ? "Εκτός" : "Ισχύει σε"}</span>
                  <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                    {list.map((t) => (
                      <li key={t.refId + g} className={`inline-flex items-center gap-1 rounded-full pl-3 pr-1 min-h-10 text-[length:var(--fs-14)] font-semibold ${g === "exclude" ? "bg-eu-red/10 text-eu-red" : "bg-eu-chip text-eu-navy"}`}>
                        {g === "exclude" && <Ban className="size-3.5" aria-hidden />}<span className="text-eu-muted font-normal">{KIND[t.kind]}:</span> {names[t.refId] ?? t.refId}
                        <button type="button" aria-label={`Αφαίρεση ${names[t.refId] ?? t.refId}`} onClick={() => remove(t)} className="size-9 grid place-items-center rounded-full hover:bg-black/5"><X className="size-4" aria-hidden /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {!d.targets.length && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">{d.mechanism.startsWith("coupon") || d.mechanism === "shipping" ? "Χωρίς στόχους ισχύει σε όλο το καλάθι." : "Διάλεξε τουλάχιστον μία κατηγορία, μάρκα ή προϊόν."}</p>}
          </div>
        </>
      )}

      {d.mechanism === "gift" && (
        <div className="grid gap-2 rounded-2xl border-2 border-dashed border-eu-green/50 p-4">
          <span className="font-extrabold text-eu-green text-[length:var(--fs-14)]">Προϊόν-δώρο {d.reward.giftProductId && <span className="text-eu-ink">· {names[d.reward.giftProductId] ?? d.reward.giftProductId}</span>}</span>
          <Picker kind="product" placeholder="Αναζήτηση προϊόντος-δώρου" onPick={(x) => { setNames((n) => ({ ...n, [x.id]: x.label })); setReward({ giftProductId: x.id }); }} />
        </div>
      )}
      {d.mechanism === "service" && (
        <Field l="Υπηρεσία που γίνεται δωρεάν">
          <select className={`${input} max-w-md`} value={d.reward.serviceSlug ?? ""} onChange={(e) => setReward({ serviceSlug: e.target.value })}>
            {services.filter((s) => s.slug !== "paradosi-egkatastasi").map((s) => <option key={s.slug} value={s.slug}>{s.title}{s.price ? ` (αξία ${s.price} €)` : ""}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

function ReviewStep({ d, a, summary, canApprove }: { d: PromoDraft; a: DraftAnalysis | null; summary: string; canApprove: boolean }) {
  const rows = useMemo(() => [
    ["Προσφορά", summary], ["Συνδυασμός", STACKING_LABEL[d.stacking].label],
    ["Διάρκεια", `${d.startsAt ? new Date(d.startsAt).toLocaleString("el-GR") : "από τη δημοσίευση"} → ${d.endsAt ? new Date(d.endsAt).toLocaleString("el-GR") : "χωρίς λήξη"}`],
    ["Όρια", [d.maxUses ? `${d.maxUses} χρήσεις` : "", d.maxPerCustomer ? `${d.maxPerCustomer}/πελάτη` : "", d.budgetEur ? `budget ${d.budgetEur.toLocaleString("el-GR")} €` : ""].filter(Boolean).join(" · ") || "χωρίς όρια"],
  ], [d, summary]);
  if (!a) return <p className="m-0 text-eu-muted text-[length:var(--fs-15)]" role="status">Έλεγχος στα προϊόντα του καταλόγου…</p>;
  return (
    <div className="grid gap-5">
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[length:var(--fs-15)]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-eu-muted">{k}</dt><dd className="m-0 font-semibold text-eu-ink">{v}</dd></div>)}
      </dl>
      {a.errors.length > 0 && (
        <ul role="alert" className="m-0 p-4 list-none rounded-xl bg-eu-red/10 text-eu-red grid gap-1 font-semibold text-[length:var(--fs-14)]">{a.errors.map((e) => <li key={e} className="flex gap-2"><AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />{e}</li>)}</ul>
      )}
      <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-13)]">Προϊόντα που αφορά</div><div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{a.products.toLocaleString("el-GR")}</div></div>
        <div className="rounded-2xl border border-eu-line p-4"><div className="text-eu-muted text-[length:var(--fs-13)]">Μέγιστη έκπτωση</div><div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{a.maxPct} %</div>{a.capped > 0 && <div className="text-eu-amber font-bold text-[length:var(--fs-13)]">{a.capped} προϊόντα κόβονται από τις δικλείδες</div>}</div>
        <div className={`rounded-2xl border p-4 ${a.approval.needed ? "border-eu-yellow bg-eu-yellow/15" : "border-eu-line"}`}>
          <div className="text-eu-muted text-[length:var(--fs-13)] inline-flex items-center gap-1"><ShieldCheck className="size-4" aria-hidden /> Έγκριση</div>
          <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">{a.approval.needed ? (canApprove ? "Πάνω από τα όρια — την εγκρίνεις εσύ" : "Χρειάζεται δεύτερο πρόσωπο") : "Δεν χρειάζεται"}</div>
          {a.approval.reasons.length > 0 && <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{a.approval.reasons.join(" · ")}</div>}
        </div>
      </div>
      {a.sample.length > 0 && (
        <div className="grid gap-2">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Δείγμα τιμών</h3>
          <ul className="m-0 p-0 list-none rounded-xl border border-eu-line divide-y divide-eu-line">
            {a.sample.map((s) => <li key={s.title} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-[length:var(--fs-14)]"><span className="text-eu-ink">{s.title}</span><span className="tabular-nums whitespace-nowrap"><s className="text-eu-muted">{eur(s.before)}</s> <strong className="text-eu-red">{eur(s.after)}</strong> <span className="text-eu-muted">(−{s.pct} %)</span></span></li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-2">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Επικαλύψεις με άλλες προσφορές</h3>
        {a.conflicts.length ? (
          <ul className="m-0 p-0 list-none grid gap-2">
            {a.conflicts.map((c) => (
              <li key={c.id} className="rounded-xl border border-eu-amber/40 bg-eu-amber/10 p-3 text-[length:var(--fs-14)]">
                <Link href={`/admin/prosfores/${c.id}`} className="font-bold text-eu-ink hover:underline">{c.name}</Link> <span className="text-eu-muted font-mono">{c.code}</span> · {STATUS_LABEL[c.status as PromoStatus]?.label ?? c.status}
                <div className="text-eu-ink-2">{c.shared.toLocaleString("el-GR")} κοινά προϊόντα · <strong>{c.outcome}</strong></div>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-14)]"><Check className="size-4" aria-hidden /> Καμία επικάλυψη στο ίδιο διάστημα.</p>}
      </div>
    </div>
  );
}
