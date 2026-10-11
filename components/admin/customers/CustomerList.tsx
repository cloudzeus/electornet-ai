"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CustomerActions, ToastBar, type Toast } from "./CustomerActions";
import { ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, ExternalLink, Mail, Phone, MapPin, Building2, Store, Loader2, ShoppingBag, Wrench, ShieldCheck, Star, Link2, Activity, LayoutGrid, CircleAlert, Check, X, Undo2, FileText, StickyNote } from "lucide-react";
import { customerPeekAction } from "@/app/admin/(shell)/customers/actions";
import type { Peek } from "@/lib/customers/peek";

export type CustomerRow = {
  id: string; number: number; name: string; sub: string; business: boolean; email: string | null; phone: string | null; vat: string | null;
  erp: { linked: boolean; label: string; failed: boolean }; orders: number; total: number; last: string | null; devices: number; tickets: number;
  points: number; tier: string | null; store: string | null; region: string | null; km: number | null; status: string; newsletter: boolean; tags: string[];
  source: string; created: string; city: string | null;
};
export type SortHead = { key: string; label: string; href: string; on: boolean; dir: "asc" | "desc" | null };

const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const eur2 = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toLocaleUpperCase("el-GR");
const GRID = "@5xl:grid-cols-[2.75rem_minmax(0,1.6fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)]";
const STATUS: Record<string, [string, string]> = { active: ["Ενεργός", "bg-eu-green/12 text-eu-green"], blocked: ["Μπλοκαρισμένος", "bg-eu-red/10 text-eu-red"], anonymised: ["Ανωνυμοποιημένος", "bg-eu-surface text-eu-muted"] };

/**
 * Η λίστα πελατών: πυκνές γραμμές (σε στενή οθόνη κάρτες) με αγορές, SoftOne, πόντους, περιοχή, κατάσταση· κάθε γραμμή
 * ανοίγει από το βέλος σε πλήρη εικόνα του πελάτη με καρτέλες (φορτώνεται εκείνη τη στιγμή).
 */
