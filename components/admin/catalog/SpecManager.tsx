"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Database, EyeOff, Filter, GripVertical, Loader2, Lock, Plus, RotateCcw, Search, Store, X } from "lucide-react";
import { changeSpecAction, setSpecOrderAction, setSpecOverrideAction } from "@/app/admin/(shell)/catalog/actions";
import type { SpecGroupDetail, SpecTree } from "@/lib/catalog/spec-admin";
import type { SpecChange } from "@/lib/softone/spec-write";
import { useToast } from "./QuickActions";

type Spec = SpecGroupDetail["specs"][number];
type Can = { local: boolean; softone: boolean; softoneReason: string | null };
type Toast = { ok: boolean; text: string } | null;
const n = (v: number) => v.toLocaleString("el-GR");
const field = "w-full rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue disabled:bg-eu-surface disabled:text-eu-ink-3";
const label = "text-eu-ink-2 font-semibold text-[length:var(--fs-12)]";
const help = "text-eu-muted text-[length:var(--fs-12)] leading-snug";
const SPECIAL: Record<string, string> = { brand: "Αυτόματο: μάρκα", price: "Αυτόματο: τιμή", energy: "Αυτόματο: ενεργειακή κλάση" };
const SPECIAL_HELP: Record<string, string> = { brand: "Οι τιμές του φίλτρου βγαίνουν αυτόματα από τη μάρκα κάθε προϊόντος.", price: "Φίλτρο εύρους τιμής, υπολογίζεται αυτόματα από την τιμή.", energy: "Οι τιμές βγαίνουν αυτόματα από την ενεργειακή ετικέτα." };
/** Αλλαγή «περιεχομένου» (όνομα ή φίλτρο)· η σειρά μόνη της δεν μετρά. */
const edited = (s: Pick<Spec, "override">) => !!s.override && (!!s.override.label || typeof s.override.filter === "boolean");
/** Σειρά στο e-shop: η δική μας αν ορίστηκε, αλλιώς ο κωδικός του SoftOne. */
const rank = (s: Spec) => s.override?.sort ?? s.code;
const shopFilter = (s: Pick<Spec, "active" | "isFilter" | "override">) => s.active && (s.override?.filter ?? s.isFilter);

/**
 * «Χαρακτηριστικά» (ui-ux-pro-max: master-detail, progressive disclosure). Αριστερά οι τύποι προϊόντων (ομάδες
 * χαρακτηριστικών του SoftOne) ανά κατηγορία. Δεξιά η λίστα χαρακτηριστικών του τύπου, μόνο για ανάγνωση και σάρωση:
 * όνομα, κατάσταση, πόσα προϊόντα έχουν τιμή. Κάθε αλλαγή γίνεται σε πλαϊνό πάνελ με δύο ξεχωριστές ενότητες και ρητή
 * αποθήκευση: «Στο e-shop» (δεν αγγίζει το SoftOne) και «Στο SoftOne» (ισχύει και στο παλιό site, με επιβεβαίωση).
 */
export function SpecManager({ tree, group, can }: { tree: SpecTree; group: SpecGroupDetail | null; can: Can }) {
  const { setToast, bar } = useToast();
  return (
    <div className="@container min-w-0">
      <div className="grid gap-3 @4xl:grid-cols-[18rem_minmax(0,1fr)] items-start">
        <TypePicker tree={tree} selected={group?.id ?? null} hidden={!!group} />
        {group ? <Detail key={group.id} g={group} can={can} onToast={setToast} /> : (
          <div className="hidden @4xl:grid place-items-center gap-1 rounded-xl border border-dashed border-eu-line bg-white p-10 text-center">
            <Filter className="size-6 text-eu-muted" aria-hidden />
            <p className="m-0 font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Διάλεξε τύπο προϊόντος</p>
            <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Τα χαρακτηριστικά και τα φίλτρα του εμφανίζονται εδώ.</p>
          </div>
        )}
      </div>
      {bar}
    </div>
  );
}

/* ---------------- τύποι προϊόντων ---------------- */

