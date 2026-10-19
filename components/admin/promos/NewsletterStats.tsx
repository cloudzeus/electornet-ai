import { History, MousePointerClick } from "lucide-react";
import { sx } from "@/components/ui/sx";

/** Αποτελέσματα αποστολής newsletter: πρόοδος, μετρητές, κλικ ανά σύνδεσμο / προϊόν, ιστορικό. Χωρίς προσωπικά στοιχεία. */
export type NewsletterStatsData = {
  recipientCount: number;
  rows: { queued: number; sending: number; sent: number; failed: number; skipped: number };
  delivered: number; opened: number; clicked: number; unsubscribed: number; bounced: number; complained: number;
  clicks: { label: string; sub: string; href: string; clicks: number; people: number }[];
  log: { at: string; text: string; by: string | null }[];
};

const num = (n: number) => n.toLocaleString("el-GR");
const rate = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10} %` : "—");
const at = (s: string) => new Date(s).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Athens" });

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl border border-eu-line bg-white px-3 py-2.5 grid gap-0.5 min-w-0">
      <span className="text-eu-muted text-[length:var(--fs-12)] font-bold">{label}</span>
      <span className={`font-heading font-extrabold text-[length:var(--fs-22)] leading-none tabular-nums ${tone === "bad" ? "text-eu-red" : tone === "warn" ? "text-eu-amber" : "text-eu-navy"}`}>{value}</span>
      {sub && <span className="text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">{sub}</span>}
    </div>
  );
}

/** `results` = false πριν από την έναρξη (προγραμματισμένο / ακυρώθηκε χωρίς να ξεκινήσει): μόνο το ιστορικό. */
export function NewsletterStats({ d, results = true }: { d: NewsletterStatsData; results?: boolean }) {
  const total = d.recipientCount;
  const done = d.rows.sent + d.rows.failed + d.rows.skipped;
  const p = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const base = d.delivered || d.rows.sent;
  const sSent = sx({ width: `${total ? (d.rows.sent / total) * 100 : 0}%` });
  const sFailed = sx({ width: `${total ? (d.rows.failed / total) * 100 : 0}%` });
  const sSkipped = sx({ width: `${total ? (d.rows.skipped / total) * 100 : 0}%` });
  return (
    <div className="grid gap-4 min-w-0">
      {results && <section data-help="newsletter.stats" aria-labelledby="ns-h" className="grid gap-3 rounded-2xl bg-white border border-eu-line p-3 @md:p-4 min-w-0">
        <h3 id="ns-h" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Αποτελέσματα</h3>
        <div className="grid gap-1">
          <div className="flex flex-wrap justify-between gap-2 text-[length:var(--fs-13)]">
            <span className="text-eu-ink-2 font-bold">{num(d.rows.sent)} στάλθηκαν από {num(total)}</span>
            <span className="text-eu-muted tabular-nums">{p} %{d.rows.queued ? ` · ${num(d.rows.queued)} στην ουρά` : ""}{d.rows.sending ? ` · ${num(d.rows.sending)} σε αποστολή` : ""}</span>
          </div>
          <div className="h-2.5 rounded-full bg-eu-surface overflow-hidden flex" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label="Πρόοδος αποστολής">
            {sSent.node}{sFailed.node}{sSkipped.node}
            <span className={`block h-full bg-eu-green ${sSent.className}`} />
            <span className={`block h-full bg-eu-red ${sFailed.className}`} />
            <span className={`block h-full bg-eu-line-2 ${sSkipped.className}`} />
          </div>
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Πράσινο: στάλθηκαν · κόκκινο: απέτυχαν{d.rows.failed ? ` (${num(d.rows.failed)})` : ""} · γκρι: δεν στάλθηκαν μετά από διακοπή{d.rows.skipped ? ` (${num(d.rows.skipped)})` : ""}.</p>
        </div>
        <div className="grid grid-cols-2 @md:grid-cols-3 @3xl:grid-cols-6 gap-2">
          <Tile label="Παραδόθηκαν" value={num(d.delivered)} sub={rate(d.delivered, d.rows.sent)} />
          <Tile label="Ανοίγματα" value={num(d.opened)} sub={rate(d.opened, base)} />
          <Tile label="Κλικ" value={num(d.clicked)} sub={rate(d.clicked, base)} />
          <Tile label="Διαγραφές" value={num(d.unsubscribed)} sub={rate(d.unsubscribed, base)} tone={d.unsubscribed / Math.max(1, base) > 0.01 ? "warn" : undefined} />
          <Tile label="Bounces" value={num(d.bounced)} sub={rate(d.bounced, d.rows.sent)} tone={d.bounced / Math.max(1, d.rows.sent) > 0.02 ? "warn" : undefined} />
          <Tile label="Παράπονα spam" value={num(d.complained)} sub={rate(d.complained, base)} tone={d.complained > 0 ? "bad" : undefined} />
        </div>
      </section>}

      <div className="grid gap-4 @4xl:grid-cols-2 items-start">
        {results && <section data-help="newsletter.clicks" aria-labelledby="nc-h" className="grid gap-2 rounded-2xl bg-white border border-eu-line p-3 @md:p-4 min-w-0">
          <h3 id="nc-h" className="m-0 inline-flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><MousePointerClick className="size-4 text-eu-blue" aria-hidden /> Κλικ ανά σύνδεσμο</h3>
          {d.clicks.length ? (
            <ul className="m-0 p-0 list-none divide-y divide-eu-line rounded-lg border border-eu-line">
              {d.clicks.map((c) => (
                <li key={c.href} className="flex items-start gap-3 px-2.5 py-2 text-[length:var(--fs-13)] min-w-0">
                  <span className="grid min-w-0 flex-1"><a href={c.href} target="_blank" rel="noreferrer" className="font-bold text-eu-ink hover:text-eu-blue hover:underline break-words">{c.label}</a><span className="text-eu-muted text-[length:var(--fs-12)] break-all">{c.sub}</span></span>
                  <span className="shrink-0 text-right tabular-nums"><span className="block font-bold text-eu-navy">{num(c.clicks)}</span><span className="block text-eu-muted text-[length:var(--fs-12)]">{num(c.people)} άτομα</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κανένα κλικ ακόμη. Τα κλικ έρχονται από τον πάροχο (Mailgun) μέσω webhook.</p>}
        </section>}

        <section data-help="newsletter.log" aria-labelledby="nl-h" className="grid gap-2 rounded-2xl bg-white border border-eu-line p-3 @md:p-4 min-w-0">
          <h3 id="nl-h" className="m-0 inline-flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><History className="size-4 text-eu-blue" aria-hidden /> Ιστορικό</h3>
          {d.log.length ? (
            <ol className="m-0 p-0 list-none grid gap-1.5 max-h-96 overflow-y-auto">
              {d.log.map((l, i) => (
                <li key={i} className="grid gap-0.5 border-l-2 border-eu-line pl-2.5 text-[length:var(--fs-13)]">
                  <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{at(l.at)}{l.by ? ` · ${l.by}` : ""}</span>
                  <span className="text-eu-ink-2 break-words">{l.text}</span>
                </li>
              ))}
            </ol>
          ) : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κενό.</p>}
        </section>
      </div>
    </div>
  );
}
