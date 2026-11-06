"use client";

import { useMemo, useState } from "react";
import { outcome, type TurnOut } from "@/lib/skets/train";

export interface Opt { v: string; label: string }
export interface Step { id: string; name: string; cue: string; say: string; options: Opt[] }
export interface Question { id: string; group: string; q: string; answer?: string }
export interface TurnRow { id: string; beat: string; at: string; said: string; out: string; say: string; ms: number | null; label: { ok: boolean | null; want?: string; note?: string } | null }

const card = "rounded-2xl border border-black/10 bg-white p-4 sm:p-5";
const btn = "min-h-11 rounded-xl px-4 font-semibold text-[length:var(--fs-14)] transition-colors disabled:opacity-50";
const T = { small: "text-[length:var(--fs-13)]", body: "text-[length:var(--fs-15)]", h2: "text-[length:var(--fs-22)]" };

/** Σελίδα εκπαίδευσης: σκορ, ερωτήσεις του Ερμή προς τον χρήστη, σημάδια στις ατάκες των προβών, δοκιμή με κείμενο. Εκτός σκετς. */
export default function Train({ k, steps, turns, questions }: { k: string; steps: Step[]; turns: TurnRow[]; questions: Question[] }) {
  const byId = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  const label = (beat: string, out: string) => byId.get(beat)?.options.find((o) => o.v === out)?.label ?? (out.startsWith("ready:") ? `Έτοιμη: «${out.slice(6)}»` : out);
  const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const tryTurn = async (beat: string, text: string) => {
    const fd = new FormData(); fd.append("beat", beat); fd.append("text", text); fd.append("mode", "try"); fd.append("alts", "{}"); fd.append("ahead", "[]");
    const t0 = Date.now();
    const r = (await fetch("/api/skets/turn", { method: "POST", headers: { "x-skets-key": k }, body: fd }).then((x) => x.json()).catch(() => ({}))) as TurnOut;
    return { r, out: outcome(r), ms: Date.now() - t0 };
  };

  return (
    <main className="min-h-dvh bg-[#f4f6fa] text-eu-ink">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 flex flex-col gap-8">
        <header>
          <p className={`font-semibold text-eu-blue ${T.small}`}>Σκετς Ερμή · εκπαίδευση (δεν φαίνεται στη σκηνή)</p>
          <h1 className="mt-1 font-black leading-tight text-[length:var(--fs-32)]">Ας κάνουμε τον Ερμή καλύτερο</h1>
          <p className={`mt-2 text-eu-muted ${T.body}`}>Απαντήστε στις ερωτήσεις, σημειώστε τι έκανε σωστά ή λάθος στις πρόβες, και δοκιμάστε φράσεις. Κάθε σημάδι γίνεται μέρος του τεστ που μετρά αν βελτιώνεται.</p>
        </header>
        <Score turns={turns} tryTurn={tryTurn} label={label} />
        <Questions questions={questions} post={post} />
        <Turns turns={turns} steps={steps} label={label} post={post} />
        <Try steps={steps} tryTurn={tryTurn} label={label} />
      </div>
    </main>
  );
}

type TryFn = (beat: string, text: string) => Promise<{ r: TurnOut; out: string; ms: number }>;
type Post = (url: string, body: unknown) => Promise<Response>;

