"use client";

import { StickerPicker } from "@/components/admin/stickers/StickerPicker";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Lock, Search, X, Plus, Check, AlertTriangle, ShieldCheck, Store, Sparkles, ChevronLeft, ChevronRight, Ban, ChevronDown, CircleAlert, PanelsTopLeft, LayoutTemplate, Megaphone, ExternalLink, ListChecks } from "lucide-react";
import type { PromoDraft, DraftAnalysis } from "@/lib/promo/admin";
import type { PromoTarget } from "@/lib/promo/engine";
import { TEMPLATES, STACKING_LABEL, STATUS_LABEL, PAYMENT_OPTIONS, autoLabel, describePromo, type PromoStatus } from "@/lib/promo/catalog";
import { Hint } from "./Help";
import { STEP_HELP, FIELD_HELP } from "@/lib/promo/help";
import { ProductBrowser, type BrowseProduct } from "./ProductBrowser";
import { analyzeAction, rootCategoriesAction, saveAction, searchTargetsAction } from "@/app/admin/(shell)/prosfores/actions";

type Svc = { slug: string; title: string; price: number };
const STEPS = ["Πρότυπο", "Προϊόντα", "Κανόνες", "Εμφάνιση", "Έλεγχος"] as const;
const GROUPS: { key: string; label: string }[] = [
  { key: "price", label: "Έκπτωση τιμής" }, { key: "qty", label: "Πολλά τεμάχια" }, { key: "extra", label: "Παροχές" }, { key: "coupon", label: "Κουπόνια" }, { key: "payment", label: "Τρόπος πληρωμής" }, { key: "held", label: "Ανενεργά μέχρι διευκρίνιση" },
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

export type WizardAppearance = { kind: "zone" | "landing" | "ad"; place: string; what: string; live: boolean; href: string };
type Issues = { errors: string[]; warns: string[] };

/** Τι λείπει ή θέλει προσοχή ανά βήμα — για τις ενδείξεις των βημάτων και τη λίστα ελέγχου της σύνοψης. */
function stepIssues(d: PromoDraft): Issues[] {
  const r = d.reward, m = d.mechanism;
  const cartWide = m.startsWith("coupon") || m.startsWith("payment") || m === "shipping";
  const t: Issues = { errors: [], warns: [] }, rr: Issues = { errors: [], warns: [] }, look: Issues = { errors: [], warns: [] };
  if (m === "bundle") { if ((r.bundle?.length ?? 0) < 2) t.errors.push("Το πακέτο θέλει τουλάχιστον 2 προϊόντα"); }
  else if (m === "special-price") { const v = Object.values(r.price ?? {}); if (!v.length) t.errors.push("Διάλεξε προϊόντα με ειδική τιμή"); else if (v.some((c) => !c)) t.errors.push("Λείπει η νέα τιμή σε κάποια προϊόντα"); }
  else if (!cartWide && !d.targets.some((x) => !x.exclude)) t.errors.push("Δεν διάλεξες σε ποια προϊόντα ισχύει");
  if (m === "gift" && !r.giftProductId) t.errors.push("Διάλεξε το προϊόν-δώρο");
  if (m === "together" && !(r.with?.length)) t.errors.push("Διάλεξε τα συνοδευτικά");
  const needPct = ["price-percent", "coupon-percent", "nth-discount", "payment-percent"].includes(m), needAmt = ["price-amount", "coupon-amount", "payment-amount"].includes(m);
  if (needPct && !r.percent) rr.errors.push("Γράψε το ποσοστό έκπτωσης");
  if (needAmt && !r.amount) rr.errors.push("Γράψε το ποσό της έκπτωσης");
  if (m === "n-plus-m" && !(r.buy && r.get)) rr.errors.push("Γράψε «αγοράζεις» και «παίρνεις δωρεάν»");
  if (m === "bundle" && !r.bundlePrice) rr.errors.push("Γράψε την τιμή του πακέτου");
  if (m.startsWith("payment") && !d.rules.payment?.length) rr.errors.push("Διάλεξε τρόπο πληρωμής");
  if (!d.endsAt) rr.warns.push("Χωρίς λήξη η προσφορά τρέχει για πάντα");
  if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) rr.errors.push("Η λήξη είναι πριν από την έναρξη");
  if (!d.termsText?.trim()) look.warns.push("Χωρίς όρους για τον πελάτη");
  return [{ errors: [], warns: [] }, t, rr, look, { errors: [], warns: [] }];
}

/**
 * Ο οδηγός: πρότυπο → προϊόντα → κανόνες → εμφάνιση → έλεγχος. Δίπλα (σε κινητό επάνω, αναδιπλούμενη) η σύνοψη: η
 * προσφορά σε μία πρόταση, πώς φαίνεται στην κάρτα, τα βασικά στοιχεία, η λίστα ελέγχου ανά βήμα και πού θα εμφανίζεται.
 * Ό,τι συμπληρώνεται εδώ τρέχει στην ίδια μηχανή με το καλάθι.
 */
