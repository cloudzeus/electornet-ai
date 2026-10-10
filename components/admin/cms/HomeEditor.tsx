"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, BookOpen, CalendarClock, Check, ChevronDown, CircleAlert, Copy, ExternalLink, Eye, EyeOff, GalleryHorizontal,
  GripVertical, History, Image as ImageIcon, Keyboard, LayoutGrid, Loader2, Mail, Megaphone, MoreHorizontal, Newspaper,
  Package, Percent, Plus, QrCode, Redo2, Rocket, Send, Sparkles, Store, Trash2, Undo2, Wrench, X, type LucideIcon,
} from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { normalizeHomeDoc, sectionDef, type HomeDoc, type HomeSectionId } from "@/lib/cms/home-sections";
import { blkKey, diffHome, flatten, rebuild, revertChange, stable, type HomeChange, type HomeItem } from "@/lib/cms/home-diff";
import type { HomeHealth } from "@/lib/cms/home-health";
import type { HomeReview } from "@/lib/cms/home-plans";
import { homeHealthAction, publishHomeAction, revertHomeAction, saveHomeAction } from "@/app/admin/(shell)/cms/home/actions";
import { HistoryDialog, KeysDialog, PlansDialog, PublishDialog, ShareDialog, type Noun } from "./EditorDialogs";
import { AddDialog, BLOCK_ICON, ico, LivePreview, RightSwitch, useFocusText, visSummary, VisibilityForm, type Vis } from "./EditorKit";
import { clearReviewAction, plansAction, saveScenarioAction, submitReviewAction, type PlanRef } from "@/app/admin/(shell)/cms/plans-actions";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { ResultBanner } from "@/components/admin/settings/ui";
import { PickerBrand } from "./brand/ImagePicker";
import { BLOCK_INFO, BlockFields, newBlock } from "./brand/BlockEditors";
import { SectionFields } from "./HomeSectionFields";
import { HomeCatalog, type CatOption } from "./CategoryCellsField";
import { HomeLiveInfo, HomeProductInfo, HomeRefresh, type HomeLive } from "./HomeInfoFields";
import { HomeServices, type ServiceOption } from "./ServiceCellsField";
import { HomeLists, type OrderOption } from "./OrderToggleField";

/* ---------------- μοντέλο: μία ενιαία λίστα (ενότητες + components) — βλ. lib/cms/home-diff ---------------- */
type Item = HomeItem;

/* ---------------- εικονίδια & περιγραφές ---------------- */
const SECTION_ICON: Record<HomeSectionId, LucideIcon> = { hero: GalleryHorizontal, ticker: Megaphone, categories: LayoutGrid, deals: Percent, campaigns: Sparkles, services: Wrench, stores: Store, guides: BookOpen, news: Newspaper, "ad-strip": ImageIcon, newsletter: Mail };
const itemIcon = (it: Item) => (it.kind === "section" ? SECTION_ICON[it.s.id] : BLOCK_ICON[it.b.type] ?? Package);
const itemName = (it: Item) => (it.kind === "section" ? sectionDef(it.s.id)!.label : `${BLOCK_INFO[it.b.type].label}${it.b.title ? ` · ${it.b.title}` : ""}`);
const visOf = (it: Item): Vis => (it.kind === "section" ? it.s : it.b);
/* ---------------- editor ---------------- */
const PLAN: PlanRef = { kind: "home" };
const NOUN: Noun = { the: "η αρχική", of: "της αρχικής", order: "Νέα σειρά ενοτήτων" };
type Dialog = "publish" | "plans" | "history" | "share" | "keys" | null;
export type HomePlansInfo = { review: HomeReview | null; scheduled: { name: string; publishAt: string }[] };
const whenShort = (iso: string) => new Date(iso).toLocaleString("el-GR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");

