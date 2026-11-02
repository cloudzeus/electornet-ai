import Link from "next/link";
import { CalendarClock, MessageSquareWarning, Search, ShieldCheck, Wrench } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { KIND_LABEL, MODE_LABEL, STATUS_LABEL, STATUS_TONE, type TicketStatus } from "@/lib/service/core";
import { isView, loadQueue, PER_PAGE, VIEWS, type QueueRow, type View } from "@/lib/service/queue";

export const metadata = { title: "Service & ραντεβού" };
export const dynamic = "force-dynamic";

type SP = { view?: string; q?: string; kind?: string; store?: string; tech?: string; page?: string };


const when = (d: Date | null, slot: string | null) =>
  d ? `${d.toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Athens" })}${slot ? ` · ${slot}` : ` · ${d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" })}`}` : null;
const ago = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3600000);
  return h < 1 ? "μόλις τώρα" : h < 24 ? `πριν ${h} ώρ.` : `πριν ${Math.round(h / 24)} ημ.`;
};

/**
 * Ουρά service: όλα τα αιτήματα (επισκευές, εγκαταστάσεις, παραδόσεις με ραντεβού) σε ένα σημείο — προβολές με
 * πλήθη, αναζήτηση και φίλτρα στη διεύθυνση, και κάθε αίτημα ανοίγει στην καρτέλα του για ραντεβού, ανάθεση και email.
 */
