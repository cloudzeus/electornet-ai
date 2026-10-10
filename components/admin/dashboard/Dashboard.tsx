"use client";

import Link from "next/link";
import { createElement, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BadgeCheck, BarChart3, Box, Check, CircleAlert, Cpu, CreditCard, Database, EyeOff, FilePen, GalleryHorizontal, GripVertical, Heart, History, Info,
  LayoutGrid, Loader2, Mail, Megaphone, MoreHorizontal, PackageSearch, Pause, Percent, Pin, PinOff, Play, Plus, RefreshCw, RotateCcw, ShieldCheck, ShoppingCart, Sparkles,
  Stamp, Store, TrendingDown, TrendingUp, Truck, UserCog, Users, Wrench, X, Zap, type LucideIcon,
} from "lucide-react";
import { HOME_TAB, TABS, WIDGETS, widgetDef, type DashItem, type DashLayout, type TabId, type Tone, type WidgetData, type WidgetSize } from "@/lib/dashboard/catalog";
import { resetDashboardAction, resetRoleDashboardAction, saveDashboardAction, saveRoleDashboardAction } from "@/app/admin/(shell)/dashboard-actions";

const ICON: Record<string, LucideIcon> = {
  stamp: Stamp, "shopping-cart": ShoppingCart, truck: Truck, store: Store, wrench: Wrench, shield: ShieldCheck, "credit-card": CreditCard, "trending-up": TrendingUp, "bar-chart": BarChart3,
  percent: Percent, megaphone: Megaphone, users: Users, "badge-check": BadgeCheck, "package-search": PackageSearch, "file-pen": FilePen, gallery: GalleryHorizontal, box: Box, heart: Heart,
  sparkles: Sparkles, refresh: RefreshCw, mail: Mail, cpu: Cpu, database: Database, history: History, "user-cog": UserCog, zap: Zap,
};
const ico = (name: string, className: string) => createElement(ICON[name] ?? LayoutGrid, { className, "aria-hidden": true });
/** τόνοι: χρώμα ΚΑΙ σχήμα/κείμενο — ποτέ μόνο χρώμα */
const DOT: Record<Tone, string> = { ok: "bg-eu-green", warn: "bg-eu-amber", bad: "bg-eu-red", info: "bg-eu-blue", muted: "bg-eu-line" };
const FILL: Record<Tone, string> = { ok: "bg-eu-green", warn: "bg-eu-amber", bad: "bg-eu-red", info: "bg-eu-blue", muted: "bg-eu-muted/40" };
const CHIP: Record<Tone, string> = { ok: "bg-eu-green/10 text-eu-green", warn: "bg-eu-amber/20 text-eu-ink", bad: "bg-eu-red/10 text-eu-red", info: "bg-eu-chip text-eu-blue", muted: "bg-eu-surface text-eu-muted" };
/** πλέγμα: 1 · 2 (≥36rem) · 3 (≥56rem) · 4 (≥72rem) στήλες· μικρό = 1, διπλό = 2, πλήρες = όλες */
const SPAN: Record<WidgetSize, string> = { s: "", m: "@xl:col-span-2", l: "col-span-full" };
const SIZE_LABEL: Record<WidgetSize, string> = { s: "Μικρό", m: "Διπλό", l: "Όλο το πλάτος" };
type WorkTab = Exclude<TabId, "overview">;

type QuickLink = { href: string; label: string };
type Props = {
  name: string; roleLabel: string; storeName: string | null;
  layout: DashLayout; data: Record<string, WidgetData | null>; allowed: string[]; quick: QuickLink[];
  source: "user" | "role" | "code";
  roleEdit: { role: string; label: string } | null;
  roles: { key: string; label: string }[] | null;
};

/**
 * Ο πανόπτης: καρτέλες (Επισκόπηση = όσα καρφίτσωσες· μία καρτέλα ανά περιοχή), πυκνές κάρτες με γραφήματα,
 * σύρσιμο πάντα ενεργό (πάνω σε κάρτα = σειρά · πάνω σε καρτέλα = μεταφορά · πάνω στην Επισκόπηση = καρφίτσωμα).
 */