export function HomeEditor({ initial, published: pub, savedAt: initSavedAt, info: initInfo, canWrite, canPublish, categories, live, services, lists, health: initHealth, plans: initPlans, me }: { initial: HomeDoc; published: HomeDoc | null; savedAt: string | null; info: Record<string, PickProduct>; canWrite: boolean; canPublish: boolean; categories: CatOption[]; live: HomeLive; services: ServiceOption[]; lists: Record<string, { options: OrderOption[]; defaults: string[] }>; health: HomeHealth; plans: HomePlansInfo; me: string }) {
  const router = useRouter();
  const [doc, setDocRaw] = useState<HomeDoc>(initial);
  const [past, setPast] = useState<HomeDoc[]>([]);
  const [future, setFuture] = useState<HomeDoc[]>([]);
  const lastPush = useRef<{ tag: string; at: number }>({ tag: "", at: 0 });
  const [info, setInfo] = useState(initInfo);
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [savedAt, setSavedAt] = useState(initSavedAt);
  const [published, setPublished] = useState<HomeDoc | null>(pub);
  const [selected, setSelected] = useState<string | null>(null);
  const [right, setRight] = useState<"settings" | "preview">("settings");
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"s" | "m" | "l">("s");
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // s: κινητό/tablet (ρυθμίσεις μέσα στη λίστα) · m: χάρτης + ρυθμίσεις ή προεπισκόπηση · l: χάρτης + ρυθμίσεις + προεπισκόπηση
    const ro = new ResizeObserver(([e]) => { const w = e.contentRect.width; setMode(w >= 1180 ? "l" : w >= 900 ? "m" : "s"); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [adding, setAdding] = useState<{ after: string | null } | null>(null);
  const [view, setView] = useState<"page" | "preview">("page");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pv, setPv] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: Issue[] } | null>(null);
  const [drag, setDrag] = useState<{ from: string; over: number | null } | null>(null);
  const [busy, start] = useTransition();
  const [health, setHealth] = useState<HomeHealth>(initHealth);
  const [review, setReview] = useState<HomeReview | null>(initPlans.review);
  const [scheduled, setScheduled] = useState(initPlans.scheduled);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [focusText, setFocusText] = useState<{ text: string; n: number } | null>(null);
  const [more, setMore] = useState(false);
  const latest = useRef(doc);
  const savedJson = useRef(stable(initial));
  const onInfo = useCallback((list: PickProduct[]) => setInfo((x) => ({ ...x, ...Object.fromEntries(list.map((p) => [p.id, p])) })), []);

  /** Κάθε αλλαγή περνά από εδώ: ιστορικό αναίρεσης (οι συνεχόμενες πληκτρολογήσεις στο ίδιο πεδίο = ένα βήμα). */
  const update = useCallback((fn: (d: HomeDoc) => HomeDoc, tag = "") => {
    if (!canWrite) return;
    setDocRaw((d) => {
      const next = fn(d);
      const now = Date.now();
      if (!(tag && tag === lastPush.current.tag && now - lastPush.current.at < 1500)) { setPast((p) => [...p.slice(-49), d]); setFuture([]); }
      lastPush.current = { tag, at: now };
      return next;
    });
  }, [canWrite]);
  const undo = useCallback(() => setPast((p) => { if (!p.length) return p; const prev = p[p.length - 1]; setFuture((f) => [latest.current, ...f]); setDocRaw(prev); lastPush.current = { tag: "", at: 0 }; return p.slice(0, -1); }), []);
  const redo = useCallback(() => setFuture((f) => { if (!f.length) return f; const nx = f[0]; setPast((p) => [...p, latest.current]); setDocRaw(nx); lastPush.current = { tag: "", at: 0 }; return f.slice(1); }), []);

  // αυτόματη αποθήκευση του πρόχειρου· μετά, έλεγχος ποιες ζώνες βγαίνουν κενές
  const flush = useCallback(async () => {
    setSave("saving");
    const r = await saveHomeAction(latest.current);
    if (!r.ok) { setSave("error"); return false; }
    savedJson.current = stable(latest.current);
    setSave("idle"); setSavedAt(r.at!); setPv((v) => v + 1);
    void homeHealthAction(latest.current).then(setHealth).catch(() => null);
    return true;
  }, []);
  useEffect(() => {
    latest.current = doc;
    if (!canWrite || stable(doc) === savedJson.current) return;
    const t0 = setTimeout(() => setSave("pending"), 0);
    const t = setTimeout(() => { void flush(); }, 1000);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [doc, flush, canWrite]);
  useEffect(() => {
    if (save === "idle") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  const items = useMemo(() => flatten(doc), [doc]);
  const idx = (key: string) => items.findIndex((x) => x.key === key);
  const sel = selected ? items.find((x) => x.key === selected) ?? null : null;
  const { errors, warnings } = checkBlocks(doc.blocks);
  const diff = useMemo(() => diffHome(doc, published), [doc, published]);
  const changes = diff.length;
  const isPublished = published !== null;
  const canPublishNow = !isPublished || changes > 0;
  const nameOfKey = (key: string) => { const it = items.find((x) => x.key === key) ?? (published ? flatten(published).find((x) => x.key === key) : undefined); return it ? itemName(it) : key; };
  const issuesOf = (key: string) => health.issues.filter((i) => i.key === key);

  const move = (key: string, to: number) => update((d) => { const l = flatten(d); const i = l.findIndex((x) => x.key === key); if (i < 0) return d; const [x] = l.splice(i, 1); l.splice(Math.max(0, Math.min(l.length, to > i ? to - 1 : to)), 0, x); return rebuild(l); });
  const setItem = (it: Item, tag = "") => update((d) => rebuild(flatten(d).map((x) => (x.key === it.key ? it : x))), tag);
  const toggle = (it: Item) => setItem(it.kind === "section" ? { ...it, s: { ...it.s, enabled: it.s.enabled === false ? undefined : false } } : { ...it, b: { ...it.b, enabled: it.b.enabled === false ? undefined : false } });
  const remove = (it: Item) => { if (it.kind !== "block") return; update((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== it.b.id) })); setSelected(null); };
  const duplicate = (it: Item) => { if (it.kind !== "block") return; const c = { ...structuredClone(it.b), id: newBlock(it.b.type, "Euronics").id }; update((d) => { const l = flatten(d); l.splice(l.findIndex((x) => x.key === it.key) + 1, 0, { key: blkKey(c.id), kind: "block", b: c }); return rebuild(l); }); setSelected(blkKey(c.id)); };
  const add = (type: BrandBlock["type"], after: string | null) => {
    const b = newBlock(type, "Euronics");
    update((d) => { const l = flatten(d); const at = after ? l.findIndex((x) => x.key === after) + 1 : 0; l.splice(at, 0, { key: blkKey(b.id), kind: "block", b }); return rebuild(l); });
    setAdding(null); setSelected(blkKey(b.id)); setRight("settings");
  };
  const open = (key: string) => { setSelected((cur) => (cur === key && mode === "s" ? null : key)); setRight("settings"); };
  const goKey = (key: string) => { if (!items.some((x) => x.key === key)) return; setDialog(null); setSelected(key); setRight("settings"); setView("page"); };
  const loadDoc = (d: HomeDoc, label: string) => { update(() => normalizeHomeDoc(structuredClone(d))); setDialog(null); setSelected(null); setResult({ ok: true, message: `Φορτώθηκε στο πρόχειρο: ${label}. Δες την προεπισκόπηση και πάτα «Δημοσίευση» για να ανέβει (ή Αναίρεση για να γυρίσεις).` }); };
  const refreshPlans = () => { void plansAction(PLAN).then((p) => { setReview(p.review); setScheduled(p.scenarios.filter((x) => x.status === "scheduled" && x.publishAt).map((x) => ({ name: x.name, publishAt: x.publishAt! })).sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt))); }); };
  const refreshServer = useCallback(() => { router.refresh(); setPv((v) => v + 1); void homeHealthAction(latest.current).then(setHealth).catch(() => null); }, [router]);

  const ensureSaved = async () => save === "idle" || (await flush());
  const doPublish = () => start(async () => {
    if (!(await ensureSaved())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
    const r = await publishHomeAction();
    setResult(r); setDialog(null);
    if (r.ok) { setPublished(structuredClone(latest.current)); setReview(null); router.refresh(); }
  });
  const doSchedule = (iso: string, name: string) => start(async () => {
    if (!(await ensureSaved())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
    const r = await saveScenarioAction(PLAN, name.trim() || `Δημοσίευση ${whenShort(iso)}`, latest.current, iso);
    setResult(r);
    if (r.ok) { setDialog(null); refreshPlans(); }
  });
  const doReview = (note: string) => start(async () => {
    if (!(await ensureSaved())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
    const r = await submitReviewAction(PLAN, note, changes);
    setResult(r); setDialog(null); refreshPlans();
  });
  const dropReview = (reason: "rejected" | "withdrawn") => { if (!window.confirm(reason === "rejected" ? "Απόρριψη του αιτήματος; Το πρόχειρο μένει ως έχει." : "Ανάκληση του αιτήματος έγκρισης;")) return; start(async () => { setResult(await clearReviewAction(PLAN, reason)); setReview(null); }); };
  const publish = () => { if (canWrite || canPublish) setDialog("publish"); };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές του πρόχειρου και να γυρίσει στη δημοσιευμένη αρχική;")) return; start(async () => { setResult(await revertHomeAction()); window.location.reload(); }); };
  const go = (anchor?: string) => { if (anchor?.startsWith("blk-")) open(blkKey(anchor.slice(4))); };

  // πλήκτρα: αναίρεση, αποθήκευση, δημοσίευση, πλοήγηση στον χάρτη (J/K), απόκρυψη (H), Esc, ?
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // e.code: ίδια πλήκτρα και με ελληνικό πληκτρολόγιο (J/K/H/Z/S = Ξ/Κ/Η/Ζ/Σ)
      if (mod && e.code === "KeyZ") { if (typing(e.target)) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.code === "KeyS") { e.preventDefault(); if (canWrite && save !== "idle") void flush(); return; }
      if (mod && e.key === "Enter") { e.preventDefault(); if (canPublishNow) publish(); return; }
      if (dialog || adding || more || mod || e.altKey || typing(e.target)) return;
      if (e.key === "Escape" && selected) { setSelected(null); return; }
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) { e.preventDefault(); setDialog("keys"); return; }
      if (e.code === "KeyJ" || e.code === "KeyK") {
        e.preventDefault();
        const i = selected ? idx(selected) : -1;
        const n = e.code === "KeyJ" ? Math.min(items.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
        setSelected(items[n].key); setRight("settings");
        document.getElementById(`map-${items[n].key}`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.code === "KeyH" && sel && canWrite) { e.preventDefault(); toggle(sel); }
    };
  });
  useEffect(() => { const k = (e: KeyboardEvent) => keys.current(e); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const inspector = (x: Item) => (
    <Inspector
      it={x} index={idx(x.key)} count={items.length} prev={idx(x.key) > 0 ? itemName(items[idx(x.key) - 1]) : null} canWrite={canWrite}
      errors={errors.filter((e) => x.kind === "block" && e.anchor === `blk-${x.b.id}`)}
      empty={health.empty[x.key] ?? null} issues={issuesOf(x.key)} focusText={focusText}
      onClose={() => setSelected(null)} onChange={(y, tag) => setItem(y, tag)} onToggle={() => toggle(x)}
      onMove={(d) => move(x.key, d < 0 ? idx(x.key) - 1 : idx(x.key) + 2)} onDuplicate={() => duplicate(x)} onRemove={() => { if (window.confirm(`Διαγραφή του «${itemName(x)}»; (Για να μη φαίνεται χωρίς να χαθεί, πάτα το μάτι.)`)) remove(x); }}
      blockCtx={{ brandId: null, brandName: "Euronics", info, onInfo }}
    />
  );
  const saveText = save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : savedAt ? `Αποθηκεύτηκε ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : "Χωρίς αλλαγές";
  const iconBtn = "size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30 disabled:hover:bg-transparent";
  // τι λέει η προεπισκόπηση όταν το επιλεγμένο δεν φαίνεται
  const notice = sel ? (() => { const v = visSummary(visOf(sel)); if (!v.live) return `«${itemName(sel)}» δεν φαίνεται τώρα: ${v.text}.`; const why = health.empty[sel.key]; return why ? `«${itemName(sel)}» δεν φαίνεται τώρα: ${why}` : null; })() : null;
  const emptyCount = items.filter((it) => health.empty[it.key] && visSummary(visOf(it)).live).length;
  const MENU: { t: string; I: typeof History; on: () => void; d?: string }[] = [
    { t: "Σενάρια & προγραμματισμός", I: CalendarClock, on: () => setDialog("plans"), d: "Έτοιμες αρχικές για καμπάνιες, με ώρα δημοσίευσης" },
    { t: "Ιστορικό δημοσιεύσεων", I: History, on: () => setDialog("history"), d: "Επαναφορά παλιότερης αρχικής" },
    { t: "Σύνδεσμος & QR προεπισκόπησης", I: QrCode, on: () => setDialog("share"), d: "Στο κινητό ή σε συνάδελφο, χωρίς λογαριασμό" },
    { t: "Προεπισκόπηση σε νέα καρτέλα", I: ExternalLink, on: () => window.open("/?preview=1", "_blank", "noopener") },
    { t: "Συντομεύσεις πλήκτρων", I: Keyboard, on: () => setDialog("keys"), d: "Πάτα ? οποτεδήποτε" },
  ];

  return (
    <HomeCatalog.Provider value={categories}>
    <HomeLiveInfo.Provider value={live}>
    <HomeRefresh.Provider value={refreshServer}>
    <HomeServices.Provider value={services}>
    <HomeLists.Provider value={lists}>
    <HomeProductInfo.Provider value={{ info, onInfo }}>
    <PickerBrand.Provider value={{ brandId: null, brandName: "Euronics" }}>
      <div ref={root} className="grid gap-3 min-w-0">
        {/* ---- πάνω μπάρα: κατάσταση, αναίρεση, δημοσίευση ---- */}
        <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2.5 bg-white/95 backdrop-blur border-b border-eu-line flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 grid">
            <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">Αρχική σελίδα</h1>
            <span role="status" className={`inline-flex flex-wrap items-center gap-x-1.5 text-[length:var(--fs-13)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>
              {save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}
              {saveText} · {!isPublished ? "δεν έχει δημοσιευτεί ακόμη" : changes ? `${changes} ${changes === 1 ? "αλλαγή" : "αλλαγές"} για δημοσίευση` : "ίδια με το site"}
              {scheduled[0] && <button type="button" onClick={() => setDialog("plans")} className="inline-flex items-center gap-1 text-eu-blue underline font-bold min-h-6"><CalendarClock className="size-3.5" aria-hidden />«{scheduled[0].name}» {whenShort(scheduled[0].publishAt)}{scheduled.length > 1 ? ` +${scheduled.length - 1}` : ""}</button>}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button data-help="editor.undo" type="button" onClick={undo} disabled={!past.length || !canWrite} aria-label="Αναίρεση" title="Αναίρεση (Ctrl/⌘ Z)" className={iconBtn}><Undo2 className="size-5" aria-hidden /></button>
            <button type="button" onClick={redo} disabled={!future.length || !canWrite} aria-label="Επανάληψη" title="Επανάληψη (Ctrl/⌘ ⇧ Z)" className={iconBtn}><Redo2 className="size-5" aria-hidden /></button>
            <div className="relative">
              <button data-help="editor.more" type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-haspopup="menu" aria-label="Περισσότερα" title="Σενάρια, ιστορικό, QR, πλήκτρα" className={iconBtn}><MoreHorizontal className="size-5" aria-hidden /></button>
              {more && (
                <>
                  <button type="button" aria-label="Κλείσιμο μενού" onClick={() => setMore(false)} className="fixed inset-0 z-40 cursor-default" />
                  <ul role="menu" onKeyDown={(e) => { if (e.key === "Escape") setMore(false); }} className="absolute right-0 top-12 z-50 m-0 p-1.5 list-none w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-eu-line bg-white shadow-[var(--shadow-overlay)] grid gap-0.5">
                    {MENU.map((m) => (
                      <li key={m.t} role="none"><button type="button" role="menuitem" autoFocus={m === MENU[0]} onClick={() => { setMore(false); m.on(); }} className="w-full flex items-start gap-3 rounded-xl px-3 py-2 min-h-12 text-left hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue">
                        {ico(m.I, "size-5 mt-0.5 shrink-0 text-eu-blue")}
                        <span className="grid"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{m.t}</span>{m.d && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{m.d}</span>}</span>
                      </button></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {canPublish ? (
              <button data-help="editor.publish" type="button" onClick={publish} disabled={busy || !canPublishNow} title="Έλεγχος & δημοσίευση (Ctrl/⌘ Enter)" className="ml-1 inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}Δημοσίευση{changes > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[length:var(--fs-13)] tabular-nums">{changes}</span>}
              </button>
            ) : canWrite && (
              <button data-help="editor.publish" type="button" onClick={publish} disabled={busy || !canPublishNow} className="ml-1 inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}Για έγκριση
              </button>
            )}
          </div>
          {review && (
            <div className="basis-full flex flex-wrap items-center gap-2 rounded-xl bg-eu-chip px-3 py-2 text-[length:var(--fs-14)] text-eu-ink-2">
              <Send className="size-4 text-eu-blue shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{review.by === me ? <>Το έστειλες για έγκριση {whenShort(review.at)} — περιμένει όποιον δημοσιεύει.</> : <><b>{review.byName}</b> ζητά έγκριση ({review.changes} {review.changes === 1 ? "αλλαγή" : "αλλαγές"}) · {whenShort(review.at)}{review.note ? <> — «{review.note}»</> : null}</>}</span>
              {canPublish && review.by !== me && <><button type="button" onClick={() => setDialog("publish")} className="rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold hover:bg-eu-blue">Έλεγχος & δημοσίευση</button><button type="button" onClick={() => dropReview("rejected")} className="rounded-full px-3 min-h-11 font-bold underline">Απόρριψη</button></>}
              {review.by === me && <button type="button" onClick={() => dropReview("withdrawn")} className="rounded-full px-3 min-h-11 font-bold underline">Ανάκληση</button>}
            </div>
          )}
          {result && (
            <div className="relative basis-full">
              <ResultBanner ok={result.ok}><span className="block pr-8">{result.message}</span></ResultBanner>
              {result.errors?.length ? <ul className="m-0 mt-1 p-0 list-none grid gap-1">{result.errors.map((e, k) => <li key={k}><button type="button" onClick={() => go(e.anchor)} className="text-left text-eu-red font-bold text-[length:var(--fs-14)] underline min-h-11">{e.where}: {e.msg}</button></li>)}</ul> : null}
              <button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button>
            </div>
          )}
          {isPublished && changes > 0 && canWrite && <button type="button" onClick={revert} disabled={busy} className="basis-full @md:basis-auto text-left text-eu-ink-3 font-bold text-[length:var(--fs-13)] underline min-h-11">Ακύρωση αλλαγών (επιστροφή στη δημοσιευμένη)</button>}
          <div className={`${mode === "s" ? "" : "hidden"} basis-full grid grid-cols-2 gap-1 rounded-full bg-eu-surface p-1`} role="tablist" aria-label="Προβολή">
            {(["page", "preview"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full min-h-11 font-bold text-[length:var(--fs-14)] ${view === v ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{v === "page" ? "Σελίδα" : "Προεπισκόπηση"}</button>)}
          </div>
        </div>

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: mode === "s" ? "minmax(0,1fr)" : mode === "m" ? "minmax(18rem,22rem) minmax(0,1fr)" : sel ? "minmax(18rem,22rem) minmax(22rem,27rem) minmax(0,1fr)" : "minmax(18rem,24rem) minmax(0,1fr)" }}>
          {/* ---- ο χάρτης της σελίδας: πάντα ορατός ---- */}
          <div className={`${mode === "s" && view !== "page" ? "hidden" : ""} min-w-0 ${mode === "s" ? "" : "sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1"}`}>
              <section data-help="editor.map" aria-label="Η αρχική από πάνω προς τα κάτω" className="grid gap-3">
                {warnings.length > 0 || errors.length > 0 ? (
                  <p className={`m-0 inline-flex items-start gap-2 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold ${errors.length ? "bg-eu-red/10 text-eu-red" : "bg-eu-amber/15 text-eu-ink-2"}`}><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{errors.length ? `${errors.length} components θέλουν διόρθωση πριν τη δημοσίευση — άνοιξε όσα έχουν κόκκινη ένδειξη.` : `${warnings.length} συστάσεις — άνοιξε όσα έχουν πορτοκαλί ένδειξη.`}</p>
                ) : null}
                {emptyCount > 0 && <p className="m-0 inline-flex items-start gap-2 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold bg-eu-amber/15 text-eu-ink-2"><EyeOff className="size-4 mt-0.5 shrink-0" aria-hidden />{emptyCount === 1 ? "1 ενότητα είναι ενεργή αλλά κενή — δεν φαίνεται στο site." : `${emptyCount} ενότητες είναι ενεργές αλλά κενές — δεν φαίνονται στο site.`}</p>}
                {canWrite && <button data-help="editor.add" type="button" onClick={() => setAdding({ after: null })} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-chip"><Plus className="size-5" aria-hidden /> Προσθήκη στην αρχική</button>}
                <ol className="m-0 p-0 list-none grid" onDragOver={(e) => e.preventDefault()}>
                  {items.map((it, i) => {
                    const v = visSummary(visOf(it));
                    const bad = it.kind === "block" ? errors.some((e) => e.anchor === `blk-${it.b.id}`) : false;
                    const warn = !bad && ((it.kind === "block" && warnings.some((e) => e.anchor === `blk-${it.b.id}`)) || issuesOf(it.key).length > 0);
                    const empty = v.live ? health.empty[it.key] : undefined;
                    const meta = [bad ? "Θέλει διόρθωση" : warn ? "Θέλει έλεγχο" : "", empty ? "Κενή — δεν φαίνεται" : "", it.kind === "block" ? "Component" : "", v.plain ? "" : v.text].filter(Boolean).join(" · ");
                    return (
                      <li key={it.key} id={`map-${it.key}`} className="relative"
                        onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const over = e.clientY < r.top + r.height / 2 ? i : i + 1; if (over !== drag.over) setDrag({ ...drag, over }); }}
                        onDrop={(e) => { e.preventDefault(); if (drag?.over != null) move(drag.from, drag.over); setDrag(null); }}>
                        {drag?.over === i && <span aria-hidden className="absolute -top-0.5 inset-x-0 h-1 rounded-full bg-eu-blue" />}
                        <div className={`group flex items-center gap-1 rounded-xl border mb-1.5 ${selected === it.key ? "border-eu-navy ring-2 ring-eu-navy/30 bg-eu-chip" : it.kind === "section" ? "bg-white border-eu-line" : "bg-eu-chip/50 border-eu-blue/30"} ${it.kind === "block" ? "ml-4" : ""} ${drag?.from === it.key ? "opacity-40" : ""}`}>
                          {canWrite && (
                            <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ from: it.key, over: null }); }} onDragEnd={() => setDrag(null)} title="Σύρε για αλλαγή σειράς" aria-hidden className="hidden @md:grid place-items-center w-7 self-stretch cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-4" /></span>
                          )}
                          <button type="button" onClick={() => open(it.key)}
                            onKeyDown={(e) => { if (!e.altKey || !canWrite) return; if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); move(it.key, i - 1); } if (e.key === "ArrowDown" && i < items.length - 1) { e.preventDefault(); move(it.key, i + 2); } }}
                            aria-label={`${itemName(it)} — ${empty ? "κενή, δεν φαίνεται. " : ""}${v.text}. Άνοιγμα ρυθμίσεων. Alt + βέλη για μετακίνηση.`}
                            className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-2 py-1.5 min-h-12 rounded-xl hover:bg-eu-surface/70 focus-visible:outline-2 focus-visible:outline-eu-blue">
                            <span className={`relative size-9 shrink-0 grid place-items-center rounded-lg ${it.kind === "section" ? "bg-eu-navy text-white" : "bg-white text-eu-blue border border-eu-blue/30"} ${v.live && !empty ? "" : "opacity-50"}`}>
                              {ico(itemIcon(it), "size-[18px]")}
                              {(bad || warn || empty || v.soon) && <span aria-hidden className={`absolute -top-1 -right-1 size-3 rounded-full ring-2 ring-white ${bad ? "bg-eu-red" : "bg-eu-amber"}`} />}
                            </span>
                            <span className="grid min-w-0">
                              <span className={`font-bold text-[length:var(--fs-15)] leading-snug line-clamp-2 ${v.live && !empty ? "text-eu-ink" : "text-eu-muted"} ${v.live ? "" : "line-through decoration-1"}`}>{itemName(it)}</span>
                              {meta && <span className={`text-[length:var(--fs-13)] leading-snug ${bad ? "text-eu-red font-bold" : warn || empty || v.soon ? "text-eu-ink-2 font-bold" : "text-eu-muted"}`}>{meta}</span>}
                            </span>
                          </button>
                          {canWrite && <button type="button" onClick={() => toggle(it)} aria-label={visOf(it).enabled === false ? `Εμφάνιση: ${itemName(it)}` : `Απόκρυψη: ${itemName(it)}`} title={visOf(it).enabled === false ? "Εμφάνιση (H)" : "Απόκρυψη (H)"} className={iconBtn}>{visOf(it).enabled === false ? <EyeOff className="size-4 text-eu-muted" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>}
                          {canWrite && <button type="button" onClick={() => setAdding({ after: it.key })} aria-label={`Προσθήκη κάτω από: ${itemName(it)}`} title="Προσθήκη από κάτω" className={iconBtn}><Plus className="size-4" aria-hidden /></button>}
                        </div>
                        {mode === "s" && selected === it.key && sel && <div className="mb-3 ml-2 pl-3 border-l-4 border-eu-navy">{inspector(sel)}</div>}
                        {drag?.over === items.length && i === items.length - 1 && <span aria-hidden className="absolute -bottom-0.5 inset-x-0 h-1 rounded-full bg-eu-blue" />}
                      </li>
                    );
                  })}
                </ol>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-relaxed">Πάτα ένα στοιχείο για να το ρυθμίσεις ή πάτα πάνω στην προεπισκόπηση. Σειρά: σύρε από τη λαβή ή Alt + βέλη. Οι αλλαγές αποθηκεύονται μόνες τους· οι επισκέπτες τις βλέπουν μετά τη «Δημοσίευση». Πάτα <kbd className="rounded border border-eu-line px-1 font-mono">?</kbd> για τα πλήκτρα.</p>
              </section>
          </div>

          {/* ---- ρυθμίσεις (στήλη δίπλα στον χάρτη) ---- */}
          {mode !== "s" && sel && (mode === "l" || right === "settings") && (
            <div data-help="editor.inspector" className="min-w-0 sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1">
              {mode === "m" && <RightSwitch right={right} setRight={setRight} />}
              {inspector(sel)}
            </div>
          )}

          {/* ---- ζωντανή προεπισκόπηση ---- */}
          {(mode === "s" ? view === "preview" : mode === "l" || !sel || right === "preview") && (
            <div data-help="editor.preview" className="min-w-0 sticky top-24">
              {mode === "m" && sel && <RightSwitch right={right} setRight={setRight} />}
              <LivePreview src="/?preview=1" v={pv} device={device} setDevice={setDevice} saving={save !== "idle"} focus={selected} notice={notice} onPick={(key, text) => { if (items.some((x) => x.key === key)) { setSelected(key); setRight("settings"); setView("page"); if (text) setFocusText((f) => ({ text, n: (f?.n ?? 0) + 1 })); } }} />
            </div>
          )}
        </div>
      </div>
      {adding && <AddDialog label="Προσθήκη στην αρχική" after={adding.after} positions={items.map((it) => ({ key: it.key, label: `Θέση: κάτω από «${itemName(it)}»` }))} onAdd={add} onClose={() => setAdding(null)} />}
      {dialog === "publish" && (
        <PublishDialog noun={NOUN} firstTime={!isPublished} changes={diff} nameOf={itemName} nameOfKey={nameOfKey} onRevert={(c: HomeChange) => published && update((d) => revertChange(d, published, c))}
          health={health} errors={errors} warnings={warnings} canPublish={canPublish} busy={busy} review={review}
          onClose={() => setDialog(null)} onPublish={doPublish} onSchedule={doSchedule} onSubmitReview={doReview} onGo={goKey} />
      )}
      {dialog === "plans" && <PlansDialog planRef={PLAN} diffCount={(a, b) => diffHome(a, b).length} doc={doc} canWrite={canWrite} canPublish={canPublish} onLoad={loadDoc} onClose={() => setDialog(null)} onChanged={refreshPlans} />}
      {dialog === "history" && <HistoryDialog planRef={PLAN} noun={NOUN} diffCount={(a, b) => diffHome(a, b).length} doc={doc} canWrite={canWrite} onLoad={loadDoc} onClose={() => setDialog(null)} />}
      {dialog === "share" && <ShareDialog planRef={PLAN} noun={NOUN} onClose={() => setDialog(null)} />}
      {dialog === "keys" && <KeysDialog onClose={() => setDialog(null)} />}
    </PickerBrand.Provider>
    </HomeProductInfo.Provider>
    </HomeLists.Provider>
    </HomeServices.Provider>
    </HomeRefresh.Provider>
    </HomeLiveInfo.Provider>
    </HomeCatalog.Provider>
  );
}