function TypePicker({ tree, selected, hidden }: { tree: SpecTree; selected: number | null; hidden: boolean }) {
  const masterOfSel = tree.find((m) => m.mains.some((x) => x.groups.some((g) => g.id === selected)))?.id ?? null;
  const [master, setMaster] = useState<number | "all">(masterOfSel ?? "all");
  const [q, setQ] = useState("");
  const t = q.trim().toLocaleLowerCase("el");
  const sections = useMemo(() => tree.filter((m) => t || master === "all" || m.id === master).flatMap((m) => m.mains.map((x) => ({
    key: `${m.id}:${x.id}`, title: t || master === "all" ? `${m.name} › ${x.name}` : x.name,
    groups: x.groups.filter((g) => !t || `${g.name} ${g.code ?? ""} ${x.name} ${m.name}`.toLocaleLowerCase("el").includes(t)),
  }))).filter((s) => s.groups.length), [tree, master, t]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "center" }); }, []);
  return (
    <aside data-help="specs.tree" aria-label="Τύποι προϊόντων" className={`${hidden ? "hidden @4xl:grid" : "grid"} grid-rows-[auto_minmax(0,1fr)] rounded-xl border border-eu-line bg-white min-w-0 max-h-[75dvh] @4xl:max-h-none @4xl:sticky @4xl:top-2 @4xl:h-[calc(100dvh-7rem)] overflow-hidden`}>
      <div className="grid gap-1.5 p-2 border-b border-eu-line">
        <label className="grid gap-0.5"><span className="sr-only">Κατηγορία</span>
          <select value={String(master)} onChange={(e) => setMaster(e.target.value === "all" ? "all" : Number(e.target.value))} className={field}>
            <option value="all">Όλες οι κατηγορίες</option>
            {tree.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.mains.reduce((a, x) => a + x.groups.length, 0)})</option>)}
          </select>
        </label>
        <label className="relative"><span className="sr-only">Αναζήτηση τύπου</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση τύπου" className={`${field} pl-8`} /></label>
      </div>
      <div ref={listRef} className="overflow-y-auto overscroll-contain">
        {sections.length ? sections.map((s) => (
          <section key={s.key} aria-label={s.title}>
            <h3 className="sticky top-0 z-[1] m-0 bg-eu-surface/95 backdrop-blur px-3 py-1 font-bold text-eu-ink-3 text-[length:var(--fs-12)] truncate">{s.title}</h3>
            <ul className="m-0 p-1 list-none grid">
              {s.groups.map((g) => { const on = g.id === selected; return (
                <li key={g.id}>
                  <Link href={`?g=${g.id}`} scroll={false} aria-current={on ? "page" : undefined} className={`grid gap-0.5 rounded-lg px-2.5 py-1.5 min-h-11 ${on ? "bg-eu-navy text-white" : "hover:bg-eu-surface"} ${g.active ? "" : "opacity-60"}`}>
                    <span className="flex items-center gap-1.5 min-w-0"><span className={`truncate font-semibold text-[length:var(--fs-13)] ${on ? "" : "text-eu-ink"}`}>{g.name}</span>{g.changed > 0 && <span className={`shrink-0 rounded-full px-1.5 text-[length:var(--fs-12)] font-bold ${on ? "bg-white/20" : "bg-eu-purple/12 text-eu-purple"}`} title="αλλαγές μόνο e-shop">e-shop</span>}</span>
                    <span className={`text-[length:var(--fs-12)] tabular-nums ${on ? "text-white/80" : "text-eu-muted"}`}>{g.filters} φίλτρα · {n(g.products)} προϊόντα</span>
                  </Link>
                </li>
              ); })}
            </ul>
          </section>
        )) : <p className="m-0 p-4 text-eu-muted text-[length:var(--fs-13)]">Κανένας τύπος για «{q}».</p>}
      </div>
    </aside>
  );
}

/* ---------------- ο τύπος ---------------- */

type View = "all" | "filters" | "nofilter" | "changed" | "off";