export default async function ServiceQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("service.tickets.read");
  const sp = await searchParams;
  const view: View = isView(sp.view) ? sp.view : "open";
  // υπάλληλος καταστήματος: ξεκινά από το δικό του κατάστημα (μπορεί να διαλέξει «όλα»)
  const store = sp.store ?? (user.storeId ? user.storeId : "");
  const page = Math.max(1, Number(sp.page) || 1);
  const f = { view, q: sp.q?.trim() || undefined, kind: sp.kind || undefined, store: store === "all" ? undefined : store || undefined, tech: sp.tech || undefined, page };
  const data = await loadQueue(f);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const all = { view, q: sp.q, kind: sp.kind, store: sp.store, tech: sp.tech, ...patch };
    for (const [k, v] of Object.entries(all)) if (v && !(k === "view" && v === "open")) p.set(k, String(v));
    const s = p.toString();
    return `/admin/service${s ? `?${s}` : ""}`;
  };
  const pages = Math.max(1, Math.ceil(data.total / PER_PAGE));
  const field = "rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] w-full";
  const label = "grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Πωλήσεις & πελάτες</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Service & ραντεβού</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">
            Αιτήματα από τον λογαριασμό των πελατών, το Snap & Find και την καρτέλα πελάτη. Άνοιξε ένα αίτημα για ραντεβού, τεχνικό, κατάσταση και email στον πελάτη. Νέο αίτημα για πελάτη ανοίγεις από την <Link href="/admin/customers" className="text-eu-blue underline">καρτέλα του</Link> (Service & ραντεβού).
          </p>
        </div>
      </div>

      <div data-help="kpis" className="grid grid-cols-2 @3xl:grid-cols-5 gap-3">
        {([
          ["new", "Νέα, χωρίς ραντεβού", Wrench, "Θέλουν τηλέφωνο για ραντεβού"],
          ["today", "Ραντεβού σήμερα", CalendarClock, null],
          ["requests", "Ζητούν αλλαγή ώρας", MessageSquareWarning, "Ο πελάτης περιμένει απάντηση"],
          ["waiting-parts", "Αναμονή ανταλλακτικών", Wrench, null],
          ["stale", "Ανοιχτά > 7 ημέρες", ShieldCheck, null],
        ] as const).map(([k, l, Icon, sub]) => {
          const n = data.count[k];
          const hot = n > 0 && (k === "new" || k === "requests" || k === "stale");
          return (
            <Link key={k} href={qs({ view: k, page: undefined })} className={`rounded-2xl border p-4 grid gap-1 min-h-11 ${hot ? "bg-eu-navy text-white border-eu-navy" : "bg-white border-eu-line hover:border-eu-blue"}`}>
              <span className="flex items-center justify-between gap-2">
                <span className={`font-heading font-extrabold text-[length:var(--fs-28)] leading-none tabular-nums ${hot ? "text-eu-yellow" : "text-eu-navy"}`}>{n.toLocaleString("el-GR")}</span>
                <Icon className={`size-5 ${hot ? "text-eu-yellow" : "text-eu-blue"}`} aria-hidden />
              </span>
              <span className={`text-[length:var(--fs-14)] ${hot ? "text-white/85" : "text-eu-muted"}`}>{l}</span>
              {sub && n > 0 && <span className={`text-[length:var(--fs-13)] ${hot ? "text-white/70" : "text-eu-muted"}`}>{sub}</span>}
            </Link>
          );
        })}
      </div>

      <nav data-help="views" aria-label="Προβολές" className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => {
          const on = v.key === view;
          return (
            <Link key={v.key} href={qs({ view: v.key, page: undefined })} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-14)] border ${on ? "bg-eu-navy text-white border-eu-navy" : "bg-white text-eu-ink-2 border-eu-line hover:border-eu-blue"}`}>
              {v.label}
              <span className={`rounded-full px-1.5 text-[length:var(--fs-13)] tabular-nums ${on ? "bg-white/20" : "bg-eu-surface"}`}>{data.count[v.key].toLocaleString("el-GR")}</span>
            </Link>
          );
        })}
      </nav>

      <form data-help="filters" method="get" action="/admin/service" className="rounded-2xl bg-white border border-eu-line p-3 grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] gap-3 items-end">
        {view !== "open" && <input type="hidden" name="view" value={view} />}
        <label className={label}>
          Αναζήτηση
          <span className="relative">
            <Search className="size-4 text-eu-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input name="q" defaultValue={sp.q ?? ""} placeholder="SRV-…, όνομα, κινητό, email, S/N, μοντέλο" className={`${field} pl-9`} />
          </span>
        </label>
        <label className={label}>
          Είδος
          <select name="kind" defaultValue={sp.kind ?? ""} className={field}>
            <option value="">Όλα</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className={label}>
          Κατάστημα
          <select name="store" defaultValue={store || "all"} className={field}>
            <option value="all">Όλα τα καταστήματα</option>
            <option value="none">Χωρίς κατάστημα</option>
            {data.stores.map((s) => <option key={s.id} value={s.id}>{s.city} — {s.name}</option>)}
          </select>
        </label>
        <label className={label}>
          Τεχνικός
          <select name="tech" defaultValue={sp.tech ?? ""} className={field}>
            <option value="">Όλοι</option>
            {data.technicians.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-full bg-eu-navy text-white font-bold px-5 min-h-11 text-[length:var(--fs-14)]">Εφαρμογή</button>
          {(sp.q || sp.kind || sp.store || sp.tech) && <Link href={qs({ q: undefined, kind: undefined, store: "all", tech: undefined, page: undefined })} className="rounded-full border border-eu-line px-4 min-h-11 inline-flex items-center font-bold text-[length:var(--fs-14)] text-eu-ink-2">Καθαρισμός</Link>}
        </div>
      </form>

      <section data-help="list" aria-label="Αιτήματα" className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <div className="hidden @5xl:grid grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_150px] gap-3 px-4 py-2 bg-eu-surface text-eu-muted font-bold text-[length:var(--fs-13)]">
          <span>Αίτημα</span><span>Πελάτης</span><span>Συσκευή / περιγραφή</span><span>Ραντεβού</span><span>Κατάστημα · τεχνικός</span><span>Κατάσταση</span>
        </div>
        <ul className="m-0 p-0 list-none divide-y divide-eu-line">
          {data.rows.map((t) => <Row key={t.id} t={t} />)}
          {!data.rows.length && <li className="p-6 text-eu-muted text-[length:var(--fs-15)]">Κανένα αίτημα σε αυτή την προβολή.</li>}
        </ul>
      </section>

      {pages > 1 && (
        <nav aria-label="Σελίδες" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)]">
          {page > 1 && <Link href={qs({ page: String(page - 1) })} className="rounded-full border border-eu-line px-4 min-h-11 inline-flex items-center font-bold">← Προηγούμενη</Link>}
          <span className="text-eu-muted">Σελίδα {page} από {pages} · {data.total.toLocaleString("el-GR")} αιτήματα</span>
          {page < pages && <Link href={qs({ page: String(page + 1) })} className="rounded-full border border-eu-line px-4 min-h-11 inline-flex items-center font-bold">Επόμενη →</Link>}
        </nav>
      )}
    </>
  );
}

function Row({ t }: { t: QueueRow }) {
  const name = `${t.customer.firstName} ${t.customer.lastName}`.trim();
  const appt = when(t.scheduledAt, t.slot);
  return (
    <li>
      <Link href={`/admin/service/${t.id}`} className="grid grid-cols-1 @md:grid-cols-2 @5xl:grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_150px] gap-x-3 gap-y-1 px-4 py-3 hover:bg-eu-surface/60 text-[length:var(--fs-14)]">
        <span className="min-w-0">
          <span className="font-bold text-eu-ink font-mono">{t.number}</span>
          <span className="block text-eu-muted text-[length:var(--fs-13)]">{KIND_LABEL[t.kind] ?? t.kind}</span>
        </span>
        <span className="min-w-0">
          <span className="font-bold text-eu-ink break-words">{name || "—"}</span>
          <span className="block text-eu-muted text-[length:var(--fs-13)]">{t.customer.mobile ?? t.customer.phone ?? ""}</span>
        </span>
        <span className="min-w-0">
          {t.device && <span className="block font-semibold text-eu-ink-2 truncate">{t.device.brand} {t.device.title}{t.device.serial ? ` · S/N ${t.device.serial}` : ""}</span>}
          <span className="block text-eu-muted text-[length:var(--fs-13)] line-clamp-2 break-words">{t.description}</span>
        </span>
        <span className="min-w-0">
          {appt ? <span className="font-semibold text-eu-ink-2">{appt}</span> : <span className="text-eu-muted">Χωρίς ραντεβού · {ago(t.createdAt)}</span>}
          {t.mode && <span className="block text-eu-muted text-[length:var(--fs-13)]">{MODE_LABEL[t.mode] ?? t.mode}</span>}
          {t.request && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-eu-red/10 text-eu-red font-bold px-2 text-[length:var(--fs-13)]">
              <MessageSquareWarning className="size-3.5" aria-hidden /> Ζητά αλλαγή{t.request.request?.date ? ` → ${new Date(t.request.request.date).toLocaleDateString("el-GR", { day: "numeric", month: "short" })}` : ""}
            </span>
          )}
        </span>
        <span className="min-w-0 text-eu-ink-2">
          <span className="block truncate">{t.store ?? <span className="text-eu-muted">Χωρίς κατάστημα</span>}</span>
          <span className="block text-eu-muted text-[length:var(--fs-13)]">{t.technician ? `Τεχνικός: ${t.technician}` : "Χωρίς τεχνικό"}</span>
        </span>
        <span className="min-w-0 flex flex-wrap items-start gap-1">
          <span className={`rounded-full px-2.5 py-0.5 font-bold text-[length:var(--fs-13)] ${STATUS_TONE[t.status] ?? "bg-eu-surface"}`}>{STATUS_LABEL[t.status as TicketStatus] ?? t.status}</span>
          <span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-13)] ${t.inWarranty ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-muted"}`}>{t.inWarranty ? "Εγγύηση" : "Εκτός εγγ."}</span>
        </span>
      </Link>
    </li>
  );
}
