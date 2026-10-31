"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Bot, CheckCircle2, Loader2, Sparkles, Wand2 } from "lucide-react";
import { createConnection, saveQuestionnaire } from "@/app/synergaton/actions";
import { QUESTION_STEPS, ruleAdvice } from "@/lib/partner-portal/questions";
import { connTypeInfo, CONN_TYPES, type ConnType } from "@/lib/partner-portal/connection-types";
import type { SetupAdvice } from "@/lib/partner-portal/ai";
import { Badge, btn, Callout, focusRing } from "./ui";
import { Wizard, WizardNav, type WizardStep } from "./wizard";

/** Ερωτηματολόγιο αρχικοποίησης → πρόταση τρόπου σύνδεσης από τον βοηθό (DeepSeek) με εναλλακτική πρόταση κανόνων. */
export function Questionnaire({ base, initial, storeIds, savedAdvice }: { base: string; initial: Record<string, string>; storeIds: string[]; savedAdvice: SetupAdvice | null }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [cur, setCur] = useState(0);
  const [advice, setAdvice] = useState<SetupAdvice | null>(savedAdvice);
  const [aiFailed, setAiFailed] = useState(false);
  const [pick, setPick] = useState<ConnType | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const steps: WizardStep[] = [...QUESTION_STEPS.map((s) => ({ key: s.key, title: s.title, hint: s.hint })), { key: "advice", title: "Η πρότασή μας", hint: "Ο βοηθός διάβασε τις απαντήσεις σας. Μπορείτε να διαλέξετε και άλλον τρόπο." }];
  const stepDone = (i: number) => i < QUESTION_STEPS.length && QUESTION_STEPS[i].questions.every((q) => !!answers[q.key]);
  const done = useMemo(() => new Set(steps.filter((_, i) => stepDone(i)).map((s) => s.key)), [answers]); // eslint-disable-line react-hooks/exhaustive-deps
  const rule = ruleAdvice(answers);
  const chosen: ConnType = pick ?? ((advice?.type as ConnType) || rule.type);
  const missing = cur < QUESTION_STEPS.length ? QUESTION_STEPS[cur].questions.filter((q) => !answers[q.key]).length : 0;

  const toAdvice = () => start(async () => {
    setErr(null); setAiFailed(false);
    const r = await saveQuestionnaire(answers, true);
    if (!r.ok) { setErr(r.error); return; }
    setAdvice(r.advice); setAiFailed(!r.advice); setPick(null); setCur(QUESTION_STEPS.length);
  });
  const create = () => start(async () => {
    setErr(null);
    const r = await createConnection(chosen, storeIds);
    if (!r.ok) { setErr(r.error); return; }
    router.push(`${base}/syndesi/${r.id}`);
  });

  return (
    <Wizard title="Ερωτηματολόγιο αρχικοποίησης" steps={steps} current={cur} done={done} onStep={setCur}
      footer={cur < QUESTION_STEPS.length
        ? <WizardNav onBack={cur ? () => setCur(cur - 1) : undefined} onNext={cur === QUESTION_STEPS.length - 1 ? toAdvice : () => setCur(cur + 1)} nextDisabled={!!missing} busy={pending} nextLabel={cur === QUESTION_STEPS.length - 1 ? "Δείτε την πρόταση" : "Συνέχεια"} note={missing ? `Απομένουν ${missing} απαντήσεις` : "Έτοιμο"} />
        : <WizardNav onBack={() => setCur(cur - 1)} onNext={create} busy={pending} nextLabel={`Ξεκινάμε με «${connTypeInfo(chosen)?.title}»`} note={storeIds.length ? `Για ${storeIds.length} καταστήματα` : "Δεν έχετε καταστήματα — επικοινωνήστε με την Euronics"} />}>
      {err && <div className="mb-4"><Callout tone="bad">{err}</Callout></div>}
      {cur < QUESTION_STEPS.length ? (
        <div className="grid gap-6">
          {QUESTION_STEPS[cur].questions.map((q) => (
            <fieldset key={q.key} className="m-0 p-0 border-0 grid gap-2.5 min-w-0">
              <legend className="font-bold text-eu-ink text-[length:var(--fs-16)] mb-2.5">{q.label}</legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {q.options.map((o) => {
                  const on = answers[q.key] === o.value;
                  return (
                    <label key={o.value} className={`relative flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 min-h-14 cursor-pointer transition-colors duration-150 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-eu-blue/40 ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line bg-white hover:border-eu-muted-3"}`}>
                      <input type="radio" name={q.key} value={o.value} checked={on} onChange={() => setAnswers((a) => ({ ...a, [q.key]: o.value }))} className="sr-only" />
                      <span className={`grid place-items-center size-5 rounded-full border-2 shrink-0 ${on ? "border-eu-navy" : "border-eu-muted-3"}`} aria-hidden>{on && <span className="size-2.5 rounded-full bg-eu-navy" />}</span>
                      <span className="min-w-0"><span className="block font-bold text-[length:var(--fs-14)] text-eu-ink">{o.label}</span>{o.hint && <span className="block text-eu-ink-3 text-[length:var(--fs-12)]">{o.hint}</span>}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ) : (
        <div className="grid gap-5">
          {advice ? (
            <div className="rounded-2xl border-2 border-eu-yellow bg-[#fffbea] p-4 sm:p-5 grid gap-3">
              <div className="flex flex-wrap items-center gap-2"><span className="grid place-items-center size-9 rounded-xl bg-eu-navy text-eu-yellow"><Bot className="size-5" aria-hidden /></span><b className="font-heading text-[length:var(--fs-17)]">Πρόταση βοηθού: {connTypeInfo(advice.type)?.title}</b><Badge tone={advice.confidence === "high" ? "good" : advice.confidence === "medium" ? "info" : "warn"}>{advice.confidence === "high" ? "Μεγάλη βεβαιότητα" : advice.confidence === "medium" ? "Μέτρια βεβαιότητα" : "Μικρή βεβαιότητα"}</Badge></div>
              <p className="m-0 text-[length:var(--fs-15)] text-eu-ink-2">{advice.why}</p>
              {!!advice.steps?.length && <ol className="m-0 pl-5 grid gap-1 text-[length:var(--fs-14)]">{advice.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
              {!!advice.ask?.length && <div className="rounded-xl bg-white p-3"><p className="m-0 mb-1 font-bold text-[length:var(--fs-13)]">Ζητήστε από τον τεχνικό σας:</p><ul className="m-0 pl-5 text-[length:var(--fs-14)]">{advice.ask.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
              {!!advice.warnings?.length && advice.warnings.map((w, i) => <Callout key={i} tone="warn">{w}</Callout>)}
              <p className="m-0 text-eu-muted text-[length:var(--fs-12)] flex items-center gap-1"><Sparkles className="size-3.5" aria-hidden /> Πρόταση από τεχνητή νοημοσύνη με βάση τις απαντήσεις σας — ελέγξτε την.</p>
            </div>
          ) : (
            <Callout tone="info" title={`Πρόταση: ${connTypeInfo(rule.type)?.title}`}>{rule.why}{aiFailed ? " (Ο βοηθός δεν ήταν διαθέσιμος· η πρόταση βγήκε από κανόνες.)" : ""}</Callout>
          )}
          <fieldset className="m-0 p-0 border-0 grid gap-2">
            <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-2">Τρόπος σύνδεσης</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {CONN_TYPES.map((t) => {
                const on = chosen === t.type, rec = (advice?.type ?? rule.type) === t.type;
                return (
                  <label key={t.type} className={`relative grid gap-2 rounded-2xl border-2 p-4 cursor-pointer transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-eu-blue/40 ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line bg-white hover:border-eu-muted-3"}`}>
                    <input type="radio" name="type" checked={on} onChange={() => setPick(t.type)} className="sr-only" />
                    <span className="flex flex-wrap items-center gap-2"><b className="text-[length:var(--fs-16)]">{t.title}</b>{rec && <Badge tone="brand">Προτείνεται</Badge>}{on && <CheckCircle2 className="size-5 text-eu-navy ml-auto" aria-hidden />}</span>
                    <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{t.blurb}</span>
                    <span className="flex flex-wrap gap-1.5"><Badge tone="neutral" icon={false}>{t.effort}</Badge><Badge tone={t.automatic ? "good" : "info"} icon={false}>{t.automatic ? "Αυτόματη ενημέρωση" : "Ανεβάζετε εσείς"}</Badge></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <button type="button" onClick={toAdvice} disabled={pending} className={`${btn("ghost", "sm")} justify-self-start ${focusRing}`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}Ξαναρώτα τον βοηθό</button>
        </div>
      )}
    </Wizard>
  );
}