/** Τα σημαδεμένα ξανά από τον Ερμή όπως είναι τώρα: πόσα βγαίνουν σωστά και σε πόσο χρόνο. */
function Score({ turns, tryTurn, label }: { turns: TurnRow[]; tryTurn: TryFn; label: (b: string, o: string) => string }) {
  const marked = turns.filter((t) => t.label && t.label.ok !== null && (t.label.ok || t.label.want) && t.said);
  const [res, setRes] = useState<{ done: number; pass: number; ms: number; fails: { t: TurnRow; want: string; got: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const acc = { done: 0, pass: 0, ms: 0, fails: [] as { t: TurnRow; want: string; got: string }[] };
    for (let i = 0; i < marked.length; i += 3) {
      await Promise.all(marked.slice(i, i + 3).map(async (t) => {
        const want = t.label!.ok ? t.out : t.label!.want!;
        const { out, ms } = await tryTurn(t.beat, t.said);
        acc.done++; acc.ms += ms;
        // «free» = ελεύθερη απάντηση: σωστό όταν δεν πήγε σε λάθος διακλάδωση/σενάριο (το κείμενο το κρίνει ο άνθρωπος)
        if (out === want || (want === "free" && (out === "free" || out.startsWith("ready:")))) acc.pass++; else acc.fails.push({ t, want, got: out });
        setRes({ ...acc, fails: [...acc.fails] });
      }));
    }
    setBusy(false);
  };
  return (
    <section className={card}>
      <h2 className={`font-bold ${T.h2}`}>Σκορ</h2>
      <p className={`mt-1 text-eu-muted ${T.body}`}>{marked.length ? `${marked.length} σημαδεμένες ατάκες. Ο Ερμής τις ξανακούει όπως είναι τώρα και μετράμε πόσες βγαίνουν σωστές.` : "Δεν υπάρχουν ακόμα σημαδεμένες ατάκες — σημειώστε μερικές παρακάτω."}</p>
      {res && <p className={`mt-3 font-bold text-[length:var(--fs-24)]`}>{Math.round((res.pass / Math.max(1, res.done)) * 100)}% σωστά <span className={`font-medium text-eu-muted ${T.body}`}>· {res.pass}/{res.done} · μέσος χρόνος {(res.ms / Math.max(1, res.done) / 1000).toFixed(1)} s</span></p>}
      {res?.fails.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {res.fails.map(({ t, want, got }) => <li key={t.id} className={`rounded-xl bg-red-50 p-3 ${T.small}`}><b>«{t.said}»</b><br />έπρεπε: {label(t.beat, want)}<br />έκανε: {label(t.beat, got)}</li>)}
        </ul>
      ) : null}
      <button type="button" disabled={busy || !marked.length} onClick={run} className={`${btn} mt-4 bg-eu-navy text-white hover:bg-eu-blue`}>{busy ? `Μετράω… ${res?.done ?? 0}/${marked.length}` : "Μέτρησε τώρα"}</button>
    </section>
  );
}