export function Dashboard({ name, roleLabel, storeName, layout: initial, data, allowed, quick, source, roleEdit, roles }: Props) {
  const router = useRouter();
  const [layout, setLayout] = useState<DashLayout>(initial);
  const latest = useRef(layout);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tab, setTabRaw] = useState<TabId>("overview");
  const [drag, setDrag] = useState<{ id: string; from: TabId; over: { tab: TabId; index: number } | null; overTab: TabId | null } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  const [auto, setAuto] = useState(true);
  const [stamp, setStamp] = useState(() => new Date());
  const [saving, startSave] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  // νέα δεδομένα από τον server → ώρα ενημέρωσης· η διάταξη ακολουθεί τον server μόνο όταν δεν εκκρεμεί αποθήκευση
  const [seen, setSeen] = useState(data);
  if (seen !== data) { setSeen(data); setStamp(new Date()); if (!saving && !roleEdit) setLayout(initial); }

  // τελευταία καρτέλα (για αυτόν τον browser) ή από το #hash
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    let t: string | null = TABS.some((x) => x.id === fromHash) ? fromHash : null;
    try { t ??= localStorage.getItem("admin.dash.tab"); } catch { /* ιδιωτική περιήγηση */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- η καρτέλα ζει μόνο στον browser
    if (t && TABS.some((x) => x.id === t)) setTabRaw(t as TabId);
  }, []);
  const setTab = (t: TabId) => { setTabRaw(t); setMenu(null); try { localStorage.setItem("admin.dash.tab", t); } catch { /* — */ } history.replaceState(null, "", `#${t}`); };

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);
  useEffect(() => {
    if (!auto || drag) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    return () => clearInterval(t);
  }, [auto, drag, refresh]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** κάθε αλλαγή του χρήστη: νέα διάταξη + αποθήκευση (όχι στην προεπιλογή ρόλου: εκεί με το κουμπί) */
  const update = (fn: (l: DashLayout) => void, thenRefresh = false) => {
    const next = structuredClone(latest.current);
    fn(next);
    latest.current = next;
    setLayout(next);
    if (roleEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; startSave(async () => { await saveDashboardAction(latest.current); if (thenRefresh) router.refresh(); }); }, thenRefresh ? 0 : 500);
  };
  const listOf = (l: DashLayout, t: TabId): DashItem[] => (t === "overview" ? l.pinned : l.tabs.find((x) => x.id === t)!.items);
  const tabOf = (l: DashLayout, id: string): WorkTab => l.tabs.find((t) => t.items.some((x) => x.id === id))?.id ?? HOME_TAB[id];
  const isPinned = (id: string) => layout.pinned.some((x) => x.id === id);

  const place = (id: string, from: TabId, to: TabId, index: number) => update((l) => {
    const src = listOf(l, from);
    const i = src.findIndex((x) => x.id === id);
    const item = i >= 0 ? src[i] : { id };
    if (to === "overview") {
      // καρφίτσωμα (ή αλλαγή σειράς στην Επισκόπηση)· η κάρτα μένει και στην καρτέλα της
      const p = l.pinned; const j = p.findIndex((x) => x.id === id);
      const it = j >= 0 ? p.splice(j, 1)[0] : { id, size: item.size };
      p.splice(Math.max(0, Math.min(p.length, j >= 0 && j < index ? index - 1 : index)), 0, it);
      return;
    }
    if (from === "overview") l.pinned = l.pinned.filter((x) => x.id !== id);
    // από καρτέλα σε καρτέλα (ή σειρά μέσα στην ίδια)
    for (const t of l.tabs) { const k = t.items.findIndex((x) => x.id === id); if (k >= 0) { t.items.splice(k, 1); if (t.id === to && k < index) index--; } }
    const dst = l.tabs.find((t) => t.id === to)!.items;
    dst.splice(Math.max(0, Math.min(dst.length, index)), 0, from === "overview" ? { id } : item);
    l.hidden = l.hidden.filter((x) => x !== id);
  });
  const togglePin = (id: string) => update((l) => { if (l.pinned.some((x) => x.id === id)) l.pinned = l.pinned.filter((x) => x.id !== id); else l.pinned.push({ id }); });
  const resize = (id: string, size: WidgetSize) => update((l) => { for (const list of [l.pinned, ...l.tabs.map((t) => t.items)]) for (const x of list) if (x.id === id) { if (size === widgetDef(id)!.size) delete x.size; else x.size = size; } });
  const hide = (id: string) => update((l) => { l.pinned = l.pinned.filter((x) => x.id !== id); for (const t of l.tabs) t.items = t.items.filter((x) => x.id !== id); if (!l.hidden.includes(id)) l.hidden.push(id); });
  const show = (id: string) => { const to = tab; setLibrary(false); update((l) => { l.hidden = l.hidden.filter((x) => x !== id); const home = to === "overview" ? HOME_TAB[id] : to; if (!l.tabs.some((x) => x.items.some((y) => y.id === id))) l.tabs.find((x) => x.id === home)!.items.push({ id }); if (to === "overview" && !l.pinned.some((x) => x.id === id)) l.pinned.push({ id }); }, !(id in data)); };
  const nudge = (id: string, d: -1 | 1) => { const list = listOf(latest.current, tab); const i = list.findIndex((x) => x.id === id); if (i + d < 0 || i + d >= list.length) return; place(id, tab, tab, d > 0 ? i + 2 : i - 1); };

  // σήματα ανά καρτέλα: πόσα θέλουν ενέργεια (κόκκινο ή πορτοκαλί)
  const urgent = (id: string) => { const b = data[id]?.badge; return b && (b.tone === "bad" || b.tone === "warn") ? b : null; };
  const tabAlerts = (t: TabId) => listOf(layout, t).filter((x) => urgent(x.id)).length;
  const items = listOf(layout, tab);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Καλημέρα" : hour < 18 ? "Καλησπέρα" : "Καλό βράδυ";

  const saveRole = () => startSave(async () => { setMsg(await saveRoleDashboardAction(roleEdit!.role, latest.current)); });
  const resetRole = () => { if (!window.confirm(`Επαναφορά της προεπιλογής του ρόλου «${roleEdit!.label}»;`)) return; startSave(async () => { setMsg(await resetRoleDashboardAction(roleEdit!.role)); router.refresh(); }); };
  const resetMine = () => { if (!window.confirm("Να γυρίσει το dashboard σου στην προεπιλογή του ρόλου σου;")) return; startSave(async () => { setMsg(await resetDashboardAction()); router.refresh(); }); };
  const dropOnTab = (t: TabId) => { if (drag) { place(drag.id, drag.from, t, listOf(latest.current, t).length); if (t !== "overview") setTab(t); } setDrag(null); };

  return (
    <div className="grid gap-3 min-w-0" onClick={() => setMenu(null)}>
      {/* ---- κεφαλίδα: σύντομη ---- */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">{roleEdit ? `Dashboard ρόλου «${roleEdit.label}»` : `${hello}, ${name.split(" ")[0]}`}</h2>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{roleEdit ? "Ισχύει για όσους έχουν αυτόν τον ρόλο και δεν έχουν δική τους διάταξη." : <>{roleLabel}{storeName ? ` · ${storeName}` : ""}{source === "user" ? " · δική σου διάταξη" : ""}</>}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-full border border-eu-line bg-white pl-3 pr-0.5 h-10 text-eu-muted text-[length:var(--fs-13)]">
            {refreshing && <Loader2 className="size-3.5 mr-1 animate-spin" aria-hidden />}
            <span aria-live="polite" suppressHydrationWarning>{stamp.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}</span>
            <button type="button" onClick={refresh} aria-label="Ανανέωση τώρα" title="Ανανέωση τώρα" className="size-9 grid place-items-center rounded-full hover:bg-eu-surface"><RefreshCw className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => setAuto((v) => !v)} aria-pressed={auto} aria-label={auto ? "Παύση αυτόματης ανανέωσης" : "Αυτόματη ανανέωση κάθε λεπτό"} title={auto ? "Ανανεώνεται μόνο του κάθε λεπτό" : "Χωρίς αυτόματη ανανέωση"} className="size-9 grid place-items-center rounded-full hover:bg-eu-surface">{auto ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}</button>
          </span>
          <button type="button" onClick={() => setLibrary(true)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-3 h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Κάρτες</button>
          {roles && !roleEdit && (
            <select aria-label="Σχεδίαση dashboard ρόλου" defaultValue="" onChange={(e) => { if (e.target.value) router.push(`/admin?role=${e.target.value}`); }} className="rounded-full border-2 border-eu-line bg-white px-3 h-10 font-bold text-eu-ink-2 text-[length:var(--fs-13)]">
              <option value="">Σχεδίαση για ρόλο…</option>
              {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          )}
          {roleEdit ? (
            <>
              <button type="button" onClick={resetRole} disabled={saving} title="Αρχική προεπιλογή του ρόλου" className="inline-flex items-center gap-1.5 rounded-full px-3 h-10 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-white"><RotateCcw className="size-4" aria-hidden /> Αρχική</button>
              <button type="button" onClick={saveRole} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 h-10 font-extrabold text-[length:var(--fs-14)] hover:bg-eu-blue">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση για τον ρόλο</button>
              <Link href="/admin" className="inline-flex items-center rounded-full border-2 border-eu-line px-3 h-10 font-bold text-[length:var(--fs-13)] hover:border-eu-navy">Το δικό μου</Link>
            </>
          ) : source === "user" && <button type="button" onClick={resetMine} disabled={saving} title="Γύρνα στην προεπιλογή του ρόλου σου" className="inline-flex items-center gap-1.5 rounded-full px-3 h-10 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-white"><RotateCcw className="size-4" aria-hidden /> Προεπιλογή</button>}
        </div>
      </header>
      {msg && <p role="status" className={`m-0 flex items-center gap-2 rounded-xl px-3 py-1.5 font-bold text-[length:var(--fs-13)] ${msg.ok ? "bg-eu-green/10 text-eu-ink-2" : "bg-eu-red/10 text-eu-red"}`}>{msg.ok ? <Check className="size-4 text-eu-green" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}{msg.message}<button type="button" onClick={() => setMsg(null)} aria-label="Κλείσιμο" className="ml-auto size-8 grid place-items-center rounded-full hover:bg-white/60"><X className="size-4" aria-hidden /></button></p>}

      {/* ---- καρτέλες (και στόχοι για σύρσιμο) ---- */}
      <div role="tablist" aria-label="Περιοχές" className="sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-eu-surface/95 backdrop-blur flex flex-wrap gap-1"
        onKeyDown={(e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; const i = TABS.findIndex((t) => t.id === tab); const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]; setTab(n.id); document.getElementById(`tab-${n.id}`)?.focus(); }}>
        {TABS.map((t) => {
          const n = tabAlerts(t.id), count = listOf(layout, t.id).length, on = tab === t.id, over = drag?.overTab === t.id;
          return (
            <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={on} aria-controls="dash-panel" tabIndex={on ? 0 : -1} title={t.help} onClick={() => setTab(t.id)}
              onDragOver={(e) => { if (!drag || (drag.from === t.id && t.id !== "overview")) return; e.preventDefault(); if (drag.overTab !== t.id) setDrag({ ...drag, overTab: t.id, over: null }); }}
              onDragLeave={() => { if (drag?.overTab === t.id) setDrag({ ...drag, overTab: null }); }}
              onDrop={(e) => { e.preventDefault(); dropOnTab(t.id); }}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-10 font-bold text-[length:var(--fs-14)] whitespace-nowrap transition-colors ${over ? "ring-2 ring-eu-blue bg-eu-chip text-eu-navy" : on ? "bg-eu-navy text-white" : "text-eu-ink-2 hover:bg-white"}`}>
              {t.id === "overview" && <Pin className="size-3.5" aria-hidden />}{t.title}
              <span className={`tabular-nums text-[length:var(--fs-13)] ${on ? "text-white/70" : "text-eu-muted"}`}>{count}</span>
              {n > 0 && <span className={`min-w-5 h-5 px-1 rounded-full grid place-items-center text-[length:var(--fs-12)] font-extrabold ${on ? "bg-white text-eu-red" : "bg-eu-red text-white"}`} aria-label={`${n} θέλουν ενέργεια`}>{n}</span>}
            </button>
          );
        })}
      </div>

      {/* ---- κάρτες της καρτέλας ---- */}
      <div id="dash-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="@container min-w-0">
        <p className="m-0 mb-2 text-eu-muted text-[length:var(--fs-13)]">{TABS.find((t) => t.id === tab)!.help}{drag ? "" : " · Σύρε μια κάρτα από τη λαβή για να αλλάξεις σειρά ή να τη στείλεις σε άλλη καρτέλα."}</p>
        <ol className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4 grid-flow-row-dense gap-2.5 items-stretch"
          onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (e.target === e.currentTarget && (drag.over?.tab !== tab || drag.over.index !== items.length)) setDrag({ ...drag, overTab: null, over: { tab, index: items.length } }); }}
          onDrop={(e) => { e.preventDefault(); if (drag) place(drag.id, drag.from, tab, drag.over?.tab === tab ? drag.over.index : items.length); setDrag(null); }}>
          {items.map((it, i) => {
            const w = widgetDef(it.id)!;
            const size = it.size ?? w.size;
            const marker = drag && drag.id !== it.id && drag.over?.tab === tab && drag.over.index === i;
            return (
              <li key={it.id} id={`w-${it.id}`} className={`relative min-w-0 ${SPAN[size]} ${drag?.id === it.id ? "opacity-40" : ""}`}
                onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const idx = e.clientX - r.left < r.width / 2 ? i : i + 1; if (drag.over?.tab !== tab || drag.over.index !== idx || drag.overTab) setDrag({ ...drag, overTab: null, over: { tab, index: idx } }); }}>
                {marker && <span aria-hidden className="absolute -left-1.5 inset-y-1 w-1 rounded-full bg-eu-blue z-10" />}
                {drag && drag.id !== it.id && drag.over?.tab === tab && drag.over.index === i + 1 && i === items.length - 1 && <span aria-hidden className="absolute -right-1.5 inset-y-1 w-1 rounded-full bg-eu-blue z-10" />}
                <Card def={w} data={data[it.id]} size={size} quick={quick} pinned={isPinned(it.id)} menuOpen={menu === it.id}
                  onDragStart={() => setDrag({ id: it.id, from: tab, over: null, overTab: null })} onDragEnd={() => setDrag(null)}
                  onPin={() => togglePin(it.id)} onMenu={() => setMenu((m) => (m === it.id ? null : it.id))}
                  menu={
                    <div role="menu" onClick={(e) => e.stopPropagation()} className="absolute right-0 top-9 z-30 w-60 rounded-xl border border-eu-line bg-white p-1.5 shadow-[var(--shadow-overlay)] grid gap-1">
                      <span className="px-2 pt-1 text-eu-muted text-[length:var(--fs-12)] font-bold uppercase tracking-wide">Μέγεθος</span>
                      <div role="radiogroup" aria-label="Μέγεθος" className="grid grid-cols-3 gap-1">
                        {(["s", "m", "l"] as const).map((sz) => <button key={sz} type="button" role="radio" aria-checked={size === sz} onClick={() => resize(it.id, sz)} className={`min-h-9 px-1 rounded-lg font-bold text-[length:var(--fs-13)] leading-tight ${size === sz ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip"}`}>{SIZE_LABEL[sz]}</button>)}
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => nudge(it.id, -1)} disabled={i === 0} className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-lg hover:bg-eu-surface disabled:opacity-30 font-bold text-[length:var(--fs-13)]"><ArrowLeft className="size-4" aria-hidden /> Νωρίτερα</button>
                        <button type="button" onClick={() => nudge(it.id, 1)} disabled={i === items.length - 1} className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-lg hover:bg-eu-surface disabled:opacity-30 font-bold text-[length:var(--fs-13)]">Αργότερα <ArrowRight className="size-4" aria-hidden /></button>
                      </div>
                      {tab !== "overview" && (
                        <label className="grid gap-0.5 px-1">
                          <span className="text-eu-muted text-[length:var(--fs-12)] font-bold uppercase tracking-wide">Μετακίνηση σε</span>
                          <select value={tabOf(layout, it.id)} onChange={(e) => { place(it.id, tab, e.target.value as WorkTab, Number.MAX_SAFE_INTEGER); setMenu(null); }} className="h-9 rounded-lg border border-eu-line bg-white px-2 text-[length:var(--fs-13)] font-bold">
                            {TABS.filter((t) => t.id !== "overview").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                          </select>
                        </label>
                      )}
                      <button type="button" onClick={() => { hide(it.id); setMenu(null); }} className="inline-flex items-center gap-2 h-9 px-2 rounded-lg text-eu-red hover:bg-eu-red/10 font-bold text-[length:var(--fs-13)]"><EyeOff className="size-4" aria-hidden /> Απόκρυψη κάρτας</button>
                    </div>
                  } />
              </li>
            );
          })}
          {!items.length && (
            <li className="col-span-full rounded-2xl border-2 border-dashed border-eu-line p-6 text-center text-eu-muted text-[length:var(--fs-14)]">
              {tab === "overview" ? <>Δεν έχεις καρφιτσώσει κάρτες. Πάτα την καρφίτσα σε μια κάρτα ή σύρε την πάνω στην «Επισκόπηση».</> : <>Καμία κάρτα εδώ — πάτα «Κάρτες» για προσθήκη.</>}
            </li>
          )}
        </ol>
      </div>

      {library && <Library current={tab} layout={layout} allowed={allowed} onShow={show} onPin={togglePin} onClose={() => setLibrary(false)} />}
    </div>
  );
}

