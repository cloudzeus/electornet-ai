"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BadgePercent, Check, Copy, Database, ExternalLink, FileText, Images, Loader2, MoreHorizontal, Plus, Ruler, Search, Tag, X, Zap, Minus } from "lucide-react";
import { matchEprelAction, productPromoChoicesAction, pullFromSoftone, saveProductFields, setProductPromoAction } from "@/app/admin/(shell)/catalog/actions";
import type { PromoChoice } from "@/lib/promo/quick-add";
import { ToastBar, type Toast } from "@/components/admin/customers/CustomerActions";
import { SourceBadge } from "./sources";
import { invalidateProductPeek, loadProductPeek } from "./ProductPeek";

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short" }) : null);
const input = "w-full rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";

/** Παράθυρο (native <dialog> στο top layer): τίτλος, προϊόν, κλείσιμο με Esc / ✕ / κλικ έξω. */
export function Dialog({ open, onClose, title, sub, icon, wide, children }: { open: boolean; onClose: () => void; title: string; sub?: string; icon?: ReactNode; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={title}
      className={`m-auto ${wide ? "w-[min(46rem,calc(100vw-1rem))]" : "w-[min(34rem,calc(100vw-1rem))]"} max-h-[calc(100dvh-2rem)] rounded-xl p-0 backdrop:bg-eu-ink/45 shadow-[var(--shadow-overlay)]`}>
      {open && (
        <div className="bg-white grid grid-rows-[auto_minmax(0,1fr)] max-h-[calc(100dvh-2rem)]">
          <div className="flex items-start justify-between gap-2 border-b border-eu-line px-3 py-2">
            <div className="grid min-w-0"><h3 className="m-0 inline-flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">{icon}{title}</h3>{sub && <span className="text-eu-muted text-[length:var(--fs-12)] truncate">{sub}</span>}</div>
            <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="size-11 md:size-8 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
          </div>
          <div className="overflow-y-auto p-3 grid gap-2.5 content-start">{children}</div>
        </div>
      )}
    </dialog>
  );
}

const isLive = (p: PromoChoice) => ["active", "scheduled", "paused"].includes(p.status);
const NEW = [["percent", "Έκπτωση %"], ["special", "Ειδική τιμή"], ["nplusm", "1+1 / 2+1"], ["gift", "Δώρο με αγορά"], ["service", "Δωρεάν υπηρεσία"]] as const;

/**
 * «Προσθήκη σε προσφορά»: οι ανοιχτές προσφορές με αναζήτηση και φίλτρο, και σε κάθε μία Προσθήκη / Αφαίρεση (σε ζωντανή
 * προσφορά με δεύτερο πάτημα, γιατί αλλάζει αμέσως τη βιτρίνα). Ειδική τιμή: γράφεις την τιμή του προϊόντος.
 */
