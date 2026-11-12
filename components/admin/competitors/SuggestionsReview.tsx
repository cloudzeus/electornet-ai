"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Barcode, Check, CheckCheck, ExternalLink, Layers, Link2, Loader2, Sparkles, Tag, X } from "lucide-react";
import { PagerButtons } from "@/components/admin/PagerButtons";
import { confirmPairs, rejectPair } from "@/app/admin/(shell)/catalog/competitors/actions";
import type { Reason } from "@/lib/competitors/run-core";

export type SuggRow = {
  productId: string; title: string; erp: string; ours: number | null;
  extId: string; extTitle: string | null; extUrl: string | null; theirs: number | null; diff: number | null;
  lastError: string | null; reason: Reason;
};

const PER = 20;
const eur = (n: number | null) => (n == null ? "—" : n.toLocaleString("el-GR", { style: "currency", currency: "EUR" }));
const base = "inline-flex items-center justify-center gap-1.5 rounded-xl border font-bold text-[length:var(--fs-13)] px-3 min-h-11 transition-colors disabled:opacity-50";
const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-12)]";

/** Τι σημαίνει κάθε λόγος, σε απλά ελληνικά, και τι να κοιτάξει ο διαχειριστής. */
const REASON: Record<Reason, { label: string; hint: string; Icon: typeof Barcode }> = {
  ean: { label: "Άλλο barcode", hint: "Ίδιο μοντέλο, άλλο EAN: συχνά άλλο χρώμα ή μνήμη. Κοίτα αν είναι ακριβώς το ίδιο", Icon: Barcode },
  ai: { label: "Το βρήκε το AI", hint: "Δεν ταίριαξε ο κωδικός· το AI το θεωρεί ίδιο προϊόν", Icon: Sparkles },
  many: { label: "Πολλά υποψήφια", hint: "Περισσότερα από ένα είδη του Κωτσόβολου ταιριάζουν· κρατήσαμε το πρώτο", Icon: Layers },
  price: { label: "Μεγάλη διαφορά τιμής", hint: "Πάνω από 40%: ίσως σετ ή άλλη συσκευασία", Icon: AlertTriangle },
  taken: { label: "Ήδη ζευγάρι αλλού", hint: "Το ίδιο είδος του Κωτσόβολου είναι ήδη ζευγάρι με άλλο προϊόν μας", Icon: Link2 },
  other: { label: "Παρόμοιος κωδικός", hint: "Ο κωδικός μοιάζει αλλά δεν είναι ίδιος (π.χ. άλλη κατάληξη)", Icon: Tag },
};
const ORDER: Reason[] = ["ean", "ai", "many", "price", "taken", "other"];

