import Link from "next/link";
import { AlertTriangle, Check, PenLine, ScrollText, Search, X } from "lucide-react";
import { StatTile } from "@/components/admin/charts/Charts";
import { Badge } from "@/components/admin/orders/ui";

const when = (d: Date) => d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Athens" });
const pretty = (v: unknown) => { try { return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2); } catch { return String(v ?? ""); } };
export const S1LOG_FILTERS = [["all", "Όλες"], ["errors", "Μόνο σφάλματα"], ["writes", "Μόνο εγγραφές στο ERP"]] as const;
const FILTERS = S1LOG_FILTERS;
const FOLD = 3000;
const PRE = "m-0 rounded-lg border border-eu-line bg-eu-surface px-3 py-2 font-mono text-[length:var(--fs-12)] text-eu-ink-2 whitespace-pre-wrap break-all";

export interface S1LogRow { id: string; at: Date; service: string; object: string | null; key: string | null; write: boolean; ok: boolean; error: string | null; ms: number; source: string | null; bytes: number }
export interface S1LogOne extends S1LogRow { errorCode: number | null; http: number | null; request: unknown; response: string | null }
export interface S1LogData { rows: S1LogRow[]; n24: number; err24: number; wr24: number; avgMs: number; one: S1LogOne | null }

/** Η σελίδα «Καταγραφή κλήσεων» χωρίς την ανάγνωση από τη βάση (τα δεδομένα έρχονται από το page.tsx). `data` null = ο πίνακας δεν υπάρχει ακόμη. */
export function S1LogView({ data, f, q, id }: { data: S1LogData | null; f: string; q: string; id?: string }) {
  const href = (p: { f?: string; q?: string; id?: string }) => { const u = new URLSearchParams({ ...(f !== "all" ? { f } : {}), ...(q ? { q } : {}), ...p }); if (u.get("f") === "all") u.delete("f"); const s = u.toString(); return `/admin/softone/log${s ? `?${s}` : ""}`; };
  const head = (
    <div>
      <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] inline-flex items-center gap-1.5"><ScrollText className="size-3.5" aria-hidden /> SoftOne ERP</div>
      <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Καταγραφή κλήσεων</h2>
      <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Ό,τι στέλνει το site στο SoftOne και ό,τι απαντά εκείνο: σύνδεση, αναγνώσεις, εγγραφές. Όταν μια κλήση αποτύχει, φεύγει και email στον τεχνικό υπεύθυνο με όλα τα στοιχεία.</p>
    </div>
  );
  if (!data) return <div className="grid gap-5 min-w-0">{head}<p role="alert" className="m-0 rounded-xl bg-eu-red/10 px-3 py-2 text-[length:var(--fs-14)] text-eu-ink">Ο πίνακας της καταγραφής δεν υπάρχει ακόμη στη βάση. Χρειάζεται να εφαρμοστεί το prisma/sql/2026-11-26-softone-docno-log.sql.</p></div>;
  const { rows, n24, err24, wr24, avgMs, one } = data;
  return (
    <div className="grid gap-5 min-w-0">
      {head}
      <div data-help="s1log.stats" className="grid grid-cols-2 @lg:grid-cols-4 gap-3">
        <StatTile label="Κλήσεις (24ω)" value={n24.toLocaleString("el-GR")} sub={n24 ? "η σύνδεση με το SoftOne δουλεύει" : "καμία κλήση το τελευταίο 24ωρο"} accent />
        <StatTile label="Σφάλματα (24ω)" value={String(err24)} sub={err24 ? "δες τα με «Μόνο σφάλματα»" : "κανένα, όλα καλά"} />
        <StatTile label="Εγγραφές στο ERP (24ω)" value={String(wr24)} sub="παραγγελίες, καρτέλες, είδη" />
        <StatTile label="Μέσος χρόνος" value={`${avgMs} ms`} sub={avgMs > 3000 ? "αργό: το SoftOne καθυστερεί" : "κανονικός"} />
      </div>

      {one && (
        <section id="detail" data-help="s1log.detail" aria-label="Λεπτομέρειες κλήσης" className="rounded-2xl bg-white border-2 border-eu-navy/30 p-4 grid gap-3 min-w-0 scroll-mt-28">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] break-words">{one.service}{one.object ? ` · ${one.object}` : ""}{one.key ? ` · ${one.key}` : ""}</h3>
              <p className="m-0 mt-0.5 text-eu-ink-3 text-[length:var(--fs-13)]">{when(one.at)} · {one.ms} ms · HTTP {one.http ?? "—"} · {one.source ?? "δεν δηλώθηκε λειτουργία"}</p>
            </div>
            <div className="flex items-center gap-2">
              {one.ok ? <Badge tone="good"><Check className="size-3.5" aria-hidden /> πέτυχε</Badge> : <Badge tone="bad"><AlertTriangle className="size-3.5" aria-hidden /> σφάλμα</Badge>}
              <Link href={href({})} className="inline-flex items-center gap-1 rounded-lg border border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><X className="size-4" aria-hidden /> Κλείσιμο</Link>
            </div>
          </div>
          {one.error && <p className={`m-0 rounded-lg px-3 py-2 text-[length:var(--fs-14)] ${one.ok ? "bg-eu-surface text-eu-ink-2" : "bg-eu-red/10 text-eu-ink"}`}>{one.errorCode != null && <b>Κωδικός {one.errorCode}: </b>}{one.error}</p>}
          <div className="grid gap-3 @3xl:grid-cols-2 min-w-0">
            {([["Αίτημα", "Όπως στάλθηκε, χωρίς τον κωδικό και το κλειδί της σύνδεσης.", pretty(one.request)], ["Απάντηση SoftOne", one.bytes > (one.response?.length ?? 0) ? `Οι πρώτοι ${(one.response?.length ?? 0).toLocaleString("el-GR")} από ${one.bytes.toLocaleString("el-GR")} χαρακτήρες: στις αναγνώσεις κρατιέται η αρχή.` : `Ολόκληρη (${one.bytes.toLocaleString("el-GR")} χαρακτήρες).`, one.response ? pretty(one.response) : "(κενή)"]] as const).map(([t, sub, body]) => (
              <div key={t} className="grid gap-1 min-w-0 content-start">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{t}</span>
                <span className="text-eu-muted text-[length:var(--fs-13)]">{sub}</span>
                {/* χωρίς εσωτερική κύλιση (ποτέ δύο κάθετα scrollbars): το μεγάλο κείμενο ανοίγει ολόκληρο μόνο όταν ζητηθεί */}
                <pre className={PRE}>{body.slice(0, FOLD)}</pre>
                {body.length > FOLD && <details><summary className="cursor-pointer inline-flex items-center min-h-11 font-bold text-eu-blue text-[length:var(--fs-13)]">Δείξε και το υπόλοιπο ({(body.length - FOLD).toLocaleString("el-GR")} χαρακτήρες)</summary><pre className={PRE}>{body.slice(FOLD)}</pre></details>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 min-w-0">
        <div data-help="s1log.filters" className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([k, label]) => <Link key={k} href={href({ f: k })} aria-current={f === k ? "true" : undefined} className={`inline-flex items-center rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] border-2 ${f === k ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-ink-2 hover:border-eu-navy"}`}>{label}</Link>)}
          <form action="/admin/softone/log" className="flex items-center gap-1 grow min-w-[14rem]">
            {f !== "all" && <input type="hidden" name="f" value={f} />}
            <label className="sr-only" htmlFor="s1log-q">Αναζήτηση</label>
            <input id="s1log-q" name="q" defaultValue={q} placeholder="π.χ. SALDOC, setData, EUR-20261126-8883" className="grow min-w-0 rounded-lg border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)]" />
            <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue"><Search className="size-4" aria-hidden /> Αναζήτηση</button>
          </form>
        </div>
        {rows.length === 0 ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{q || f !== "all" ? "Καμία κλήση με αυτά τα κριτήρια." : "Δεν έχει καταγραφεί ακόμη κλήση. Η καταγραφή ξεκινά από την πρώτη κλήση μετά την ενημέρωση του site."}</p> : (
          <ul data-help="s1log.list" className="m-0 p-0 list-none grid gap-1.5">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`${href({ id: r.id })}#detail`} className={`grid gap-x-3 gap-y-0.5 grid-cols-[auto_minmax(0,1fr)] @2xl:grid-cols-[auto_minmax(0,1fr)_auto] items-start rounded-xl border px-3 py-2 min-h-11 hover:border-eu-navy ${id === r.id ? "border-eu-navy bg-eu-chip/50" : r.ok ? "border-eu-line" : "border-eu-red/30 bg-eu-red/5"}`}>
                  {r.ok ? <Check className="size-4 mt-0.5 text-eu-green" aria-label="πέτυχε" /> : <AlertTriangle className="size-4 mt-0.5 text-eu-red" aria-label="σφάλμα" />}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="break-all">{r.service}{r.object ? ` · ${r.object}` : ""}{r.key ? ` · ${r.key}` : ""}</span>{r.write && <Badge tone="info"><PenLine className="size-3" aria-hidden /> εγγραφή</Badge>}</span>
                    <span className="block text-eu-ink-3 text-[length:var(--fs-13)] break-words">{r.error ?? r.source ?? "ανάγνωση"}{r.error && r.source ? ` · ${r.source}` : ""}</span>
                  </span>
                  <span className="col-start-2 @2xl:col-start-3 text-eu-muted text-[length:var(--fs-13)] tabular-nums whitespace-nowrap @2xl:text-right">{when(r.at)} · {r.ms} ms</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length === 150 && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Φαίνονται οι 150 πιο πρόσφατες. Στένεψε με τα φίλτρα ή την αναζήτηση για παλαιότερες.</p>}
      </section>
    </div>
  );
}