export function PromoWizard({ initial, names: initialNames, status, code, canApprove, services, segments = [], stores = [], startStep = 0, appears = [], overview }: { initial: PromoDraft; names: Record<string, string>; status: PromoStatus | null; code: string | null; canApprove: boolean; services: Svc[]; segments?: { id: string; label: string }[]; stores?: StoreOpt[]; startStep?: number; appears?: WizardAppearance[]; overview?: ReactNode }) {
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
  const base = useMemo(() => stepIssues(d), [d]);
  const issues = analysis ? [...base.slice(0, 4), { errors: analysis.errors, warns: analysis.approval.needed ? ["Χρειάζεται έγκριση"] : [] }] : base;

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

  // χωρίς όνομα αποθηκεύεται με την περιγραφή της (αλλάζει στο βήμα «Εμφάνιση»)
  const save = (intent: "draft" | "publish") => start(async () => {
    setMsg(null);
    const draft = d.name.trim() ? d : { ...d, name: summary.slice(0, 120) };
    if (draft !== d) set({ name: draft.name });
    const r = await saveAction(draft, intent);
    if (!r.ok) { setMsg({ tone: "err", text: (r.errors ?? ["Δεν αποθηκεύτηκε."]).join(" ") }); return; }
    const st = r.status ? STATUS_LABEL[r.status].label : "";
    setMsg({ tone: "ok", text: intent === "publish" ? (r.status === "pending" ? `Στάλθηκε για έγκριση (${r.approval?.join(", ")}).` : `Δημοσιεύτηκε · ${st}. Η βιτρίνα ενημερώνεται.`) : `Αποθηκεύτηκε · ${st}.` });
    if (!d.id && r.id) router.replace(`/admin/prosfores/${r.id}?step=${step}`);
    else router.refresh();
    if (r.id) set({ id: r.id });
  });
  const go = (i: number) => { setStep(i); document.getElementById("wz-top")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };

  const aside = <WizardSummary d={d} summary={summary} svcTitle={svcTitle} issues={issues} step={step} go={go} appears={appears} status={status} code={code} />;

  return (
    <div className="grid gap-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/prosfores" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-10 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλες οι προσφορές</Link>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">{d.name || (d.id ? "Προσφορά" : "Νέα προσφορά")}</h2>
          <div className="text-eu-ink-3 text-[length:var(--fs-14)]">{code && <span className="font-mono">{code} · </span>}{status && <span className="font-bold">{STATUS_LABEL[status].label}</span>}{!status && "Πρόχειρο · δεν φαίνεται ακόμη στους πελάτες"}</div>
        </div>
      </div>

      {overview}

      <ol id="wz-top" data-help="promo.steps" className="m-0 p-0 list-none grid grid-cols-5 gap-1.5 scroll-mt-4" aria-label="Βήματα">
        {STEPS.map((s, i) => {
          const is = issues[i], cur = i === step, err = is.errors.length > 0 && (i < step || i === 4), warn = !err && is.warns.length > 0 && i <= step;
          return (
            <li key={s}>
              <button type="button" onClick={() => go(i)} aria-current={cur ? "step" : undefined} title={[...is.errors, ...is.warns].join(" · ") || undefined}
                className={`w-full rounded-xl px-2 min-h-12 text-left border-2 flex items-center gap-2 ${cur ? "border-eu-navy bg-eu-navy text-white" : err ? "border-eu-red/40 bg-white text-eu-ink" : "border-eu-line bg-white text-eu-ink-2 hover:border-eu-blue"}`}>
                <span className={`size-6 shrink-0 rounded-full grid place-items-center text-[length:var(--fs-12)] font-extrabold mx-auto @2xl:mx-0 ${cur ? "bg-white text-eu-navy" : err ? "bg-eu-red text-white" : warn ? "bg-eu-amber text-white" : i < step ? "bg-eu-green text-white" : "bg-eu-surface text-eu-ink-3"}`}>
                  {err || warn ? "!" : i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className="hidden @2xl:block min-w-0 font-extrabold text-[length:var(--fs-14)] truncate">{s}</span>
                <span className="sr-only @2xl:hidden">{`${i + 1}. ${s}`}</span>
                {err && <span className="sr-only"> — θέλει διόρθωση</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <details className="@5xl:hidden group rounded-2xl border border-eu-line bg-white">
        <summary className="list-none cursor-pointer flex items-center gap-2 px-4 min-h-12 font-bold text-eu-ink text-[length:var(--fs-14)] [&::-webkit-details-marker]:hidden">
          <ListChecks className="size-4 text-eu-blue shrink-0" aria-hidden /><span className="flex-1 min-w-0 truncate">Βήμα {step + 1}/{STEPS.length} · {STEPS[step]} — {summary}</span><ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4">{aside}</div>
      </details>

      <div className="grid gap-4 items-start @5xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid gap-4 min-w-0">
          <section className="rounded-2xl bg-white border border-eu-line p-3 @md:p-5 grid gap-4 min-w-0">
            <div className="grid gap-0.5">
              <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{STEP_HELP[step].title.replace(/^Βήμα \d · /, "")}</h3>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug max-w-[80ch]">{STEP_HELP[step].what}</p>
            </div>
        {step === 0 && (
          <div className="grid gap-4">
            {GROUPS.map((g) => (
              <div key={g.key} className="grid gap-2">
                <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">{g.label}</h4>
                <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 gap-2">
                  {TEMPLATES.filter((t) => t.group === g.key).map((t) => (
                    <button key={t.key} type="button" onClick={() => pickTemplate(t.key)} disabled={!!t.held} aria-pressed={d.template === t.key}
                      className={`text-left rounded-xl border-2 px-3 py-2.5 grid gap-0.5 ${t.held ? "border-dashed border-eu-line bg-eu-surface cursor-not-allowed" : d.template === t.key ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                      <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5">{t.held ? <Lock className="size-4 text-eu-muted" aria-hidden /> : d.template === t.key ? <Check className="size-4 text-eu-navy" aria-hidden /> : null}{t.title}</span>
                      <span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{t.blurb} <span className="text-eu-muted italic">π.χ. {t.example}</span></span>
                      {t.held && <span className="text-eu-amber font-bold text-[length:var(--fs-12)]">{t.held}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 1 && <TargetsStep d={d} set={set} setReward={setReward} names={names} setNames={setNames} services={services} />}

        {step === 2 && (
          <div className="grid gap-3">
            <Group title="Η έκπτωση" desc="Πόσο κερδίζει ο πελάτης.">
              <RewardFields d={d} setReward={setReward} setRules={setRules} />
            </Group>
            <Group title="Πότε ισχύει" desc="Η λήξη είναι πραγματική: σε αυτή μετρά η αντίστροφη μέτρηση στη βιτρίνα.">
              <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                <Field l="Έναρξη" hint={FIELD_HELP.startsAt}><input type="datetime-local" className={input} value={localDt(d.startsAt)} onChange={(e) => set({ startsAt: fromLocal(e.target.value) })} /></Field>
                <Field l="Λήξη" hint={d.endsAt ? FIELD_HELP.endsAt : "Χωρίς λήξη η προσφορά τρέχει για πάντα — βάλε ημερομηνία."}><input type="datetime-local" className={input} value={localDt(d.endsAt)} onChange={(e) => set({ endsAt: fromLocal(e.target.value) })} /></Field>
              </div>
            </Group>
            {isCoupon && (
              <Group title="Κωδικός κουπονιού" desc={FIELD_HELP.coupon}>
                <Field l="Κοινός κωδικός" hint="Προαιρετικό. Για προσωπικούς κωδικούς μίας χρήσης (παρτίδες, email, κοινό) πήγαινε στα «Κουπόνια» μετά την αποθήκευση.">
                  <input className={`${input} font-mono uppercase @xl:max-w-sm`} value={d.couponCode ?? ""} onChange={(e) => set({ couponCode: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") || null })} placeholder="π.χ. WELCOME10" />
                </Field>
              </Group>
            )}
            <p className="m-0 mt-1 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Προαιρετικά — πάτα για αλλαγή</p>
            <Group title="Για ποιους πελάτες" desc={FIELD_HELP.customers} value={customersText(d, segments)} fold open={!!(d.rules.customers || d.rules.segments?.length || d.rules.earlyAccess)}>
              <div className="grid grid-cols-1 @xl:grid-cols-3 gap-2">
                <OptionCard on={(d.rules.customers ?? "all") === "all"} onClick={() => setRules({ customers: undefined })} title="Όλοι" desc="Επισκέπτες και μέλη." />
                <OptionCard on={d.rules.customers === "new"} onClick={() => setRules({ customers: "new" })} title="Πρώτη αγορά" desc="Μόνο όσοι δεν έχουν παραγγείλει ποτέ." />
                <OptionCard on={d.rules.customers === "registered"} onClick={() => setRules({ customers: "registered" })} title="Μέλη" desc="Μόνο συνδεδεμένοι με λογαριασμό." />
              </div>
              <SegmentRules d={d} setRules={setRules} segments={segments} />
            </Group>
            <Group title="Ελάχιστο καλάθι" desc="Ο πελάτης βλέπει στο καλάθι «σου λείπουν Χ €» ή «πρόσθεσε 1 ακόμη»." value={d.rules.minValue || d.rules.minQty ? [d.rules.minValue ? `από ${eur(d.rules.minValue)}` : "", d.rules.minQty ? `από ${d.rules.minQty} τεμ.` : ""].filter(Boolean).join(" · ") : "Χωρίς ελάχιστο"} fold open={!!(d.rules.minValue || d.rules.minQty)}>
              <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                <Field l="Ελάχιστη αξία (€)" hint={FIELD_HELP.minValue}><input inputMode="decimal" className={input} value={toEur(d.rules.minValue)} onChange={(e) => setRules({ minValue: toCents(e.target.value) })} placeholder="χωρίς ελάχιστο" /></Field>
                <Field l="Ελάχιστα τεμάχια" hint={FIELD_HELP.minQty}><input inputMode="numeric" className={input} value={d.rules.minQty ?? ""} onChange={(e) => setRules({ minQty: Number(e.target.value) || undefined })} placeholder="χωρίς ελάχιστο" /></Field>
              </div>
            </Group>
            <Group title="Όρια" desc="Η προσφορά σταματά μόνη της όταν φτάσει σε κάποιο όριο." value={limitsText(d)} fold open={!!(d.maxUses || d.maxPerCustomer || d.budgetEur)}>
              <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3">
                <Field l="Μέγιστες χρήσεις" hint={FIELD_HELP.maxUses}><input inputMode="numeric" className={input} value={d.maxUses ?? ""} onChange={(e) => set({ maxUses: Number(e.target.value) || null })} placeholder="απεριόριστες" /></Field>
                <Field l="Ανά πελάτη" hint={FIELD_HELP.maxPerCustomer}><input inputMode="numeric" className={input} value={d.maxPerCustomer ?? ""} onChange={(e) => set({ maxPerCustomer: Number(e.target.value) || null })} placeholder="απεριόριστες" /></Field>
                <Field l="Budget (€)" hint={FIELD_HELP.budget}><input inputMode="decimal" className={input} value={d.budgetEur ?? ""} onChange={(e) => set({ budgetEur: Number(e.target.value.replace(",", ".")) || null })} placeholder="χωρίς όριο" /></Field>
              </div>
            </Group>
            <Group title="Μαζί με άλλες προσφορές" desc="Τι γίνεται όταν το ίδιο προϊόν έχει κι άλλη προσφορά." value={`${STACKING_LABEL[d.stacking].label} · προτεραιότητα ${d.priority}`} fold>
              <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-2">
                {(Object.keys(STACKING_LABEL) as (keyof typeof STACKING_LABEL)[]).map((k) => <OptionCard key={k} on={d.stacking === k} onClick={() => set({ stacking: k })} title={STACKING_LABEL[k].label} desc={STACKING_LABEL[k].help} />)}
              </div>
              <Field l="Προτεραιότητα" hint={FIELD_HELP.priority}><input inputMode="numeric" className={`${input} @xl:max-w-40`} value={d.priority} onChange={(e) => set({ priority: Number(e.target.value) || 100 })} /></Field>
            </Group>
            <Group title="Πού και πώς" desc="Περιορισμός σε κανάλι, κατάστημα, περιοχή, πληρωμή ή παράδοση." value={whereText(d)} fold open={whereText(d) !== "Παντού, με κάθε πληρωμή και παράδοση"}>
              <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-4 gap-2">
                <OptionCard on={!d.rules.channels?.length} onClick={() => setRules({ channels: undefined })} title="Παντού" desc="Online (αποστολή ή παραλαβή) — και στο ταμείο, αν το συνδέσετε." />
                <OptionCard on={d.rules.channels?.length === 1 && d.rules.channels[0] === "online"} onClick={() => setRules({ channels: ["online"] })} title="Μόνο αποστολή" desc="Όταν ο πελάτης παραλαμβάνει στο σπίτι." />
                <OptionCard on={d.rules.channels?.length === 1 && d.rules.channels[0] === "click-collect"} onClick={() => setRules({ channels: ["click-collect"] })} title="Μόνο παραλαβή" desc="Click & collect από κατάστημα." />
                <OptionCard on={d.rules.channels?.length === 1 && d.rules.channels[0] === "pos"} onClick={() => setRules({ channels: ["pos"] })} title="Μόνο στο ταμείο" desc="Μόνο μέσα στα καταστήματα (POS) — όχι στο e-shop." />
              </div>
              <StorePicker selected={d.rules.stores ?? []} stores={stores} onChange={(ids) => setRules({ stores: ids.length ? ids : undefined })} />
              <Field l="Ταχυδρομικοί κώδικες" hint={FIELD_HELP.zips}><input className={input} value={(d.rules.zips ?? []).join(", ")} onChange={(e) => setRules({ zips: e.target.value.split(/[,\s]+/).filter(Boolean) })} placeholder="όλη η Ελλάδα" /></Field>
              {!d.mechanism.startsWith("payment") && (
                <fieldset className="m-0 p-0 border-0 grid gap-1"><legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Μόνο με τρόπο πληρωμής</legend>
                  <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κανένας = με οποιονδήποτε τρόπο.</p>
                  <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 gap-x-4">{PAYMENT_OPTIONS.map((o) => { const on = !!d.rules.payment?.includes(o.value); return <label key={o.value} className="inline-flex items-center gap-2 min-h-11 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={on} onChange={(e) => setRules({ payment: e.target.checked ? [...(d.rules.payment ?? []), o.value] : (d.rules.payment ?? []).filter((x) => x !== o.value) })} />{o.label}</label>; })}</div>
                </fieldset>
              )}
              <fieldset className="m-0 p-0 border-0 grid gap-1"><legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Μόνο με τρόπο παράδοσης</legend>
                <div className="grid grid-cols-1 @md:grid-cols-3 gap-x-4">{DELIVERY.map(([v, l]) => { const on = !!d.rules.delivery?.includes(v); return <label key={v} className="inline-flex items-center gap-2 min-h-11 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={on} onChange={(e) => setRules({ delivery: e.target.checked ? [...(d.rules.delivery ?? []), v] : (d.rules.delivery ?? []).filter((x) => x !== v) })} />{l}</label>; })}</div>
              </fieldset>
            </Group>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <Field l="Όνομα (εσωτερικό)" hint={`Φαίνεται στο διαχειριστικό, στις αναφορές και στο παραστατικό. Κενό = «${summary}».`}><input className={input} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="π.χ. Black Friday · τηλεοράσεις −20 %" /></Field>
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4 items-start">
              <Field info="tagLabel" l="Ετικέτα στη βιτρίνα" hint={`Κενό = αυτόματη: «${autoLabel({ ...d, tagLabel: null }, svcTitle)}»`}><input className={input} value={d.tagLabel ?? ""} maxLength={28} onChange={(e) => set({ tagLabel: e.target.value || null })} /></Field>
              <div className="grid gap-1">
                <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Sticker στις κάρτες <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">— σε όσα προϊόντα αφορά, όσο ισχύει (έως 2 ανά κάρτα)</span></span>
                <StickerPicker value={d.stickerKey ?? null} onChange={(v) => set({ stickerKey: v })} />
              </div>
            </div>
            <Field info="terms" l="Όροι (εμφανίζονται στον πελάτη και γράφονται στο παραστατικό)">
              <textarea rows={4} className={`${input} py-2`} value={d.termsText ?? ""} onChange={(e) => set({ termsText: e.target.value || null })} />
            </Field>
            <button type="button" onClick={() => set({ termsText: termsFor(d, summary) })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-chip"><Sparkles className="size-4" aria-hidden /> Σύνταξη όρων από τα στοιχεία</button>
            <WhereItAppears id={d.id ?? null} appears={appears} />
          </div>
        )}

        {step === 4 && <ReviewStep d={d} a={analysis} summary={summary} canApprove={canApprove} />}
          </section>

          {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`m-0 rounded-xl px-4 py-3 font-semibold text-[length:var(--fs-14)] ${msg.tone === "err" ? "bg-eu-red/10 text-eu-red" : "bg-eu-green/10 text-eu-green"}`}>{msg.text}</p>}

          <div className="sticky bottom-0 z-20 -mx-4 @md:mx-0 px-4 @md:px-3 py-3 bg-white/95 backdrop-blur border-t border-eu-line @md:border @md:rounded-2xl flex items-center justify-between gap-2">
            <button type="button" disabled={step === 0} onClick={() => go(step - 1)} aria-label="Πίσω" className="shrink-0 inline-flex items-center justify-center gap-1 rounded-full border-2 border-eu-line min-w-11 px-2 @md:px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><ChevronLeft className="size-4" aria-hidden /><span className="hidden @md:inline">Πίσω</span></button>
            <div className="flex gap-2 min-w-0">
              <button type="button" disabled={busy} onClick={() => save("draft")} className="rounded-full border-2 border-eu-navy text-eu-navy px-4 @md:px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] hover:bg-eu-chip disabled:opacity-40"><span className="@md:hidden">{d.id && status && status !== "draft" ? "Αποθήκευση" : "Πρόχειρο"}</span><span className="hidden @md:inline">{d.id && status && status !== "draft" ? "Αποθήκευση αλλαγών" : "Αποθήκευση πρόχειρου"}</span></button>
              {step < 4 ? (
                <button type="button" onClick={() => go(step + 1)} className="inline-flex items-center gap-1 rounded-full bg-eu-navy text-white px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] hover:bg-eu-blue">{STEPS[step + 1]} <ChevronRight className="size-4" aria-hidden /></button>
              ) : (
                <button type="button" disabled={busy || !analysis || analysis.errors.length > 0 || issues.slice(0, 4).some((x) => x.errors.length)} onClick={() => save("publish")} className="rounded-full bg-eu-yellow text-eu-navy px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-yellow-dark disabled:opacity-40">
                  {busy ? "Γίνεται…" : analysis?.approval.needed && !canApprove ? "Υποβολή για έγκριση" : status && ["active", "scheduled", "paused"].includes(status) ? "Δημοσίευση νέας έκδοσης" : "Δημοσίευση"}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside data-help="promo.summary" aria-label="Σύνοψη προσφοράς" className="hidden @5xl:block [@media(min-height:820px)]:sticky top-4 rounded-2xl bg-white border border-eu-line p-4">{aside}</aside>
      </div>
    </div>
  );
}

const DELIVERY = [["courier", "Αποστολή στο σπίτι"], ["click-collect", "Παραλαβή από κατάστημα"], ["appointment", "Παράδοση με ραντεβού"]] as const;
const CUSTOMERS = { all: "Όλοι οι πελάτες", new: "Μόνο πρώτη αγορά", registered: "Μόνο μέλη" } as const;
function customersText(d: PromoDraft, segments: { id: string; label: string }[]) {
  const segs = (d.rules.segments ?? []).map((id) => segments.find((s) => s.id === id)?.label.replace(/ \(\d+\)$/, "") ?? id);
  return [CUSTOMERS[d.rules.customers ?? "all"], segs.length ? `κοινά: ${segs.join(", ")}` : "", d.rules.earlyAccess ? `early access ${d.rules.earlyAccess.hours} ώρες` : ""].filter(Boolean).join(" · ");
}
function limitsText(d: PromoDraft) {
  return [d.maxUses ? `${d.maxUses} χρήσεις` : "", d.maxPerCustomer ? `${d.maxPerCustomer}/πελάτη` : "", d.budgetEur ? `budget ${d.budgetEur.toLocaleString("el-GR")} €` : ""].filter(Boolean).join(" · ") || "Χωρίς όρια";
}
const CH: Record<string, string> = { online: "μόνο αποστολή", "click-collect": "μόνο παραλαβή", pos: "μόνο ταμείο" };
function whereText(d: PromoDraft) {
  const r = d.rules;
  const parts = [r.channels?.length ? r.channels.map((c) => CH[c] ?? c).join(", ") : "", r.stores?.length ? `${r.stores.length} καταστήματα` : "", r.zips?.length ? `ΤΚ ${r.zips.slice(0, 3).join(", ")}${r.zips.length > 3 ? "…" : ""}` : "", !d.mechanism.startsWith("payment") && r.payment?.length ? `πληρωμή: ${r.payment.map((p) => PAYMENT_OPTIONS.find((o) => o.value === p)?.label ?? p).join(", ")}` : "", r.delivery?.length ? `παράδοση: ${r.delivery.map((v) => DELIVERY.find((x) => x[0] === v)?.[1] ?? v).join(", ")}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Παντού, με κάθε πληρωμή και παράδοση";
}

const KIND_ICON = { zone: PanelsTopLeft, landing: LayoutTemplate, ad: Megaphone } as const;
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

/** Η σύνοψη δίπλα στον οδηγό: πρόταση, κάρτα, βασικά στοιχεία, λίστα ελέγχου ανά βήμα, πού εμφανίζεται. */
function WizardSummary({ d, summary, svcTitle, issues, step, go, appears, status, code }: { d: PromoDraft; summary: string; svcTitle?: string; issues: Issues[]; step: number; go: (i: number) => void; appears: WizardAppearance[]; status: PromoStatus | null; code: string | null }) {
  const label = d.tagLabel || autoLabel({ ...d, tagLabel: null }, svcTitle);
  const facts: [string, string][] = [
    ["Διάρκεια", `${dt(d.startsAt) ?? "από τη δημοσίευση"} → ${dt(d.endsAt) ?? "χωρίς λήξη"}`],
    ["Για", [CUSTOMERS[d.rules.customers ?? "all"], d.rules.segments?.length ? `${d.rules.segments.length} κοινά` : ""].filter(Boolean).join(" · ")],
    ["Όρια", limitsText(d)],
    ["Συνδυασμός", STACKING_LABEL[d.stacking].label],
  ];
  return (
    <div className="grid gap-4 text-[length:var(--fs-14)]">
      <div className="grid gap-2">
        <span className="font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Σύνοψη{code ? ` · ${code}` : ""}{status ? ` · ${STATUS_LABEL[status].label}` : ""}</span>
        <p className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] leading-snug">{summary}</p>
        <div className="rounded-xl border border-eu-line p-2.5 flex items-center gap-3" aria-label="Έτσι φαίνεται στην κάρτα προϊόντος">
          <span className="size-12 shrink-0 rounded-lg bg-eu-surface grid place-items-center text-eu-muted"><Store className="size-5" aria-hidden /></span>
          <div className="grid gap-1 min-w-0">
            <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 font-extrabold text-[length:var(--fs-13)] ${d.mechanism.startsWith("price") || d.mechanism === "special-price" ? "bg-eu-red text-white" : "bg-eu-navy text-white"}`}>{label}</span>
            <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">ετικέτα στην κάρτα{d.stickerKey ? " + sticker" : ""} · countdown στις τελευταίες 3 ημέρες</span>
          </div>
        </div>
      </div>
      <dl className="m-0 grid gap-1">
        {facts.map(([k, v]) => <div key={k} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2"><dt className="text-eu-muted">{k}</dt><dd className="m-0 text-eu-ink font-semibold leading-snug">{v}</dd></div>)}
      </dl>
      <div className="grid gap-1">
        <span className="font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Έλεγχος</span>
        <ul className="m-0 p-0 list-none grid gap-0.5">
          {STEPS.map((s, i) => {
            const is = issues[i], first = is.errors[0] ?? is.warns[0];
            const Icon = is.errors.length ? CircleAlert : is.warns.length ? AlertTriangle : Check;
            return (
              <li key={s}>
                <button type="button" onClick={() => go(i)} className={`w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-eu-surface ${i === step ? "bg-eu-surface" : ""}`}>
                  <Icon className={`size-4 mt-0.5 shrink-0 ${is.errors.length ? "text-eu-red" : is.warns.length ? "text-eu-amber" : "text-eu-green"}`} aria-hidden />
                  <span className="grid min-w-0"><span className="font-bold text-eu-ink">{i + 1}. {s}</span>{first && <span className={`text-[length:var(--fs-13)] leading-snug ${is.errors.length ? "text-eu-red" : "text-eu-ink-3"}`}>{first}</span>}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid gap-1">
        <span className="font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Πού εμφανίζεται</span>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">Πάντα: κάρτες & σελίδες των προϊόντων της, καλάθι, /prosfores{appears.length ? ` · και σε ${appears.length} ${appears.length === 1 ? "σημείο" : "σημεία"}:` : "."}</p>
        {appears.length > 0 && <AppearList appears={appears} />}
        <button type="button" onClick={() => go(3)} className="justify-self-start font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline min-h-9">Πρόσθεσε σε ζώνη, banner ή landing page →</button>
      </div>
    </div>
  );
}

function AppearList({ appears }: { appears: WizardAppearance[] }) {
  return (
    <ul className="m-0 p-0 list-none grid gap-1">
      {appears.map((a, i) => { const I = KIND_ICON[a.kind]; return (
        <li key={i}><Link href={a.href} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-eu-surface text-[length:var(--fs-13)]">
          <I className="size-4 mt-px shrink-0 text-eu-muted" aria-hidden />
          <span className="grid min-w-0 flex-1"><span className="font-bold text-eu-ink leading-snug">{a.place}</span><span className="text-eu-ink-3 leading-snug">{a.what}</span></span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${a.live ? "bg-eu-green/15 text-eu-green" : "bg-eu-surface text-eu-muted"}`}>{a.live ? "φαίνεται" : "όχι ακόμη"}</span>
        </Link></li>
      ); })}
    </ul>
  );
}

/** Βήμα «Εμφάνιση»: πού φαίνεται αυτόματα, πού έχει μπει ρητά, και πώς τη βάζεις σε ζώνη, banner ή landing page. */
function WhereItAppears({ id, appears }: { id: string | null; appears: WizardAppearance[] }) {
  const add = [
    { href: "/admin/cms/home", I: PanelsTopLeft, t: "Σε ζώνη της αρχικής", s: "Blocks «Προϊόντα προσφοράς», «Αντίστροφη μέτρηση», «Προσφορά ημέρας» ή η ενότητα «Προσφορές της εβδομάδας»." },
    { href: id ? `/admin/prosfores/selides?promo=${id}` : "/admin/prosfores/selides", I: LayoutTemplate, t: "Δική της landing page", s: "Σελίδα /prosfores/… με τα προϊόντα της αυτόματα, countdown και όρους." },
    { href: "/admin/prosfores/theseis", I: Megaphone, t: "Banner σε διαφημιστική θέση", s: "Αρχική, λίστες, σελίδα προϊόντος, καλάθι· φαίνεται μόνο όσο τρέχει η προσφορά." },
    { href: "/admin/cms/brand-stores", I: Store, t: "Σε σελίδα μάρκας", s: "Τα ίδια blocks προσφορών στη σελίδα μιας μάρκας." },
  ];
  return (
    <section data-help="promo.where" aria-labelledby="wz-where" className="grid gap-3 rounded-2xl bg-eu-surface/60 p-3 @md:p-4">
      <div className="grid gap-0.5">
        <h4 id="wz-where" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Πού θα εμφανίζεται</h4>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Αυτόματα, χωρίς ρύθμιση: στις κάρτες και στη σελίδα κάθε προϊόντος της (ετικέτα, τιμή, countdown), στο καλάθι, στη σελίδα /prosfores και στα blocks «Προϊόντα · σε προσφορά».</p>
      </div>
      {appears.length > 0 && <div className="rounded-xl bg-white border border-eu-line p-1.5"><AppearList appears={appears} /></div>}
      {!id && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Αποθήκευσε πρώτα την προσφορά για να τη διαλέξεις σε ζώνες, banners και landing pages.</p>}
      <ul className="m-0 p-0 list-none grid gap-2 @3xl:grid-cols-2">
        {add.map((x) => (
          <li key={x.t}><Link href={x.href} target="_blank" className="flex items-start gap-2.5 rounded-xl bg-white border border-eu-line p-3 h-full hover:border-eu-blue">
            <x.I className="size-5 mt-0.5 shrink-0 text-eu-blue" aria-hidden />
            <span className="grid min-w-0 flex-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] inline-flex items-center gap-1">{x.t} <ExternalLink className="size-3.5 text-eu-muted" aria-hidden /><span className="sr-only">(νέα καρτέλα)</span></span><span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{x.s}</span></span>
          </Link></li>
        ))}
      </ul>
    </section>
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

function RewardFields({ d, setReward, setRules }: { d: PromoDraft; setReward: (p: Partial<PromoDraft["reward"]>) => void; setRules: (p: Partial<PromoDraft["rules"]>) => void }) {

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
    case "together":
      return (
        <div className="flex flex-wrap gap-3 items-end">
          <Field l="Έκπτωση στο συνοδευτικό" info="together"><select className={`${input} w-40`} value={r.percent != null ? "pct" : "amt"} onChange={(e) => setReward(e.target.value === "pct" ? { percent: 30, amount: undefined } : { amount: 5000, percent: undefined })}><option value="pct">ποσοστό %</option><option value="amt">ποσό €</option></select></Field>
          {r.percent != null ? <Field l="%"><input inputMode="decimal" className={`${input} w-28`} value={r.percent ?? ""} onChange={(e) => setReward({ percent: num(e.target.value) })} /></Field> : <Field l="€ ανά τεμάχιο"><input inputMode="decimal" className={`${input} w-32`} value={toEur(r.amount)} onChange={(e) => setReward({ amount: toCents(e.target.value) })} /></Field>}
        </div>
      );
    case "bundle":
      return <Field l="Τιμή πακέτου (€, με ΦΠΑ)" info="bundle" hint="Τα προϊόντα του πακέτου τα διαλέγεις στο βήμα «Προϊόντα»."><input inputMode="decimal" className={`${input} max-w-40`} value={toEur(r.bundlePrice)} onChange={(e) => setReward({ bundlePrice: toCents(e.target.value) })} /></Field>;
    case "payment-percent": case "payment-amount":
      return (
        <div className="grid gap-3">
          <Field l={d.mechanism === "payment-percent" ? "Έκπτωση (%)" : "Έκπτωση (€)"} info="paymentDiscount">{d.mechanism === "payment-percent" ? <input inputMode="decimal" className={`${input} max-w-40`} value={r.percent ?? ""} onChange={(e) => setReward({ percent: num(e.target.value) })} /> : <input inputMode="decimal" className={`${input} max-w-40`} value={toEur(r.amount)} onChange={(e) => setReward({ amount: toCents(e.target.value) })} />}</Field>
          <PaymentPick d={d} setRules={setRules} />
        </div>
      );
    case "gift":
      return <Field l="Τεμάχια δώρου"><input inputMode="numeric" className={`${input} max-w-32`} value={r.giftQty ?? 1} onChange={(e) => setReward({ giftQty: Number(e.target.value) || 1 })} /></Field>;
    default:
      return null;
  }
}

export function Picker({ kind, onPick, placeholder }: { kind: "product" | "brand" | "category"; onPick: (x: { id: string; label: string; sub?: string }) => void; placeholder: string }) {
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

type SetNames = (f: (n: Record<string, string>) => Record<string, string>) => void;
const KIND: Record<PromoTarget["kind"], string> = { product: "Προϊόν", brand: "Μάρκα παντού", category: "Κατηγορία", brandcat: "Μάρκα σε κατηγορία" };

/** Οι στόχοι σε λόγια + chips για αφαίρεση. */
export function TargetChips({ list, names, onRemove, tone }: { list: PromoTarget[]; names: Record<string, string>; onRemove: (t: PromoTarget) => void; tone: "in" | "out" }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
      {list.map((t) => (
        <li key={t.kind + t.refId} className={`inline-flex items-center gap-1 rounded-full pl-3 pr-1 min-h-10 text-[length:var(--fs-14)] font-semibold max-w-full ${tone === "out" ? "bg-eu-red/10 text-eu-red" : "bg-eu-chip text-eu-navy"}`}>
          {tone === "out" && <Ban className="size-3.5 shrink-0" aria-hidden />}<span className="text-eu-muted font-normal shrink-0">{KIND[t.kind]}:</span> <span className="truncate">{names[t.refId] ?? t.refId}</span>
          <button type="button" aria-label={`Αφαίρεση ${names[t.refId] ?? t.refId}`} onClick={() => onRemove(t)} className="size-9 shrink-0 grid place-items-center rounded-full hover:bg-black/5"><X className="size-4" aria-hidden /></button>
        </li>
      ))}
    </ul>
  );
}

/** Ομάδα πεδίων με τίτλο και ορατή εξήγηση· με `fold` αναδιπλώνεται και δείχνει την τρέχουσα τιμή σε μία γραμμή. */
function Group({ title, desc, children, value, fold = false, open = false }: { title: string; desc?: string; children: ReactNode; value?: string; fold?: boolean; open?: boolean }) {
  if (fold) return (
    <details open={open} className="group/g rounded-2xl border border-eu-line min-w-0 open:pb-3">
      <summary className="list-none cursor-pointer flex items-center gap-3 px-3 @md:px-4 min-h-12 py-2 [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 flex-1"><span className="font-extrabold text-eu-navy text-[length:var(--fs-15)]">{title}</span>{value && <span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{value}</span>}</span>
        <span className="shrink-0 font-bold text-eu-blue text-[length:var(--fs-13)] group-open/g:hidden">Αλλαγή</span>
        <ChevronDown className="size-4 shrink-0 text-eu-muted transition-transform group-open/g:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-3 px-3 @md:px-4">{desc && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{desc}</p>}{children}</div>
    </details>
  );
  return (
    <section className="rounded-2xl border border-eu-line p-3 @md:p-4 grid gap-3 min-w-0">
      <div className="grid gap-0.5">
        <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">{title}</h4>
        {desc && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export function OptionCard({ on, onClick, title, desc, tone = "navy" }: { on: boolean; onClick: () => void; title: string; desc: string; tone?: "navy" | "red" }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`text-left rounded-2xl border-2 p-3 grid gap-0.5 min-w-0 ${on ? (tone === "red" ? "border-eu-red bg-eu-red/5" : "border-eu-navy bg-eu-chip") : "border-eu-line hover:border-eu-blue"}`}>
      <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5">{on ? <Check className="size-4" aria-hidden /> : <span className="size-4 rounded-full border-2 border-eu-line" aria-hidden />}{title}</span>
      <span className="text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{desc}</span>
    </button>
  );
}

function TargetsStep({ d, set, setReward, names, setNames, services }: { d: PromoDraft; set: (p: Partial<PromoDraft>) => void; setReward: (p: Partial<PromoDraft["reward"]>) => void; names: Record<string, string>; setNames: SetNames; services: Svc[] }) {
  const [exclude, setExclude] = useState(false);
  const add = (kind: PromoTarget["kind"], id: string, name: string) => {
    setNames((n) => ({ ...n, [id]: name }));
    set({ targets: [...d.targets.filter((t) => t.refId !== id), { kind, refId: id, exclude }] });
  };
  const toggleProduct = (p: BrowseProduct) => {
    const has = d.targets.find((t) => t.refId === p.id);
    if (has) set({ targets: d.targets.filter((t) => t.refId !== p.id) });
    else add("product", p.id, `${p.title} · ${p.sku}`);
  };
  const remove = (t: PromoTarget) => set({ targets: d.targets.filter((x) => !(x.refId === t.refId && x.exclude === t.exclude)) });
  const whole = async () => { const roots = await rootCategoriesAction(); setNames((n) => ({ ...n, ...Object.fromEntries(roots.map((r) => [r.id, r.name])) })); set({ targets: [...d.targets.filter((t) => t.exclude), ...roots.map((r) => ({ kind: "category" as const, refId: r.id, exclude: false }))] }); };
  const inc = d.targets.filter((t) => !t.exclude), exc = d.targets.filter((t) => t.exclude);
  const selected = new Set(d.targets.map((t) => t.refId));
  const cartWide = d.mechanism.startsWith("coupon") || d.mechanism.startsWith("payment") || d.mechanism === "shipping";

  if (d.mechanism === "bundle") return <BundleItems d={d} setReward={setReward} names={names} setNames={setNames} />;
  if (d.mechanism === "special-price") return <SpecialPrices d={d} setReward={setReward} names={names} setNames={setNames} />;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">{d.mechanism === "together" ? "Ποιο είναι το βασικό προϊόν (αυτό που αγοράζει ο πελάτης);" : "Τι προσθέτω τώρα;"}</span>
        <div className="grid grid-cols-2 @4xl:grid-cols-3 gap-2">
          <OptionCard on={!exclude} onClick={() => setExclude(false)} title="Ισχύει σε" desc="Ό,τι διαλέξεις από κάτω μπαίνει στην προσφορά." />
          <OptionCard on={exclude} onClick={() => setExclude(true)} tone="red" title="Εξαίρεση" desc="Ό,τι διαλέξεις από κάτω δεν παίρνει ποτέ την προσφορά — ακόμη κι αν ανήκει σε κατηγορία που ισχύει." />
          <button type="button" onClick={whole} className="col-span-2 @4xl:col-span-1 text-left rounded-2xl border-2 border-dashed border-eu-line p-3 grid gap-0.5 hover:border-eu-navy">
            <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><Store className="size-4" aria-hidden /> Όλο το κατάστημα</span>
            <span className="text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">Προσθέτει όλες τις κύριες κατηγορίες. Μετά εξαιρείς όσα δεν θέλεις.</span>
          </button>
        </div>
      </div>

      <section className="rounded-2xl bg-eu-surface p-4 grid gap-2" aria-live="polite">
        <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Η προσφορά ισχύει σε</h4>
        {inc.length ? <TargetChips list={inc} names={names} onRemove={remove} tone="in" /> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">{cartWide ? "Χωρίς επιλογή ισχύει σε όλο το καλάθι." : "Δεν έχεις διαλέξει ακόμη — ξεκίνα από την κατηγορία (1)."}</p>}
        {exc.length > 0 && <><h4 className="m-0 mt-1 font-extrabold text-eu-red text-[length:var(--fs-15)]">Εκτός</h4><TargetChips list={exc} names={names} onRemove={remove} tone="out" /></>}
        {inc.length > 1 && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Πολλές επιλογές = ισχύει σε οποιαδήποτε από αυτές. Για «μόνο η μάρκα Χ σε αυτή την κατηγορία» χρησιμοποίησε το «+» δίπλα στη μάρκα (βήμα 2).</p>}
      </section>

      <ProductBrowser mode="targets" selected={selected}
        onCategory={(c) => add("category", c.id, c.name)}
        onBrandInCategory={(b, c) => add("brandcat", `${b.id}|${c.id}`, `${b.name} στα ${c.name}`)}
        onProduct={toggleProduct} addLabel={exclude ? "Εξαίρεση" : "Προσθήκη"} />

      <details className="rounded-xl border border-eu-line p-3">
        <summary className="cursor-pointer font-bold text-eu-ink-2 text-[length:var(--fs-14)] min-h-8">Μάρκα σε όλο τον κατάλογο (σε όλες τις κατηγορίες)</summary>
        <div className="mt-2 grid gap-1"><p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Π.χ. «όλα τα Philips», από ξυριστικές μέχρι airfryer.</p><Picker kind="brand" onPick={(x) => add("brand", x.id, x.label)} placeholder="Όνομα μάρκας" /></div>
      </details>



      {d.mechanism === "together" && <Companions d={d} setReward={setReward} names={names} setNames={setNames} />}
      {d.mechanism === "gift" && (
        <section className="grid gap-2 rounded-2xl border-2 border-dashed border-eu-green/50 p-4">
          <h4 className="m-0 font-extrabold text-eu-green text-[length:var(--fs-15)]">Το προϊόν-δώρο {d.reward.giftProductId && <span className="text-eu-ink">· {names[d.reward.giftProductId] ?? d.reward.giftProductId}</span>}</h4>
          <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Μπαίνει στο καλάθι με 0 € και στο παραστατικό με την αξία του και έκπτωση 100 %.</p>
          <ProductBrowser mode="products" single selected={new Set(d.reward.giftProductId ? [d.reward.giftProductId] : [])} addLabel="Ως δώρο" onProduct={(p) => { setNames((n) => ({ ...n, [p.id]: p.title })); setReward({ giftProductId: p.id }); }} />
        </section>
      )}
      {d.mechanism === "service" && (
        <Field l="Υπηρεσία που γίνεται δωρεάν" hint="Μπαίνει αυτόματα σε κάθε προϊόν της προσφοράς στο καλάθι, με 0 € και την αξία της.">
          <select className={`${input} @xl:max-w-md`} value={d.reward.serviceSlug ?? ""} onChange={(e) => setReward({ serviceSlug: e.target.value })}>
            {services.filter((s) => s.slug !== "paradosi-egkatastasi").map((s) => <option key={s.slug} value={s.slug}>{s.title}{s.price ? ` (αξία ${s.price} €)` : ""}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

/** «Μαζί φθηνότερα»: τα συνοδευτικά (κατηγορία, μάρκα σε κατηγορία ή προϊόν). */
function Companions({ d, setReward, names, setNames }: { d: PromoDraft; setReward: (p: Partial<PromoDraft["reward"]>) => void; names: Record<string, string>; setNames: SetNames }) {
  const w = d.reward.with ?? [];
  const add = (kind: PromoTarget["kind"], id: string, name: string) => { setNames((n) => ({ ...n, [id]: name })); if (!w.some((t) => t.refId === id)) setReward({ with: [...w, { kind, refId: id, exclude: false }] }); };
  return (
    <section className="grid gap-3 rounded-2xl border-2 border-dashed border-eu-blue/40 p-4">
      <h4 className="m-0 font-extrabold text-eu-blue text-[length:var(--fs-15)] inline-flex items-center gap-1">Συνοδευτικά — αυτά γίνονται φθηνότερα <Hint k="together" /></h4>
      <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Π.χ. βασικό: τηλεοράσεις · συνοδευτικά: soundbars. Ένα συνοδευτικό με έκπτωση για κάθε βασικό προϊόν στο καλάθι.</p>
      <ProductBrowser mode="targets" selected={new Set(w.map((t) => t.refId))} onCategory={(c) => add("category", c.id, c.name)} onBrandInCategory={(b, c) => add("brandcat", `${b.id}|${c.id}`, `${b.name} στα ${c.name}`)} onProduct={(p) => (w.some((t) => t.refId === p.id) ? setReward({ with: w.filter((t) => t.refId !== p.id) }) : add("product", p.id, p.title))} />
      {w.length > 0 && <TargetChips list={w} names={names} tone="in" onRemove={(t) => setReward({ with: w.filter((x) => x.refId !== t.refId) })} />}
    </section>
  );
}

/** Πακέτο: τα προϊόντα και πόσα τεμάχια από το καθένα. */
function BundleItems({ d, setReward, names, setNames }: { d: PromoDraft; setReward: (p: Partial<PromoDraft["reward"]>) => void; names: Record<string, string>; setNames: SetNames }) {
  const items = d.reward.bundle ?? [];
  return (
    <div className="grid gap-4">
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] inline-flex items-center gap-1">Διάλεξε τα προϊόντα του πακέτου. Ο πελάτης πρέπει να τα βάλει όλα στο καλάθι για να πάρει την τιμή πακέτου. <Hint k="bundle" /></p>
      <ProductBrowser mode="products" selected={new Set(items.map((i) => i.productId))} addLabel="Στο πακέτο" onProduct={(p) => { setNames((n) => ({ ...n, [p.id]: `${p.title} · ${p.sku}` })); setReward({ bundle: items.some((i) => i.productId === p.id) ? items.filter((i) => i.productId !== p.id) : [...items, { productId: p.id, qty: 1 }] }); }} />
      <section className="rounded-2xl bg-eu-surface p-4 grid gap-2">
        <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Το πακέτο ({items.length} {items.length === 1 ? "προϊόν" : "προϊόντα"})</h4>
        {!items.length && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Πρόσθεσε τουλάχιστον 2 προϊόντα.</p>}
        <ul className="m-0 p-0 list-none grid gap-2">{items.map((i) => (
          <li key={i.productId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl bg-white border border-eu-line p-2 pl-3">
            <span className="min-w-0 text-[length:var(--fs-14)] font-semibold line-clamp-2">{names[i.productId] ?? i.productId}</span>
            <label className="inline-flex items-center gap-1 text-[length:var(--fs-14)]">τεμ. <input inputMode="numeric" className={`${input} w-16`} value={i.qty} onChange={(e) => setReward({ bundle: items.map((x) => (x.productId === i.productId ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)) })} /></label>
            <button type="button" aria-label="Αφαίρεση" onClick={() => setReward({ bundle: items.filter((x) => x.productId !== i.productId) })} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
          </li>
        ))}</ul>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Την τιμή του πακέτου τη βάζεις στο επόμενο βήμα.</p>
      </section>
    </div>
  );
}

/** Ειδικές τιμές: διαλέγεις προϊόντα και γράφεις την τελική τιμή. */
function SpecialPrices({ d, setReward, names, setNames }: { d: PromoDraft; setReward: (p: Partial<PromoDraft["reward"]>) => void; names: Record<string, string>; setNames: SetNames }) {
  const prices = d.reward.price ?? {};
  const [list, setList] = useState<Record<string, number | null>>({});
  return (
    <div className="grid gap-4">
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Διάλεξε προϊόντα και γράψε την τελική τιμή τους (με ΦΠΑ). Για πολλά προϊόντα πιο γρήγορα είναι η <Link href="/admin/prosfores/excel" className="font-bold text-eu-blue hover:underline">εισαγωγή από Excel</Link>.</p>
      <ProductBrowser mode="products" selected={new Set(Object.keys(prices))} onProduct={(p) => {
        setNames((n) => ({ ...n, [p.id]: `${p.title} · ${p.sku}` })); setList((l) => ({ ...l, [p.id]: p.price }));
        if (p.id in prices) { const { [p.id]: _x, ...rest } = prices; void _x; setReward({ price: rest }); } else setReward({ price: { ...prices, [p.id]: 0 } });
      }} />
      <section className="rounded-2xl bg-eu-surface p-4 grid gap-2">
        <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Ειδικές τιμές ({Object.keys(prices).length})</h4>
        <ul className="m-0 p-0 list-none grid gap-2">{Object.entries(prices).map(([id, c]) => (
          <li key={id} className="grid grid-cols-1 @xl:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl bg-white border border-eu-line p-2 pl-3">
            <span className="min-w-0 text-[length:var(--fs-14)] font-semibold">{names[id] ?? id}{list[id] != null && <span className="block font-normal text-eu-muted text-[length:var(--fs-13)]">τρέχουσα {list[id]!.toLocaleString("el-GR")} €</span>}</span>
            <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-bold">Νέα τιμή <input aria-label="Ειδική τιμή σε €" inputMode="decimal" defaultValue={c ? toEur(c) : ""} onBlur={(e) => setReward({ price: { ...prices, [id]: toCents(e.target.value) ?? 0 } })} className={`${input} w-32 text-right`} placeholder="€" /></label>
            <button type="button" aria-label="Αφαίρεση" onClick={() => { const { [id]: _x, ...rest } = prices; void _x; setReward({ price: rest }); }} className="justify-self-end size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
          </li>
        ))}</ul>
        {!Object.keys(prices).length && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Πρόσθεσε προϊόντα από τη λίστα (3).</p>}
      </section>
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

/** Κοινά πελατών και early access (βήμα «Κανόνες»). */
function SegmentRules({ d, setRules, segments }: { d: PromoDraft; setRules: (p: Partial<PromoDraft["rules"]>) => void; segments: { id: string; label: string }[] }) {
  const sel = d.rules.segments ?? [];
  const ea = d.rules.earlyAccess;
  if (!segments.length) return <p className="m-0 rounded-xl bg-eu-surface px-4 py-3 text-eu-ink-3 text-[length:var(--fs-14)]">Για στοχευμένη προσφορά ή early access φτιάξε πρώτα ένα <Link href="/admin/prosfores/koina" className="font-bold text-eu-blue hover:underline">κοινό πελατών</Link>.</p>;
  return (
    <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3">
      <fieldset className="m-0 rounded-xl border border-eu-line p-3 grid gap-1.5"><legend className="px-1 font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-1">Μόνο για τα κοινά <Hint k="segments" /></legend>
        <div className="flex flex-wrap gap-1.5">{segments.map((s) => { const on = sel.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setRules({ segments: on ? sel.filter((x) => x !== s.id) : [...sel, s.id] })} className={`rounded-full px-3 min-h-10 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{s.label}</button>; })}</div>
        <span className="text-eu-muted text-[length:var(--fs-13)]">{sel.length ? "Μόνο μέλη αυτών των κοινών." : "Κανένα = για όλους."}</span>
      </fieldset>
      <fieldset className="m-0 rounded-xl border border-eu-line p-3 grid gap-1.5"><legend className="px-1 font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-1">Early access <Hint k="earlyAccess" /></legend>
        <div className="flex flex-wrap gap-1.5">{segments.map((s) => { const on = !!ea?.segments.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => { const next = on ? (ea?.segments ?? []).filter((x) => x !== s.id) : [...(ea?.segments ?? []), s.id]; setRules({ earlyAccess: next.length ? { segments: next, hours: ea?.hours ?? 24 } : undefined }); }} className={`rounded-full px-3 min-h-10 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-blue text-white border-eu-blue" : "border-eu-line"}`}>{s.label}</button>; })}</div>
        {ea && <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-bold text-eu-ink-2">ώρες νωρίτερα <input inputMode="numeric" className={`${input} w-24`} value={ea.hours} onChange={(e) => setRules({ earlyAccess: { ...ea, hours: Math.max(1, Math.min(720, Number(e.target.value) || 24)) } })} /></label>}
        {ea && !d.startsAt && <span className="text-eu-amber font-semibold text-[length:var(--fs-13)]">Βάλε ημερομηνία έναρξης — το early access μετρά από αυτήν.</span>}
      </fieldset>
    </div>
  );
}

function PaymentPick({ d: dd, setRules }: { d: PromoDraft; setRules: (p: Partial<PromoDraft["rules"]>) => void }) {
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-1"><legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1 inline-flex items-center gap-1">Με ποιους τρόπους πληρωμής <Hint k="payment" /></legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">{PAYMENT_OPTIONS.map((o) => { const on = !!dd.rules.payment?.includes(o.value); return <label key={o.value} className="inline-flex items-center gap-1.5 min-h-11 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={on} onChange={(e) => setRules({ payment: e.target.checked ? [...(dd.rules.payment ?? []), o.value] : (dd.rules.payment ?? []).filter((x) => x !== o.value) })} />{o.label}</label>; })}</div>
    </fieldset>
  );
}

type StoreOpt = { id: string; name: string; city: string };
const normTxt = (x: string) => x.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** «Μόνο σε αυτά τα καταστήματα»: λίστα που στενεύει όσο πληκτρολογείς (όνομα ή πόλη). */
function StorePicker({ selected, stores, onChange }: { selected: string[]; stores: StoreOpt[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(selected.length > 0);
  const shown = useMemo(() => { const t = normTxt(q.trim()); return (t ? stores.filter((x) => normTxt(`${x.name} ${x.city}`).includes(t)) : stores).slice(0, 80); }, [q, stores]);
  const byId = new Map(stores.map((x) => [x.id, x]));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  if (!stores.length) return null;
  return (
    <div className="grid gap-2 rounded-xl border border-eu-line p-3">
      <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5 accent-eu-navy" checked={open} onChange={(e) => { setOpen(e.target.checked); if (!e.target.checked) onChange([]); }} /> Μόνο σε συγκεκριμένα καταστήματα</label>
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Online ισχύει όταν ο πελάτης διαλέγει παραλαβή από αυτά τα καταστήματα· στο ταμείο, μόνο σε αυτά. Π.χ. εγκαίνια ή εκκαθάριση ενός καταστήματος.</p>
      {open && (
        <>
          {selected.length > 0 && <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">{selected.map((id) => <li key={id} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-navy pl-3 pr-1 min-h-10 text-[length:var(--fs-14)] font-semibold max-w-full"><span className="truncate">{byId.get(id)?.name ?? id}</span><button type="button" aria-label="Αφαίρεση" onClick={() => toggle(id)} className="size-9 shrink-0 grid place-items-center rounded-full hover:bg-black/5"><X className="size-4" aria-hidden /></button></li>)}</ul>}
          <input aria-label="Φίλτρο καταστημάτων" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Γράψε πόλη ή όνομα καταστήματος…" className={input} />
          <ul className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-2 gap-1 max-h-72 overflow-y-auto">
            {shown.map((x) => { const on = selected.includes(x.id); return <li key={x.id}><button type="button" aria-pressed={on} onClick={() => toggle(x.id)} className={`w-full text-left flex items-center gap-2 rounded-xl px-3 min-h-11 text-[length:var(--fs-14)] border ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>{on ? <Check className="size-4 shrink-0" aria-hidden /> : <Plus className="size-4 shrink-0" aria-hidden />}<span className="min-w-0"><span className="block font-semibold truncate">{x.name}</span><span className="block text-eu-muted text-[length:var(--fs-13)]">{x.city}</span></span></button></li>; })}
            {!shown.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Κανένα κατάστημα με αυτό το φίλτρο.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