/** Οι προτάσεις προς έλεγχο: «Σωστό» (γίνεται ζευγάρι) ή «Λάθος» (δεν ξαναπροτείνεται), μία-μία ή πολλές μαζί. */
export function SuggestionsReview({ rows, canWrite }: { rows: SuggRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [filter, setFilter] = useState<Reason | "all">("all");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const counts = useMemo(() => { const m = new Map<Reason, number>(); for (const r of rows) m.set(r.reason, (m.get(r.reason) ?? 0) + 1); return m; }, [rows]);
  const list = filter === "all" ? rows : rows.filter((r) => r.reason === filter);
  const pages = Math.max(1, Math.ceil(list.length / PER)), cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PER, cur * PER);
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.productId));

  const confirm = (ids: string[]) => start(async () => {
    setMsg(null);
    const r = await confirmPairs(ids);
    setMsg(r.ok ? { ok: true, text: r.confirmed === 1 ? "Έγινε ζευγάρι" : `${r.confirmed} έγιναν ζευγάρια` } : { ok: false, text: r.error });
    setSel(new Set());
    router.refresh();
  });
  const reject = (id: string) => start(async () => {
    setMsg(null);
    const r = await rejectPair(id);
    setMsg(r.ok ? { ok: true, text: "Απορρίφθηκε· δεν θα ξαναπροταθεί" } : { ok: false, text: r.error });
    router.refresh();
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickFilter = (f: Reason | "all") => { setFilter(f); setPage(1); setSel(new Set()); };

  return (
    <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0" aria-labelledby="sugg-h" data-help="competitors-suggestions">
      <div className="grid gap-1">
        <h3 id="sugg-h" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Προτάσεις προς έλεγχο <span className="text-eu-ink-3 font-normal tabular-nums">({rows.length.toLocaleString("el-GR")})</span></h3>
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] max-w-[70ch]">Πιθανά ζευγάρια που θέλουν ματιά από άνθρωπο. Μέχρι να τα επιβεβαιώσεις δεν μετρούν πουθενά: ούτε στο «Είμαστε ακριβότεροι» ούτε στη μαζική αλλαγή τιμών.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Φίλτρο ανά λόγο" data-help="competitors-suggestions-filter">
        {(["all", ...ORDER] as const).filter((f) => f === "all" || counts.get(f)).map((f) => {
          const on = filter === f, R = f === "all" ? null : REASON[f];
          return (
            <button key={f} type="button" aria-pressed={on} onClick={() => pickFilter(f)}
              className={`${base} ${on ? "bg-eu-navy text-white border-eu-navy" : "bg-white text-eu-navy border-eu-line hover:border-eu-navy"}`}>
              {R && <R.Icon className="size-4" aria-hidden />}{R ? R.label : "Όλες"} <span className="tabular-nums font-normal">{f === "all" ? rows.length : counts.get(f)}</span>
            </button>
          );
        })}
      </div>

      {canWrite && shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-help="competitors-suggestions-bulk">
          <label className="inline-flex items-center gap-2 min-h-11 px-1 text-eu-ink text-[length:var(--fs-14)] cursor-pointer">
            <input type="checkbox" className="size-5 accent-eu-navy" checked={allOn} onChange={() => setSel((s) => { const n = new Set(s); for (const r of shown) allOn ? n.delete(r.productId) : n.add(r.productId); return n; })} />
            Όλα σε αυτή τη σελίδα
          </label>
          <button type="button" disabled={busy || !sel.size} onClick={() => confirm([...sel])} className={`${base} bg-eu-green text-white border-eu-green hover:opacity-90`}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />} Επιβεβαίωσε τα επιλεγμένα ({sel.size})
          </button>
        </div>
      )}
      {msg && <p role="status" className={`m-0 text-[length:var(--fs-13)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}

      {!rows.length ? (
        <p className="m-0 inline-flex items-center gap-2 text-eu-green font-bold text-[length:var(--fs-14)]"><Check className="size-4" aria-hidden /> Καμία πρόταση· όλα τα ζευγάρια είναι σίγουρα</p>
      ) : (
        <ul className="m-0 p-0 list-none grid gap-2">
          {shown.map((r) => {
            const R = REASON[r.reason];
            const big = r.diff != null && Math.abs(r.diff) > 40;
            const diffCls = r.diff == null ? "bg-eu-surface-2 text-eu-ink-3" : big ? "bg-eu-amber/15 text-eu-ink" : r.diff > 0.5 ? "bg-eu-red/10 text-eu-red" : r.diff < -0.5 ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface-2 text-eu-ink";
            return (
              <li key={r.productId} className={`rounded-xl border p-3 grid gap-2 min-w-0 ${sel.has(r.productId) ? "border-eu-navy bg-eu-blue/5" : "border-eu-line"}`}>
                <div className="flex items-start gap-3 min-w-0">
                  {canWrite && <label className="size-11 -m-2 shrink-0 grid place-items-center cursor-pointer"><input type="checkbox" className="size-5 accent-eu-navy" aria-label={`Επιλογή: ${r.title}`} checked={sel.has(r.productId)} onChange={() => toggle(r.productId)} /></label>}
                  <div className="grid gap-2 min-w-0 flex-1 md:grid-cols-2">
                    <div className="grid gap-0.5 min-w-0">
                      <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Δικό μας · {r.erp}</span>
                      <Link href={`/admin/catalog/${r.productId}`} className="font-bold text-eu-ink hover:underline break-words text-[length:var(--fs-14)]">{r.title}</Link>
                      <span className="tabular-nums text-eu-ink text-[length:var(--fs-14)]">{eur(r.ours)}</span>
                    </div>
                    <div className="grid gap-0.5 min-w-0">
                      <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Κωτσόβολος · {r.extId}</span>
                      {r.extUrl
                        ? <a href={`https://www.kotsovolos.gr/${r.extUrl.replace(/^\//, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-bold text-eu-blue hover:underline break-words text-[length:var(--fs-14)]">{r.extTitle ?? `Είδος ${r.extId}`}<ExternalLink className="size-4 shrink-0 mt-0.5" aria-label="(ανοίγει σε νέα καρτέλα)" /></a>
                        : <span className="font-bold text-eu-ink break-words text-[length:var(--fs-14)]">{r.extTitle ?? `Είδος ${r.extId}`}</span>}
                      <span className="flex flex-wrap items-center gap-2 tabular-nums text-eu-ink text-[length:var(--fs-14)]">{eur(r.theirs)}
                        <span className={`${pill} ${diffCls}`} title="Δική μας τιμή σε σχέση με του Κωτσόβολου">{r.diff == null ? "χωρίς σύγκριση" : `${r.diff > 0 ? "+" : ""}${r.diff.toLocaleString("el-GR")}% εμείς`}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 grid gap-0.5 min-w-0 text-[length:var(--fs-13)]">
                    <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink"><R.Icon className="size-4 shrink-0 text-eu-amber" aria-hidden />{R.label}</span>
                    <span className="text-eu-ink-3 break-words">{R.hint}{r.lastError && r.reason !== "taken" ? ` · ${r.lastError}` : ""}</span>
                  </p>
                  {canWrite && (
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => confirm([r.productId])} className={`${base} bg-white border-eu-green text-eu-green hover:bg-eu-green/5`}><Check className="size-4" aria-hidden /> Σωστό</button>
                      <button type="button" disabled={busy} onClick={() => reject(r.productId)} className={`${base} bg-white border-eu-red text-eu-red hover:bg-eu-red/5`}><X className="size-4" aria-hidden /> Λάθος</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PagerButtons page={cur} pages={pages} total={list.length} onPage={(p) => { setPage(p); setSel(new Set()); }} label="προτάσεις" />
    </section>
  );
}