function Detail({ g, can, onToast }: { g: SpecGroupDetail; can: Can; onToast: (t: Toast) => void }) {
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | "new" | null>(null);
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const base = useMemo(() => g.specs.filter((s) => s.active).sort((a, b) => rank(a) - rank(b) || a.code - b.code).map((s) => s.code), [g.specs]);
  const [order, setOrder] = useState<number[] | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [say, setSay] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const cur = order ?? base;
  const dirty = !!order && order.join() !== base.join();
  const custom = g.specs.some((s) => s.override?.sort != null);
  const byCode = new Map(g.specs.map((s) => [s.code, s]));
  const move = (code: number, to: number) => { const rest = cur.filter((c) => c !== code); const i = Math.max(0, Math.min(rest.length, to)); rest.splice(i, 0, code); if (rest.join() !== cur.join()) { setOrder(rest); setSay(`${byCode.get(code)?.name}: θέση ${i + 1} από ${rest.length}`); } };
  const onDragMove = (e: React.PointerEvent) => {
    if (drag == null || !listRef.current) return;
    const rest = cur.filter((c) => c !== drag);
    let to = rest.length;
    for (let i = 0; i < rest.length; i++) { const el = listRef.current.querySelector<HTMLElement>(`[data-code="${rest[i]}"]`); if (!el) continue; const r = el.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = i; break; } }
    move(drag, to);
  };
  const saveOrder = (codes: number[]) => startSave(async () => {
    await setSpecOrderAction(g.id, codes);
    setOrder(null);
    onToast({ ok: true, text: codes.length ? "Η σειρά των φίλτρων αποθηκεύτηκε στο e-shop." : "Η σειρά ακολουθεί ξανά το SoftOne." });
    router.refresh();
  });
  const counts: Record<View, number> = {
    all: g.specs.filter((s) => s.active).length,
    filters: g.specs.filter(shopFilter).length,
    nofilter: g.specs.filter((s) => s.active && !shopFilter(s)).length,
    changed: g.specs.filter(edited).length,
    off: g.specs.filter((s) => !s.active).length,
  };
  const t = q.trim().toLocaleLowerCase("el");
  const sortable = view === "all" && !t && can.local;
  const ordered = [...cur.map((c) => byCode.get(c)!).filter(Boolean), ...g.specs.filter((s) => !s.active)];
  const list = ordered.filter((s) => (view === "all" ? s.active : view === "filters" ? shopFilter(s) : view === "nofilter" ? s.active && !shopFilter(s) : view === "changed" ? edited(s) : !s.active) && (!t || `${s.name} ${s.override?.label ?? ""}`.toLocaleLowerCase("el").includes(t)));
  const max = Math.max(1, g.products);
  const current = typeof open === "number" ? g.specs.find((s) => s.code === open) ?? null : null;
  const tabs: [View, string][] = [["all", "Όλα"], ["filters", "Φίλτρα"], ["nofilter", "Χωρίς φίλτρο"], ["changed", "Αλλαγές e-shop"], ["off", "Ανενεργά"]];

  return (
    <section data-help="specs.detail" aria-labelledby="sg-h" className="grid gap-3 min-w-0">
      <header className="rounded-xl border border-eu-line bg-white overflow-hidden">
        <div className="p-3 grid gap-2">
          <Link href="?" scroll={false} className="@4xl:hidden justify-self-start inline-flex items-center gap-1 min-h-11 font-bold text-eu-blue text-[length:var(--fs-13)]"><ArrowLeft className="size-4" aria-hidden /> Όλοι οι τύποι</Link>
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="grid min-w-0">
              <span className="text-eu-muted text-[length:var(--fs-12)]">{g.path}</span>
              <h2 id="sg-h" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">{g.name}</h2>
              <span className="text-eu-muted text-[length:var(--fs-12)]">Ομάδα χαρακτηριστικών SoftOne <span className="font-mono">{g.code ?? "-"}</span> · id {g.id}{!g.active && <b className="text-eu-amber"> · ανενεργή</b>}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.shopHref && <a href={g.shopHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy"><Store className="size-4" aria-hidden /> Στο κατάστημα</a>}
              <button type="button" onClick={() => setOpen("new")} disabled={!can.softone} title={can.softoneReason ?? undefined} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-3.5 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-45"><Plus className="size-4" aria-hidden /> Νέο χαρακτηριστικό</button>
            </div>
          </div>
        </div>
        <dl className="m-0 grid grid-cols-2 @2xl:grid-cols-4 border-t border-eu-line-2 [&>div]:px-3 [&>div]:py-2 [&>div]:border-eu-line-2 [&>div:not(:last-child)]:border-r">
          {([["Χαρακτηριστικά", counts.all], ["Φίλτρα στο e-shop", counts.filters], ["Προϊόντα στο site", g.products], ["Είδη στο SoftOne", g.items]] as const).map(([k, v]) => <div key={k}><dt className="text-eu-muted text-[length:var(--fs-12)]">{k}</dt><dd className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{n(v)}</dd></div>)}
        </dl>
      </header>

      {!can.softone && <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/12 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]"><Lock className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />{can.softoneReason} Οι αλλαγές μόνο για το e-shop δουλεύουν κανονικά.</p>}

      <div data-help="specs.table" className="rounded-xl border border-eu-line bg-white overflow-clip">
        <div className="flex flex-wrap items-center gap-2 border-b border-eu-line p-2">
          <div role="tablist" aria-label="Προβολή" className="flex flex-wrap gap-0.5 rounded-lg bg-eu-surface p-0.5">
            {tabs.filter(([k]) => k === "all" || counts[k] > 0 || view === k).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`inline-flex items-center gap-1 rounded-md px-2.5 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] ${view === k ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}>{l}<span className="tabular-nums opacity-70">{counts[k]}</span></button>
            ))}
          </div>
          {custom && !dirty && <button type="button" onClick={() => saveOrder([])} disabled={!can.local || saving} aria-describedby="order-note" className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-8 font-bold text-eu-purple text-[length:var(--fs-12)] hover:bg-eu-purple/10"><RotateCcw className="size-3.5" aria-hidden /> Σειρά όπως SoftOne</button>}
          <label className="relative ml-auto w-full @2xl:w-56"><span className="sr-only">Αναζήτηση χαρακτηριστικού</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση" className={`${field} pl-8`} /></label>
        </div>
        {list.length ? (
          <ul ref={listRef} onPointerMove={onDragMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} className={`m-0 p-0 list-none divide-y divide-eu-line-2 ${drag != null ? "select-none" : ""}`}>
            {list.map((s, i) => {
              const products = s.facet?.products ?? 0, pct = Math.round((products / max) * 100);
              return (
                <li key={s.code} data-code={s.code} className={`flex items-stretch ${drag === s.code ? "relative z-[1] bg-eu-chip shadow-[var(--shadow-raised)]" : ""}`}>
                  {sortable && s.active && (
                    <button type="button" aria-label={`Μετακίνηση: ${s.name}. Σύρε ή πάτα ↑ ↓.`} title="Σύρε για να αλλάξεις τη σειρά των φίλτρων στο e-shop"
                      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(s.code); }}
                      onPointerMove={onDragMove} onPointerUp={() => setDrag(null)}
                      onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); move(s.code, cur.indexOf(s.code) + (e.key === "ArrowUp" ? -1 : 1)); requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-code="${s.code}"] [data-grip]`)?.focus()); } }}
                      data-grip className={`shrink-0 grid place-items-center w-9 touch-none text-eu-muted hover:text-eu-navy focus-visible:text-eu-navy focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-eu-blue ${drag === s.code ? "cursor-grabbing text-eu-navy" : "cursor-grab"}`}>
                      <GripVertical className="size-4" aria-hidden />
                    </button>
                  )}
                  <button type="button" onClick={() => drag == null && setOpen(s.code)} className={`flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] @2xl:grid-cols-[2rem_minmax(0,1fr)_minmax(9rem,13rem)_1rem] items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-eu-surface/60 focus-visible:bg-eu-surface focus-visible:outline-none ${s.active ? "" : "opacity-70"} ${sortable && s.active ? "pl-0" : ""}`}>
                    <span className="hidden @2xl:block font-mono text-eu-muted text-[length:var(--fs-12)] tabular-nums" title={`Κωδικός SoftOne ${s.code}`}>{s.active && view === "all" && !t ? i + 1 : s.code}</span>
                    <span className="grid gap-1 min-w-0">
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug">{s.override?.label ?? s.name}{s.override?.label && <span className="font-normal text-eu-muted text-[length:var(--fs-12)]"> (SoftOne: {s.name})</span>}</span>
                      <span className="flex flex-wrap gap-1">
                        {!s.active ? <Badge tone="amber" title="Ανενεργό στο SoftOne: δεν εμφανίζεται πουθενά.">Ανενεργό</Badge> : shopFilter(s) ? <Badge tone="navy" icon={<Filter className="size-3" aria-hidden />} title="Εμφανίζεται ως φίλτρο στο e-shop.">Φίλτρο</Badge> : <Badge tone="mute" title="Δεν εμφανίζεται ως φίλτρο στο e-shop. Υπάρχει μόνο ως χαρακτηριστικό.">Όχι φίλτρο</Badge>}
                        {s.active && !s.isView && <Badge tone="mute" icon={<EyeOff className="size-3" aria-hidden />} title="Στο παλιό site δεν φαίνεται στα χαρακτηριστικά του προϊόντος.">Κρυφό στο παλιό site</Badge>}
                        {edited(s) && <Badge tone="purple" icon={<Store className="size-3" aria-hidden />} title="Έχει δικό του όνομα ή ρύθμιση φίλτρου μόνο για το e-shop.">Αλλαγή e-shop</Badge>}
                        {s.special && <Badge tone="mute" title={SPECIAL_HELP[s.special]}>{SPECIAL[s.special]}</Badge>}
                        {s.options.length > 0 && <Badge tone="mute" title="Λίστα επιλογών στο SoftOne για αυτό το χαρακτηριστικό.">{s.options.filter((o) => o.active).length} προκαθορισμένες τιμές</Badge>}
                      </span>
                    </span>
                    <span className="hidden @2xl:grid gap-1" title={`${products} από ${g.products} προϊόντα έχουν τιμή`}>
                      {shopFilter(s) && !s.special ? <>
                        <span className="h-1.5 rounded-full bg-eu-surface overflow-hidden"><span className={`block h-full rounded-full ${pct >= 50 ? "bg-eu-green" : pct >= 15 ? "bg-eu-amber" : "bg-eu-red/70"}`} style={{ width: `${pct}%` }} /></span>
                        <span className="text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">{n(products)} προϊόντα ({pct} %) · {n(s.facet?.values ?? 0)} τιμές</span>
                      </> : <span className="text-eu-muted text-[length:var(--fs-12)]">{s.special ? "υπολογίζεται αυτόματα" : `${n(s.descLines)} γραμμές περιγραφής`}</span>}
                    </span>
                    <ChevronRight className="size-4 text-eu-muted justify-self-end" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="m-0 p-6 text-center text-eu-muted text-[length:var(--fs-13)]">{t ? `Κανένα χαρακτηριστικό για «${q}».` : "Κανένα χαρακτηριστικό σε αυτή την προβολή."}</p>}
        <p aria-live="polite" className="sr-only">{say}</p>
        {dirty && (
          <div className="sticky bottom-2 z-[2] m-2 flex flex-wrap items-center gap-2 rounded-lg border border-eu-purple/30 bg-white/95 backdrop-blur px-3 py-2 shadow-[var(--shadow-raised)]">
            <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink-2 text-[length:var(--fs-13)] mr-auto"><Store className="size-4 text-eu-purple" aria-hidden /> Νέα σειρά φίλτρων στο e-shop</span>
            <button type="button" disabled={saving} onClick={() => setOrder(null)} className="rounded-full border border-eu-line px-3.5 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]">Ακύρωση</button>
            <button type="button" disabled={saving} onClick={() => saveOrder(cur)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-purple text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση σειράς</button>
          </div>
        )}
      </div>
      <p id="order-note" className="m-0 text-eu-muted text-[length:var(--fs-12)]">Η σειρά της λίστας είναι η σειρά των φίλτρων στο e-shop: σύρε από τη λαβή (ή ↑ ↓). Κάθε προϊόν παίρνει τιμή από τη γραμμή «Όνομα : τιμή» της περιγραφής του στο SoftOne. Πάτα ένα χαρακτηριστικό για αλλαγές.</p>

      <Sheet open={open != null} onClose={() => setOpen(null)} title={open === "new" ? "Νέο χαρακτηριστικό" : current?.override?.label ?? current?.name ?? ""} sub={g.name}>
        {open === "new" ? <NewSpec g={g} onDone={(t) => { onToast(t); if (t?.ok) setOpen(null); }} />
          : current && <Inspector key={current.code} g={g} s={current} can={can} onToast={onToast} />}
      </Sheet>
    </section>
  );
}

