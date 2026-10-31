"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Clock, Sparkles, Zap } from "lucide-react";
import { createConnection } from "@/app/synergaton/actions";
import { CONN_TYPES, type ConnType } from "@/lib/partner-portal/connection-types";
import type { SetupAdvice } from "@/lib/partner-portal/ai";
import { Badge, Callout } from "../ui";
import { Wizard, WizardNav, type WizardStep } from "../wizard";

const STEPS: WizardStep[] = [
  { key: "type", title: "Τρόπος", hint: "Ο πιο αξιόπιστος είναι ο αυτόματος από το σύστημά σας. Αν δεν είστε σίγουροι, το «Ανέβασμα αρχείου» ξεκινά αμέσως." },
  { key: "stores", title: "Καταστήματα", hint: "Για ποια καταστήματα θα στέλνει απόθεμα αυτή η σύνδεση. Την ακριβή αντιστοίχιση αποθηκών την κάνετε αργότερα." },
];

export function NewConnection({ stores, advice, base }: { stores: { id: string; name: string; city: string }[]; advice: SetupAdvice | null; base: string }) {
  const router = useRouter();
  const [cur, setCur] = useState(0);
  const [type, setType] = useState<ConnType | null>((advice?.type as ConnType) ?? null);
  const [sel, setSel] = useState<Set<string>>(new Set(stores.map((s) => s.id)));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const create = () => start(async () => {
    if (!type) return;
    const r = await createConnection(type, [...sel]);
    if (!r.ok) { setErr(r.error); return; }
    router.push(`${base}/syndesi/${r.id}`);
  });
  const done = new Set([type ? "type" : "", sel.size ? "stores" : ""].filter(Boolean));
  return (
    <Wizard title="Νέα σύνδεση" steps={STEPS} current={cur} done={done} onStep={setCur}
      footer={<WizardNav onBack={cur ? () => setCur(0) : undefined} onNext={cur ? create : () => setCur(1)} nextDisabled={cur ? !sel.size : !type} busy={pending} nextLabel={cur ? "Δημιουργία και ρύθμιση" : "Συνέχεια"} note={cur ? `${sel.size} από ${stores.length} καταστήματα` : undefined} />}>
      {err && <div className="mb-4"><Callout tone="bad">{err}</Callout></div>}
      {cur === 0 && (
        <fieldset className="m-0 p-0 border-0 grid gap-3 md:grid-cols-2">
          <legend className="sr-only">Τρόπος σύνδεσης</legend>
          {CONN_TYPES.map((c) => {
            const on = type === c.type, rec = advice?.type === c.type;
            return (
              <label key={c.type} className={`relative grid gap-2 rounded-2xl border-2 p-4 cursor-pointer transition-[border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-eu-blue/40 ${on ? "border-eu-navy bg-eu-chip shadow-sm" : "border-eu-line hover:border-eu-muted-3 bg-white"}`}>
                <input type="radio" name="type" value={c.type} checked={on} onChange={() => setType(c.type)} className="sr-only" />
                <span className="flex items-start justify-between gap-2">
                  <b className="font-heading text-[length:var(--fs-17)]">{c.title}</b>
                  <span className={`grid place-items-center size-6 rounded-full border-2 shrink-0 ${on ? "bg-eu-navy border-eu-navy text-white" : "border-eu-muted-3"}`} aria-hidden>{on && <Check className="size-3.5" />}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {rec && <Badge tone="brand" icon={false}><Sparkles className="size-3.5" aria-hidden /> Πρόταση βοηθού</Badge>}
                  <Badge tone={c.automatic ? "good" : "neutral"} icon={false}>{c.automatic ? <><Zap className="size-3.5" aria-hidden /> Αυτόματο</> : "Χειροκίνητο"}</Badge>
                  <Badge tone="neutral" icon={false}><Clock className="size-3.5" aria-hidden /> {c.effort}</Badge>
                </span>
                <span className="text-[length:var(--fs-14)] text-eu-ink-2">{c.blurb}</span>
                <span className="text-[length:var(--fs-13)] text-eu-ink-3"><b className="text-eu-ink-2">Για:</b> {c.bestFor}</span>
                {rec && advice?.why && <span className="text-[length:var(--fs-13)] text-[#6b4d00] bg-[#fffbea] rounded-lg px-2.5 py-1.5">{advice.why}</span>}
              </label>
            );
          })}
        </fieldset>
      )}
      {cur === 1 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSel(new Set(stores.map((s) => s.id)))} className="min-h-11 px-3 rounded-full text-eu-blue font-bold text-[length:var(--fs-13)] hover:bg-eu-chip">Όλα</button>
            <button type="button" onClick={() => setSel(new Set())} className="min-h-11 px-3 rounded-full text-eu-blue font-bold text-[length:var(--fs-13)] hover:bg-eu-chip">Κανένα</button>
          </div>
          <fieldset className="m-0 p-0 border-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Καταστήματα</legend>
            {stores.map((s) => {
              const on = sel.has(s.id);
              return (
                <label key={s.id} className={`flex items-center gap-3 rounded-xl border-2 p-3 min-h-14 cursor-pointer has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-eu-blue/40 ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
                  <input type="checkbox" checked={on} onChange={() => setSel((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} className="size-5 accent-[#122a58]" />
                  <span className="min-w-0"><b className="block break-words text-[length:var(--fs-14)]">{s.name}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">{s.city}</span></span>
                </label>
              );
            })}
          </fieldset>
        </div>
      )}
    </Wizard>
  );
}