export function CustomerList({ rows, heads, canWrite = false, erpOn = false }: { rows: CustomerRow[]; heads: SortHead[]; canWrite?: boolean; erpOn?: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast>(null);
  const [rev, setRev] = useState<Record<string, number>>({});
  const closeToast = useCallback(() => setToast(null), []);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div data-help="customers.list" className="rounded-2xl bg-white border border-eu-line overflow-hidden">
      <div className={`hidden @5xl:grid ${GRID} gap-x-3 px-3 bg-eu-surface/60 text-eu-muted text-[length:var(--fs-12)] font-bold uppercase tracking-wide`}>
        <span />
        {heads.map((h) => {
          const I = h.on ? (h.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
          return <Link key={h.key} href={h.href} scroll={false} aria-sort={h.on ? (h.dir === "asc" ? "ascending" : "descending") : "none"} className={`flex items-center gap-1 min-h-10 hover:text-eu-navy ${h.on ? "text-eu-navy" : ""}`}>{h.label}<I className={`size-3.5 shrink-0 ${h.on ? "" : "opacity-40"}`} aria-hidden /></Link>;
        })}
      </div>
      <ul className="m-0 p-0 list-none divide-y divide-eu-line">
        {rows.map((c) => {
          const isOpen = open.has(c.id);
          const [st, stCls] = STATUS[c.status] ?? STATUS.active;
          return (
            <li key={c.id} className={isOpen ? "bg-eu-surface/40" : ""}>
              <div className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto] ${GRID} gap-x-3 gap-y-1 px-3 py-2.5 items-center hover:bg-eu-surface/50`}>
                <button type="button" onClick={() => toggle(c.id)} onPointerEnter={() => void loadPeek(c.id)} aria-expanded={isOpen} aria-controls={`peek-${c.id}`} aria-label={`${isOpen ? "Κλείσιμο" : "Άνοιγμα"}: ${c.name}`} className={`size-10 grid place-items-center rounded-full border ${isOpen ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line text-eu-ink-3 hover:border-eu-navy hover:text-eu-navy"}`}>
                  <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className={`hidden @md:grid size-9 shrink-0 place-items-center rounded-full font-extrabold text-[length:var(--fs-13)] ${c.business ? "bg-eu-blue/10 text-eu-blue" : "bg-eu-chip text-eu-navy"}`} aria-hidden>{c.business ? <Building2 className="size-4" /> : initials(c.name)}</span>
                  <span className="grid min-w-0">
                    <Link href={`/admin/customers/${c.id}`} className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-snug truncate hover:text-eu-blue hover:underline">{c.name}</Link>
                    <span className="text-eu-muted text-[length:var(--fs-12)] truncate">#{c.number} · {c.sub}{c.tags.length ? ` · ${c.tags.join(", ")}` : ""}</span>
                  </span>
                </div>
                <span className="@5xl:hidden justify-self-end inline-flex items-center gap-1"><span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${stCls}`}>{st}</span><CustomerActions c={{ id: c.id, name: c.name, email: c.email, phone: c.phone, vat: c.vat, erpLinked: c.erp.linked, canWrite, erpOn }} onToast={setToast} onChanged={() => setRev((m) => ({ ...m, [c.id]: (m[c.id] ?? 0) + 1 }))} /></span>
                <div className="col-start-2 col-span-2 @5xl:col-start-auto @5xl:col-span-1 min-w-0 grid text-[length:var(--fs-13)]">
                  <span className="truncate text-eu-ink-2">{c.email ?? <span className="text-eu-muted">χωρίς email</span>}</span>
                  <span className="text-eu-muted tabular-nums">{c.phone ?? "—"}{c.vat ? ` · ΑΦΜ ${c.vat}` : ""}</span>
                </div>
                <div className="col-start-2 @5xl:col-start-auto min-w-0 text-[length:var(--fs-13)] tabular-nums">
                  <span className="font-bold text-eu-ink">{c.orders ? `${c.orders} αγορ.` : "Καμία αγορά"}</span>{c.total > 0 && <span className="text-eu-ink-2"> · {eur(c.total)}</span>}
                  <span className="block text-eu-muted text-[length:var(--fs-12)]">{c.last ? `τελευταία ${day(c.last)}` : `${c.devices} συσκ. · ${c.tickets} service`}</span>
                </div>
                <div className="hidden @5xl:block min-w-0 text-[length:var(--fs-13)]">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${c.erp.failed ? "bg-eu-red/10 text-eu-red" : c.erp.linked ? "bg-eu-navy/10 text-eu-navy" : "bg-eu-surface text-eu-muted"}`}>{c.erp.failed ? <CircleAlert className="size-3" aria-hidden /> : <Link2 className="size-3" aria-hidden />}{c.erp.label}</span>
                </div>
                <div className="hidden @5xl:block text-[length:var(--fs-13)] tabular-nums"><b className="text-eu-ink">{c.points.toLocaleString("el-GR")}</b>{c.tier && <span className="block text-eu-muted text-[length:var(--fs-12)]">{c.tier}</span>}</div>
                <div className="col-start-3 row-start-3 @5xl:row-start-auto @5xl:col-start-auto min-w-0 text-right @5xl:text-left text-[length:var(--fs-13)]">
                  <span className="block truncate text-eu-ink-2">{c.store ?? c.region ?? "—"}</span>
                  <span className="hidden @5xl:flex flex-wrap items-center gap-1 text-[length:var(--fs-12)]"><span className={`rounded-full px-2 py-0.5 font-bold ${stCls}`}>{st}</span>{c.newsletter && <span className="text-eu-muted">newsletter</span>}{c.km != null && <span className="text-eu-muted">{c.km.toFixed(1)} km</span>}</span>
                </div>
              </div>
              {isOpen && <CustomerPeek key={rev[c.id] ?? 0} id={c.id} />}
            </li>
          );
        })}
      </ul>
      <ToastBar t={toast} onClose={closeToast} />
    </div>
  );
}

/** Μνήμη ανά πελάτη (για όσο μένει ανοιχτή η σελίδα) + προφόρτωση όταν ο δείκτης πάει στο βέλος, για άμεσο άνοιγμα. */
const peekCache = new Map<string, Promise<Peek | null>>();
export const invalidatePeek = (id: string) => { peekCache.delete(id); };
export function loadPeek(id: string) { let p = peekCache.get(id); if (!p) { p = customerPeekAction(id).catch(() => { peekCache.delete(id); return null; }); peekCache.set(id, p); } return p; }

const TABS = [
  { k: "overview", t: "Επισκόπηση", s: "Σύνοψη", I: LayoutGrid },
  { k: "buys", t: "Αγορές", s: "Αγορές", I: ShoppingBag },
  { k: "requests", t: "Αιτήματα", s: "Αιτήματα", I: Wrench },
  { k: "warranty", t: "Εγγυήσεις", s: "Εγγυήσεις", I: ShieldCheck },
  { k: "loyalty", t: "Πόντοι & συναινέσεις", s: "Πόντοι", I: Star },
  { k: "erp", t: "SoftOne", s: "SoftOne", I: Link2 },
  { k: "activity", t: "Δραστηριότητα", s: "Ιστορικό", I: Activity },
] as const;
type TabKey = (typeof TABS)[number]["k"];
const WORKSPACE_TAB: Record<TabKey, string> = { overview: "profile", buys: "orders", requests: "service", warranty: "devices", loyalty: "loyalty", erp: "erp", activity: "profile" };