function Questions({ questions, post }: { questions: Question[]; post: Post }) {
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q.id, q.answer ?? ""])));
  const open = questions.filter((q) => !saved[q.id]);
  const done = questions.filter((q) => saved[q.id]);
  return (
    <section className={card}>
      <h2 className={`font-bold ${T.h2}`}>Ο Ερμής σας ρωτά <span className="text-eu-muted font-medium">({open.length} ανοιχτές)</span></h2>
      <p className={`mt-1 text-eu-muted ${T.body}`}>Απαντήστε σύντομα, όσα ξέρετε. Από τις απαντήσεις φτιάχνονται έτοιμες (ηχογραφημένες) απαντήσεις — το κείμενο σας το δείχνω πριν ηχογραφηθεί.</p>
      <div className="mt-4 flex flex-col gap-4">{open.map((q) => <QItem key={q.id} q={q} onSave={async (text) => { await post("/api/skets/train", { t: "answer", q: q.id, text }); setSaved((s) => ({ ...s, [q.id]: text })); }} />)}</div>
      {done.length > 0 && (
        <details className="mt-5">
          <summary className={`cursor-pointer font-semibold ${T.body}`}>Απαντημένες ({done.length})</summary>
          <ul className="mt-3 flex flex-col gap-3">{done.map((q) => <li key={q.id} className={T.small}><b>{q.q}</b><br /><span className="text-eu-muted whitespace-pre-wrap">{saved[q.id]}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}

function QItem({ q, onSave }: { q: Question; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`q-${q.id}`} className={T.body}><span className={`mr-2 rounded-full bg-eu-blue/10 px-2 py-0.5 font-semibold text-eu-blue ${T.small}`}>{q.group}</span>{q.q}</label>
      <textarea id={`q-${q.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} className={`w-full rounded-xl border border-black/15 p-3 ${T.body}`} />
      <button type="button" disabled={busy || !text.trim()} onClick={async () => { setBusy(true); await onSave(text.trim()); setBusy(false); }} className={`${btn} self-start bg-eu-navy text-white hover:bg-eu-blue`}>Αποθήκευση</button>
    </div>
  );
}

function Turns({ turns, steps, label, post }: { turns: TurnRow[]; steps: Step[]; label: (b: string, o: string) => string; post: Post }) {
  const [marks, setMarks] = useState<Record<string, TurnRow["label"]>>(() => Object.fromEntries(turns.map((t) => [t.id, t.label])));
  const [all, setAll] = useState(false);
  const shown = turns.filter((t) => all || !marks[t.id]);
  const save = async (t: TurnRow, m: NonNullable<TurnRow["label"]>) => { await post("/api/skets/train", { t: "label", turn: t.id, ...m }); setMarks((x) => ({ ...x, [t.id]: m })); };
  return (
    <section className={card}>
      <h2 className={`font-bold ${T.h2}`}>Ατάκες από τις πρόβες</h2>
      <p className={`mt-1 text-eu-muted ${T.body}`}>Τι άκουσε ο Ερμής και τι έκανε. Σωστό ή λάθος; Αν είναι δική μου δοκιμή και όχι πρόβα, πατήστε «Δοκιμή».</p>
      <label className={`mt-3 flex min-h-11 items-center gap-2 ${T.body}`}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-5" /> Δείξε και τις σημαδεμένες</label>
      <div className="mt-3 flex flex-col gap-3">
        {shown.length === 0 && <p className={`text-eu-muted ${T.body}`}>Όλες σημαδεμένες. Μετά την επόμενη πρόβα θα εμφανιστούν οι νέες.</p>}
        {shown.slice(0, 60).map((t) => <TurnItem key={t.id} t={t} step={steps.find((s) => s.id === t.beat)} mark={marks[t.id]} label={label} onSave={(m) => save(t, m)} />)}
      </div>
    </section>
  );
}

function TurnItem({ t, step, mark, label, onSave }: { t: TurnRow; step?: Step; mark: TurnRow["label"]; label: (b: string, o: string) => string; onSave: (m: NonNullable<TurnRow["label"]>) => Promise<void> }) {
  const [wrong, setWrong] = useState(false); const [want, setWant] = useState(""); const [note, setNote] = useState("");
  const when = new Date(t.at).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-xl border border-black/10 p-3 sm:p-4">
      <p className={`text-eu-muted ${T.small}`}>{step?.name ?? t.beat} · {when}{t.ms ? ` · ${(t.ms / 1000).toFixed(1)} s` : ""}{mark ? ` · ${mark.ok === null ? "δοκιμή" : mark.ok ? "✓ σωστό" : "✗ λάθος"}` : ""}</p>
      <p className={`mt-1 font-semibold ${T.body}`}>«{t.said || "(τίποτα δεν ακούστηκε)"}»</p>
      <p className={`mt-1 ${T.body}`}>→ {label(t.beat, t.out)}</p>
      {t.say && !t.out.startsWith("ready:") && <p className={`mt-1 text-eu-muted ${T.small}`}>Ερμής: «{t.say}»</p>}
      {!wrong ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onSave({ ok: true })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>✓ Σωστό</button>
          <button type="button" onClick={() => setWrong(true)} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>✗ Λάθος</button>
          <button type="button" onClick={() => onSave({ ok: null })} className={`${btn} bg-black/5 hover:bg-black/10`}>Δοκιμή</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`w-${t.id}`} className={`font-semibold ${T.small}`}>Τι έπρεπε να κάνει;</label>
          <select id={`w-${t.id}`} value={want} onChange={(e) => setWant(e.target.value)} className={`min-h-11 w-full rounded-xl border border-black/15 px-3 ${T.body}`}>
            <option value="">— διαλέξτε —</option>
            {(step?.options ?? []).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <label htmlFor={`n-${t.id}`} className={`font-semibold ${T.small}`}>Τι έπρεπε να πει (αν δεν ταιριάζει καμία έτοιμη)</label>
          <textarea id={`n-${t.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`w-full rounded-xl border border-black/15 p-3 ${T.body}`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!want && !note.trim()} onClick={() => onSave({ ok: false, want: want || "free", note: note.trim() })} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>Αποθήκευση</button>
            <button type="button" onClick={() => setWrong(false)} className={`${btn} bg-black/5 hover:bg-black/10`}>Άκυρο</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Δοκιμή: ένα βήμα + μια φράση → τι θα έκανε ο Ερμής (η σκηνή δεν ακούει, δεν καταγράφεται ως πρόβα). */
function Try({ steps, tryTurn, label }: { steps: Step[]; tryTurn: TryFn; label: (b: string, o: string) => string }) {
  const [beat, setBeat] = useState(steps[0]?.id ?? ""); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ beat: string; text: string; out: string; say: string; ms: number }[]>([]);
  const step = steps.find((s) => s.id === beat);
  const go = async () => { if (!text.trim()) return; setBusy(true); const { r, out, ms } = await tryTurn(beat, text.trim()); setLog((l) => [{ beat, text: text.trim(), out, say: r.say ?? "", ms }, ...l]); setText(""); setBusy(false); };
  return (
    <section className={card}>
      <h2 className={`font-bold ${T.h2}`}>Δοκιμή</h2>
      <p className={`mt-1 text-eu-muted ${T.body}`}>Διαλέξτε βήμα, γράψτε τι θα έλεγε ο παρουσιαστής και δείτε τι κάνει ο Ερμής. Η σκηνή δεν το ακούει.</p>
      <label htmlFor="try-step" className={`mt-4 block font-semibold ${T.small}`}>Βήμα</label>
      <select id="try-step" value={beat} onChange={(e) => setBeat(e.target.value)} className={`mt-1 min-h-11 w-full rounded-xl border border-black/15 px-3 ${T.body}`}>
        {steps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {step?.say && <p className={`mt-2 text-eu-muted ${T.small}`}>Ερμής: «{step.say}» · αναμενόμενο: {step.cue}</p>}
      <label htmlFor="try-text" className={`mt-3 block font-semibold ${T.small}`}>Τι λέει ο παρουσιαστής</label>
      <form onSubmit={(e) => { e.preventDefault(); void go(); }} className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input id="try-text" value={text} onChange={(e) => setText(e.target.value)} className={`min-h-11 flex-1 rounded-xl border border-black/15 px-3 ${T.body}`} placeholder="π.χ. Μένουμε δύο, δεν πλένουμε πολλά" />
        <button type="submit" disabled={busy || !text.trim()} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{busy ? "Σκέφτεται…" : "Δοκίμασε"}</button>
      </form>
      <ul className="mt-4 flex flex-col gap-2">
        {log.map((x, n) => <li key={n} className={`rounded-xl bg-black/[0.03] p-3 ${T.small}`}><span className="text-eu-muted">{steps.find((s) => s.id === x.beat)?.name} · {(x.ms / 1000).toFixed(1)} s</span><br /><b>«{x.text}»</b> → {label(x.beat, x.out)}{x.say && !x.out.startsWith("ready:") ? <><br /><span className="text-eu-muted">Ερμής: «{x.say}»</span></> : null}</li>)}
      </ul>
    </section>
  );
}
