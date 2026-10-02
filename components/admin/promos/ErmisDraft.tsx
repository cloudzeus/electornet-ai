"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles, ArrowRight, Info } from "lucide-react";
import { ermisDraftAction } from "@/app/admin/(shell)/prosfores/actions";

const EXAMPLES = ["−20 % σε όλα τα πλυντήρια ρούχων μέχρι 30/11", "2+1 σε μικροσυσκευές κουζίνας Philips έως τέλος Δεκεμβρίου", "Δωρεάν επέκταση εγγύησης σε ψυγεία από 1/12 μέχρι 24/12", "Κουπόνι WELCOME10 10 € για πρώτη αγορά από 99 €"];
type R = Awaited<ReturnType<typeof ermisDraftAction>>;

/** Φυσική γλώσσα → προσχέδιο → οδηγός. */
export function ErmisDraft() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [res, setRes] = useState<R | null>(null);
  const [busy, start] = useTransition();
  const go = () => start(async () => setRes(await ermisDraftAction(text)));
  const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "long" }) : "—");
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
        <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Η προσφορά</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); }} className="w-full rounded-xl border-2 border-eu-line px-3 py-2 text-[length:var(--fs-16)] focus-visible:border-eu-blue outline-none" placeholder="π.χ. −15 % σε όλες τις τηλεοράσεις Samsung μέχρι τέλος Νοεμβρίου, μόνο για μέλη" />
        </label>
        <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setText(x)} className="rounded-full bg-eu-surface px-3 min-h-10 text-[length:var(--fs-13)] text-eu-ink-2 hover:bg-eu-chip">{x}</button>)}</div>
        <button type="button" disabled={busy || text.trim().length < 6} onClick={go} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Sparkles className="size-4" aria-hidden /> {busy ? "Ο Ερμής ετοιμάζει…" : "Ετοίμασε την προσφορά"}</button>
      </section>
      {res && !res.ok && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-semibold px-4 py-3 text-[length:var(--fs-14)]">{res.error}</p>}
      {res?.ok && (
        <section className="rounded-2xl bg-white border-2 border-eu-navy p-4 @md:p-5 grid gap-3" aria-live="polite">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-16)]">{res.name}</h3>
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[length:var(--fs-15)]">
            <dt className="text-eu-muted">Προσφορά</dt><dd className="m-0 font-semibold">{res.summary}</dd>
            <dt className="text-eu-muted">Σε</dt><dd className="m-0 font-semibold">{res.targets.length ? res.targets.join(", ") : "— (διάλεξε στον οδηγό)"}</dd>
            <dt className="text-eu-muted">Διάρκεια</dt><dd className="m-0 font-semibold">{dt(res.startsAt)} → {dt(res.endsAt)}</dd>
          </dl>
          {res.notes.length > 0 && <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)] text-eu-ink-2">{res.notes.map((n) => <li key={n} className="flex gap-2"><Info className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden />{n}</li>)}</ul>}
          <button type="button" onClick={() => router.push(`/admin/prosfores/new?draft=${res.encoded}`)} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-yellow-dark">Συνέχεια στον οδηγό <ArrowRight className="size-4" aria-hidden /></button>
        </section>
      )}
    </div>
  );
}
