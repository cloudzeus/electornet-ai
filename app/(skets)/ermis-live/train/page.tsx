import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sketsKeyOk } from "@/lib/skets/auth";
import { buildBeats, pickOf } from "@/lib/skets/script";
import { outcome, QUESTIONS, STEP_NAMES, UNSURE, type TurnOut } from "@/lib/skets/train";
import snapshot from "@/lib/skets/snapshot.json";
import type { Snapshot } from "@/lib/skets/types";
import Train, { type Opt, type Question, type Step, type TurnRow } from "@/components/skets/Train";

export const metadata: Metadata = { title: "Ερμής — εκπαίδευση", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const snap = snapshot as Snapshot;

/** Τι μπορεί να κάνει ο Ερμής σε κάθε βήμα — οι επιλογές για το «τι έπρεπε να κάνει». */
function steps(): Step[] {
  return buildBeats(snap).filter((b) => b.wait === "presenter" || b.wait === "store").map((b) => {
    const cat = snap.cats.find((c) => b.id === `${c.key}-ask` || b.id === `${c.key}-ask2`);
    const opts: Opt[] = [{ v: "script", label: "Συνέχεια σεναρίου" }];
    for (const a of cat?.alts ?? []) { const p = pickOf(cat!, { [cat!.key]: a.key }); opts.push({ v: `alt:${a.key}`, label: `Διακλάδωση: ${p.brand} ${p.key}` }); }
    if (b.wait === "store") snap.stores.forEach((s, i) => opts.push({ v: `store:${i}`, label: `Κατάστημα: ${s.street}` }));
    for (const x of snap.qa ?? []) {
      if (!snap.voice[x.a] || !!x.start !== (b.id === "idle") || (x.cat && x.cat !== cat?.key)) continue;
      opts.push({ v: `ready:${x.a}`, label: `Έτοιμη: «${x.a.length > 80 ? `${x.a.slice(0, 80)}…` : x.a}»` });
    }
    opts.push({ v: "clarify", label: "«Συγγνώμη, δεν σας άκουσα καλά…»" }, { v: "free", label: "Απάντηση από το μοντέλο (γράψε τι έπρεπε να πει)" }, { v: "none", label: "Τίποτα — να ξανακούσει" });
    return { id: b.id, name: STEP_NAMES[b.id] ?? b.id, cue: b.cue ?? "", say: b.say ?? "", options: opts };
  });
}

export default async function Page({ searchParams }: PageProps<"/ermis-live/train">) {
  const sp = await searchParams;
  const k = typeof sp.k === "string" ? sp.k : "";
  if (!sketsKeyOk(k)) notFound();
  const since = new Date(Date.now() - 30 * 864e5);
  const [turnRows, labelRows, answerRows] = await Promise.all([
    db.auditLog.findMany({ where: { action: "skets.turn", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 400, select: { id: true, entityId: true, after: true, createdAt: true } }),
    db.auditLog.findMany({ where: { action: "skets.label" }, orderBy: { createdAt: "asc" }, select: { entityId: true, after: true } }),
    db.auditLog.findMany({ where: { action: "skets.answer" }, orderBy: { createdAt: "asc" }, select: { entityId: true, after: true, createdAt: true } }),
  ]);
  const labels = new Map(labelRows.map((r) => [r.entityId ?? "", r.after as TurnRow["label"]])); // το τελευταίο σημάδι μετράει
  const answers = new Map(answerRows.map((r) => [r.entityId ?? "", (r.after as { text?: string })?.text ?? ""]));
  const turns: TurnRow[] = turnRows.flatMap((r) => {
    const o = (r.after ?? {}) as TurnOut & { src?: string; ms?: unknown };
    if (o.src === "try" || o.src === "test") return [];
    const ms = typeof o.ms === "number" ? o.ms : null;
    return [{ id: String(r.id), beat: r.entityId ?? "", at: r.createdAt.toISOString(), said: o.said ?? o.heard ?? "", out: outcome(o), say: o.say ?? "", ms, label: labels.get(String(r.id)) ?? null }];
  });
  const auto: Question[] = turns.filter((t) => t.out === "free" && UNSURE.test(t.say)).map((t) => ({ id: `t:${t.id}`, group: STEP_NAMES[t.beat] ?? t.beat, q: `Ρωτήθηκε «${t.said}» και ο Ερμής είπε «${t.say}». Τι έπρεπε να πει;` }));
  const questions: Question[] = [...auto, ...QUESTIONS].map((q) => ({ ...q, answer: answers.get(q.id) ?? "" }));
  return <Train k={k} steps={steps()} turns={turns} questions={questions} />;
}
