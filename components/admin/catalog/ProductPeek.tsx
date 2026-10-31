"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutGrid, Images, ListChecks, Zap, ShoppingBag, Database, ExternalLink, Loader2, BadgePercent, AlertTriangle, CircleCheck } from "lucide-react";
import { BarChart } from "@/components/admin/charts/Charts";
import type { ProductPeek as Peek } from "@/lib/catalog/product-peek";
import { productPeekAction } from "@/app/admin/(shell)/catalog/actions";
import { SOURCES, SourceBadge, sourceOf, type SourceKey } from "./sources";
import { Channel3Mark } from "./Channel3Logo";

const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const eur2 = (v: number | null | undefined) => (v != null ? `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—");
const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const num = (v: number) => v.toLocaleString("el-GR");

// ίδια λογική με τους πελάτες: μία φόρτωση ανά προϊόν, ξεκινά ήδη στο hover του ▾
const cache = new Map<string, Promise<Peek | null>>();
export const invalidateProductPeek = (id: string) => { cache.delete(id); };
export function loadProductPeek(id: string) { let p = cache.get(id); if (!p) { p = productPeekAction(id).catch(() => { cache.delete(id); return null; }); cache.set(id, p); } return p; }

type TabKey = "overview" | "photos" | "specs" | "label" | "sales" | "erp";
const TABS: { k: TabKey; t: string; s: string; I: typeof LayoutGrid; ws: string }[] = [
  { k: "overview", t: "Επισκόπηση", s: "Σύνοψη", I: LayoutGrid, ws: "overview" },
  { k: "photos", t: "Φωτογραφίες", s: "Εικόνες", I: Images, ws: "media" },
  { k: "specs", t: "Χαρακτηριστικά", s: "Χαρακτ.", I: ListChecks, ws: "content" },
  { k: "label", t: "Ετικέτα & διαστάσεις", s: "Ετικέτα", I: Zap, ws: "dims" },
  { k: "sales", t: "Πωλήσεις & service", s: "Πωλήσεις", I: ShoppingBag, ws: "overview" },
  { k: "erp", t: "SoftOne", s: "SoftOne", I: Database, ws: "erp" },
];
const WS_OF: Record<string, string> = { media: "media", content: "content", dims: "dims", commerce: "commerce", erp: "erp" };

const Tile = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "bad" }) => (
  <div className="rounded-lg bg-eu-surface/70 px-2.5 py-1.5 min-w-0"><div className="text-eu-muted text-[length:var(--fs-12)] font-bold">{label}</div><div className={`font-heading font-extrabold text-[length:var(--fs-16)] tabular-nums leading-tight truncate ${tone === "bad" ? "text-eu-red" : tone === "warn" ? "text-eu-amber" : "text-eu-ink"}`}>{value}</div>{sub && <div className="text-eu-ink-3 text-[length:var(--fs-12)] truncate">{sub}</div>}</div>
);
const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="flex items-baseline justify-between gap-2"><h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">{children}</h4>{right}</div>;
const Empty = ({ children }: { children: ReactNode }) => <p className="m-0 rounded-lg bg-eu-surface/60 px-2.5 py-2 text-eu-muted text-[length:var(--fs-13)]">{children}</p>;
const Dl = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="m-0 grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--fs-13)]">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-eu-muted">{k}</dt><dd className="m-0 min-w-0 break-words">{v}</dd></div>)}</dl>
);

/**
 * Άνοιγμα γραμμής στη λίστα προϊόντων: καρτέλες με όλη την εικόνα του προϊόντος (Επισκόπηση, Φωτογραφίες,
 * Χαρακτηριστικά με την πηγή τους, Ενεργειακή ετικέτα & διαστάσεις, Πωλήσεις & service, SoftOne) και σύνδεσμος στην
 * αντίστοιχη καρτέλα εργασίας. Φορτώνει μία φορά ανά προϊόν.
 */
export function ProductPeek({ id, canPromo }: { id: string; canPromo: boolean }) {
  const [data, setData] = useState<Peek | null | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>("overview");
  useEffect(() => { let live = true; void loadProductPeek(id).then((d) => { if (live) setData(d); }); return () => { live = false; }; }, [id]);
  const p = data;
  const ws = TABS.find((t) => t.k === tab)!.ws;
  const count: Partial<Record<TabKey, number>> = p ? { photos: p.photoCount, specs: p.specCount, sales: p.overview.sales.docs, erp: 0 } : {};
  const alert: Partial<Record<TabKey, boolean>> = p ? { photos: p.photoCount === 0, specs: p.specCount === 0, label: (p.energyNeeded && !p.energy) || p.dimStatus === "conflict", erp: !!p.erp?.missing } : {};
  return (
    <section id={`ppeek-${id}`} data-help="catalog.peek" aria-label="Εικόνα προϊόντος" className="mx-1.5 mb-1.5 rounded-xl bg-white border border-eu-line shadow-sm overflow-hidden @container">
      <div className="grid @2xl:flex @2xl:items-center gap-1 border-b border-eu-line px-2 pt-1.5">
        <div role="tablist" aria-label="Ενότητες προϊόντος" className="grid grid-cols-3 @lg:grid-cols-6 @2xl:flex @2xl:flex-wrap gap-0.5 flex-1 min-w-0">
          {TABS.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={`relative inline-flex flex-col @2xl:flex-row items-center justify-center gap-0.5 @2xl:gap-1.5 px-1 @2xl:px-2.5 min-h-11 @2xl:min-h-9 border-b-2 -mb-px font-bold text-[length:var(--fs-12)] @2xl:text-[length:var(--fs-13)] ${tab === t.k ? "border-eu-navy text-eu-navy" : "border-transparent text-eu-ink-3 hover:text-eu-blue"}`}>
              <t.I className="size-4" aria-hidden /><span className="@2xl:hidden">{t.s}</span><span className="hidden @2xl:inline">{t.t}</span>
              {count[t.k] ? <span className="hidden @2xl:inline rounded-full bg-eu-surface px-1.5 text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">{num(count[t.k]!)}</span> : null}
              {alert[t.k] && <span className="absolute top-1 right-1 @2xl:static size-2 rounded-full bg-eu-red" aria-label="θέλει προσοχή" />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 pb-1 @2xl:pb-0">
          {p?.active && <a href={`/proion/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:bg-eu-surface">Στο site <ExternalLink className="size-3.5" aria-hidden /></a>}
          {canPromo && <Link href={`/admin/prosfores/new?products=${id}`} className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:bg-eu-surface"><BadgePercent className="size-3.5" aria-hidden /> Προσφορά</Link>}
          <Link href={`/admin/catalog/${id}?tab=${ws}`} className="inline-flex items-center gap-1 rounded-full bg-eu-chip px-3 min-h-9 font-bold text-eu-blue text-[length:var(--fs-13)] hover:bg-eu-navy hover:text-white">Πλήρης καρτέλα <ExternalLink className="size-3.5" aria-hidden /></Link>
        </div>
      </div>
      <div role="tabpanel" className="p-2.5 min-h-24">
        {!p ? (
          data === undefined ? <span className="inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</span> : <p className="m-0 text-eu-muted">Το προϊόν δεν βρέθηκε.</p>
        ) : tab === "overview" ? <Overview p={p} go={setTab} />
          : tab === "photos" ? <Photos p={p} />
          : tab === "specs" ? <Specs p={p} />
          : tab === "label" ? <LabelDims p={p} />
          : tab === "sales" ? <Sales p={p} />
          : <Erp p={p} />}
      </div>
    </section>
  );
}