/* ---------------- επιθεωρητής ---------------- */
function Inspector({ it, index, count, prev, canWrite, errors, empty, issues, focusText, onClose, onChange, onToggle, onMove, onDuplicate, onRemove, blockCtx }: {
  it: Item; index: number; count: number; prev: string | null; canWrite: boolean; errors: Issue[]; empty: string | null; issues: { msg: string }[]; focusText: { text: string; n: number } | null;
  onClose: () => void; onChange: (it: Item, tag?: string) => void; onToggle: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void;
  blockCtx: { brandId: string | null; brandName: string; info: Record<string, PickProduct>; onInfo: (p: PickProduct[]) => void };
}) {
  const v = visOf(it);
  const sum = visSummary(v);
  const setVis = (p: Vis) => onChange(it.kind === "section" ? { ...it, s: { ...it.s, ...p } } : { ...it, b: { ...it.b, ...p } as BrandBlock });
  const help = it.kind === "section" ? sectionDef(it.s.id)!.help : BLOCK_INFO[it.b.type].help;
  const iconBtn = "size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30";
  const box = useRef<HTMLElement>(null);
  useFocusText(box, focusText, it.key);
  return (
    <section ref={box} aria-label={`Ρυθμίσεις: ${itemName(it)}`} className="grid gap-3">
      {/* σταθερή κεφαλίδα: πού είσαι, τι είναι, οι ενέργειες */}
      <div className="sticky top-0 z-10 -mx-1 px-1 pb-1 bg-eu-surface grid gap-2">
        <div className="flex items-center gap-2">
          <span className="min-w-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug"><b className="text-eu-ink tabular-nums">Θέση {index + 1} από {count}</b>{prev ? <> · μετά από «{prev}»</> : " · στην κορυφή"}</span>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο ρυθμίσεων (Esc)" title="Κλείσιμο (Esc)" className="ml-auto size-11 shrink-0 grid place-items-center rounded-full hover:bg-white"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="rounded-2xl border border-eu-line bg-white grid">
          <div className="flex items-center gap-3 px-3 pt-3 pb-2">
            <span className={`size-10 shrink-0 grid place-items-center rounded-lg ${it.kind === "section" ? "bg-eu-navy text-white" : "bg-eu-chip text-eu-blue"}`}>{ico(itemIcon(it), "size-5")}</span>
            <h2 className="m-0 min-w-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight">{it.kind === "section" ? sectionDef(it.s.id)!.label : BLOCK_INFO[it.b.type].label}</h2>
          </div>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-1 border-t border-eu-line px-2 py-1">
              <button type="button" onClick={onToggle} title="Εμφάνιση / απόκρυψη (H)" className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-surface">{v.enabled === false ? <><Eye className="size-4" aria-hidden /> Εμφάνιση</> : <><EyeOff className="size-4" aria-hidden /> Απόκρυψη</>}</button>
              <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Πιο πάνω" title="Πιο πάνω" className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Πιο κάτω" title="Πιο κάτω" className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
              {it.kind === "block" && <>
                <button type="button" onClick={onDuplicate} aria-label="Αντίγραφο" title="Αντίγραφο" className={iconBtn}><Copy className="size-4" aria-hidden /></button>
                <button type="button" onClick={onRemove} aria-label="Διαγραφή" title="Διαγραφή" className={`${iconBtn} ml-auto text-eu-red hover:bg-eu-red/10`}><Trash2 className="size-4" aria-hidden /></button>
              </>}
            </div>
          )}
        </div>
      </div>
      <p className="m-0 -mt-1 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{help}</p>
      {empty && sum.live && <p role="status" className="m-0 flex items-start gap-2 rounded-xl bg-eu-amber/15 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><EyeOff className="size-4 mt-0.5 shrink-0" aria-hidden /><span><b>Δεν φαίνεται στο site τώρα.</b> {empty}</span></p>}
      {errors.length > 0 && <ul className="m-0 p-0 list-none grid gap-1 rounded-xl bg-eu-red/10 px-3 py-2">{errors.map((e, k) => <li key={k} className="text-eu-red font-bold text-[length:var(--fs-14)]">{e.msg}</li>)}</ul>}
      {issues.length > 0 && <ul className="m-0 p-0 list-none grid gap-1 rounded-xl bg-eu-amber/15 px-3 py-2">{issues.map((e, k) => <li key={k} className="flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{e.msg}</li>)}</ul>}
      <details className={`group rounded-2xl border border-eu-line bg-white ${canWrite ? "" : "pointer-events-none opacity-80"}`}>
        <summary className="list-none cursor-pointer flex items-center gap-2 px-3 @md:px-4 min-h-12">
          <CalendarClock className="size-5 shrink-0 text-eu-blue" aria-hidden />
          <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Πότε & σε ποιους</span><span className={`text-[length:var(--fs-13)] ${sum.live && !sum.soon ? "text-eu-muted" : "text-eu-ink-2 font-bold"}`}>{sum.text}</span></span>
          <ChevronDown className="ml-auto size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-3 @md:px-4 pb-4"><VisibilityForm v={v} summary={sum.text} onChange={setVis} /></div>
      </details>
      <div className={`rounded-2xl border border-eu-line bg-white p-3 @md:p-4 grid gap-4 ${canWrite ? "" : "pointer-events-none opacity-80"}`}>
        {it.kind === "section"
          ? <SectionFields s={it.s} set={(props) => onChange({ ...it, s: { ...it.s, props: Object.keys(props).length ? props : undefined } }, `p:${it.key}`)} />
          : <BlockFields b={it.b} set={(nb) => onChange({ ...it, b: nb }, `b:${it.key}`)} ctx={blockCtx} />}
      </div>
    </section>
  );
}

