"use client";
// «Λάθος ζευγάρι» / «Βρες ζευγάρι» / επιβεβαίωση πρότασης. Τα υποψήφια φορτώνουν μία φορά (sitemap σε κρυφή μνήμη)· το φιλτράρισμα γίνεται εδώ, χωρίς κλήσεις ανά πλήκτρο.
import { useMemo, useState, useTransition } from "react";
import { Check, Search, Unlink, X } from "lucide-react";
import { pairCandidates, rejectPair, setPair } from "@/app/admin/(shell)/catalog/competitors/actions";
import type { KotView } from "@/lib/competitors/badge";

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const pretty = (last: string) => last.split("-").slice(1).join(" ");
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} border-eu-navy bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-eu-muted-3 bg-white text-eu-navy hover:bg-eu-chip`;

export function PairPicker({ productId, view, canWrite }: { productId: string; view: KotView | null; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [items, setItems] = useState<{ art: string; last: string }[] | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const paired = !!view?.extId && view.match !== "rejected" && view.match !== "lost";

  const run = (f: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => start(async () => {
    setMsg(null);
    const r = await f();
    if (!r.ok) setMsg(r.error); else after?.();
  });
  const openSearch = () => start(async () => {
    setOpen(true); setMsg(null);
    if (items) return;
    const r = await pairCandidates(productId);
    if (r.ok) setItems(r.items); else setMsg(r.error);
  });

  const hits = useMemo(() => {
    if (!items) return [];
    const words = plain(q).split(/[^a-z0-9α-ω]+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter((i) => { const s = plain(i.last); return words.every((w) => s.includes(w)); }).slice(0, 20);
  }, [items, q]);
  const digits = /^\d{1,12}$/.test(q.trim()) ? q.trim() : null;

  if (!canWrite) return null;
  return (
    <div className="grid gap-2">
      {view?.match === "suggested" && view.extId && (
        <button type="button" className={primary} disabled={pending} onClick={() => run(() => setPair(productId, view.extId!))}>
          <Check className="size-4" aria-hidden />Ναι, είναι το ίδιο · επιβεβαίωσε
        </button>
      )}
      {paired && !confirmReject && (
        <button type="button" className={secondary} disabled={pending} onClick={() => setConfirmReject(true)}>
          <Unlink className="size-4" aria-hidden />Λάθος ζευγάρι · άλλαξέ το
        </button>
      )}
      {paired && confirmReject && (
        <div className="grid gap-2 rounded-lg border border-eu-amber/40 bg-eu-amber/10 p-3 text-[length:var(--fs-14)]" role="group" aria-label="Επιβεβαίωση απόρριψης">
          <p className="m-0 text-eu-ink">Το «{view?.extTitle ?? view?.extId}» δεν θα ξαναπροταθεί για αυτό το προϊόν και η τιμή του σταματά να μετρά.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={pending} onClick={() => run(() => rejectPair(productId), () => { setConfirmReject(false); openSearch(); })}>Ναι, απόρριψη</button>
            <button type="button" className={secondary} disabled={pending} onClick={() => setConfirmReject(false)}>Άκυρο</button>
          </div>
        </div>
      )}
      {!paired && !open && (
        <button type="button" className={secondary} disabled={pending} onClick={openSearch}><Search className="size-4" aria-hidden />Βρες ζευγάρι</button>
      )}

      {open && (
        <div className="grid gap-2 rounded-xl border border-eu-line bg-eu-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`pair-q-${productId}`} className="font-bold text-eu-ink text-[length:var(--fs-14)]">Αναζήτηση στον Κωτσόβολο</label>
            <button type="button" onClick={() => { setOpen(false); setQ(""); }} className="inline-flex size-11 items-center justify-center rounded-lg text-eu-ink-3 hover:bg-eu-surface-2" aria-label="Κλείσιμο αναζήτησης"><X className="size-4" aria-hidden /></button>
          </div>
          <input id={`pair-q-${productId}`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" placeholder="μοντέλο, μάρκα ή αριθμός είδους"
            className="min-h-11 w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 text-[length:var(--fs-14)]" />
          <p className="m-0 text-[length:var(--fs-12)] text-eu-ink-3">
            {items ? `${items.length.toLocaleString("el-GR")} προϊόντα στην αντίστοιχη κατηγορία τους. Γράψε π.χ. τον κωδικό μοντέλου.` : pending ? "Φορτώνει η λίστα του Κωτσόβολου…" : ""}
          </p>
          {hits.length > 0 && (
            <ul className="m-0 grid list-none gap-1 p-0">
              {hits.map((h) => (
                <li key={h.art}>
                  <button type="button" disabled={pending} onClick={() => run(() => setPair(productId, h.art), () => { setOpen(false); setQ(""); })}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-eu-line bg-white px-3 py-1.5 text-left text-[length:var(--fs-13)] hover:border-eu-blue hover:bg-eu-chip disabled:opacity-50">
                    <span className="min-w-0 flex-1 break-words text-eu-ink">{pretty(h.last)}</span>
                    <span className="shrink-0 font-mono text-eu-muted">{h.art}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items && q.trim() && !hits.length && !digits && <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-3">Δεν βρέθηκε τίποτα. Δοκίμασε μέρος του κωδικού μοντέλου ή τον αριθμό είδους από τη διεύθυνση της σελίδας τους.</p>}
          {digits && !hits.some((h) => h.art === digits) && (
            <button type="button" className={secondary} disabled={pending} onClick={() => run(() => setPair(productId, digits), () => { setOpen(false); setQ(""); })}>Χρήση του είδους {digits}</button>
          )}
        </div>
      )}
      {pending && <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-3" aria-live="polite">Μία στιγμή…</p>}
      {msg && <p className="m-0 rounded-lg bg-eu-red/10 px-3 py-2 text-[length:var(--fs-13)] text-eu-ink" role="alert">{msg}</p>}
    </div>
  );
}