function Overview({ p, go }: { p: Peek; go: (t: TabKey) => void }) {
  const s = p.overview.sales, o = p.overview.offer;
  const rate = s.units ? Math.round((s.returned / s.units) * 1000) / 10 : 0;
  return (
    <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid gap-2 content-start min-w-0">
        <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-1.5">
          <Tile label="Τεμάχια" value={num(s.units)} sub={`${num(s.last12)} σε 12 μήνες`} />
          <Tile label="Έσοδα" value={eur(s.revenue)} sub={s.units ? `μέση ${eur(s.avg)}` : "καμία πώληση"} />
          <Tile label="Τελευταία πώληση" value={day(s.last)} sub={`${num(s.customers)} πελάτες`} />
          <Tile label="Επιστροφές" value={num(s.returned)} sub={s.units ? `${rate} %` : undefined} tone={rate >= 5 ? "warn" : undefined} />
        </div>
        {p.overview.monthly.some((m) => m.units > 0) ? <BarChart labels={p.overview.monthly.map((m) => m.label)} series={[{ key: "u", label: "Τεμάχια", values: p.overview.monthly.map((m) => m.units) }]} height={130} /> : <Empty>Καμία πώληση τους τελευταίους 12 μήνες.</Empty>}
      </div>
      <div className="grid gap-2 content-start min-w-0">
        <H>Βιτρίνα</H>
        <Dl rows={[
          ["Τιμή", o && o.price < o.listPrice ? <span className="tabular-nums font-bold"><s className="text-eu-muted font-normal">{eur2(o.listPrice)}</s> <span className="text-eu-red">{eur2(o.price)}</span></span> : <b className="tabular-nums">{eur2(p.price)}</b>],
          ...(o?.promo ? [["Προσφορά", <Link key="pr" href={`/admin/prosfores/${o.promo.id}`} className="font-bold text-eu-blue hover:underline">{o.promo.name}</Link>] as [string, ReactNode]] : []),
          ["Απόθεμα", <span key="st" className={`font-bold ${p.stock > 0 ? "text-eu-green" : "text-eu-ink-3"}`}>{p.stock > 0 ? `${num(p.stock)} τεμ.` : "κατόπιν παραγγελίας"}</span>],
          ["Εγγύηση", `${p.warranty.months} μήνες · ${p.warranty.from === "softone" ? "SoftOne" : p.warranty.from === "specs" ? "χαρακτηριστικά" : "νόμιμη 2ετής"}`],
          ["Κριτικές", p.overview.reviews.count ? `★ ${p.overview.reviews.avg?.toLocaleString("el-GR", { maximumFractionDigits: 1 })} από ${p.overview.reviews.count}` : "καμία"],
        ]} />
        <H right={<span className="text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">{p.readiness.done}/{p.readiness.total}</span>}>Έτοιμο για το site</H>
        {p.readiness.missing.length ? (
          <ul className="m-0 p-0 list-none grid gap-1">{p.readiness.missing.map((m) => (
            <li key={m.label}><Link href={`/admin/catalog/${p.id}?tab=${WS_OF[m.tab] ?? "overview"}`} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[length:var(--fs-13)] font-semibold hover:underline ${m.level === "required" ? "bg-eu-red/8 text-eu-red" : "bg-eu-amber/12 text-eu-ink-2"}`}><AlertTriangle className="size-3.5 shrink-0" aria-hidden />{m.label}</Link></li>
          ))}</ul>
        ) : <p className="m-0 inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-13)]"><CircleCheck className="size-4" aria-hidden /> Όλα έτοιμα</p>}
        <button type="button" onClick={() => go("label")} className="justify-self-start text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline">Πηγές ετικέτας & διαστάσεων →</button>
      </div>
    </div>
  );
}

function Photos({ p }: { p: Peek }) {
  if (!p.photoCount) return <div className="grid gap-2"><Empty>Χωρίς φωτογραφία — δεν εμφανίζεται σωστά στο κατάστημα.</Empty><Link href={`/admin/catalog/${p.id}?tab=media`} className="justify-self-start rounded-full bg-eu-navy text-white font-bold px-4 min-h-10 inline-flex items-center text-[length:var(--fs-13)] hover:bg-eu-blue">Προσθήκη φωτογραφιών</Link></div>;
  return (
    <div className="grid gap-2">
      <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
        {p.photos.map((m, i) => (
          <li key={m.id} className="relative aspect-square rounded-lg border border-eu-line bg-white overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφίες CDN, ήδη 480px */}
            <img src={m.src} alt="" loading="lazy" className="size-full object-contain" />
            {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-eu-navy text-white font-bold px-1.5 text-[length:var(--fs-12)]">κύρια</span>}
            {m.low && <span className="absolute left-1 bottom-1 rounded-full bg-eu-red text-white font-bold px-1.5 text-[length:var(--fs-12)]">μικρή</span>}
            {m.w && m.h && <span className="absolute right-1 bottom-1 rounded bg-white/85 px-1 text-eu-ink-3 tabular-nums text-[length:var(--fs-12)]">{m.w}×{m.h}</span>}
          </li>
        ))}
      </ul>
      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">{num(p.photoCount)} φωτογραφίες{p.photoCount > p.photos.length ? ` (δείχνονται ${p.photos.length})` : ""}{p.hiddenPhotos ? ` · ${p.hiddenPhotos} κρυμμένες` : ""}{p.photoCount < 4 ? " · προτείνονται 4+" : ""}</p>
    </div>
  );
}

function Specs({ p }: { p: Peek }) {
  if (!p.specCount) return <Empty>Χωρίς χαρακτηριστικά — πρόσθεσέ τα από την περιγραφή του SoftOne ή το EPREL στην πλήρη καρτέλα.</Empty>;
  const groups = new Map<string, Peek["specs"]>();
  for (const s of p.specs) groups.set(s.groupName || "Γενικά", [...(groups.get(s.groupName || "Γενικά") ?? []), s]);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">{p.specSources.map((s) => <SourceBadge key={s.source} source={s.source} count={s.n} size="xs" />)}<span className="text-eu-muted text-[length:var(--fs-12)]">· το χρώμα δείχνει από πού ήρθε κάθε γραμμή</span></div>
      <div className="grid gap-2 @3xl:grid-cols-2">
        {[...groups].map(([g, rows]) => (
          <section key={g} className="min-w-0">
            <H>{g}</H>
            <ul className="m-0 mt-1 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line-2">
              {rows.map((s, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] gap-x-2 items-start px-2 py-1 text-[length:var(--fs-13)]">
                  <span className="text-eu-ink-3 break-words">{s.key}</span><span className="text-eu-ink font-semibold break-words">{s.value}</span>
                  {s.source === "channel3" ? <span title={sourceOf(s.source).where} className="mt-0.5 inline-flex text-eu-ink"><Channel3Mark className="size-3.5" /></span> : <span title={sourceOf(s.source).where} className={`mt-1 size-2.5 rounded-full ${sourceOf(s.source).dot}`} aria-label={sourceOf(s.source).label} />}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {p.specCount > p.specs.length && <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Δείχνονται {p.specs.length} από {num(p.specCount)} — τα υπόλοιπα στην πλήρη καρτέλα.</p>}
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 gap-y-1 text-eu-muted text-[length:var(--fs-12)]" aria-label="Υπόμνημα πηγών">{(Object.keys(SOURCES) as SourceKey[]).filter((k) => k !== "other").map((k) => <li key={k} className="inline-flex items-center gap-1"><span className={`size-2.5 rounded-full ${SOURCES[k].dot}`} aria-hidden />{SOURCES[k].label}</li>)}</ul>
    </div>
  );
}

const DIM: Record<string, [string, string]> = { match: ["ERP = EPREL", "text-eu-green"], minor: ["μικρή διαφορά", "text-eu-ink-3"], swapped: ["αντεστραμμένοι άξονες", "text-eu-amber"], conflict: ["διαφέρουν", "text-eu-red"], "erp-only": ["μόνο ERP", "text-eu-ink-3"], "eprel-only": ["μόνο EPREL", "text-eu-ink-3"] };
function LabelDims({ p }: { p: Peek }) {
  return (
    <div className="grid gap-3 @3xl:grid-cols-2">
      <section className="grid gap-1.5 content-start min-w-0">
        <H>Ενεργειακή ετικέτα</H>
        {p.energy ? (
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
            <span className="rounded-md bg-eu-green text-white font-extrabold px-2.5 py-0.5 text-[length:var(--fs-16)]">{p.energy.cls}</span>
            <SourceBadge source={p.energy.source} size="xs" />
            <span className="text-eu-muted">κλίμακα {p.energy.scale}{p.energy.eprel ? ` · EPREL ${p.energy.eprel}` : ""}</span>
            {p.energy.label && <a href={p.energy.label} target="_blank" rel="noreferrer" className="font-bold text-eu-blue hover:underline">Ετικέτα</a>}
            {p.energy.fiche && <a href={p.energy.fiche} target="_blank" rel="noreferrer" className="font-bold text-eu-blue hover:underline">Δελτίο</a>}
            {p.energy.source !== "eprel" && <span className="basis-full text-eu-amber font-bold">Όχι από EPREL — καλύτερα η επίσημη δήλωση.</span>}
          </div>
        ) : <Empty>{p.energyNeeded ? <span className="text-eu-red font-bold">Λείπει — υποχρεωτική για την κατηγορία.</span> : "Δεν απαιτείται για αυτή την κατηγορία."}</Empty>}
        <H>Εγγύηση</H>
        <p className="m-0 text-[length:var(--fs-13)]"><b className="tabular-nums">{p.warranty.months} μήνες</b> <span className="text-eu-muted">· {p.warranty.from === "softone" ? "SoftOne (GUARTIME)" : p.warranty.from === "specs" ? `χαρακτηριστικά «${p.warranty.text}»` : "νόμιμη 2ετής (καμία δήλωση)"}</span></p>
      </section>
      <section className="grid gap-1.5 content-start min-w-0">
        <H right={p.dimStatus && DIM[p.dimStatus] ? <span className={`font-bold text-[length:var(--fs-12)] ${DIM[p.dimStatus][1]}`}>{DIM[p.dimStatus][0]}</span> : null}>Διαστάσεις ανά πηγή</H>
        {p.dims.length || p.erp?.widthCm ? (
          <ul className="m-0 p-0 list-none grid gap-1">
            {p.erp?.widthCm != null && <li className="flex flex-wrap items-center gap-1.5 rounded-lg bg-eu-surface/70 px-2 py-1 text-[length:var(--fs-13)]"><span className="rounded-full bg-eu-ink/8 px-2 py-0.5 font-bold text-[length:var(--fs-12)]">Πεδία SoftOne</span><span className="tabular-nums font-bold">{p.erp.widthCm} × {p.erp.heightCm ?? "—"} × {p.erp.lengthCm ?? "—"} cm</span>{p.erp.weightKg != null && <span className="text-eu-muted">· {p.erp.weightKg} kg</span>}</li>}
            {p.dims.map((d, i) => <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-eu-surface/40 px-2 py-1 text-[length:var(--fs-13)]"><SourceBadge source={d.source} size="xs" /><span className="tabular-nums">{d.w} × {d.h} × {d.d} cm{d.kind !== "product" ? ` (${d.kind})` : ""}</span>{d.warning && <span className="text-eu-amber">· {d.warning}</span>}</li>)}
          </ul>
        ) : <Empty>Καμία διάσταση από καμία πηγή.</Empty>}
        {p.dimNote && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{p.dimNote}</p>}
        <Link href={`/admin/catalog/${p.id}?tab=dims`} className="justify-self-start text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline">Ενημέρωση διαστάσεων από το περιεχόμενο →</Link>
      </section>
    </div>
  );
}

const SRC: Record<string, [string, string]> = { eshop: ["e-shop", "bg-eu-chip text-eu-blue"], softone: ["SoftOne", "bg-eu-navy/10 text-eu-navy"], nop: ["παλιό e-shop", "bg-eu-surface text-eu-muted"] };
function Sales({ p }: { p: Peek }) {
  const o = p.overview;
  return (
    <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="grid gap-1.5 content-start min-w-0">
        <H right={<span className="text-eu-muted text-[length:var(--fs-12)]">e-shop {o.sales.eshopUnits} · SoftOne {o.sales.erpUnits} τεμ.</span>}>Τελευταίες πωλήσεις</H>
        {o.recent.length ? (
          <ul className="m-0 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line-2">{o.recent.map((r, i) => (
            <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-2 items-center px-2 py-1 text-[length:var(--fs-13)]">
              <span className="text-eu-ink-3 tabular-nums">{day(r.date)}</span>
              <span className="min-w-0 truncate">{r.customerId ? <Link href={`/admin/customers/${r.customerId}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{r.customer}</Link> : <span className="text-eu-muted">λιανική</span>} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[length:var(--fs-12)] font-bold ${SRC[r.src]?.[1] ?? ""}`}>{SRC[r.src]?.[0] ?? r.src}</span></span>
              <span className="tabular-nums text-right">{r.qty > 1 ? <b>{r.qty}× </b> : null}{eur2(r.total)}</span>
            </li>
          ))}</ul>
        ) : <Empty>Δεν έχει πουληθεί ακόμη.</Empty>}
      </section>
      <section className="grid gap-1.5 content-start min-w-0">
        <H>Μετά την πώληση</H>
        <div className="grid grid-cols-2 gap-1.5">
          <Tile label="Σε εγγύηση" value={num(o.devices.inWarranty)} sub={`από ${o.devices.total} συσκευές`} />
          <Tile label="Με επέκταση" value={num(o.devices.extended)} />
          <Tile label="Service" value={num(o.service.total)} sub={o.service.open ? `${o.service.open} ανοιχτά` : "κανένα ανοιχτό"} tone={o.service.open ? "warn" : undefined} />
          <Tile label="Ερωτήσεις" value={num(o.questions.count)} sub={o.questions.unanswered ? `${o.questions.unanswered} χωρίς απάντηση` : undefined} tone={o.questions.unanswered ? "warn" : undefined} />
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Σε {num(o.wishlist)} λίστες αγαπημένων{o.reviews.pending ? ` · ${o.reviews.pending} κριτικές για έγκριση` : ""}.</p>
      </section>
    </div>
  );
}

function Erp({ p }: { p: Peek }) {
  const e = p.erp;
  if (!e) return <Empty>Το προϊόν δεν προέρχεται από το SoftOne.</Empty>;
  const wh = e.stockByWh ? Object.entries(e.stockByWh) : [];
  return (
    <div className="grid gap-3 @3xl:grid-cols-2">
      <section className="grid gap-1.5 content-start min-w-0">
        <H right={<span className="text-eu-muted text-[length:var(--fs-12)]">συγχρ. {day(e.syncedAt)}</span>}>Είδος (MTRL {p.erpCode})</H>
        {e.missing && <p className="m-0 rounded-lg bg-eu-red/8 px-2 py-1 text-eu-red font-bold text-[length:var(--fs-13)]">Δεν βρέθηκε στον τελευταίο συγχρονισμό του SoftOne.</p>}
        <Dl rows={[
          ["Κωδικός", <span key="c" className="font-mono">{e.code}</span>],
          ["Όνομα", e.name],
          ["Barcode", <span key="b" className="font-mono">{e.barcode ?? "—"}</span>],
          ["Κωδ. εργοστασίου", <span key="f" className="font-mono">{e.factoryCode ?? "—"}</span>],
          ["Ενεργό", e.active ? <span key="a" className="text-eu-green font-bold">ναι</span> : <span key="a" className="text-eu-red font-bold">όχι</span>],
          ["Διαθεσιμότητα", e.availText ?? "—"],
          ["Εγγύηση", `${e.guaranteeMonths ? `${e.guaranteeMonths} μήνες` : "κενό GUARTIME"}${e.extWarranty ? " · με επέκταση" : ""}`],
          ["Τελ. αλλαγή ERP", day(e.s1UpdatedAt)],
        ]} />
      </section>
      <section className="grid gap-1.5 content-start min-w-0">
        <H>Τιμές & απόθεμα</H>
        <Dl rows={[
          ["Τιμή e-shop", <b key="p" className="tabular-nums">{eur2(e.eshopPrice)}</b>],
          ["Τιμή καρτέλας", <span key="r" className="tabular-nums">{eur2(e.priceRetail)}</span>],
          ["Κεντρική αποθήκη", <span key="s" className="tabular-nums">{e.stockCentral != null ? num(e.stockCentral) : "—"}</span>],
          ["Σε παραγγελία", e.onOrder ? "ναι" : "όχι"],
        ]} />
        {wh.length > 0 && <ul className="m-0 p-0 list-none flex flex-wrap gap-1">{wh.map(([k, v]) => <li key={k} className="rounded-full bg-eu-surface px-2 py-0.5 text-[length:var(--fs-12)] tabular-nums"><span className="text-eu-muted">αποθ. {k}</span> <b>{num(v)}</b></li>)}</ul>}
        <H>Κείμενα</H>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] line-clamp-3">{e.shortDesc || <span className="text-eu-muted">χωρίς σύντομη περιγραφή</span>}</p>
        <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Αναλυτική περιγραφή: {e.longDesc ? `${num(e.longDesc)} χαρακτήρες` : "κενή"}</p>
      </section>
    </div>
  );
}
