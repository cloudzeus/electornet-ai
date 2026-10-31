"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "@base-ui/react/dialog";
import { ArrowRight, Loader2, RotateCcw, Send, X } from "lucide-react";
import { STAR_PATH } from "@/components/motion/star";
import { askPortalErmis } from "@/app/synergaton/actions";
import type { ErmisReply, ErmisTurn } from "@/lib/partner-portal/assistant";
import { btn, focusRing } from "./ui";

/**
 * Ο Ερμής της πύλης: βοηθός για τις ρυθμίσεις του μέλους (όχι για το eshop). Ξέρει τη σελίδα που είσαι και την
 * κατάσταση των καταστημάτων / συνδέσεών σου· απαντά με βήματα και συνδέσμους μόνο προς σελίδες της πύλης.
 */
type Msg = { role: "user" | "assistant"; text: string; reply?: ErmisReply; error?: boolean };

const SUGGEST: { match: RegExp; q: string[] }[] = [
  { match: /^\/katastimata/, q: ["Τι λείπει από τα καταστήματά μου;", "Πώς δηλώνω διακεκομμένο ωράριο;", "Πώς διορθώνω το σημείο στον χάρτη;"] },
  { match: /^\/syndesi/, q: ["Ποιος τρόπος σύνδεσης μού ταιριάζει;", "Γιατί απέτυχε ο έλεγχος;", "Πώς αντιστοιχίζω στήλες και καταστήματα;"] },
  { match: /^\/paraggelies/, q: ["Πώς ετοιμάζω μια παραγγελία για παραλαβή;", "Τι σημαίνουν οι καταστάσεις;"] },
  { match: /^\/profil/, q: ["Πώς αλλάζω τον κωδικό μου;", "Ποιος άλλος έχει πρόσβαση;"] },
  { match: /./, q: ["Τι μου λείπει για να ξεκινήσω;", "Ποιο είναι το επόμενο βήμα;", "Πώς ενημερώνεται το απόθεμα;"] },
];

function Star({ className = "" }: { className?: string }) {
  return <svg viewBox="0 12 72 85" className={className} aria-hidden><path d={STAR_PATH} fill="currentColor" /></svg>;
}