/** Η πλήρης εικόνα ενός πελάτη μέσα στη λίστα, σε καρτέλες. Φορτώνεται όταν ανοίξει η γραμμή. */
export function CustomerPeek({ id }: { id: string }) {
  const [data, setData] = useState<Peek | null | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>("overview");
  useEffect(() => { let live = true; void loadPeek(id).then((d) => { if (live) setData(d); }); return () => { live = false; }; }, [id]);
  const p = data;
  const count: Partial<Record<TabKey, number>> = p ? { buys: p.kpi.count, requests: p.requests.tickets.length + p.requests.returns.length + p.requests.gdpr.length + p.requests.reviews.length, warranty: p.devices.length } : {};
  const alert: Partial<Record<TabKey, boolean>> = p ? { requests: p.kpi.openTickets > 0 || p.requests.gdpr.some((g) => g.overdue), erp: p.erp.status === "failed" } : {};
  return (
    <section id={`peek-${id}`} data-help="customers.peek" aria-label="Εικόνα πελάτη" className="mx-1.5 mb-1.5 rounded-xl bg-white border border-eu-line shadow-sm overflow-hidden">
      <div className="grid @2xl:flex @2xl:items-center gap-1 border-b border-eu-line px-2 pt-1.5">
        <div role="tablist" aria-label="Ενότητες πελάτη" className="grid grid-cols-4 @2xl:flex @2xl:flex-wrap gap-0.5 flex-1 min-w-0">
          {TABS.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={`relative inline-flex flex-col @2xl:flex-row items-center justify-center gap-0.5 @2xl:gap-1.5 px-1 @2xl:px-2.5 min-h-11 @2xl:min-h-9 border-b-2 -mb-px font-bold text-[length:var(--fs-12)] @2xl:text-[length:var(--fs-13)] ${tab === t.k ? "border-eu-navy text-eu-navy" : "border-transparent text-eu-ink-3 hover:text-eu-blue"}`}>
              <t.I className="size-4" aria-hidden /><span className="@2xl:hidden">{t.s}</span><span className="hidden @2xl:inline">{t.t}</span>
              {count[t.k] ? <span className="hidden @2xl:inline rounded-full bg-eu-surface px-1.5 text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">{count[t.k]}</span> : null}
              {alert[t.k] && <span className="absolute top-1 right-1 @2xl:static size-2 rounded-full bg-eu-red" aria-label="θέλει προσοχή" />}
            </button>
          ))}
          <Link href={`/admin/customers/${id}?tab=${WORKSPACE_TAB[tab]}`} aria-label="Πλήρης καρτέλα πελάτη" className="@2xl:hidden inline-flex flex-col items-center justify-center gap-0.5 min-h-12 font-bold text-eu-blue text-[length:var(--fs-12)]"><ExternalLink className="size-4" aria-hidden />Καρτέλα</Link>
        </div>
        <Link href={`/admin/customers/${id}?tab=${WORKSPACE_TAB[tab]}`} className="hidden @2xl:inline-flex items-center gap-1 rounded-full px-3 min-h-9 font-bold text-eu-blue text-[length:var(--fs-13)] hover:bg-eu-surface">Πλήρης καρτέλα <ExternalLink className="size-3.5" aria-hidden /></Link>
      </div>
      <div role="tabpanel" className="p-2.5 min-h-24">
        {!p ? (
          data === undefined ? <span className="inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</span> : <p className="m-0 text-eu-muted">Ο πελάτης δεν βρέθηκε.</p>
        ) : tab === "overview" ? <Overview p={p} go={setTab} />
          : tab === "buys" ? <Buys p={p} />
          : tab === "requests" ? <Requests p={p} />
          : tab === "warranty" ? <Warranty p={p} />
          : tab === "loyalty" ? <Loyalty p={p} />
          : tab === "erp" ? <Erp p={p} />
          : <ActivityTab p={p} />}
      </div>
    </section>
  );
}