/* ---------------- μία κάρτα ---------------- */
function Card({ def, data: d, size, quick, pinned, menuOpen, menu, onDragStart, onDragEnd, onPin, onMenu }: {
  def: (typeof WIDGETS)[number]; data: WidgetData | null | undefined; size: WidgetSize; quick: QuickLink[]; pinned: boolean; menuOpen: boolean; menu: React.ReactNode;
  onDragStart: () => void; onDragEnd: () => void; onPin: () => void; onMenu: () => void;
}) {
  const bad = d?.badge?.tone === "bad";
  return (
    <article aria-labelledby={`wt-${def.id}`} className={`group relative h-full rounded-xl border bg-white grid grid-rows-[auto_1fr_auto] ${bad ? "border-eu-red/40" : "border-eu-line"} hover:border-eu-blue/40 transition-colors`}>
      <header className="flex items-center gap-1 pl-1 pr-1 pt-1">
        <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", def.id); onDragStart(); }} onDragEnd={onDragEnd} title="Σύρε: σειρά, άλλη καρτέλα ή Επισκόπηση" aria-hidden className="size-8 shrink-0 grid place-items-center rounded-lg cursor-grab active:cursor-grabbing text-eu-muted/60 group-hover:text-eu-muted hover:bg-eu-surface"><GripVertical className="size-4" /></span>
        <span className="size-7 shrink-0 grid place-items-center rounded-lg bg-eu-chip text-eu-blue">{ico(def.icon, "size-4")}</span>
        <h3 id={`wt-${def.id}`} className="m-0 ml-1 min-w-0 flex-1 font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight truncate" title={def.title}>{def.title}</h3>
        {d?.badge && <span className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 h-6 font-extrabold text-[length:var(--fs-12)] tabular-nums ${CHIP[d.badge.tone]}`}>{bad && <CircleAlert className="size-3" aria-hidden />}{d.badge.n || "!"}</span>}
        <span className="relative shrink-0 inline-flex">
          <button type="button" aria-label={`Τι δείχνει: ${def.help}`} title={def.help} className="size-8 grid place-items-center rounded-lg text-eu-muted hover:bg-eu-surface"><Info className="size-4" aria-hidden /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onPin(); }} aria-pressed={pinned} aria-label={pinned ? `Ξεκαρφίτσωμα: ${def.title}` : `Καρφίτσωμα στην Επισκόπηση: ${def.title}`} title={pinned ? "Καρφιτσωμένη στην Επισκόπηση" : "Καρφίτσωμα στην Επισκόπηση"} className={`size-8 grid place-items-center rounded-lg hover:bg-eu-surface ${pinned ? "text-eu-navy" : "text-eu-muted"}`}>{pinned ? <Pin className="size-4 fill-current" aria-hidden /> : <PinOff className="size-4" aria-hidden />}</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onMenu(); }} aria-expanded={menuOpen} aria-haspopup="menu" aria-label={`Ρυθμίσεις κάρτας: ${def.title}`} className="size-8 grid place-items-center rounded-lg text-eu-muted hover:bg-eu-surface"><MoreHorizontal className="size-4" aria-hidden /></button>
          {menuOpen && menu}
        </span>
      </header>
      <div className="px-3 pb-2.5 pt-1.5 grid gap-2 content-start min-w-0">
        {d === undefined ? <Skeleton /> : def.id === "quick" ? <QuickLinks links={quick} /> : !d ? <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Δεν υπάρχουν δεδομένα.</p> : d.error ? (
          <p className="m-0 flex items-start gap-1.5 rounded-lg bg-eu-red/10 px-2 py-1.5 text-eu-red text-[length:var(--fs-13)]"><CircleAlert className="size-4 mt-px shrink-0" aria-hidden /><span><b>Δεν φόρτωσε:</b> {d.error}</span></p>
        ) : <Body d={d} size={size} />}
      </div>
      {d?.href && !d.error ? (
        <Link href={d.href} className="flex items-center justify-between gap-2 border-t border-eu-line px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-13)] hover:bg-eu-surface rounded-b-xl">{d.hrefLabel ?? "Άνοιγμα"}{d.total && d.rows && d.total > d.rows.length ? <span className="ml-auto text-eu-muted font-semibold">όλα τα {d.total.toLocaleString("el-GR")}</span> : null}<ArrowRight className="size-4 shrink-0" aria-hidden /></Link>
      ) : <span />}
    </article>
  );
}

function Body({ d, size }: { d: WidgetData; size: WidgetSize }) {
  const rows = size === "s" ? d.rows?.slice(0, 4) : d.rows;
  return (
    <>
      {(d.headline || d.series) && (
        <div className="flex items-end gap-3 min-w-0">
          {d.headline && (
            <div className="grid gap-0.5 min-w-0 shrink-0">
              <span className="font-heading font-extrabold text-eu-navy text-[length:var(--fs-24)] leading-none tabular-nums">{d.headline.value}</span>
              <span className="text-eu-muted text-[length:var(--fs-12)] leading-tight">{d.headline.label}</span>
              {d.headline.delta && <span className={`inline-flex items-center gap-0.5 font-bold text-[length:var(--fs-12)] ${d.headline.delta.dir === "flat" ? "text-eu-muted" : d.headline.delta.good ? "text-eu-green" : "text-eu-red"}`}>{d.headline.delta.dir === "up" ? <TrendingUp className="size-3.5" aria-hidden /> : d.headline.delta.dir === "down" ? <TrendingDown className="size-3.5" aria-hidden /> : null}{d.headline.delta.text}</span>}
            </div>
          )}
          {d.series && d.series.length > 1 && <Spark series={d.series} />}
        </div>
      )}
      {d.bars && d.bars.length > 0 && <Bars bars={d.bars} />}
      {d.parts && d.parts.some((p) => p.value) && <Parts parts={d.parts} />}
      {d.stats && d.stats.length > 0 && (
        <dl className="m-0 grid grid-cols-2 @lg:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
          {d.stats.map((s) => {
            const inner = (
              <>
                <dd className={`m-0 inline-flex items-center gap-1 font-bold text-[length:var(--fs-16)] leading-none tabular-nums ${s.tone === "bad" ? "text-eu-red" : "text-eu-ink"}`}>{s.tone && s.tone !== "muted" && <span className={`size-1.5 rounded-full ${DOT[s.tone]}`} aria-hidden />}{s.value}{s.tone === "bad" && <span className="sr-only"> (θέλει προσοχή)</span>}</dd>
                <dt className="text-eu-muted text-[length:var(--fs-12)] leading-tight">{s.label}</dt>
                {s.of ? <span className="h-1 rounded-full bg-eu-line overflow-hidden" aria-hidden><span className={`block h-full rounded-full ${FILL[s.tone ?? "info"]}`} style={{ width: `${Math.min(100, Math.max(s.n ? 2 : 0, ((s.n ?? 0) / s.of) * 100))}%` }} /></span> : null}
              </>
            );
            return s.href
              ? <Link key={s.label} href={s.href} className="grid gap-1 content-start rounded-lg bg-eu-surface/70 px-2 py-1.5 hover:bg-eu-chip">{inner}</Link>
              : <div key={s.label} className="grid gap-1 content-start rounded-lg bg-eu-surface/70 px-2 py-1.5">{inner}</div>;
          })}
        </dl>
      )}
      {rows && rows.length > 0 ? (
        <ul className="m-0 p-0 list-none grid divide-y divide-eu-line">
          {rows.map((r, k) => {
            const inner = (
              <>
                <span className={`size-1.5 mt-1.5 shrink-0 rounded-full ${DOT[r.tone ?? "muted"]}`} aria-hidden />
                <span className="grid min-w-0 flex-1"><span className="font-semibold text-eu-ink text-[length:var(--fs-13)] leading-snug truncate" title={r.title}>{r.title}</span>{r.sub && <span className={`text-[length:var(--fs-12)] leading-snug truncate ${r.tone === "bad" ? "text-eu-red" : "text-eu-muted"}`} title={r.sub}>{r.sub}</span>}</span>
                {r.meta && <span className={`shrink-0 text-[length:var(--fs-12)] tabular-nums ${r.tone === "bad" ? "text-eu-red font-bold" : "text-eu-muted"}`}>{r.meta}</span>}
              </>
            );
            return <li key={k}>{r.href ? <Link href={r.href} className="flex items-start gap-2 py-1.5 min-h-10 hover:bg-eu-surface/60 rounded">{inner}</Link> : <div className="flex items-start gap-2 py-1.5">{inner}</div>}</li>;
          })}
        </ul>
      ) : d.empty && !d.bars?.length && !d.series ? (d.emptyTone === "warn"
        ? <p className="m-0 flex items-start gap-1.5 rounded-lg bg-eu-amber/15 px-2 py-1.5 text-eu-ink-2 font-bold text-[length:var(--fs-13)]"><Info className="size-4 mt-px shrink-0" aria-hidden />{d.empty}</p>
        : <p className="m-0 inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-13)]"><Check className="size-4" aria-hidden />{d.empty}</p>) : null}
      {d.note && size !== "s" && <p className="m-0 text-eu-muted text-[length:var(--fs-12)] leading-snug">{d.note}</p>}
    </>
  );
}

/** Μικρή καμπύλη τάσης (γραμμή 2px + απαλή περιοχή), η τελευταία τιμή τονισμένη· λίστα για αναγνώστες οθόνης. */
function Spark({ series }: { series: NonNullable<WidgetData["series"]> }) {
  const W = 160, H = 40, P = 3;
  const max = Math.max(...series.map((s) => s.value), 1);
  const x = (i: number) => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  return (
    <figure className="m-0 flex-1 min-w-0 grid gap-0.5">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-10" aria-hidden>
        <path d={`${line} L${x(series.length - 1)},${H - P} L${x(0)},${H - P} Z`} className="fill-eu-blue/10" />
        <path d={line} fill="none" className="stroke-eu-blue" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(series.length - 1)} cy={y(last.value)} r={3} className="fill-eu-navy stroke-white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {series.map((s, i) => <rect key={i} x={x(i) - W / series.length / 2} y={0} width={W / series.length} height={H} fill="transparent"><title>{`${s.label}: ${s.display}`}</title></rect>)}
      </svg>
      <span className="flex justify-between text-eu-muted text-[length:var(--fs-12)] tabular-nums" aria-hidden><span>{series[0].label}</span><span>{last.label}</span></span>
      <figcaption className="sr-only"><ul>{series.map((s, i) => <li key={i}>{s.label}: {s.display}</li>)}</ul></figcaption>
    </figure>
  );
}

/** Ραβδόγραμμα μίας σειράς: λεπτές μπάρες με στρογγυλή κορυφή και κενό 2px, η μέγιστη τονισμένη. */
function Bars({ bars }: { bars: NonNullable<WidgetData["bars"]> }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const top = bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0]);
  return (
    <figure className="m-0 grid gap-1">
      <div className="relative h-20 flex items-end gap-[2px] border-b border-eu-line" aria-hidden>
        {bars.map((b, i) => (
          <div key={i} className="group/bar relative flex-1 h-full flex items-end" title={`${b.label}: ${b.display}`}>
            <div className={`w-full rounded-t-[4px] ${b === top && b.value ? "bg-eu-navy" : "bg-eu-blue/50"} group-hover/bar:bg-eu-navy`} style={{ height: `${b.value ? Math.max(4, (b.value / max) * 100) : 2}%` }} />
          </div>
        ))}
        {top.value > 0 && <span className="absolute right-0 -top-0.5 text-eu-muted text-[length:var(--fs-12)] tabular-nums">μέγ. {top.value}</span>}
      </div>
      <div className="flex justify-between text-eu-muted text-[length:var(--fs-12)] tabular-nums" aria-hidden><span>{bars[0].label}</span><span>{bars[bars.length - 1].label}</span></div>
      <figcaption className="sr-only"><ul>{bars.map((b, i) => <li key={i}>{b.label}: {b.display}</li>)}</ul></figcaption>
    </figure>
  );
}

/** Κατανομή σε μία ράβδο (κενό 2px ανάμεσα), με υπόμνημα που γράφει και τον αριθμό — όχι μόνο χρώμα. */
function Parts({ parts }: { parts: NonNullable<WidgetData["parts"]> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <figure className="m-0 grid gap-1">
      <div className="flex h-2.5 gap-[2px] rounded-full overflow-hidden" aria-hidden>
        {parts.filter((p) => p.value).map((p) => <span key={p.label} className={FILL[p.tone]} style={{ flex: p.value }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--fs-12)] text-eu-ink-2">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1"><span className={`size-2 rounded-sm ${FILL[p.tone]}`} aria-hidden />{p.label} <b className="tabular-nums">{p.value}</b><span className="text-eu-muted tabular-nums">({total ? Math.round((p.value / total) * 100) : 0}%)</span></span>)}
      </figcaption>
    </figure>
  );
}

function QuickLinks({ links }: { links: QuickLink[] }) {
  return <div className="flex flex-wrap gap-1">{links.map((i) => <Link key={i.href} href={i.href} className="rounded-full bg-eu-surface text-eu-navy font-bold text-[length:var(--fs-12)] px-2.5 min-h-8 inline-flex items-center hover:bg-eu-navy hover:text-white transition-colors">{i.label}</Link>)}</div>;
}

function Skeleton() {
  return <div className="grid gap-1.5 animate-pulse motion-reduce:animate-none" aria-label="Φόρτωση"><div className="h-6 w-1/3 rounded bg-eu-surface" /><div className="h-10 rounded-lg bg-eu-surface" /></div>;
}

/* ---------------- βιβλιοθήκη καρτών ---------------- */
function Library({ current, layout, allowed, onShow, onPin, onClose }: { current: TabId; layout: DashLayout; allowed: string[]; onShow: (id: string) => void; onPin: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const where = useMemo(() => new Map(layout.tabs.flatMap((t) => t.items.map((x) => [x.id, t.id] as const))), [layout]);
  const pinned = new Set(layout.pinned.map((x) => x.id));
  const groups = [...new Set(WIDGETS.map((w) => w.category))].map((c) => ({ c, items: WIDGETS.filter((w) => w.category === c && allowed.includes(w.id)) })).filter((g) => g.items.length);
  const tabTitle = (id: string) => TABS.find((t) => t.id === id)?.title ?? id;
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-label="Κάρτες" className="m-auto w-[min(56rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] rounded-2xl p-0 backdrop:bg-black/50 bg-white @container">
      <div className="grid grid-rows-[auto_minmax(0,1fr)] max-h-[calc(100dvh-1rem)]">
        <div className="flex items-center gap-2 px-4 min-h-14 border-b border-eu-line">
          <div className="flex-1 min-w-0"><h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Κάρτες</h2><p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Όλες όσες επιτρέπει ο ρόλος σου. Πάτα μια κρυφή για να εμφανιστεί {current === "overview" ? "και να καρφιτσωθεί" : `στην καρτέλα «${tabTitle(current)}»`}.</p></div>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="overflow-y-auto p-4 grid gap-4">
          {groups.map((g) => (
            <section key={g.c} className="grid gap-1.5">
              <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">{g.c}</h3>
              <div className="grid grid-cols-1 @xl:grid-cols-2 gap-1.5">
                {g.items.map((w) => {
                  const tab = where.get(w.id);
                  return (
                    <div key={w.id} className="flex items-center gap-2.5 rounded-xl border border-eu-line p-2">
                      <span className="size-8 shrink-0 grid place-items-center rounded-lg bg-eu-chip text-eu-blue">{ico(w.icon, "size-4")}</span>
                      <span className="grid min-w-0 flex-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{w.title}</span><span className="text-eu-muted text-[length:var(--fs-12)] leading-snug line-clamp-2">{tab ? `Στην καρτέλα «${tabTitle(tab)}»` : "Κρυφή"} · {w.help}</span></span>
                      {tab ? (
                        <button type="button" onClick={() => onPin(w.id)} aria-pressed={pinned.has(w.id)} aria-label={pinned.has(w.id) ? `Ξεκαρφίτσωμα: ${w.title}` : `Καρφίτσωμα: ${w.title}`} title={pinned.has(w.id) ? "Ξεκαρφίτσωμα" : "Καρφίτσωμα στην Επισκόπηση"} className={`shrink-0 size-10 grid place-items-center rounded-lg hover:bg-eu-surface ${pinned.has(w.id) ? "text-eu-navy" : "text-eu-muted"}`}>{pinned.has(w.id) ? <Pin className="size-4 fill-current" aria-hidden /> : <PinOff className="size-4" aria-hidden />}</button>
                      ) : <button type="button" onClick={() => onShow(w.id)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-eu-navy text-white px-3 h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Εμφάνιση</button>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