export function PortalErmis({ base, firstName }: { base: string; firstName: string }) {
  const pathname = usePathname();
  const path = (base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname) || "/";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const suggestions = SUGGEST.find((s) => s.match.test(path))!.q;

  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs, pending]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    const history: ErmisTurn[] = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.reply ? [m.reply.answer, ...m.reply.steps].join("\n") : m.text }));
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setQ("");
    start(async () => {
      const r = await askPortalErmis(history, t, path);
      setMsgs((m) => [...m, r.ok ? { role: "assistant", text: r.reply.answer, reply: r.reply } : { role: "assistant", text: r.error, error: true }]);
    });
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className={`inline-flex items-center gap-2 rounded-full pl-1 pr-1 sm:pr-3.5 min-h-11 bg-eu-navy text-white font-bold text-[length:var(--fs-14)] hover:bg-eu-blue transition-colors motion-reduce:transition-none ${focusRing}`} aria-label="Ερμής: βοηθός για τις ρυθμίσεις της πύλης">
        <span className="grid place-items-center size-9 rounded-full bg-eu-yellow text-eu-navy"><Star className="size-5" /></span>
        <span className="hidden sm:inline">Ερμής</span>
      </D.Trigger>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-50 bg-eu-navy/35 supports-backdrop-filter:backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <D.Popup initialFocus={input} className="fixed z-50 inset-x-0 bottom-0 top-[8dvh] sm:inset-auto sm:right-4 sm:bottom-4 sm:top-4 sm:w-[min(28rem,calc(100vw-2rem))] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl outline-none overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 sm:data-open:slide-in-from-right-4 motion-reduce:animate-none">
          <div className="flex items-center gap-3 bg-eu-navy text-white px-4 py-3.5">
            <span className="grid place-items-center size-10 rounded-full bg-eu-yellow text-eu-navy shrink-0"><Star className="size-6" /></span>
            <div className="min-w-0 flex-1">
              <D.Title className="m-0 font-heading font-extrabold text-[length:var(--fs-17)] leading-tight">Ερμής</D.Title>
              <D.Description className="m-0 text-eu-on-dark text-[length:var(--fs-12)]">Βοηθός για τις ρυθμίσεις της πύλης σας</D.Description>
            </div>
            {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} className={`grid place-items-center size-11 rounded-full hover:bg-white/10 ${focusRing}`} aria-label="Νέα συζήτηση" title="Νέα συζήτηση"><RotateCcw className="size-5" aria-hidden /></button>}
            <D.Close className={`grid place-items-center size-11 rounded-full hover:bg-white/10 ${focusRing}`} aria-label="Κλείσιμο"><X className="size-5" aria-hidden /></D.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 grid gap-3 content-start" aria-live="polite">
            <div className="rounded-2xl rounded-tl-md bg-eu-surface-2 p-3.5 text-[length:var(--fs-14)] text-eu-ink-2 grid gap-2">
              <p className="m-0">Γεια σου {firstName}! Βλέπω τα καταστήματα, τις συνδέσεις και τους ελέγχους σας και σε βοηθάω να τα ρυθμίσεις σωστά.</p>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Για προϊόντα και τιμές του eshop δεν απαντάω εδώ.</p>
            </div>
            {msgs.map((m, i) => m.role === "user" ? (
              <p key={i} className="m-0 justify-self-end max-w-[85%] rounded-2xl rounded-tr-md bg-eu-blue text-white px-3.5 py-2.5 text-[length:var(--fs-14)] break-words whitespace-pre-wrap">{m.text}</p>
            ) : (
              <div key={i} className={`max-w-[92%] rounded-2xl rounded-tl-md p-3.5 grid gap-2.5 text-[length:var(--fs-14)] ${m.error ? "bg-[#fff4f2] text-[#8a2b20]" : m.reply?.offTopic ? "bg-eu-chip text-eu-ink-2" : "bg-eu-surface-2 text-eu-ink"}`}>
                <p className="m-0 whitespace-pre-wrap break-words">{m.text}</p>
                {!!m.reply?.steps.length && (
                  <ol className="m-0 p-0 list-none grid gap-1.5">
                    {m.reply.steps.map((s, k) => <li key={k} className="flex gap-2"><span className="grid place-items-center size-6 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-12)] shrink-0">{k + 1}</span><span className="min-w-0 pt-0.5">{s}</span></li>)}
                  </ol>
                )}
                {!!m.reply?.links.length && (
                  <div className="flex flex-wrap gap-2">
                    {m.reply.links.map((l) => <Link key={l.path} href={`${base}${l.path === "/" ? "" : l.path}` || "/"} onClick={() => setOpen(false)} className={`inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-bold px-3 min-h-11 text-[length:var(--fs-13)] hover:bg-eu-navy hover:text-white ${focusRing}`}>{l.label}<ArrowRight className="size-4" aria-hidden /></Link>)}
                  </div>
                )}
              </div>
            ))}
            {pending && <p className="m-0 inline-flex items-center gap-2 text-eu-ink-3 text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Ο Ερμής κοιτάζει τις ρυθμίσεις σας…</p>}
            {!msgs.length && !pending && (
              <div className="grid gap-2 pt-1">
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)] font-bold uppercase tracking-wide">Ρώτα για παράδειγμα</p>
                {suggestions.map((s) => <button key={s} type="button" onClick={() => ask(s)} className={`text-left rounded-xl border border-eu-line bg-white px-3.5 min-h-11 py-2 text-eu-blue font-bold text-[length:var(--fs-14)] hover:border-eu-blue hover:bg-eu-chip ${focusRing}`}>{s}</button>)}
              </div>
            )}
            <div ref={end} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="border-t border-eu-line p-3 flex items-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <label htmlFor="ermis-q" className="sr-only">Η ερώτησή σου</label>
            <textarea id="ermis-q" ref={input} rows={1} value={q} maxLength={800} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} placeholder="Γράψε την ερώτησή σου…" className={`flex-1 min-w-0 resize-none min-h-12 max-h-32 rounded-xl border-2 border-eu-line bg-white px-3.5 py-2.5 text-eu-ink text-[length:var(--fs-15)] placeholder:text-eu-muted-2 focus:border-eu-blue ${focusRing}`} />
            <button type="submit" disabled={!q.trim() || pending} className={`${btn("primary")} size-12 p-0 shrink-0`} aria-label="Αποστολή"><Send className="size-5" aria-hidden /></button>
          </form>
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}