const Tile = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="rounded-lg bg-eu-surface/70 px-2.5 py-1.5 min-w-0"><div className="text-eu-muted text-[length:var(--fs-12)] font-bold">{label}</div><div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-16)] tabular-nums leading-tight truncate">{value}</div>{sub && <div className="text-eu-ink-3 text-[length:var(--fs-12)] truncate">{sub}</div>}</div>
);
const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="flex items-baseline justify-between gap-2"><h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">{children}</h4>{right}</div>;
const Empty = ({ children }: { children: ReactNode }) => <p className="m-0 rounded-lg bg-eu-surface/60 px-2.5 py-2 text-eu-muted text-[length:var(--fs-13)]">{children}</p>;
const Pill = ({ tone, children }: { tone: "ok" | "warn" | "bad" | "info" | "mute"; children: ReactNode }) => <span className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${{ ok: "bg-eu-green/12 text-eu-green", warn: "bg-eu-amber/15 text-eu-amber", bad: "bg-eu-red/10 text-eu-red", info: "bg-eu-chip text-eu-blue", mute: "bg-eu-surface text-eu-muted" }[tone]}`}>{children}</span>;

function Overview({ p, go }: { p: Peek; go: (t: TabKey) => void }) {
  const max = Math.max(1, ...p.byYear.map((y) => y.total));
  const addr = p.addresses[0];
  return (
    <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="grid gap-1.5 content-start text-[length:var(--fs-13)]">
        <H>Στοιχεία</H>
        <ul className="m-0 p-0 list-none grid gap-1">
          {p.type === "business" && <li className="flex gap-2"><Building2 className="size-4 mt-0.5 shrink-0 text-eu-muted" aria-hidden /><span>{p.company} · <span className="text-eu-ink-3">υπεύθυνος {p.person}</span></span></li>}
          <li className="flex gap-2 min-w-0"><Mail className="size-4 mt-0.5 shrink-0 text-eu-muted" aria-hidden /><span className="min-w-0 break-words">{p.email ? <a href={`mailto:${p.email}`} className="text-eu-blue hover:underline">{p.email}</a> : "χωρίς email"}{p.email && !p.emailVerified && <span className="text-eu-amber text-[length:var(--fs-12)] font-bold"> · μη επιβεβαιωμένο</span>}</span></li>
          <li className="flex gap-2"><Phone className="size-4 mt-0.5 shrink-0 text-eu-muted" aria-hidden /><span className="tabular-nums">{[p.mobile, p.phone].filter(Boolean).join(" · ") || "—"}</span></li>
          {addr && <li className="flex gap-2"><MapPin className="size-4 mt-0.5 shrink-0 text-eu-muted" aria-hidden /><span>{[addr.street, addr.number].filter(Boolean).join(" ")}, {addr.zip} {addr.city}{addr.region ? ` · ${addr.region}` : ""}{p.addresses.length > 1 && <span className="text-eu-muted"> (+{p.addresses.length - 1})</span>}</span></li>}
          {p.store && <li className="flex gap-2"><Store className="size-4 mt-0.5 shrink-0 text-eu-muted" aria-hidden /><span>{p.store}</span></li>}
          {(p.vat || p.doy) && <li className="flex gap-2"><FileText className="size-4 mt-0.5 shrink-0 text-eu-muted" aria-hidden /><span className="tabular-nums">ΑΦΜ {p.vat ?? "—"}{p.doy ? ` · ΔΟΥ ${p.doy}` : ""}</span></li>}
        </ul>
        <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Μέλος από {day(p.createdAt)} · πηγή {p.source}{p.lastLoginAt ? ` · τελευταία σύνδεση ${day(p.lastLoginAt)}` : " · δεν έχει συνδεθεί"}{p.birthday ? ` · γενέθλια ${new Date(p.birthday).toLocaleDateString("el-GR", { day: "numeric", month: "long" })}` : ""}</p>
        {p.notes.length > 0 && (
          <ul className="m-0 p-0 list-none grid gap-1">{p.notes.map((x) => <li key={x.id} className="flex gap-2 rounded-lg bg-eu-yellow/15 px-2.5 py-1.5 text-[length:var(--fs-13)]"><StickyNote className="size-4 shrink-0 mt-px text-eu-yellow-dark" aria-hidden /><span className="min-w-0">{x.text}</span></li>)}</ul>
        )}
      </div>
      <div className="grid gap-2 content-start">
        <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-1.5">
          <Tile label="Αξία πελάτη" value={eur(p.kpi.lifetime)} sub={`${p.kpi.count} αγορές`} />
          <Tile label="Μέση αγορά" value={p.kpi.count ? eur(p.kpi.avg) : "—"} sub={p.kpi.first ? `πρώτη ${day(p.kpi.first)}` : undefined} />
          <Tile label="Τελευταία αγορά" value={p.kpi.last ? day(p.kpi.last) : "—"} />
          <Tile label="Πόντοι" value={p.loyalty.points.toLocaleString("el-GR")} sub={p.loyalty.tier ?? undefined} />
        </div>
        <div className="grid gap-1.5">
          <H>Αγορές ανά έτος</H>
          <ul className="m-0 p-0 list-none grid grid-cols-6 gap-1.5 items-end h-20" aria-label="Αγορές ανά έτος">
            {p.byYear.map((y) => <li key={y.y} className="grid gap-1 h-full content-end text-center" title={`${y.y}: ${eur(y.total)}`}><span className="text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">{y.total ? eur(y.total).replace(" €", "") : ""}</span><span className="rounded-t-md bg-eu-blue" style={{ height: `${Math.max(y.total ? 6 : 2, (y.total / max) * 44)}px`, opacity: y.total ? 1 : 0.2 }} /><span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{y.y}</span></li>)}
          </ul>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => go("requests")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-2.5 min-h-8 text-[length:var(--fs-12)] font-bold hover:border-eu-navy"><Wrench className="size-3.5" aria-hidden /> {p.kpi.openTickets ? `${p.kpi.openTickets} ανοιχτά service` : "Χωρίς ανοιχτό service"}</button>
          <button type="button" onClick={() => go("warranty")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-2.5 min-h-8 text-[length:var(--fs-12)] font-bold hover:border-eu-navy"><ShieldCheck className="size-3.5" aria-hidden /> {p.devices.filter((d) => (d.daysLeft ?? -1) >= 0).length} σε εγγύηση / {p.devices.length} συσκευές</button>
          <button type="button" onClick={() => go("erp")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-2.5 min-h-8 text-[length:var(--fs-12)] font-bold hover:border-eu-navy"><Link2 className="size-3.5" aria-hidden /> {p.erp.trdr ? `SoftOne ${p.erp.code ?? p.erp.trdr}` : "Χωρίς SoftOne"}</button>
          {p.kpi.wishlist > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-surface px-3 min-h-9 text-[length:var(--fs-13)] font-bold text-eu-ink-3">{p.kpi.wishlist} στα αγαπημένα</span>}
        </div>
      </div>
    </div>
  );
}

const BSTATUS: Record<string, string> = { pending: "σε εξέλιξη", paid: "εξοφλημένη", unpaid: "ανεξόφλητη", cancelled: "ακυρώθηκε", issued: "εκδόθηκε", phone: "τηλεφωνική", processing: "σε επεξεργασία", shipped: "στάλθηκε", delivered: "παραδόθηκε", "ready-for-pickup": "έτοιμη για παραλαβή", completed: "ολοκληρώθηκε", failed: "απέτυχε", refunded: "επιστράφηκε", order: "παραγγελία", receipt: "απόδειξη", invoice: "τιμολόγιο", credit: "πιστωτικό" };
const SRC: Record<string, [string, "info" | "ok" | "mute"]> = { eshop: ["e-shop", "info"], softone: ["SoftOne", "ok"], nop: ["παλιό e-shop", "mute"] };
function Buys({ p }: { p: Peek }) {
  if (!p.buys.length) return <Empty>Καμία αγορά — ούτε στο e-shop ούτε στο ιστορικό του SoftOne.</Empty>;
  return (
    <div className="grid gap-2">
      <H right={<span className="text-eu-muted text-[length:var(--fs-12)]">e-shop & παραστατικά SoftOne σε ένα χρονολόγιο{p.kpi.count > p.kpi.shown ? ` · οι ${p.kpi.shown} πιο πρόσφατες` : ""}</span>}>Αγορές ({p.kpi.count}) · {eur(p.kpi.lifetime)} χωρίς ακυρωμένες</H>
      <ul className="m-0 p-0 list-none divide-y divide-eu-line rounded-xl border border-eu-line">
        {p.buys.map((b) => (
          <li key={b.id} className="grid grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[7rem_minmax(0,1fr)_auto_auto] gap-x-3 gap-y-0.5 items-center px-2.5 py-1 text-[length:var(--fs-13)]">
            <span className="text-eu-ink-3 tabular-nums text-[length:var(--fs-13)]">{day(b.date)}</span>
            <span className="row-start-2 col-span-2 @3xl:row-start-auto @3xl:col-span-1 min-w-0"><span className="font-bold text-eu-ink font-mono text-[length:var(--fs-13)]">{b.ref}</span> <span className="text-eu-ink-3 text-[length:var(--fs-13)]">· {b.lines} {b.lines === 1 ? "είδος" : "είδη"}{b.what ? ` · ${b.what}` : ""}</span></span>
            <span className="row-start-1 col-start-2 @3xl:row-start-auto @3xl:col-start-auto flex items-center gap-1.5"><Pill tone={SRC[b.src][1]}>{SRC[b.src][0]}</Pill>{b.status && <span className={`text-[length:var(--fs-12)] ${b.status === "cancelled" ? "text-eu-red" : "text-eu-muted"}`}>{BSTATUS[b.status] ?? b.status}</span>}</span>
            <span className={`hidden @3xl:block text-right font-bold tabular-nums ${b.status === "cancelled" ? "line-through text-eu-muted" : ""}`}>{eur2(b.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TICKET: Record<string, string> = { repair: "Επισκευή", installation: "Εγκατάσταση", delivery: "Παράδοση", pickup: "Παραλαβή", appointment: "Ραντεβού", "warranty-claim": "Εγγύηση" };
const TSTATUS: Record<string, [string, "ok" | "warn" | "info" | "mute"]> = { new: ["Νέο", "warn"], scheduled: ["Προγραμματισμένο", "info"], "in-progress": ["Σε εξέλιξη", "info"], "waiting-parts": ["Αναμονή ανταλλακτικών", "warn"], done: ["Ολοκληρώθηκε", "ok"], cancelled: ["Ακυρώθηκε", "mute"] };
function Requests({ p }: { p: Peek }) {
  const r = p.requests;
  if (!r.tickets.length && !r.returns.length && !r.gdpr.length && !r.reviews.length) return <Empty>Κανένα αίτημα: ούτε service, ούτε επιστροφή, ούτε GDPR, ούτε κριτική.</Empty>;
  return (
    <div className="grid gap-3 @4xl:grid-cols-2">
      <div className="grid gap-2 content-start">
        <H>Service ({r.tickets.length})</H>
        {r.tickets.length ? <ul className="m-0 p-0 list-none grid gap-1.5">{r.tickets.map((t) => { const s = TSTATUS[t.status] ?? [t.status, "mute" as const]; return (
          <li key={t.id} className="rounded-lg border border-eu-line px-2.5 py-1.5 text-[length:var(--fs-13)] grid gap-0.5">
            <span className="flex flex-wrap items-center gap-2"><b className="font-mono text-[length:var(--fs-13)]">{t.number}</b><span className="text-eu-ink-2">{TICKET[t.kind] ?? t.kind}{t.device ? ` · ${t.device}` : ""}</span><span className="ml-auto"><Pill tone={s[1]}>{s[0]}</Pill></span></span>
            <span className="text-eu-ink-3 text-[length:var(--fs-13)] line-clamp-2">{t.description}</span>
            <span className="text-eu-muted text-[length:var(--fs-12)]">{day(t.createdAt)}{t.scheduledAt ? ` · ραντεβού ${day(t.scheduledAt)}` : ""}{t.inWarranty ? " · εντός εγγύησης" : " · εκτός εγγύησης"}</span>
          </li>
        ); })}</ul> : <Empty>Κανένα αίτημα service.</Empty>}
      </div>
      <div className="grid gap-3 content-start">
        <div className="grid gap-2"><H>Επιστροφές ({r.returns.length})</H>{r.returns.length ? <ul className="m-0 p-0 list-none grid gap-1">{r.returns.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-eu-surface/70 px-2.5 py-1 text-[length:var(--fs-13)]"><Undo2 className="size-4 text-eu-muted" aria-hidden /><b className="font-mono">{x.order}</b><span className="text-eu-ink-3 flex-1 min-w-0 truncate">{x.reason}</span><Pill tone={x.status === "done" || x.status === "refunded" ? "ok" : "warn"}>{x.status}</Pill></li>)}</ul> : <Empty>Καμία επιστροφή.</Empty>}</div>
        <div className="grid gap-2"><H>GDPR ({r.gdpr.length})</H>{r.gdpr.length ? <ul className="m-0 p-0 list-none grid gap-1">{r.gdpr.map((g) => <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-eu-surface/70 px-2.5 py-1 text-[length:var(--fs-13)]"><b className="font-mono">{g.number}</b><span className="text-eu-ink-3">{g.type} · έως {day(g.dueAt)}</span><span className="ml-auto"><Pill tone={g.overdue ? "bad" : g.status === "done" ? "ok" : "warn"}>{g.overdue ? "εκπρόθεσμο" : g.status}</Pill></span></li>)}</ul> : <Empty>Κανένα αίτημα GDPR.</Empty>}</div>
        <div className="grid gap-2"><H>Κριτικές ({r.reviews.length})</H>{r.reviews.length ? <ul className="m-0 p-0 list-none grid gap-1">{r.reviews.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-eu-surface/70 px-2.5 py-1 text-[length:var(--fs-13)]"><span className="text-eu-yellow-dark font-bold" aria-label={`${x.rating} αστέρια`}>{"★".repeat(x.rating)}<span className="text-eu-line-3">{"★".repeat(5 - x.rating)}</span></span><Link href={`/proion/${x.slug}`} target="_blank" className="flex-1 min-w-0 truncate text-eu-ink-2 hover:text-eu-blue hover:underline">{x.product}</Link><Pill tone={x.status === "approved" ? "ok" : x.status === "rejected" ? "mute" : "warn"}>{x.status}</Pill></li>)}</ul> : <Empty>Καμία κριτική.</Empty>}</div>
      </div>
    </div>
  );
}

const REG: Record<string, string> = { order: "παραγγελία e-shop", erp: "SoftOne", manual: "χειροκίνητα", staff: "προσωπικό" };
function Warranty({ p }: { p: Peek }) {
  if (!p.devices.length) return <Empty>Καμία καταχωρημένη συσκευή. Οι συσκευές μπαίνουν από τις παραγγελίες, το SoftOne ή χειροκίνητα στην πλήρη καρτέλα.</Empty>;
  return (
    <div className="grid gap-2">
      <ul className="m-0 p-0 list-none grid gap-1.5 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {p.devices.map((d) => {
          const left = d.daysLeft;
          const tone = left == null ? "mute" : left < 0 ? "bad" : left <= 60 ? "warn" : "ok";
          return (
            <li key={d.id} className="rounded-lg border border-eu-line px-2.5 py-1.5 grid gap-0.5 text-[length:var(--fs-13)]">
              <span className="flex items-start gap-2"><span className="font-bold text-eu-ink leading-snug flex-1 min-w-0">{d.brand} {d.title}</span><Pill tone={tone}>{left == null ? "χωρίς εγγύηση" : left < 0 ? "έληξε" : left <= 60 ? `${left} ημέρες` : "σε εγγύηση"}</Pill></span>
              <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{[d.model, d.serial && `S/N ${d.serial}`].filter(Boolean).join(" · ") || "—"}</span>
              <span className="text-eu-muted text-[length:var(--fs-12)]">αγορά {day(d.purchasedAt)} · εγγύηση έως {day(d.extendedUntil ?? d.warrantyUntil)}{d.extendedUntil ? ` (επέκταση${d.extendedPlan ? ` ${d.extendedPlan}` : ""})` : ""} · από {REG[d.registeredBy] ?? d.registeredBy}</span>
            </li>
          );
        })}
      </ul>
      {p.extensions.length > 0 && (
        <div className="grid gap-1.5"><H>Επεκτάσεις εγγύησης</H>
          <ul className="m-0 p-0 list-none grid gap-1">{p.extensions.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-eu-surface/70 px-2.5 py-1 text-[length:var(--fs-13)]"><b className="font-mono">{x.number}</b><span className="text-eu-ink-3 flex-1 min-w-0 truncate">{x.device} · {x.months} μήνες · {eur2(x.amount)}</span><Pill tone={x.status === "paid" ? "ok" : x.status === "failed" || x.status === "cancelled" ? "bad" : "warn"}>{x.status}</Pill></li>)}</ul>
        </div>
      )}
    </div>
  );
}

const TOPIC: Record<string, string> = { newsletter: "Newsletter", offers: "Προσφορές", "price-drop": "Πτώση τιμής", "back-in-stock": "Διαθεσιμότητα", service: "Service", profiling: "Προσωποποίηση", orders: "Παραγγελίες", cookies: "Cookies" };
const REASON: Record<string, string> = { order: "Παραγγελία", review: "Κριτική", referral: "Σύσταση", birthday: "Γενέθλια", manual: "Χειροκίνητα", redeem: "Εξαργύρωση", expire: "Λήξη", erp: "SoftOne" };
function Loyalty({ p }: { p: Peek }) {
  return (
    <div className="grid gap-3 @4xl:grid-cols-2">
      <div className="grid gap-2 content-start">
        <H right={<span className="text-eu-ink-3 text-[length:var(--fs-13)]">{p.loyalty.points.toLocaleString("el-GR")} πόντοι{p.loyalty.tier ? ` · ${p.loyalty.tier}` : ""}{p.loyalty.card ? ` · κάρτα ${p.loyalty.card}` : ""}</span>}>Πόντοι</H>
        {p.loyalty.recent.length ? <ul className="m-0 p-0 list-none divide-y divide-eu-line rounded-xl border border-eu-line">{p.loyalty.recent.map((l) => <li key={l.id} className="flex items-center gap-2 px-2.5 py-1 text-[length:var(--fs-13)]"><span className="text-eu-muted tabular-nums w-24 shrink-0">{day(l.at)}</span><span className="flex-1 min-w-0 truncate text-eu-ink-2">{REASON[l.reason] ?? l.reason}{l.note ? ` · ${l.note}` : ""}</span><b className={`tabular-nums ${l.points >= 0 ? "text-eu-green" : "text-eu-red"}`}>{l.points > 0 ? "+" : ""}{l.points.toLocaleString("el-GR")}</b></li>)}</ul> : <Empty>Καμία κίνηση πόντων.</Empty>}
      </div>
      <div className="grid gap-2 content-start">
        <H>Συναινέσεις (τρέχουσα κατάσταση)</H>
        {p.consents.length ? <ul className="m-0 p-0 list-none grid gap-1">{p.consents.map((x) => <li key={`${x.topic}|${x.channel}`} className="flex items-center gap-2 rounded-lg bg-eu-surface/70 px-2.5 py-1 text-[length:var(--fs-13)]">{x.granted ? <Check className="size-4 text-eu-green" aria-hidden /> : <X className="size-4 text-eu-red" aria-hidden />}<span className="flex-1 min-w-0"><b className="text-eu-ink">{TOPIC[x.topic] ?? x.topic}</b> · {x.channel}</span><span className="text-eu-muted text-[length:var(--fs-12)]">{x.granted ? "ναι" : "όχι"} · {day(x.at)} · {x.source}</span></li>)}</ul> : <Empty>Καμία καταγεγραμμένη συναίνεση{p.newsletter ? " (στο newsletter: ναι)" : ""}.</Empty>}
      </div>
    </div>
  );
}

function Erp({ p }: { p: Peek }) {
  const e = p.erp;
  return (
    <div className="grid gap-2.5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-1.5 content-start">
        <Tile label="Σύνδεση" value={e.trdr ? "Συνδεδεμένος" : "Χωρίς σύνδεση"} sub={e.trdr ? `TRDR ${e.trdr}${e.code ? ` · ${e.code}` : ""}` : "δεν έχει καρτέλα στο SoftOne"} />
        <Tile label="Συγχρονισμός" value={e.status ?? "—"} sub={e.syncedAt ? `τελευταίος ${day(e.syncedAt)}` : undefined} />
        <Tile label="Παραστατικά SoftOne" value={e.docs.toLocaleString("el-GR")} sub="στο ιστορικό αγορών" />
        <Tile label="Σύνολο εγγραφών" value={e.docsTotal.toLocaleString("el-GR")} sub="παραστατικά & παραγγελίες" />
      </div>
      <div className="grid gap-2 content-start text-[length:var(--fs-14)]">
        {e.error && <p className="m-0 rounded-xl bg-eu-red/10 text-eu-red px-3 py-2 font-semibold">Τελευταίο σφάλμα: {e.error}</p>}
        <p className="m-0 text-eu-ink-3">Από εδώ βλέπεις μόνο. Η σύνδεση με καρτέλα SoftOne, η αναζήτηση με ΑΦΜ και ο συγχρονισμός γίνονται στην πλήρη καρτέλα του πελάτη.</p>
        <Link href={`/admin/customers/${p.id}?tab=erp`} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy px-4 min-h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-chip">Καρτέλα SoftOne του πελάτη <ExternalLink className="size-3.5" aria-hidden /></Link>
      </div>
    </div>
  );
}

const EVENT: Record<string, string> = { login: "Σύνδεση", register: "Εγγραφή", order: "Παραγγελία", consent: "Συναίνεση", profile: "Αλλαγή στοιχείων", address: "Διεύθυνση", device: "Συσκευή", ticket: "Service", loyalty: "Πόντοι", note: "Σημείωση", erp: "SoftOne", gdpr: "GDPR" };
function ActivityTab({ p }: { p: Peek }) {
  if (!p.events.length) return <Empty>Καμία καταγεγραμμένη δραστηριότητα.</Empty>;
  return (
    <ol className="m-0 p-0 list-none grid gap-0.5">
      {p.events.map((e) => (
        <li key={e.id} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 px-2 py-1 rounded-lg hover:bg-eu-surface/60 text-[length:var(--fs-13)]">
          <span className="text-eu-muted tabular-nums">{new Date(e.at).toLocaleString("el-GR", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="min-w-0 truncate"><b className="text-eu-ink">{EVENT[e.kind] ?? e.kind}</b>{e.meta ? <span className="text-eu-ink-3"> · {Object.entries(e.meta).filter(([, v]) => typeof v !== "object").slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</span> : null}</span>
        </li>
      ))}
    </ol>
  );
}
