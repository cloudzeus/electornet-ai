"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, EyeOff, Loader2, RefreshCw, Save } from "lucide-react";
import { PUBLISH_CRITERIA, type PublishGate, type PublishKey } from "@/lib/catalog/publish-ready";
import type { PublishTally } from "@/lib/catalog/publish-ready-server";
import { previewGateAction, recomputePublishAction, saveGateAction } from "./actions";

const num = (n: number) => n.toLocaleString("el-GR");
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-11 hover:border-eu-navy disabled:opacity-50";

/** Διακόπτης ελέγχου πληρότητας και ποια κριτήρια μετράνε — με ζωντανό «θα κρυφτούν Χ» πριν την αποθήκευση. */
export function GateForm({ initial, tally: initialTally, canSettings, canRecompute }: { initial: PublishGate; tally: PublishTally; canSettings: boolean; canRecompute: boolean }) {
  const router = useRouter();
  const [gate, setGate] = useState(initial);
  const [tally, setTally] = useState(initialTally);
  const [calc, startCalc] = useTransition();
  const [busy, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(gate) !== JSON.stringify(initial);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => startCalc(async () => setTally(await previewGateAction(gate))), 300);
    return () => clearTimeout(t);
  }, [gate]);

  const toggle = (k: PublishKey) => { setGate((g) => ({ ...g, criteria: g.criteria.includes(k) ? g.criteria.filter((x) => x !== k) : [...g.criteria, k] })); setMsg(null); };
  return (
    <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0" aria-label="Έλεγχος πληρότητας" data-help="completeness.gate">
      <label className="flex items-start gap-3 min-h-11 cursor-pointer">
        <input type="checkbox" checked={gate.enabled} disabled={!canSettings} onChange={(e) => { setGate((g) => ({ ...g, enabled: e.target.checked })); setMsg(null); }} className="size-5 mt-0.5 shrink-0" />
        <span className="grid gap-0.5">
          <b className="text-eu-ink text-[length:var(--fs-16)]">Έλεγχος πληρότητας ενεργός</b>
          <span className="text-eu-ink-3 text-[length:var(--fs-14)]">Ενεργός: στη βιτρίνα φαίνονται μόνο τα προϊόντα που περνούν τα κριτήρια που τσεκάρεις. Κλειστός: φαίνονται όλα, και εδώ βλέπεις μόνο τι λείπει.</span>
        </span>
      </label>
      <div className="grid gap-1.5 @2xl:grid-cols-2 min-w-0">
        {PUBLISH_CRITERIA.map((c) => (
          <label key={c.key} className="flex items-start gap-2.5 rounded-xl border border-eu-line-2 p-2.5 min-h-11 cursor-pointer min-w-0">
            <input type="checkbox" checked={gate.criteria.includes(c.key)} disabled={!canSettings} onChange={() => toggle(c.key)} className="size-4 mt-1 shrink-0" />
            <span className="grid min-w-0">
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{c.label} <span className="tabular-nums text-eu-ink-3 font-normal">· λείπει σε {num(tally.byKey[c.key])}</span></span>
              <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{c.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="m-0 inline-flex flex-wrap items-center gap-1.5 text-[length:var(--fs-14)]" role="status" aria-live="polite">
        <EyeOff className="size-4 text-eu-red" aria-hidden />
        Με αυτά τα κριτήρια <b className="text-eu-red tabular-nums">{num(tally.hidden)}</b> από {num(tally.active)} ενεργά προϊόντα δεν θα δημοσιεύονται{gate.enabled ? "" : " (όταν ανοίξει ο έλεγχος)"}.
        {calc && <Loader2 className="size-4 animate-spin text-eu-blue" aria-label="Υπολογισμός" />}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canSettings && (
          <button type="button" disabled={!dirty || busy} onClick={() => startSave(async () => { const r = await saveGateAction(gate); setMsg(`Αποθηκεύτηκε · ${num(r.changed)} προϊόντα άλλαξαν κατάσταση δημοσίευσης.`); router.refresh(); })}
            className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50" data-help="completeness.save">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση & εφαρμογή
          </button>
        )}
        {canRecompute && (
          <button type="button" disabled={busy} onClick={() => startSave(async () => { const r = await recomputePublishAction(); setMsg(`Ξαναμετρήθηκε ο κατάλογος · ${num(r.changed)} αλλαγές.`); router.refresh(); })} className={btn} data-help="completeness.recompute">
            <RefreshCw className="size-4" aria-hidden /> Ξαναμέτρημα τώρα
          </button>
        )}
        {msg && <span className="inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-14)]"><Check className="size-4" aria-hidden />{msg}</span>}
      </div>
    </section>
  );
}