function Badge({ tone, icon, title, children }: { tone: "navy" | "purple" | "amber" | "mute"; icon?: ReactNode; title?: string; children: ReactNode }) {
  const c = { navy: "bg-eu-navy/10 text-eu-navy", purple: "bg-eu-purple/12 text-eu-purple", amber: "bg-eu-amber/15 text-eu-ink-2", mute: "bg-eu-surface text-eu-ink-3" }[tone];
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-px font-semibold text-[length:var(--fs-12)] ${c}`}>{icon}{children}{title && <span className="sr-only">: {title}</span>}</span>;
}

/** Πλαϊνό πάνελ (native <dialog> στο top layer): δεξιά στον υπολογιστή, όλη η οθόνη στο κινητό. Esc / ✕ / κλικ έξω. */
function Sheet({ open, onClose, title, sub, children }: { open: boolean; onClose: () => void; title: string; sub: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={title}
      className="m-0 ml-auto h-dvh max-h-dvh w-full md:w-[30rem] max-w-full p-0 bg-white shadow-[var(--shadow-overlay)] backdrop:bg-eu-ink/40">
      {open && (
        <div className="grid grid-rows-[auto_minmax(0,1fr)] h-full">
          <div className="flex items-start justify-between gap-2 border-b border-eu-line px-4 py-3">
            <div className="grid min-w-0"><span className="text-eu-muted text-[length:var(--fs-12)] truncate">{sub}</span><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight">{title}</h3></div>
            <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="size-11 md:size-9 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
          </div>
          <div data-help="specs.layers" className="overflow-y-auto overscroll-contain p-4 grid gap-4 content-start">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Ενότητα του πάνελ: τίτλος με τη στρώση (χρώμα + κείμενο), εξήγηση, περιεχόμενο. */
function Panel({ layer, title, note, children }: { layer: "shop" | "s1"; title: string; note?: string; children: ReactNode }) {
  const tag = layer === "shop" ? <Badge tone="purple" icon={<Store className="size-3" aria-hidden />}>Μόνο e-shop</Badge> : <Badge tone="navy" icon={<Database className="size-3" aria-hidden />}>SoftOne</Badge>;
  return (
    <section className={`grid gap-3 rounded-xl border p-3 ${layer === "shop" ? "border-eu-purple/30" : "border-eu-navy/25"}`}>
      <div className="grid gap-0.5"><div className="flex items-center justify-between gap-2"><h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">{title}</h4>{tag}</div>{note && <p className={`m-0 ${help}`}>{note}</p>}</div>
      {children}
    </section>
  );
}

/** Διακόπτης με ετικέτα και εξήγηση (όλη η γραμμή πατιέται). */
function Toggle({ on, onChange, title, desc, disabled }: { on: boolean; onChange: (v: boolean) => void; title: string; desc?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-3 min-h-11 py-1 ${disabled ? "opacity-55" : "cursor-pointer"}`}>
      <span className="grid gap-0.5"><span className="font-semibold text-eu-ink text-[length:var(--fs-13)]">{title}</span>{desc && <span className={help}>{desc}</span>}</span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-eu-blue ${on ? "bg-eu-navy" : "bg-eu-line-2"}`}><span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} /></span>
    </label>
  );
}

/* ---------------- πάνελ χαρακτηριστικού ---------------- */

function Inspector({ g, s, can, onToast }: { g: SpecGroupDetail; s: Spec; can: Can; onToast: (t: Toast) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // στο e-shop
  const [lbl, setLbl] = useState(s.override?.label ?? "");
  const [flt, setFlt] = useState<boolean | null>(s.override?.filter ?? null);
  const shopDirty = (lbl.trim() || null) !== (s.override?.label ?? null) || flt !== (s.override?.filter ?? null);
  // στο SoftOne
  const [name, setName] = useState(s.name);
  const [isFilter, setIsFilter] = useState(s.isFilter);
  const [isView, setIsView] = useState(s.isView);
  const [active, setActive] = useState(s.active);
  const [confirm, setConfirm] = useState(false);
  const patch = { ...(name.trim() !== s.name ? { name: name.trim() } : {}), ...(isFilter !== s.isFilter ? { isFilter } : {}), ...(isView !== s.isView ? { isView } : {}), ...(active !== s.active ? { active } : {}) };
  const s1Dirty = Object.keys(patch).length > 0 && !!name.trim();
  const [opt, setOpt] = useState("");

  const saveShop = (reset = false) => start(async () => {
    await setSpecOverrideAction(g.id, s.code, reset ? { label: null, filter: null } : { label: lbl.trim() || null, filter: flt });
    if (reset) { setLbl(""); setFlt(null); }
    onToast({ ok: true, text: reset ? "Το χαρακτηριστικό ακολουθεί ξανά το SoftOne στο e-shop." : "Αποθηκεύτηκε στο e-shop. Τα φίλτρα ενημερώθηκαν." });
    router.refresh();
  });
  const s1 = (change: SpecChange, ok: string) => start(async () => {
    const r = await changeSpecAction(g.id, change);
    setConfirm(false);
    onToast(r.ok ? { ok: true, text: ok } : { ok: false, text: [r.error, ...("details" in r && r.details ? r.details : [])].join(" ") });
    if (r.ok) { setOpt(""); router.refresh(); }
  });

  // τι επηρεάζει η αλλαγή στο SoftOne, σε απλά λόγια
  const impact: ReactNode[] = [];
  if (patch.name) impact.push(<><b>{n(s.descLines)}</b> γραμμές περιγραφών γράφουν «{s.name}» και δεν θα ταιριάζουν πια{s.facet ? `: το φίλτρο χάνει τις τιμές τους (σήμερα ${n(s.facet.products)} προϊόντα)` : ""} μέχρι να αλλάξουν. Ο σύνδεσμος του φίλτρου μένει ίδιος.</>);
  if (patch.isFilter === false) impact.push(<>Το φίλτρο φεύγει από τον τύπο στο παλιό site{s.override?.filter == null ? " και στο e-shop" : ""}.</>);
  if (patch.isFilter === true) impact.push(<>Νέο φίλτρο στον τύπο{s.override?.filter === false ? " (στο e-shop μένει κρυφό λόγω αλλαγής e-shop)" : ""}.</>);
  if (patch.active === false) impact.push(<>Δεν εμφανίζεται πουθενά. Ο κωδικός {s.code} μένει και ενεργοποιείται ξανά όποτε θέλεις.</>);
  if (patch.isView != null) impact.push(<>Η προβολή αφορά το παλιό site. Το νέο e-shop δείχνει τα χαρακτηριστικά από την περιγραφή.</>);
  const nowFilter = shopFilter({ active: s.active, isFilter: s.isFilter, override: { ...s.override, filter: flt } });

  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([["Προϊόντα με τιμή", s.facet ? n(s.facet.products) : "-"], ["Διαφορετικές τιμές", s.facet ? n(s.facet.values) : "-"], ["Γραμμές περιγραφής", n(s.descLines)]] as const).map(([k, v]) => <div key={k} className="rounded-lg bg-eu-surface/70 px-2 py-1.5"><div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-16)] tabular-nums">{v}</div><div className="text-eu-muted text-[length:var(--fs-12)] leading-tight">{k}</div></div>)}
      </div>
      {s.facet && <p className={`m-0 ${help}`}>Σύνδεσμος φίλτρου στο site: <span className="font-mono text-eu-ink-3">?f_{s.facet.param}</span>{s.special ? ` · ${SPECIAL[s.special]}, οι τιμές του υπολογίζονται αυτόματα` : ""}</p>}

      <Panel layer="shop" title="Στο e-shop" note="Αλλάζει μόνο ό,τι βλέπει ο πελάτης στο νέο e-shop. Το SoftOne, το παλιό site και οι περιγραφές μένουν ίδια.">
        <fieldset disabled={!can.local || pending || !s.active} className="m-0 p-0 border-0 grid gap-3 min-w-0">
          <label className="grid gap-1"><span className={label}>Όνομα φίλτρου</span><input value={lbl} onChange={(e) => setLbl(e.target.value)} placeholder={s.name} maxLength={80} className={field} /><span className={help}>Κενό = όπως στο SoftOne.</span></label>
          <div className="grid gap-1" role="radiogroup" aria-label="Φίλτρο στο e-shop">
            <span className={label}>Φίλτρο στο e-shop</span>
            <div className="grid grid-cols-3 rounded-lg bg-eu-surface p-0.5">
              {([[null, "Όπως SoftOne"], [true, "Πάντα"], [false, "Ποτέ"]] as const).map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={flt === v} disabled={!!s.special} onClick={() => setFlt(v)} className={`rounded-md min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] disabled:opacity-50 ${flt === v ? "bg-white text-eu-purple shadow-sm" : "text-eu-ink-3 hover:text-eu-purple"}`}>{l}</button>)}
            </div>
            <span className={help}>Με αυτή την επιλογή {nowFilter ? "είναι" : "δεν είναι"} φίλτρο στο e-shop (στο SoftOne: {s.isFilter ? "ναι" : "όχι"}).</span>
          </div>
          <p className={`m-0 ${help}`}>Σειρά στα φίλτρα: σύρε τη γραμμή στη λίστα.</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {edited(s) ? <button type="button" onClick={() => saveShop(true)} className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:bg-eu-surface"><RotateCcw className="size-4" aria-hidden /> Όπως το SoftOne</button> : <span />}
            <button type="button" disabled={!shopDirty} onClick={() => saveShop()} className="inline-flex items-center gap-1.5 rounded-full bg-eu-purple text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] disabled:opacity-40">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση στο e-shop</button>
          </div>
        </fieldset>
      </Panel>

      <Panel layer="s1" title="Στο SoftOne" note="Ισχύει στο SoftOne και στο παλιό site. Πριν γραφτεί βλέπεις τι επηρεάζει.">
        <fieldset disabled={!can.softone || pending} className="m-0 p-0 border-0 grid gap-1 min-w-0">
          {!can.softone && <p className="m-0 flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)]"><Lock className="size-3.5 mt-0.5 shrink-0" aria-hidden />{can.softoneReason}</p>}
          <label className="grid gap-1 pb-1"><span className={label}>Όνομα (όπως στις περιγραφές «Όνομα : τιμή»)</span><input value={name} onChange={(e) => { setName(e.target.value); setConfirm(false); }} maxLength={100} className={field} /></label>
          <Toggle on={isFilter} onChange={(v) => { setIsFilter(v); setConfirm(false); }} disabled={!!s.special || !can.softone} title="Φίλτρο" desc="Εμφανίζεται ως φίλτρο στον τύπο." />
          <Toggle on={isView} onChange={(v) => { setIsView(v); setConfirm(false); }} disabled={!can.softone} title="Προβάλλεται" desc="Στο παλιό site, στα χαρακτηριστικά του προϊόντος." />
          <Toggle on={active} onChange={(v) => { setActive(v); setConfirm(false); }} disabled={!can.softone} title="Ενεργό" desc="Ανενεργό = κρυφό παντού. Δεν διαγράφεται ποτέ." />
          {s1Dirty && (confirm ? (
            <div role="alert" className="mt-1 grid gap-2 rounded-lg border border-eu-amber/40 bg-eu-amber/10 p-2.5">
              <p className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-amber" aria-hidden /> Θα γραφτεί στο SoftOne (παραγωγή)</p>
              <ul className="m-0 pl-4 grid gap-1 text-eu-ink-2 text-[length:var(--fs-12)]">{impact.map((l, i) => <li key={i}>{l}</li>)}<li>Διαβάζεται όλη η ομάδα, στέλνεται ολόκληρη και επαληθεύεται ότι δεν χάθηκε καμία γραμμή.</li></ul>
              <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setConfirm(false)} className="rounded-full border border-eu-line bg-white px-3.5 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]">Πίσω</button><button type="button" onClick={() => s1({ kind: "set-spec", code: s.code, patch }, "Αποθηκεύτηκε στο SoftOne και επαληθεύτηκε. Τα φίλτρα ενημερώθηκαν.")} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue">{pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Ναι, γράψε στο SoftOne</button></div>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => { setName(s.name); setIsFilter(s.isFilter); setIsView(s.isView); setActive(s.active); }} className="rounded-full px-2.5 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:bg-eu-surface">Αναίρεση</button>
              <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue">Αποθήκευση στο SoftOne…</button>
            </div>
          ))}
        </fieldset>
      </Panel>

      <Panel layer="s1" title="Προκαθορισμένες τιμές" note={s.options.length ? "Οι επιλογές του χαρακτηριστικού στο SoftOne. Αφαίρεση = ανενεργή." : "Χωρίς προκαθορισμένες τιμές: η τιμή κάθε προϊόντος έρχεται από την περιγραφή του."}>
        {s.options.length > 0 && (
          <ul className="m-0 p-0 list-none grid divide-y divide-eu-line-2 rounded-lg border border-eu-line">
            {s.options.map((o) => (
              <li key={o.code} className="px-2.5">
                <Toggle on={o.active} disabled={!can.softone || pending} onChange={(v) => s1({ kind: "set-option", code: s.code, option: o.code, patch: { active: v } }, v ? `Η τιμή «${o.name}» ενεργοποιήθηκε.` : `Η τιμή «${o.name}» απενεργοποιήθηκε.`)} title={o.name} />
              </li>
            ))}
          </ul>
        )}
        {can.softone && (
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (opt.trim()) s1({ kind: "add-option", code: s.code, name: opt.trim() }, `Η τιμή «${opt.trim()}» προστέθηκε στο SoftOne.`); }}>
            <label className="flex-1"><span className="sr-only">Νέα τιμή</span><input value={opt} onChange={(e) => setOpt(e.target.value)} placeholder="Νέα τιμή" maxLength={100} disabled={pending} className={field} /></label>
            <button disabled={!opt.trim() || pending} className="inline-flex items-center gap-1 rounded-full border border-eu-navy text-eu-navy px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-navy hover:text-white disabled:opacity-40"><Plus className="size-4" aria-hidden />Προσθήκη</button>
          </form>
        )}
      </Panel>
    </>
  );
}

function NewSpec({ g, onDone }: { g: SpecGroupDetail; onDone: (t: Toast) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(""), [isFilter, setFilter] = useState(true), [isView, setView] = useState(true);
  const dup = g.specs.some((e) => e.name.trim().toLocaleLowerCase("el") === name.trim().toLocaleLowerCase("el"));
  const submit = () => start(async () => {
    const r = await changeSpecAction(g.id, { kind: "add-spec", name: name.trim(), isFilter, isView });
    onDone(r.ok ? { ok: true, text: `Το «${name.trim()}» προστέθηκε στο SoftOne με κωδικό ${r.code}.` } : { ok: false, text: [r.error, ...("details" in r && r.details ? r.details : [])].join(" ") });
    if (r.ok) router.refresh();
  });
  return (
    <Panel layer="s1" title="Στο SoftOne" note="Μπαίνει στην ομάδα με τον επόμενο ελεύθερο κωδικό και φαίνεται και στο παλιό site.">
      <form className="grid gap-1" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !dup) submit(); }}>
        <label className="grid gap-1 pb-1"><span className={label}>Όνομα (όπως θα γράφεται στις περιγραφές «Όνομα : τιμή»)</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={field} />{dup && <span role="alert" className="text-eu-red text-[length:var(--fs-12)]">Υπάρχει ήδη χαρακτηριστικό με αυτό το όνομα.</span>}</label>
        <Toggle on={isFilter} onChange={setFilter} title="Φίλτρο" desc="Εμφανίζεται ως φίλτρο στον τύπο." />
        <Toggle on={isView} onChange={setView} title="Προβάλλεται" desc="Στο παλιό site, στα χαρακτηριστικά του προϊόντος." />
        <p className={`m-0 pt-1 ${help}`}>Τιμή παίρνει όταν η περιγραφή ενός είδους έχει γραμμή «{name.trim() || "Όνομα"} : τιμή».</p>
        <div className="flex justify-end pt-1"><button disabled={!name.trim() || dup || pending} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-40">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Προσθήκη στο SoftOne</button></div>
      </form>
    </Panel>
  );
}
