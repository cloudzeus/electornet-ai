"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleAlert, ExternalLink, LayoutTemplate, Loader2, Megaphone, Pause, Play, Plus, Search, Square, Archive, TicketPercent, X } from "lucide-react";
import { Badge } from "@/components/admin/orders/ui";
import { CAMPAIGN_GOALS, CAMPAIGN_STATUS, budgetUse, publishOutcome, validateCampaign, type CampaignDraft, type CampaignGoal, type CampaignStatus } from "@/lib/promo/campaign-core";
import { MECHANISM_LABEL, STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import { campaignStateAction, membershipAction, publishCampaignAction, saveCampaignAction } from "@/app/admin/(shell)/prosfores/kampanies/actions";

type Avail = { id: string; label: string; sub: string; status: string; campaignCode: string | null };
export type WizardCampaign = {
  id: string; code: string; status: CampaignStatus; title: string; goal: CampaignGoal; brief: string; startsAt: string; endsAt: string;
  budgetEur: number | null; spent: number; budget: ReturnType<typeof budgetUse>;
  promotions: { id: string; code: string; name: string; status: string; mechanism: string; startsAt: string | null; endsAt: string | null; usedCount: number; coupons: string[] }[];
  landings: { id: string; slug: string; title: string; status: string; startsAt: string | null; endsAt: string | null }[];
  ads: { id: string; title: string; slot: string; status: string; startsAt: string | null; endsAt: string | null; impressions: number; clicks: number }[];
  available: { promotions: Avail[]; landings: Avail[]; ads: Avail[] };
};

const STEPS = [
  { t: "Στόχος & ημερομηνίες", what: "Τι θέλει να πετύχει η καμπάνια και πότε τρέχει. Οι προσφορές χωρίς δικές τους ημερομηνίες ακολουθούν αυτές." },
  { t: "Budget", what: "Το μέγιστο ποσό που μπορεί να δοθεί σε εκπτώσεις σε όλη την καμπάνια. Βλέπεις πόσο έχει δοθεί μέχρι τώρα." },
  { t: "Περιεχόμενα", what: "Οι προσφορές, οι landing pages και τα banners της καμπάνιας. Πρόσθεσε υπάρχοντα ή φτιάξε νέα προσφορά μέσα στην καμπάνια." },
  { t: "Προβολή", what: "Πού θα φανεί η καμπάνια στο site: landing pages και διαφημιστικές θέσεις, με τις ημερομηνίες τους." },
  { t: "Έλεγχος & δημοσίευση", what: "Τι λείπει, τι να προσέξεις, και η δημοσίευση όλων μαζί." },
] as const;

const field = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-10 text-[length:var(--fs-14)] outline-none focus:border-eu-blue";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 disabled:opacity-45";
const label = "grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink";
const helpTxt = "m-0 font-normal text-eu-ink-3 text-[length:var(--fs-12)] leading-snug";
const eur = (v: number) => v.toLocaleString("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Athens" }) : "—");
const promoTone = (s: string) => (s === "active" ? "good" : s === "pending" || s === "paused" ? "warn" : s === "scheduled" ? "info" : "neutral");

/**
 * Ο οδηγός καμπάνιας σε 5 βήματα. Κάθε «Συνέχεια» στα βήματα 1–2 αποθηκεύει (νέα καμπάνια → παίρνει κωδικό και
 * διεύθυνση), ώστε να μη χάνεται τίποτα. Στο πλάι (κάτω στο κινητό): σύνοψη και ό,τι λείπει.
 */