export function PromoPicker({ productId, onDone }: { productId: string; onDone?: (t: Toast) => void }) {
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof productPromoChoicesAction>> | undefined>(undefined);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"live" | "in" | "all">("live");
  const [arm, setArm] = useState<string | null>(null);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Toast>(null);
  const [, start] = useTransition();
  const load = useCallback(() => { void productPromoChoicesAction(productId).then((d) => { setData(d); if (d && !d.promos.some(isLive)) setOnly("all"); }).catch(() => setData(null)); }, [productId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!arm) return; const h = setTimeout(() => setArm(null), 4000); return () => clearTimeout(h); }, [arm]);
  const list = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("el");
    return (data?.promos ?? []).filter((p) => (only === "in" ? p.inScope : only === "live" ? ["active", "scheduled", "paused"].includes(p.status) : true) && (!t || `${p.name} ${p.code} ${p.text}`.toLocaleLowerCase("el").includes(t)));
  }, [data, q, only]);
  const live = isLive;
  const act = (p: PromoChoice, remove: boolean) => {
    if (live(p) && arm !== `${p.id}:${remove}`) { setArm(`${p.id}:${remove}`); return; }
    setArm(null); setBusy(p.id); setMsg(null);
    start(async () => {
      const r = await setProductPromoAction(productId, p.id, { remove, price: p.needsPrice ? Number(String(price[p.id] ?? p.price ?? "").replace(",", ".")) : null });
      setBusy(null);
      const t = { ok: r.ok, text: r.ok ? r.message : r.error };
      setMsg(t); onDone?.(t);
      if (r.ok) { invalidateProductPeek(productId); load(); router.refresh(); }
    });
  };
  const counts = { live: (data?.promos ?? []).filter(live).length, in: (data?.promos ?? []).filter((p) => p.inScope).length, all: data?.promos.length ?? 0 };
  return (
    <div className="grid gap-2.5" data-help="product.promo-picker">
      <div className="grid gap-2 @md:flex @md:items-center">
        <label className="relative flex-1 min-w-0"><span className="sr-only">Αναζήτηση προσφοράς</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Όνομα ή κωδικός προσφοράς" className={`${input} pl-8`} /></label>
        <div role="radiogroup" aria-label="Ποιες προσφορές" className="inline-flex rounded-lg bg-eu-surface p-0.5 text-[length:var(--fs-12)] font-bold shrink-0">
          {([["live", "Ζωντανές"], ["in", "Ισχύουν ήδη"], ["all", "Όλες"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={only === k} onClick={() => setOnly(k)} className={`rounded-md px-2.5 min-h-11 md:min-h-8 ${only === k ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}>{l} <span className="tabular-nums opacity-70">{counts[k]}</span></button>)}
        </div>
      </div>
      {msg && <p role="status" className={`m-0 rounded-lg px-2.5 py-1.5 text-[length:var(--fs-13)] font-semibold ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}
      {data === undefined ? <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση προσφορών…</p>
        : !data ? <p className="m-0 text-eu-red text-[length:var(--fs-13)]">Δεν φορτώθηκαν οι προσφορές.</p>
        : data.promos.length === 0 ? (
          <div className="grid gap-2 rounded-lg bg-eu-surface/60 p-3">
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)]"><b>Δεν υπάρχει ανοιχτή προσφορά.</b> Φτιάξε νέα με το προϊόν ήδη επιλεγμένο:</p>
            <div className="flex flex-wrap gap-1.5">{NEW.map(([t, l]) => <Link key={t} href={`/admin/prosfores/new?template=${t}&products=${productId}`} className="inline-flex items-center gap-1 rounded-full bg-white border border-eu-line px-3 min-h-11 md:min-h-8 font-bold text-eu-navy text-[length:var(--fs-12)] hover:border-eu-navy"><Plus className="size-3.5" aria-hidden />{l}</Link>)}</div>
          </div>
        )
        : list.length === 0 ? <p className="m-0 rounded-lg bg-eu-surface/60 px-2.5 py-2 text-eu-muted text-[length:var(--fs-13)]">Καμία προσφορά με αυτά τα κριτήρια.</p>
        : (
          <ul className="m-0 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line-2 max-h-[min(55dvh,26rem)] overflow-y-auto">
            {list.map((p) => {
              const armedAdd = arm === `${p.id}:false`, armedRemove = arm === `${p.id}:true`;
              return (
                <li key={p.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-2.5 py-1.5 ${p.inScope ? "bg-eu-green/5" : ""}`}>
                  <div className="min-w-0 grid">
                    <span className="flex items-center gap-1.5 min-w-0"><span className={`shrink-0 rounded-full px-1.5 py-px text-[length:var(--fs-12)] font-bold ${p.tone}`}>{p.statusLabel}</span><Link href={`/admin/prosfores/${p.id}`} className="font-bold text-eu-ink text-[length:var(--fs-13)] truncate hover:text-eu-blue hover:underline">{p.name}</Link></span>
                    <span className="text-eu-muted text-[length:var(--fs-12)] truncate">{p.text}{p.endsAt ? ` · έως ${day(p.endsAt)}` : ""}{p.all ? " · όλα τα προϊόντα" : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {p.locked ? <span className="text-eu-muted text-[length:var(--fs-12)]" title={p.locked}>από τον οδηγό</span> : <>
                      {p.needsPrice && <label className="relative w-24"><span className="sr-only">Ειδική τιμή €</span><input inputMode="decimal" value={price[p.id] ?? (p.price != null ? String(p.price) : "")} onChange={(e) => setPrice((m) => ({ ...m, [p.id]: e.target.value }))} placeholder="τιμή" className={`${input} pr-6 tabular-nums text-right`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-eu-muted text-[length:var(--fs-12)]">€</span></label>}
                      {p.inScope && !p.needsPrice ? (
                        <button type="button" disabled={busy === p.id} onClick={() => act(p, true)} className={`inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] ${armedRemove ? "bg-eu-red text-white" : "text-eu-red hover:bg-eu-red/10"}`}>{busy === p.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}{armedRemove ? "Σίγουρα; αλλάζει τη βιτρίνα" : "Αφαίρεση"}</button>
                      ) : (<>
                        {p.inScope && p.needsPrice && <button type="button" disabled={busy === p.id} onClick={() => act(p, true)} aria-label={`Αφαίρεση από ${p.name}`} className={`size-11 md:size-8 grid place-items-center rounded-full ${armedRemove ? "bg-eu-red text-white" : "text-eu-red hover:bg-eu-red/10"}`}><Minus className="size-3.5" aria-hidden /></button>}
                        <button type="button" disabled={busy === p.id} onClick={() => act(p, false)} className={`inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] ${armedAdd ? "bg-eu-amber text-eu-ink" : "bg-eu-navy text-white hover:bg-eu-blue"}`}>{busy === p.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : p.inScope ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}{armedAdd ? "Σίγουρα; ζωντανή" : p.inScope ? "Νέα τιμή" : "Προσθήκη"}</button>
                      </>)}
                    </>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--fs-12)]">
        <span className="text-eu-muted">Σε ζωντανή προσφορά πατάς δύο φορές. Όπου χρειάζεται έγκριση, η αλλαγή περιμένει δεύτερο πρόσωπο.</span>
        <Link href={`/admin/prosfores/new?products=${productId}`} className="inline-flex items-center gap-1 rounded-full border border-eu-navy text-eu-navy font-bold px-3 min-h-11 md:min-h-8 hover:bg-eu-navy hover:text-white"><Plus className="size-3.5" aria-hidden /> Νέα προσφορά</Link>
      </div>
    </div>
  );
}

/** Γρήγορες διαστάσεις: τα πεδία του SoftOne και όσες βρέθηκαν στο περιεχόμενο (EPREL, περιγραφή), με αποθήκευση σε SoftOne + eshop. */
export function DimsQuick({ productId, canSave, onDone }: { productId: string; canSave: boolean; onDone?: (t: Toast) => void }) {
  const router = useRouter();
  const [peek, setPeek] = useState<Awaited<ReturnType<typeof loadProductPeek>> | undefined>(undefined);
  const [v, setV] = useState<{ w: string; h: string; d: string; kg: string }>({ w: "", h: "", d: "", kg: "" });
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Toast>(null);
  useEffect(() => {
    let live = true;
    void loadProductPeek(productId).then((p) => { if (!live) return; setPeek(p); const e = p?.erp; setV({ w: e?.widthCm != null ? String(e.widthCm) : "", h: e?.heightCm != null ? String(e.heightCm) : "", d: e?.lengthCm != null ? String(e.lengthCm) : "", kg: e?.weightKg != null ? String(e.weightKg) : "" }); });
    return () => { live = false; };
  }, [productId]);
  if (peek === undefined) return <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</p>;
  const e = peek?.erp;
  if (!e) return <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Το προϊόν δεν προέρχεται από το SoftOne, οι διαστάσεις του δεν αλλάζουν από εδώ.</p>;
  const n = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
  const eq = (a: number | null, b: number | null) => (a ?? null) === (b ?? null);
  const fields = [["widthCm", e.widthCm, n(v.w), "Πλάτος"], ["heightCm", e.heightCm, n(v.h), "Ύψος"], ["lengthCm", e.lengthCm, n(v.d), "Βάθος"], ["weightKg", e.weightKg, n(v.kg), "Βάρος"]] as const;
  const changed = fields.filter(([, a, b]) => !eq(a, b));
  const save = () => start(async () => {
    const r = await saveProductFields(productId, Object.fromEntries(changed.map(([k, a, b]) => [k, { from: a, to: b }])) as never);
    const t = { ok: r.ok, text: r.message };
    setMsg(t); onDone?.(t); setConfirm(false);
    if (r.ok) { invalidateProductPeek(productId); router.refresh(); }
  });
  const box = (k: keyof typeof v, label: string, unit: string) => (
    <label className="grid gap-0.5 min-w-0"><span className="text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">{label}</span>
      <span className="relative block"><input type="number" inputMode="decimal" step="0.1" min={0} disabled={!canSave || pending} value={v[k]} onChange={(ev) => setV((x) => ({ ...x, [k]: ev.target.value }))} className={`${input} pr-9 tabular-nums disabled:bg-eu-surface`} /><span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-eu-muted text-[length:var(--fs-12)]">{unit}</span></span>
    </label>
  );
  return (
    <div className="grid gap-2.5">
      {!canSave && <p className="m-0 rounded-lg bg-eu-surface px-2.5 py-1.5 text-eu-ink-2 text-[length:var(--fs-12)]">Μόνο ανάγνωση: η εγγραφή στο SoftOne είναι κλειστή ή λείπει δικαίωμα.</p>}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">{box("w", "Πλάτος", "εκ.")}{box("h", "Ύψος", "εκ.")}{box("d", "Βάθος", "εκ.")}{box("kg", "Βάρος", "kg")}</div>
      {peek.dims.length > 0 && (
        <ul className="m-0 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line-2">
          {peek.dims.map((c, i) => { const same = eq(n(v.w), c.w) && eq(n(v.h), c.h) && eq(n(v.d), c.d); return (
            <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-1">
              <SourceBadge source={c.source} size="xs" />
              <span className="min-w-0 grid"><b className="tabular-nums text-[length:var(--fs-13)]">{c.w} × {c.h} × {c.d}{c.kind !== "product" ? <span className="font-normal text-eu-muted"> ({c.kind})</span> : null}</b>{(c.rawValue || c.warning) && <span className="text-eu-muted text-[length:var(--fs-12)] truncate" title={`${c.rawKey ?? ""}: ${c.rawValue ?? ""}`}>{c.rawValue}{c.warning ? ` · ${c.warning}` : ""}</span>}</span>
              {same ? <span className="inline-flex items-center gap-1 text-eu-green font-bold text-[length:var(--fs-12)]"><Check className="size-3.5" aria-hidden />ίδιες</span> : canSave && <button type="button" onClick={() => setV((x) => ({ ...x, w: String(c.w), h: String(c.h), d: String(c.d) }))} className="rounded-full border border-eu-navy text-eu-navy font-bold px-2.5 min-h-11 md:min-h-8 text-[length:var(--fs-12)] hover:bg-eu-navy hover:text-white">Χρήση αυτών</button>}
            </li>
          ); })}
        </ul>
      )}
      {msg && <p role="status" className={`m-0 rounded-lg px-2.5 py-1.5 text-[length:var(--fs-13)] font-semibold ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}
      {canSave && changed.length > 0 && (confirm ? (
        <div className="grid gap-1.5 rounded-lg border border-eu-amber/40 bg-eu-amber/10 p-2.5">
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)]">Θα γραφτούν στο SoftOne (παραγωγή) και αμέσως στο e-shop: {changed.map(([, a, b, l]) => `${l} ${a ?? "-"} → ${b ?? "-"}`).join(", ")}.</p>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-4 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-60">{pending && <Loader2 className="size-4 animate-spin" aria-hidden />}{pending ? "Γράφω στο SoftOne…" : "Ναι, αποθήκευση"}</button><button type="button" disabled={pending} onClick={() => setConfirm(false)} className="rounded-full border border-eu-line px-3.5 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]">Πίσω</button></div>
        </div>
      ) : <button type="button" onClick={() => setConfirm(true)} className="justify-self-end inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-4 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-blue">Αποθήκευση σε SoftOne + eshop ({changed.length})</button>)}
    </div>
  );
}

export type RowCan = { promo: boolean; write: boolean; erpSave: boolean };
export type RowCtx = { id: string; title: string; slug: string | null; active: boolean; sku: string; ean: string | null; erpCode: string; fromS1: boolean; energyNeeded: boolean };

/**
 * Μενού ⋯ μιας γραμμής προϊόντος: γρήγορες ενέργειες σε παράθυρο (προσφορά, διαστάσεις), EPREL και SoftOne με ένα
 * πάτημα, άνοιγμα της σωστής καρτέλας εργασίας, αντιγραφή κωδικών. Ανοίγει πάνω από τον πίνακα· ↑ ↓ Esc.
 */
export function ProductRowActions({ r, can, onToast }: { r: RowCtx; can: RowCan; onToast: (t: Toast) => void }) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const [dlg, setDlg] = useState<"promo" | "dims" | null>(null);
  const [busy, start] = useTransition();
  const setToast = onToast;
  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    const out = (e: Event) => { if (e instanceof KeyboardEvent) { if (e.key === "Escape") { close(); btn.current?.focus(); } return; } if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const gone = () => close();
    document.addEventListener("mousedown", out); document.addEventListener("keydown", out); window.addEventListener("resize", gone); window.addEventListener("scroll", gone, true);
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", out); window.removeEventListener("resize", gone); window.removeEventListener("scroll", gone, true); };
  }, [pos]);
  const keyNav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const run = (f: () => Promise<{ ok: boolean; text: string }>) => { close(); start(async () => { const t = await f(); setToast(t); if (t.ok) { invalidateProductPeek(r.id); router.refresh(); } }); };
  const item = "w-full flex items-center gap-2.5 rounded-md px-2 min-h-11 md:min-h-8 text-left text-[length:var(--fs-13)] hover:bg-eu-surface focus-visible:bg-eu-surface outline-none disabled:opacity-40";
  const head = "px-2 pt-1.5 pb-0.5 font-bold text-eu-muted text-[length:var(--fs-12)]";
  const ws = (tab: string) => `/admin/catalog/${r.id}?tab=${tab}`;
  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={!!pos} aria-label={`Ενέργειες: ${r.title}`} onClick={() => { if (pos) return close(); const b = btn.current!.getBoundingClientRect(); const up = b.bottom + 420 > window.innerHeight && b.top > 420; setPos({ top: up ? b.top - 4 : b.bottom + 4, right: window.innerWidth - b.right, up }); }}
        className={`size-11 md:size-8 grid place-items-center rounded-full ${pos ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy"}`}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreHorizontal className="size-4" aria-hidden />}
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" aria-label={`Ενέργειες: ${r.title}`} onKeyDown={keyNav} className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] max-h-[min(70dvh,30rem)] overflow-y-auto rounded-lg border border-eu-line bg-white p-1 shadow-[var(--shadow-raised)] grid" style={{ ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }), right: Math.max(8, pos.right) }}>
          <span className={head}>Γρήγορα</span>
          {can.promo && <button type="button" role="menuitem" onClick={() => { close(); setDlg("promo"); }} className={item}><BadgePercent className="size-4 text-eu-blue" aria-hidden />Προσθήκη σε προσφορά…</button>}
          {r.fromS1 && <button type="button" role="menuitem" onClick={() => { close(); setDlg("dims"); }} className={item}><Ruler className="size-4 text-eu-blue" aria-hidden />Διαστάσεις & βάρος…</button>}
          {can.write && r.energyNeeded && <button type="button" role="menuitem" onClick={() => run(async () => { const x = await matchEprelAction(r.id); return x.ok ? { ok: x.status === "matched", text: x.status === "matched" ? `Βρέθηκε στο EPREL (${x.registrationNumber}). Ετικέτα, χαρακτηριστικά και διαστάσεις ενημερώθηκαν.` : x.status === "ambiguous" ? "Πολλά πιθανά μοντέλα στο EPREL: διάλεξε από τη σελίδα EPREL." : "Δεν βρέθηκε στο EPREL." } : { ok: false, text: x.error }; })} className={item}><Zap className="size-4 text-eu-green" aria-hidden />Αναζήτηση στο EPREL</button>}
          {can.write && r.fromS1 && <button type="button" role="menuitem" onClick={() => run(async () => { const x = await pullFromSoftone(r.id); return { ok: x.ok, text: x.message }; })} className={item}><Database className="size-4 text-eu-navy" aria-hidden />Ενημέρωση από SoftOne</button>}
          <div className="border-t border-eu-line-2 my-1" />
          <span className={head}>Άνοιγμα</span>
          <Link role="menuitem" href={ws("overview")} onClick={close} className={item}><ExternalLink className="size-4 text-eu-muted" aria-hidden />Καρτέλα προϊόντος</Link>
          <Link role="menuitem" href={ws("media")} onClick={close} className={item}><Images className="size-4 text-eu-muted" aria-hidden />Φωτογραφίες & βίντεο</Link>
          <Link role="menuitem" href={ws("content")} onClick={close} className={item}><FileText className="size-4 text-eu-muted" aria-hidden />Κείμενα & χαρακτηριστικά</Link>
          <Link role="menuitem" href={ws("commerce")} onClick={close} className={item}><Tag className="size-4 text-eu-muted" aria-hidden />Τιμή, προσφορές, stickers</Link>
          {r.active && r.slug && <a role="menuitem" href={`/proion/${r.slug}`} target="_blank" rel="noreferrer" onClick={close} className={item}><ExternalLink className="size-4 text-eu-muted" aria-hidden />Στο site (νέα καρτέλα)</a>}
          <div className="border-t border-eu-line-2 my-1" />
          {[["Κωδικός", r.sku], ["EAN", r.ean], ["MTRL", r.erpCode]].filter((x): x is [string, string] => !!x[1]).map(([l, val]) => (
            <button key={l} type="button" role="menuitem" onClick={() => { close(); void navigator.clipboard?.writeText(val); setToast({ ok: true, text: `Αντιγράφηκε ${l}: ${val}` }); }} className={item}><Copy className="size-4 text-eu-muted" aria-hidden />{l}<span className="ml-auto font-mono text-eu-muted text-[length:var(--fs-12)] truncate">{val}</span></button>
          ))}
        </div>,
        document.body,
      )}
      <Dialog open={dlg === "promo"} onClose={() => setDlg(null)} title="Προσθήκη σε προσφορά" sub={r.title} icon={<BadgePercent className="size-4 text-eu-blue" aria-hidden />} wide>
        <div className="@container"><PromoPicker productId={r.id} onDone={setToast} /></div>
      </Dialog>
      <Dialog open={dlg === "dims"} onClose={() => setDlg(null)} title="Διαστάσεις & βάρος" sub={r.title} icon={<Ruler className="size-4 text-eu-blue" aria-hidden />}>
        <div className="@container"><DimsQuick productId={r.id} canSave={can.erpSave} onDone={setToast} /></div>
      </Dialog>
    </>
  );
}

/** Ένα μήνυμα αποτελέσματος για όλο τον πίνακα (όχι ένα ανά γραμμή). */
export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const close = useCallback(() => setToast(null), []);
  return { toast, setToast, bar: <ToastBar t={toast} onClose={close} /> };
}