export function CampaignWizard({ campaign, initialStep }: { campaign: WizardCampaign | null; initialStep: number }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [d, setD] = useState<CampaignDraft>({ id: campaign?.id, title: campaign?.title ?? "", goal: campaign?.goal ?? "sales", brief: campaign?.brief ?? "", startsAt: campaign?.startsAt ?? null, endsAt: campaign?.endsAt ?? null, budgetEur: campaign?.budgetEur ?? null });
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<CampaignDraft>) => { setD((x) => ({ ...x, ...p })); setErrors([]); };
  const status = campaign?.status ?? "draft";
  const published = !["draft", "review", "approved", "rejected"].includes(status);

  const promoWindows = useMemo(() => (campaign?.promotions ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status, startsAt: p.startsAt ? new Date(p.startsAt) : null, endsAt: p.endsAt ? new Date(p.endsAt) : null })), [campaign]);
  const pendingCount = (campaign?.promotions ?? []).filter((p) => p.status === "pending").length;
  const [now] = useState(() => new Date());
  const check = validateCampaign(d, promoWindows, { publish: true, now });

  const go = (to: number) => {
    setStep(to);
    if (campaign) window.history.replaceState(null, "", `/admin/prosfores/kampanies/${campaign.id}?step=${to}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  /** Αποθήκευση και μετάβαση. Νέα καμπάνια: μεταφορά στη διεύθυνσή της. */
  const saveAnd = (to: number) => start(async () => {
    const r = await saveCampaignAction(d);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors([]);
    if (!campaign) { router.replace(`/admin/prosfores/kampanies/${r.id}?step=${to}`); return; }
    router.refresh();
    go(to);
  });

  return (
    <div className="grid grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start min-w-0">
      <div className="grid gap-4 min-w-0">
        <ol data-help="campaign.steps" aria-label="Βήματα" className="m-0 p-0 list-none grid grid-cols-5 gap-1">
          {STEPS.map((s, i) => {
            const cur = i === step, locked = !campaign && i > 1;
            return (
              <li key={s.t}>
                <button type="button" disabled={locked || pending} onClick={() => (i <= 1 || campaign ? go(i) : null)} aria-current={cur ? "step" : undefined} title={locked ? "Αποθήκευσε πρώτα το βήμα 1" : s.t}
                  className={`w-full grid gap-1 justify-items-center @2xl:justify-items-start rounded-lg px-2 py-1.5 min-h-11 text-left disabled:opacity-45 ${cur ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink-3 hover:border-eu-navy"}`}>
                  <span className={`size-6 rounded-full grid place-items-center font-extrabold text-[length:var(--fs-12)] ${cur ? "bg-white text-eu-navy" : i < step ? "bg-eu-green text-white" : "bg-eu-surface"}`}>{i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
                  <span className="hidden @2xl:block font-bold text-[length:var(--fs-12)] leading-tight">{s.t}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <section className="rounded-xl border border-eu-line bg-white p-4 grid gap-4 min-w-0">
          <header className="grid gap-0.5">
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)] font-bold">Βήμα {step + 1} από 5</p>
            <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{STEPS[step].t}</h3>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[75ch]">{STEPS[step].what}</p>
          </header>

          {errors.length > 0 && <ul role="alert" className="m-0 pl-5 grid gap-0.5 rounded-lg bg-eu-red/5 border border-eu-red/20 py-2 pr-3 text-eu-red text-[length:var(--fs-13)] font-bold">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

          {step === 0 && (
            <div className="grid gap-4">
              <label className={label} data-help="campaign.title">Όνομα
                <input className={field} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="π.χ. Black Friday 2026" maxLength={160} />
                <span className={helpTxt}>Το βλέπουν μόνο οι συνάδελφοι — οι πελάτες βλέπουν τις προσφορές και τις landing pages.</span>
              </label>
              <fieldset data-help="campaign.goal" className="m-0 p-0 border-0 grid gap-1.5">
                <legend className="font-bold text-eu-ink text-[length:var(--fs-13)] mb-1">Στόχος</legend>
                <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-1.5">
                  {(Object.keys(CAMPAIGN_GOALS) as CampaignGoal[]).map((g) => (
                    <label key={g} className={`flex gap-2 items-start rounded-lg border p-2.5 cursor-pointer min-h-11 ${d.goal === g ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-navy"}`}>
                      <input type="radio" name="goal" checked={d.goal === g} onChange={() => set({ goal: g })} className="mt-1 accent-eu-navy size-4 shrink-0" />
                      <span className="grid gap-0.5"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{CAMPAIGN_GOALS[g].label}</span><span className={helpTxt}>{CAMPAIGN_GOALS[g].help}</span><span className={`${helpTxt} italic`}>{CAMPAIGN_GOALS[g].measures}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className={label}>Σύντομη περιγραφή <span className="font-normal text-eu-muted">(προαιρετικό)</span>
                <textarea className={`${field} py-2 min-h-20`} value={d.brief ?? ""} onChange={(e) => set({ brief: e.target.value })} placeholder="Τι προσφέρουμε, σε ποιους, τι θέλουμε να πετύχουμε." maxLength={2000} />
              </label>
              <div data-help="campaign.dates" className="grid grid-cols-1 @md:grid-cols-2 gap-3">
                <label className={label}>Έναρξη<input type="date" className={`${field} tabular-nums`} value={d.startsAt ?? ""} onChange={(e) => set({ startsAt: e.target.value || null })} /><span className={helpTxt}>Από τις 00:00 (ώρα Ελλάδας).</span></label>
                <label className={label}>Λήξη<input type="date" className={`${field} tabular-nums`} value={d.endsAt ?? ""} min={d.startsAt ?? undefined} onChange={(e) => set({ endsAt: e.target.value || null })} /><span className={helpTxt}>Ως τις 23:59. Η ίδια ημερομηνία οδηγεί κάθε αντίστροφη μέτρηση του site.</span></label>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <label className={label} data-help="campaign.budget">Budget εκπτώσεων (€) <span className="font-normal text-eu-muted">(προαιρετικό)</span>
                <input type="number" inputMode="decimal" min={0} step={100} className={`${field} tabular-nums max-w-56`} value={d.budgetEur ?? ""} onChange={(e) => set({ budgetEur: e.target.value === "" ? null : Number(e.target.value) })} placeholder="π.χ. 10000" />
                <span className={helpTxt}>Το άθροισμα των εκπτώσεων που μπορούν να δοθούν σε όλες τις προσφορές της καμπάνιας. Π.χ. 100 τηλεοράσεις με −100 € = 10.000 €. Κενό = χωρίς όριο.</span>
              </label>
              {campaign && (
                <div className="rounded-lg bg-eu-surface p-3 grid gap-1 text-[length:var(--fs-13)]">
                  <span className="font-bold text-eu-ink">Μέχρι τώρα: {eur(campaign.spent)} σε εκπτώσεις</span>
                  {campaign.budget.pct != null && <span className={campaign.budget.over ? "text-eu-red font-bold" : "text-eu-ink-3"}>{campaign.budget.over ? `Υπέρβαση budget κατά ${eur(-(campaign.budget.left ?? 0))}` : `${campaign.budget.pct}% του budget · απομένουν ${eur(campaign.budget.left ?? 0)}`}</span>}
                </div>
              )}
              <p className="m-0 rounded-lg border border-eu-line p-3 text-eu-ink-3 text-[length:var(--fs-13)]">Η εκτίμηση κόστους από το ιστορικό πωλήσεων, η συμμετοχή κατασκευαστών / τραπεζών και η έγκριση εμπορικής / οικονομικής διεύθυνσης έρχονται στην επόμενη φάση.</p>
            </div>
          )}

          {step === 2 && campaign && (
            <div className="grid gap-5">
              <Members data-help="campaign.promotion" title="Προσφορές" icon={TicketPercent} kind="promotion" id={campaign.id} available={campaign.available.promotions}
                rows={campaign.promotions.map((p) => ({ id: p.id, href: `/admin/prosfores/${p.id}`, title: p.name, sub: `${p.code} · ${MECHANISM_LABEL[p.mechanism] ?? p.mechanism}${p.coupons.length ? ` · ${p.coupons.join(", ")}` : ""} · ${day(p.startsAt)} – ${day(p.endsAt)}`, badge: <Badge tone={promoTone(p.status)}>{STATUS_LABEL[p.status as PromoStatus]?.label ?? p.status}</Badge> }))}
                extra={<Link href={`/admin/prosfores/new?campaign=${campaign.id}`} className={`${btn} border border-eu-line bg-white hover:border-eu-navy`}><Plus className="size-4" aria-hidden /> Νέα προσφορά σε αυτή την καμπάνια</Link>} />
              <Members data-help="campaign.landing" title="Landing pages" icon={LayoutTemplate} kind="landing" id={campaign.id} available={campaign.available.landings}
                rows={campaign.landings.map((l) => ({ id: l.id, href: `/admin/prosfores/selides/${l.id}`, title: l.title, sub: `/prosfores/${l.slug} · ${day(l.startsAt)} – ${day(l.endsAt)}`, badge: <Badge tone={l.status === "published" ? "good" : "neutral"}>{l.status === "published" ? "Δημοσιευμένη" : "Πρόχειρη"}</Badge> }))} />
              <Members data-help="campaign.ad" title="Banners" icon={Megaphone} kind="ad" id={campaign.id} available={campaign.available.ads}
                rows={campaign.ads.map((a) => ({ id: a.id, href: "/admin/prosfores/theseis", title: a.title, sub: `${a.slot} · ${day(a.startsAt)} – ${day(a.endsAt)}`, badge: <Badge tone={a.status === "active" ? "good" : "neutral"}>{a.status === "active" ? "Ενεργό" : a.status === "paused" ? "Σε παύση" : "Πρόχειρο"}</Badge> }))} />
            </div>
          )}

          {step === 3 && campaign && (
            <div className="grid gap-3">
              {campaign.landings.length + campaign.ads.length === 0 && (
                <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/10 border border-eu-amber/30 p-3 text-eu-ink-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden /> Η καμπάνια δεν έχει ακόμη landing page ή banner: οι πελάτες θα βρίσκουν τις προσφορές μόνο στις σελίδες των προϊόντων. Πρόσθεσέ τα στο βήμα «Περιεχόμενα».</p>
              )}
              <ul className="m-0 p-0 list-none grid gap-1.5">
                {campaign.landings.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-eu-line p-2.5 text-[length:var(--fs-13)]">
                    <LayoutTemplate className="size-4 text-eu-blue" aria-hidden /><span className="font-bold text-eu-ink">{l.title}</span><span className="text-eu-muted">{day(l.startsAt)} – {day(l.endsAt)}</span>
                    <span className="ml-auto flex gap-2"><a href={`/prosfores/${l.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-eu-blue font-bold hover:underline min-h-11 md:min-h-8">Προβολή <ExternalLink className="size-3.5" aria-hidden /></a><Link href={`/admin/prosfores/selides/${l.id}`} className="inline-flex items-center text-eu-blue font-bold hover:underline min-h-11 md:min-h-8">Επεξεργασία</Link></span>
                  </li>
                ))}
                {campaign.ads.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-eu-line p-2.5 text-[length:var(--fs-13)]">
                    <Megaphone className="size-4 text-eu-blue" aria-hidden /><span className="font-bold text-eu-ink">{a.title}</span><span className="text-eu-muted">{a.slot} · {day(a.startsAt)} – {day(a.endsAt)}</span>
                    <span className="ml-auto text-eu-ink-3 tabular-nums">{a.impressions.toLocaleString("el-GR")} εμφανίσεις · {a.clicks.toLocaleString("el-GR")} κλικ</span>
                  </li>
                ))}
              </ul>
              <p className={helpTxt}>Landing pages και banners χωρίς δικές τους ημερομηνίες παίρνουν τις ημερομηνίες της καμπάνιας κατά τη δημοσίευση.</p>
            </div>
          )}

          {step === 4 && campaign && (
            <div className="grid gap-3" data-help="campaign.review">
              {check.errors.length > 0 && <Issues tone="bad" title="Πρέπει να διορθωθούν πριν τη δημοσίευση" items={check.errors} />}
              {check.warnings.length > 0 && <Issues tone="warn" title="Να το προσέξεις" items={check.warnings} />}
              {check.errors.length === 0 && check.warnings.length === 0 && <p className="m-0 inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-14)]"><Check className="size-4" aria-hidden /> Όλα έτοιμα.</p>}
              <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[length:var(--fs-13)]">
                <dt className="text-eu-muted">Στόχος</dt><dd className="m-0 font-bold">{CAMPAIGN_GOALS[d.goal].label}</dd>
                <dt className="text-eu-muted">Διάρκεια</dt><dd className="m-0 font-bold tabular-nums">{day(d.startsAt)} – {day(d.endsAt)}</dd>
                <dt className="text-eu-muted">Budget</dt><dd className="m-0 font-bold tabular-nums">{d.budgetEur ? eur(d.budgetEur) : "χωρίς όριο"}</dd>
                <dt className="text-eu-muted">Περιεχόμενα</dt><dd className="m-0 font-bold">{campaign.promotions.length} προσφορές · {campaign.landings.length} landing · {campaign.ads.length} banners</dd>
              </dl>
              <p className={helpTxt}>Με τη δημοσίευση οι πρόχειρες προσφορές δημοσιεύονται μαζί· όσες ξεπερνούν τα όρια έγκρισης μένουν «Αναμένει έγκριση» μέχρι να τις εγκρίνει δεύτερο πρόσωπο.</p>
              {!published && (
                <button type="button" disabled={pending || check.errors.length > 0} onClick={() => start(async () => {
                  const s = await saveCampaignAction(d);
                  if (!s.ok) { setErrors(s.errors); return; }
                  const r = await publishCampaignAction(campaign.id);
                  setMsg(publishOutcome(r));
                  router.refresh();
                })} className={`${btn} justify-self-start bg-eu-navy text-white hover:bg-eu-blue`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Δημοσίευση καμπάνιας</button>
              )}
              {msg && <p role={msg.tone === "bad" ? "alert" : "status"} className={`m-0 font-bold text-[length:var(--fs-13)] ${msg.tone === "ok" ? "text-eu-green" : msg.tone === "warn" ? "text-eu-amber" : "text-eu-red"}`}>{msg.text}</p>}
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-2 pt-2 border-t border-eu-line">
            {step > 0 && <button type="button" disabled={pending} onClick={() => go(step - 1)} className={`${btn} border border-eu-line bg-white hover:border-eu-navy`}><ArrowLeft className="size-4" aria-hidden /> Πίσω</button>}
            {step < 4 && (
              <button type="button" disabled={pending} onClick={() => (step <= 1 ? saveAnd(step + 1) : go(step + 1))} className={`${btn} ml-auto bg-eu-navy text-white hover:bg-eu-blue`}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{step <= 1 ? "Αποθήκευση & συνέχεια" : "Συνέχεια"} <ArrowRight className="size-4" aria-hidden />
              </button>
            )}
          </footer>
        </section>
      </div>

      <aside data-help="campaign.summary" className="grid gap-3 rounded-xl border border-eu-line bg-white p-4 min-w-0 @5xl:sticky @5xl:top-4">
        <div className="flex flex-wrap items-center gap-2">
          {campaign && <span className="font-mono text-[length:var(--fs-12)] text-eu-ink-3">{campaign.code}</span>}
          <Badge tone={CAMPAIGN_STATUS[status].tone}>{CAMPAIGN_STATUS[status].label}</Badge>
        </div>
        <p className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] break-words">{d.title || "Χωρίς όνομα"}</p>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{day(d.startsAt)} – {day(d.endsAt)}</p>
        {campaign && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{campaign.promotions.length} προσφορές · {campaign.landings.length} landing · {campaign.ads.length} banners</p>}
        {pendingCount > 0 && <p data-help="campaign.pending" className="m-0 inline-flex items-center gap-1.5 rounded-lg bg-eu-amber/10 px-2.5 py-1.5 font-bold text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-amber" aria-hidden /> {pendingCount} {pendingCount === 1 ? "προσφορά αναμένει" : "προσφορές αναμένουν"} έγκριση</p>}
        {campaign && campaign.budget.pct != null && (
          <div className="grid gap-1">
            <span className="h-1.5 rounded-full bg-eu-surface overflow-hidden"><span className={`block h-full ${campaign.budget.over ? "bg-eu-red" : "bg-eu-blue"}`} style={{ width: `${Math.min(100, campaign.budget.pct)}%` }} /></span>
            <span className={`text-[length:var(--fs-12)] tabular-nums ${campaign.budget.over ? "text-eu-red font-bold" : "text-eu-ink-3"}`}>{eur(campaign.spent)} από {eur(campaign.budgetEur!)}</span>
          </div>
        )}
        {(check.errors.length > 0 || check.warnings.length > 0) && (
          <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-12)]">
            {check.errors.map((e) => <li key={e} className="flex gap-1.5 text-eu-red"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />{e}</li>)}
            {check.warnings.map((e) => <li key={e} className="flex gap-1.5 text-eu-ink-3"><AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-eu-amber" aria-hidden />{e}</li>)}
          </ul>
        )}
        {campaign && published && status !== "archived" && <StateActions id={campaign.id} status={status} />}
      </aside>
    </div>
  );
}

function Issues({ tone, title, items }: { tone: "bad" | "warn"; title: string; items: string[] }) {
  return (
    <div className={`grid gap-1 rounded-lg p-3 text-[length:var(--fs-13)] ${tone === "bad" ? "bg-eu-red/5 border border-eu-red/20" : "bg-eu-amber/10 border border-eu-amber/30"}`}>
      <span className={`font-bold ${tone === "bad" ? "text-eu-red" : "text-eu-ink"}`}>{title}</span>
      <ul className="m-0 pl-5 grid gap-0.5 text-eu-ink-2">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

type Row = { id: string; href: string; title: string; sub: string; badge: React.ReactNode };
/** Λίστα περιεχομένων της καμπάνιας με αφαίρεση και «Προσθήκη» από αναζητήσιμη λίστα. */
function Members({ title, icon: Icon, kind, id, rows, available, extra, "data-help": help }: { title: string; icon: typeof Megaphone; kind: "promotion" | "landing" | "ad"; id: string; rows: Row[]; available: Avail[]; extra?: React.ReactNode; "data-help": string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = available.filter((a) => !q.trim() || `${a.label} ${a.sub}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  const act = (ids: string[], attach: boolean) => start(async () => {
    const r = await membershipAction(id, kind, ids, attach);
    setMsg(attach ? `Προστέθηκαν ${ids.length}${r.moved.length ? ` · μετακινήθηκαν από ${r.moved.join(", ")}` : ""}.` : "Αφαιρέθηκε.");
    setPicked([]); setOpen(false); router.refresh();
  });
  return (
    <section data-help={help} className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="m-0 inline-flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]"><Icon className="size-4 text-eu-blue" aria-hidden />{title} <span className="text-eu-muted tabular-nums text-[length:var(--fs-13)]">{rows.length}</span></h4>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {extra}
          <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className={`${btn} border border-eu-line bg-white hover:border-eu-navy`}>{open ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {open ? "Κλείσιμο" : "Προσθήκη"}</button>
        </span>
      </div>
      {open && (
        <div className="grid gap-2 rounded-lg border border-eu-line bg-eu-surface/60 p-2.5">
          <label className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση" aria-label={`Αναζήτηση: ${title}`} className={`${field} pl-8`} /></label>
          {list.length === 0 ? <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Τίποτα διαθέσιμο.</p> : (
            <ul className="m-0 p-0 list-none grid gap-1 max-h-72 overflow-y-auto">
              {list.map((a) => (
                <li key={a.id}>
                  <label className="flex items-start gap-2 rounded-md bg-white border border-eu-line px-2.5 py-1.5 cursor-pointer min-h-11 text-[length:var(--fs-13)]">
                    <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} className="mt-1 accent-eu-navy size-4 shrink-0" />
                    <span className="grid min-w-0"><span className="font-bold text-eu-ink break-words">{a.label}</span><span className="text-eu-muted text-[length:var(--fs-12)] break-words">{a.sub}{a.campaignCode ? ` · ανήκει στην ${a.campaignCode} — θα μετακινηθεί` : ""}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button type="button" disabled={!picked.length || pending} onClick={() => act(picked, true)} className={`${btn} justify-self-start bg-eu-navy text-white hover:bg-eu-blue`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Προσθήκη επιλεγμένων ({picked.length})</button>
        </div>
      )}
      {rows.length === 0 ? <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κανένα ακόμη.</p> : (
        <ul className="m-0 p-0 list-none divide-y divide-eu-line rounded-lg border border-eu-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 text-[length:var(--fs-13)]">
              <span className="grid min-w-0 flex-1"><Link href={r.href} className="font-bold text-eu-ink hover:text-eu-blue hover:underline break-words">{r.title}</Link><span className="text-eu-muted text-[length:var(--fs-12)] break-words">{r.sub}</span></span>
              {r.badge}
              <button type="button" disabled={pending} onClick={() => act([r.id], false)} aria-label={`Αφαίρεση: ${r.title}`} className="inline-flex items-center justify-center rounded-full size-11 md:size-8 text-eu-muted hover:text-eu-red hover:bg-eu-red/5"><X className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p role="status" className="m-0 text-eu-green font-bold text-[length:var(--fs-12)]">{msg}</p>}
    </section>
  );
}

/** Παύση / συνέχεια / λήξη / αρχείο, με επιβεβαίωση μέσα στη σελίδα. */
function StateActions({ id, status }: { id: string; status: CampaignStatus }) {
  const router = useRouter();
  const [ask, setAsk] = useState<null | "pause" | "resume" | "end" | "archive">(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const TEXT = { pause: "Παύση: σταματούν αμέσως όλες οι προσφορές της καμπάνιας.", resume: "Συνέχεια: οι προσφορές ξαναμπαίνουν σε ισχύ.", end: "Λήξη τώρα: οι προσφορές λήγουν οριστικά.", archive: "Αρχείο: η καμπάνια κρύβεται από τη λίστα· οι προσφορές μένουν (όσες τρέχουν λήγουν)." };
  const options = (status === "paused" ? ["resume", "end", "archive"] : status === "ended" ? ["archive"] : ["pause", "end", "archive"]) as (keyof typeof TEXT)[];
  const ICON = { pause: Pause, resume: Play, end: Square, archive: Archive };
  const LABEL = { pause: "Παύση", resume: "Συνέχεια", end: "Λήξη τώρα", archive: "Αρχείο" };
  return (
    <div data-help="campaign.state" className="grid gap-2 pt-2 border-t border-eu-line">
      {!ask ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => { const I = ICON[o]; return <button key={o} type="button" onClick={() => setAsk(o)} className={`${btn} border border-eu-line bg-white ${o === "end" || o === "archive" ? "hover:border-eu-red hover:text-eu-red" : "hover:border-eu-navy"}`}><I className="size-4" aria-hidden /> {LABEL[o]}</button>; })}
        </div>
      ) : (
        <div className="grid gap-2 rounded-lg bg-eu-surface p-2.5">
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)]">{TEXT[ask]}</p>
          <div className="flex gap-1.5">
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await campaignStateAction(id, ask); if (!r.ok) { setErr(r.error ?? "Δεν έγινε."); return; } setAsk(null); setErr(null); router.refresh(); })} className={`${btn} ${ask === "end" || ask === "archive" ? "bg-eu-red" : "bg-eu-navy"} text-white`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {LABEL[ask]}</button>
            <button type="button" onClick={() => setAsk(null)} className={`${btn} border border-eu-line bg-white`}>Άκυρο</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-12)]">{err}</p>}
    </div>
  );
}
