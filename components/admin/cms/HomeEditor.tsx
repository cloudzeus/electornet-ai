"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, Bell, BookOpen, CalendarClock, Check, ChevronDown, CircleAlert, Copy, ExternalLink, Eye, EyeOff, FileText, GalleryHorizontal,
  GripVertical, HelpCircle, Image as ImageIcon, LayoutGrid, Laptop, ListOrdered, Loader2, Mail, Megaphone, MessageSquare, Monitor, Newspaper,
  Package, Percent, Plus, Redo2, Rocket, Search, ShoppingBag, Smartphone, Sparkles, Store, Tablet, Tag, Ticket, Timer, Trash2, Truck, Undo2, Video, Wrench, X, Zap,
  type LucideIcon,
} from "lucide-react";
import type { BrandBlock, Device } from "@/lib/cms/brand-store";
import { DEVICES } from "@/lib/cms/brand-store";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { afterZone, sectionDef, TOP_ZONE, type HomeAudience, type HomeDoc, type HomeSection, type HomeSectionId } from "@/lib/cms/home-sections";
import { publishHomeAction, revertHomeAction, saveHomeAction } from "@/app/admin/(shell)/cms/home/actions";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { ResultBanner } from "@/components/admin/settings/ui";
import { PickerBrand } from "./brand/ImagePicker";
import { BLOCK_GROUPS, BLOCK_INFO, BlockFields, newBlock } from "./brand/BlockEditors";
import { DateTime } from "./brand/fields";
import { SectionFields } from "./HomeSectionFields";
import { HomeCatalog, type CatOption } from "./CategoryCellsField";
import { HomeLiveInfo, HomeProductInfo, type HomeLive } from "./HomeInfoFields";
import { HomeServices, type ServiceOption } from "./ServiceCellsField";
import { HomeLists, type OrderOption } from "./OrderToggleField";

/* ---------------- μοντέλο: μία ενιαία λίστα (ενότητες + components) ---------------- */
type Item = { key: string; kind: "section"; s: HomeSection } | { key: string; kind: "block"; b: BrandBlock };
const secKey = (id: string) => `sec:${id}`;
const blkKey = (id: string) => `blk:${id}`;

/** Έγγραφο → λίστα με τη σειρά που εμφανίζεται στη σελίδα. */
function flatten(doc: HomeDoc): Item[] {
  const at = (zone: string) => doc.blocks.filter((b) => (b.zone ?? TOP_ZONE) === zone).map((b): Item => ({ key: blkKey(b.id), kind: "block", b }));
  return [...at(TOP_ZONE), ...doc.sections.flatMap((s) => [{ key: secKey(s.id), kind: "section", s } as Item, ...at(afterZone(s.id))])];
}
/** Λίστα → έγγραφο: κάθε component παίρνει τη ζώνη της ενότητας που προηγείται (ή «κορυφή»). */
function rebuild(items: Item[]): HomeDoc {
  let zone = TOP_ZONE;
  const sections: HomeSection[] = [], blocks: BrandBlock[] = [];
  for (const it of items) {
    if (it.kind === "section") { sections.push(it.s); zone = afterZone(it.s.id); } else blocks.push({ ...it.b, zone });
  }
  return { sections, blocks };
}

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

/** Πόσες αλλαγές έχει το πρόχειρο από τη δημοσίευση (προσθήκες, αφαιρέσεις, αλλαγές, μετακινήσεις). */
function changeCount(doc: HomeDoc, pub: HomeDoc | null): number {
  if (!pub) return 0;
  const a = flatten(doc), b = flatten(pub);
  const bm = new Map(b.map((x, i) => [x.key, { x, i }]));
  let n = 0;
  for (const x of a) { const o = bm.get(x.key); if (!o) n++; else if (stable(x.kind === "section" ? x.s : { ...x.b, zone: undefined }) !== stable(o.x.kind === "section" ? o.x.s : { ...o.x.b, zone: undefined })) n++; }
  n += b.filter((x) => !a.some((y) => y.key === x.key)).length;
  const order = (l: Item[]) => l.filter((x) => bm.has(x.key) && a.some((y) => y.key === x.key)).map((x) => x.key).join("|");
  if (order(a) !== order(b)) n++;
  return n;
}

/* ---------------- εικονίδια & περιγραφές ---------------- */
const SECTION_ICON: Record<HomeSectionId, LucideIcon> = { hero: GalleryHorizontal, ticker: Megaphone, categories: LayoutGrid, deals: Percent, campaigns: Sparkles, services: Wrench, stores: Store, guides: BookOpen, news: Newspaper, "ad-strip": ImageIcon, newsletter: Mail };
const BLOCK_ICON: Partial<Record<BrandBlock["type"], LucideIcon>> = {
  ad: ImageIcon, "deal-hero": Zap, "promo-products": Percent, "promo-grid": Tag, countdown: Timer, "promo-landing": Megaphone, coupon: Ticket,
  "products-auto": ShoppingBag, "new-arrivals": Package, offers: Percent, series: LayoutGrid, categories: LayoutGrid,
  banner: ImageIcon, story: FileText, gallery: GalleryHorizontal, video: Video,
  text: FileText, steps: ListOrdered, callout: Bell, faq: HelpCircle, tech: Sparkles, support: Wrench,
  contact: MessageSquare, stores: Store, services: Truck, guides: BookOpen, newsletter: Mail,
  announcement: Megaphone, usp: Check, cta: Rocket,
};
const itemIcon = (it: Item) => (it.kind === "section" ? SECTION_ICON[it.s.id] : BLOCK_ICON[it.b.type] ?? Package);
/** εικονίδιο χωρίς «component μέσα στο render» */
const ico = (I: LucideIcon, className: string) => createElement(I, { className, "aria-hidden": true });
const itemName = (it: Item) => (it.kind === "section" ? sectionDef(it.s.id)!.label : `${BLOCK_INFO[it.b.type].label}${it.b.title ? ` · ${it.b.title}` : ""}`);
const AUD_LABEL: Record<HomeAudience, string> = { all: "Σε όλους", guest: "Μόνο επισκέπτες", customer: "Μόνο πελάτες" };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "short" });

type Vis = { enabled?: boolean; hideOn?: Device[]; audience?: HomeAudience; schedule?: { from?: string; to?: string } };
const visOf = (it: Item): Vis => (it.kind === "section" ? it.s : it.b);
/** Η ορατότητα σε μία φράση: «Κρυφή», «Από 1 Νοε · μόνο κινητό», «Σε όλους · όλες οι συσκευές». */
function visSummary(v: Vis): { live: boolean; text: string } {
  if (v.enabled === false) return { live: false, text: "Κρυφή" };
  const now = Date.now();
  if (v.schedule?.to && new Date(v.schedule.to).getTime() < now) return { live: false, text: `Έληξε ${shortDate(v.schedule.to)}` };
  const parts: string[] = [];
  if (v.schedule?.from && new Date(v.schedule.from).getTime() > now) parts.push(`Από ${shortDate(v.schedule.from)}`);
  else if (v.schedule?.to) parts.push(`Έως ${shortDate(v.schedule.to)}`);
  parts.push(AUD_LABEL[v.audience ?? "all"]);
  const shown = DEVICES.filter((d) => !v.hideOn?.includes(d.key));
  parts.push(shown.length === 3 ? "όλες οι συσκευές" : shown.length ? `μόνο ${shown.map((d) => d.label.toLowerCase()).join(" & ")}` : "καμία συσκευή");
  return { live: !(v.schedule?.from && new Date(v.schedule.from).getTime() > now) && shown.length > 0, text: parts.join(" · ") };
}

/* ---------------- editor ---------------- */
export function HomeEditor({ initial, published: pub, savedAt: initSavedAt, info: initInfo, canWrite, canPublish, categories, live, services, lists }: { initial: HomeDoc; published: HomeDoc | null; savedAt: string | null; info: Record<string, PickProduct>; canWrite: boolean; canPublish: boolean; categories: CatOption[]; live: HomeLive; services: ServiceOption[]; lists: Record<string, { options: OrderOption[]; defaults: string[] }> }) {
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

  // αυτόματη αποθήκευση του πρόχειρου
  const flush = useCallback(async () => {
    setSave("saving");
    const r = await saveHomeAction(latest.current);
    if (!r.ok) { setSave("error"); return false; }
    savedJson.current = stable(latest.current);
    setSave("idle"); setSavedAt(r.at!); setPv((v) => v + 1);
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
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return; // η αναίρεση του πεδίου ανήκει στο πεδίο
      e.preventDefault(); if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [undo, redo]);

  const items = useMemo(() => flatten(doc), [doc]);
  const idx = (key: string) => items.findIndex((x) => x.key === key);
  const sel = selected ? items.find((x) => x.key === selected) ?? null : null;
  const { errors, warnings } = checkBlocks(doc.blocks);
  const changes = changeCount(doc, published);
  const isPublished = published !== null;
  const canPublishNow = !isPublished || changes > 0;

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

  const publish = () => {
    if (errors.length) { setResult({ ok: false, message: `Υπάρχουν ${errors.length} θέματα που πρέπει να διορθωθούν πριν τη δημοσίευση.`, errors }); return; }
    if (!window.confirm(isPublished ? `Δημοσίευση ${changes} ${changes === 1 ? "αλλαγής" : "αλλαγών"} στην αρχική; Οι επισκέπτες θα τις δουν αμέσως.` : "Δημοσίευση της αρχικής; Από εδώ και πέρα την ελέγχει αυτή η σελίδα.")) return;
    start(async () => {
      if (save !== "idle" && !(await flush())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
      const r = await publishHomeAction();
      setResult(r);
      if (r.ok) { setPublished(structuredClone(latest.current)); router.refresh(); }
    });
  };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές του πρόχειρου και να γυρίσει στη δημοσιευμένη αρχική;")) return; start(async () => { setResult(await revertHomeAction()); window.location.reload(); }); };
  const go = (anchor?: string) => { if (anchor?.startsWith("blk-")) open(blkKey(anchor.slice(4))); };

  const inspector = (x: Item) => (
    <Inspector
      it={x} index={idx(x.key)} count={items.length} prev={idx(x.key) > 0 ? itemName(items[idx(x.key) - 1]) : null} canWrite={canWrite}
      errors={errors.filter((e) => x.kind === "block" && e.anchor === `blk-${x.b.id}`)}
      onClose={() => setSelected(null)} onChange={(y, tag) => setItem(y, tag)} onToggle={() => toggle(x)}
      onMove={(d) => move(x.key, d < 0 ? idx(x.key) - 1 : idx(x.key) + 2)} onDuplicate={() => duplicate(x)} onRemove={() => { if (window.confirm(`Διαγραφή του «${itemName(x)}»; (Για να μη φαίνεται χωρίς να χαθεί, πάτα το μάτι.)`)) remove(x); }}
      blockCtx={{ brandId: null, brandName: "Euronics", info, onInfo }}
    />
  );
  const saveText = save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : savedAt ? `Αποθηκεύτηκε ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : "Χωρίς αλλαγές";
  const iconBtn = "size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <HomeCatalog.Provider value={categories}>
    <HomeLiveInfo.Provider value={live}>
    <HomeServices.Provider value={services}>
    <HomeLists.Provider value={lists}>
    <HomeProductInfo.Provider value={{ info, onInfo }}>
    <PickerBrand.Provider value={{ brandId: null, brandName: "Euronics" }}>
      <div ref={root} className="grid gap-3 min-w-0">
        {/* ---- πάνω μπάρα: κατάσταση, αναίρεση, δημοσίευση ---- */}
        <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2.5 bg-white/95 backdrop-blur border-b border-eu-line flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 grid">
            <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">Αρχική σελίδα</h1>
            <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>
              {save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}
              {saveText} · {!isPublished ? "δεν έχει δημοσιευτεί ακόμη" : changes ? `${changes} ${changes === 1 ? "αλλαγή" : "αλλαγές"} για δημοσίευση` : "ίδια με το site"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={undo} disabled={!past.length || !canWrite} aria-label="Αναίρεση" title="Αναίρεση (Ctrl/⌘ Z)" className={iconBtn}><Undo2 className="size-5" aria-hidden /></button>
            <button type="button" onClick={redo} disabled={!future.length || !canWrite} aria-label="Επανάληψη" title="Επανάληψη (Ctrl/⌘ ⇧ Z)" className={iconBtn}><Redo2 className="size-5" aria-hidden /></button>
            <a href="/?preview=1" target="_blank" rel="noopener noreferrer" aria-label="Προεπισκόπηση σε νέα καρτέλα" title="Προεπισκόπηση σε νέα καρτέλα" className={iconBtn}><ExternalLink className="size-5" aria-hidden /></a>
            {canPublish && (
              <button type="button" onClick={publish} disabled={busy || !canPublishNow} className="ml-1 inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}Δημοσίευση
              </button>
            )}
          </div>
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

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: mode === "s" ? "minmax(0,1fr)" : mode === "m" ? "minmax(17rem,19rem) minmax(0,1fr)" : sel ? "minmax(17rem,19rem) minmax(20rem,24rem) minmax(0,1fr)" : "minmax(17rem,19rem) minmax(0,1fr)" }}>
          {/* ---- ο χάρτης της σελίδας: πάντα ορατός ---- */}
          <div className={`${mode === "s" && view !== "page" ? "hidden" : ""} min-w-0 ${mode === "s" ? "" : "sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1"}`}>
              <section aria-label="Η αρχική από πάνω προς τα κάτω" className="grid gap-3">
                {warnings.length > 0 || errors.length > 0 ? (
                  <p className={`m-0 inline-flex items-start gap-2 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold ${errors.length ? "bg-eu-red/10 text-eu-red" : "bg-eu-amber/15 text-eu-ink-2"}`}><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{errors.length ? `${errors.length} components θέλουν διόρθωση πριν τη δημοσίευση — άνοιξε όσα έχουν κόκκινη ένδειξη.` : `${warnings.length} συστάσεις — άνοιξε όσα έχουν πορτοκαλί ένδειξη.`}</p>
                ) : null}
                {canWrite && <button type="button" onClick={() => setAdding({ after: null })} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-chip"><Plus className="size-5" aria-hidden /> Προσθήκη στην αρχική</button>}
                <ol className="m-0 p-0 list-none grid" onDragOver={(e) => e.preventDefault()}>
                  {items.map((it, i) => {
                    const v = visSummary(visOf(it));
                    const bad = it.kind === "block" ? errors.some((e) => e.anchor === `blk-${it.b.id}`) : false;
                    const warn = it.kind === "block" && !bad ? warnings.some((e) => e.anchor === `blk-${it.b.id}`) : false;
                    return (
                      <li key={it.key} className="relative"
                        onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const over = e.clientY < r.top + r.height / 2 ? i : i + 1; if (over !== drag.over) setDrag({ ...drag, over }); }}
                        onDrop={(e) => { e.preventDefault(); if (drag?.over != null) move(drag.from, drag.over); setDrag(null); }}>
                        {drag?.over === i && <span aria-hidden className="absolute -top-0.5 inset-x-0 h-1 rounded-full bg-eu-blue" />}
                        <div className={`group flex items-center gap-1 rounded-xl border mb-1.5 ${selected === it.key ? "border-eu-navy ring-2 ring-eu-navy/30 bg-eu-chip" : it.kind === "section" ? "bg-white border-eu-line" : "bg-eu-chip/50 border-eu-blue/30"} ${it.kind === "block" ? "ml-4" : ""} ${drag?.from === it.key ? "opacity-40" : ""}`}>
                          {canWrite && (
                            <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ from: it.key, over: null }); }} onDragEnd={() => setDrag(null)} title="Σύρε για αλλαγή σειράς" aria-hidden className="hidden @md:grid place-items-center w-7 self-stretch cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-4" /></span>
                          )}
                          <button type="button" onClick={() => open(it.key)}
                            onKeyDown={(e) => { if (!e.altKey || !canWrite) return; if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); move(it.key, i - 1); } if (e.key === "ArrowDown" && i < items.length - 1) { e.preventDefault(); move(it.key, i + 2); } }}
                            aria-label={`${itemName(it)} — ${v.text}. Άνοιγμα ρυθμίσεων. Alt + βέλη για μετακίνηση.`}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left px-2 py-2 min-h-14 rounded-xl hover:bg-eu-surface/70 focus-visible:outline-2 focus-visible:outline-eu-blue">
                            <span className={`size-9 shrink-0 grid place-items-center rounded-lg ${it.kind === "section" ? "bg-eu-navy text-white" : "bg-white text-eu-blue border border-eu-blue/30"} ${v.live ? "" : "opacity-50"}`}>{ico(itemIcon(it), "size-[18px]")}</span>
                            <span className="grid min-w-0">
                              <span className={`font-bold text-[length:var(--fs-15)] leading-snug ${v.live ? "text-eu-ink" : "text-eu-muted line-through decoration-1"}`}>{itemName(it)}</span>
                              <span className={`text-[length:var(--fs-13)] leading-snug ${bad ? "text-eu-red font-bold" : warn ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{bad ? "Θέλει διόρθωση · " : warn ? "Σύσταση · " : ""}{it.kind === "block" ? "Component · " : ""}{v.text}</span>
                            </span>
                          </button>
                          {canWrite && <button type="button" onClick={() => toggle(it)} aria-label={visOf(it).enabled === false ? `Εμφάνιση: ${itemName(it)}` : `Απόκρυψη: ${itemName(it)}`} title={visOf(it).enabled === false ? "Εμφάνιση" : "Απόκρυψη"} className={iconBtn}>{visOf(it).enabled === false ? <EyeOff className="size-4 text-eu-muted" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>}
                          {canWrite && <button type="button" onClick={() => setAdding({ after: it.key })} aria-label={`Προσθήκη κάτω από: ${itemName(it)}`} title="Προσθήκη από κάτω" className={iconBtn}><Plus className="size-4" aria-hidden /></button>}
                        </div>
                        {mode === "s" && selected === it.key && sel && <div className="mb-3 ml-2 pl-3 border-l-4 border-eu-navy">{inspector(sel)}</div>}
                        {drag?.over === items.length && i === items.length - 1 && <span aria-hidden className="absolute -bottom-0.5 inset-x-0 h-1 rounded-full bg-eu-blue" />}
                      </li>
                    );
                  })}
                </ol>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-relaxed">Πάτα ένα στοιχείο για να το ρυθμίσεις — η λίστα μένει εδώ, ώστε να βλέπεις πάντα πού βρίσκεσαι. Σειρά: σύρε από τη λαβή ή «Πιο πάνω / Πιο κάτω». Οι αλλαγές αποθηκεύονται μόνες τους ως πρόχειρο· οι επισκέπτες τις βλέπουν μετά τη «Δημοσίευση».</p>
              </section>
          </div>

          {/* ---- ρυθμίσεις (στήλη δίπλα στον χάρτη) ---- */}
          {mode !== "s" && sel && (mode === "l" || right === "settings") && (
            <div className="min-w-0 sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1">
              {mode === "m" && <RightSwitch right={right} setRight={setRight} />}
              {inspector(sel)}
            </div>
          )}

          {/* ---- ζωντανή προεπισκόπηση ---- */}
          {(mode === "s" ? view === "preview" : mode === "l" || !sel || right === "preview") && (
            <div className="min-w-0 sticky top-24">
              {mode === "m" && sel && <RightSwitch right={right} setRight={setRight} />}
              <LivePreview v={pv} device={device} setDevice={setDevice} saving={save !== "idle"} focus={selected} onPick={(key) => { if (items.some((x) => x.key === key)) { setSelected(key); setRight("settings"); setView("page"); } }} />
            </div>
          )}
        </div>
      </div>
      {adding && <AddDialog after={adding.after} items={items} onAdd={add} onClose={() => setAdding(null)} />}
    </PickerBrand.Provider>
    </HomeProductInfo.Provider>
    </HomeLists.Provider>
    </HomeServices.Provider>
    </HomeLiveInfo.Provider>
    </HomeCatalog.Provider>
  );
}

/* ---------------- επιθεωρητής ---------------- */
/** Ρυθμίσεις → στήλη δίπλα στον χάρτη: διακόπτης ρυθμίσεις / προεπισκόπηση (μεσαίες οθόνες). */
function RightSwitch({ right, setRight }: { right: "settings" | "preview"; setRight: (r: "settings" | "preview") => void }) {
  return (
    <div role="tablist" aria-label="Δεξιά στήλη" className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-eu-surface p-1">
      {(["settings", "preview"] as const).map((r) => <button key={r} type="button" role="tab" aria-selected={right === r} onClick={() => setRight(r)} className={`rounded-full min-h-11 font-bold text-[length:var(--fs-14)] ${right === r ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-2"}`}>{r === "settings" ? "Ρυθμίσεις" : "Προεπισκόπηση"}</button>)}
    </div>
  );
}

function Inspector({ it, index, count, prev, canWrite, errors, onClose, onChange, onToggle, onMove, onDuplicate, onRemove, blockCtx }: {
  it: Item; index: number; count: number; prev: string | null; canWrite: boolean; errors: Issue[];
  onClose: () => void; onChange: (it: Item, tag?: string) => void; onToggle: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void;
  blockCtx: { brandId: string | null; brandName: string; info: Record<string, PickProduct>; onInfo: (p: PickProduct[]) => void };
}) {
  const v = visOf(it);
  const sum = visSummary(v);
  const setVis = (p: Vis) => onChange(it.kind === "section" ? { ...it, s: { ...it.s, ...p } } : { ...it, b: { ...it.b, ...p } as BrandBlock });
  const help = it.kind === "section" ? sectionDef(it.s.id)!.help : BLOCK_INFO[it.b.type].help;
  const iconBtn = "size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30";
  return (
    <section aria-label={`Ρυθμίσεις: ${itemName(it)}`} className="grid gap-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug"><b className="text-eu-ink tabular-nums">Θέση {index + 1} από {count}</b>{prev ? <> · μετά από «{prev}»</> : " · στην κορυφή"}</span>
        <button type="button" onClick={onClose} aria-label="Κλείσιμο ρυθμίσεων" title="Κλείσιμο" className="ml-auto size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
      </div>
      <div className="rounded-2xl border border-eu-line bg-white grid">
        <div className="flex items-start gap-3 p-3">
          <span className={`size-10 shrink-0 grid place-items-center rounded-lg ${it.kind === "section" ? "bg-eu-navy text-white" : "bg-eu-chip text-eu-blue"}`}>{ico(itemIcon(it), "size-5")}</span>
          <div className="min-w-0 grid gap-0.5">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight">{it.kind === "section" ? sectionDef(it.s.id)!.label : BLOCK_INFO[it.b.type].label}</h2>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{help}</p>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-1 border-t border-eu-line px-2 py-1">
            <button type="button" onClick={onToggle} className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-surface">{v.enabled === false ? <><Eye className="size-4" aria-hidden /> Εμφάνιση</> : <><EyeOff className="size-4" aria-hidden /> Απόκρυψη</>}</button>
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Πιο πάνω" title="Πιο πάνω" className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Πιο κάτω" title="Πιο κάτω" className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
            {it.kind === "block" && <>
              <button type="button" onClick={onDuplicate} aria-label="Αντίγραφο" title="Αντίγραφο" className={iconBtn}><Copy className="size-4" aria-hidden /></button>
              <button type="button" onClick={onRemove} aria-label="Διαγραφή" title="Διαγραφή" className={`${iconBtn} ml-auto text-eu-red hover:bg-eu-red/10`}><Trash2 className="size-4" aria-hidden /></button>
            </>}
          </div>
        )}
      </div>
      {errors.length > 0 && <ul className="m-0 p-0 list-none grid gap-1 rounded-xl bg-eu-red/10 px-3 py-2">{errors.map((e, k) => <li key={k} className="text-eu-red font-bold text-[length:var(--fs-14)]">{e.msg}</li>)}</ul>}
      <div className={`rounded-2xl border border-eu-line bg-white p-3 @md:p-4 grid gap-4 ${canWrite ? "" : "pointer-events-none opacity-80"}`}>
        {it.kind === "section"
          ? <SectionFields s={it.s} set={(props) => onChange({ ...it, s: { ...it.s, props: Object.keys(props).length ? props : undefined } }, `p:${it.key}`)} />
          : <BlockFields b={it.b} set={(nb) => onChange({ ...it, b: nb }, `b:${it.key}`)} ctx={blockCtx} />}
      </div>
      <details className={`group rounded-2xl border border-eu-line bg-white ${canWrite ? "" : "pointer-events-none opacity-80"}`}>
        <summary className="list-none cursor-pointer flex items-center gap-2 px-3 @md:px-4 min-h-14">
          <CalendarClock className="size-5 shrink-0 text-eu-blue" aria-hidden />
          <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">Πότε & σε ποιους</span><span className={`text-[length:var(--fs-13)] ${sum.live ? "text-eu-muted" : "text-eu-amber font-bold"}`}>{sum.text}</span></span>
          <ChevronDown className="ml-auto size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-3 @md:px-4 pb-4"><VisibilityForm v={v} summary={sum.text} onChange={setVis} /></div>
      </details>
    </section>
  );
}

/** «Πότε & σε ποιους»: συσκευές (κουμπιά), κοινό (επιλογές με εξήγηση), ημερομηνίες. */
function VisibilityForm({ v, summary, onChange }: { v: Vis; summary: string; onChange: (p: Vis) => void }) {
  const AUD: { v: HomeAudience; t: string; d: string }[] = [
    { v: "all", t: "Σε όλους", d: "Επισκέπτες και συνδεδεμένοι πελάτες." },
    { v: "guest", t: "Μόνο σε επισκέπτες", d: "Όσοι δεν έχουν συνδεθεί — π.χ. κουπόνι εγγραφής." },
    { v: "customer", t: "Μόνο σε πελάτες", d: "Όσοι έχουν συνδεθεί — π.χ. προσφορά για μέλη." },
  ];
  return (
    <div className="grid gap-5">
      <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><b>Τώρα:</b> {summary}</p>
      <fieldset className="m-0 p-0 border-0 grid gap-2">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-1">Σε ποιες συσκευές</legend>
        <div className="grid grid-cols-3 gap-2">
          {DEVICES.map((dv) => {
            const on = !v.hideOn?.includes(dv.key);
            return (
              <button key={dv.key} type="button" aria-pressed={on} onClick={() => { const cur = new Set<Device>(v.hideOn ?? []); if (on) cur.add(dv.key); else cur.delete(dv.key); onChange({ hideOn: cur.size ? [...cur] : undefined }); }}
                className={`grid justify-items-center gap-1 rounded-xl border-2 px-2 py-2 min-h-16 font-bold text-[length:var(--fs-13)] ${on ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-muted"}`}>
                {ico(dv.key === "mobile" ? Smartphone : dv.key === "tablet" ? Tablet : Laptop, "size-5")}{dv.label}<span className="font-normal">{on ? "Ναι" : "Όχι"}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="m-0 p-0 border-0 grid gap-2">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-1">Σε ποιους</legend>
        {AUD.map((a) => {
          const on = (v.audience ?? "all") === a.v;
          return (
            <label key={a.v} className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 min-h-12 cursor-pointer ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-navy/50"}`}>
              <input type="radio" name="aud" checked={on} onChange={() => onChange({ audience: a.v === "all" ? undefined : a.v })} className="mt-1 size-4 accent-eu-navy" />
              <span className="grid"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{a.t}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{a.d}</span></span>
            </label>
          );
        })}
      </fieldset>
      <fieldset className="m-0 p-0 border-0 grid gap-3">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-1 inline-flex items-center gap-2"><CalendarClock className="size-4" aria-hidden /> Πότε</legend>
        <DateTime label="Από" value={v.schedule?.from} onChange={(x) => onChange({ schedule: { ...v.schedule, from: x } })} help="Κενό = από τώρα." />
        <DateTime label="Έως" value={v.schedule?.to} onChange={(x) => onChange({ schedule: { ...v.schedule, to: x } })} help="Κενό = χωρίς λήξη. Μετά κρύβεται μόνο του." />
      </fieldset>
    </div>
  );
}

/* ---------------- προσθήκη ---------------- */
function AddDialog({ after, items, onAdd, onClose }: { after: string | null; items: Item[]; onAdd: (t: BrandBlock["type"], after: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<string>(after ?? "");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const groups = BLOCK_GROUPS.map((g) => ({ ...g, types: g.types.filter((t) => !q || norm(`${BLOCK_INFO[t].label} ${BLOCK_INFO[t].help}`).includes(norm(q))) })).filter((g) => g.types.length);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-label="Προσθήκη στην αρχική" className="m-auto w-[min(56rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-2xl p-0 backdrop:bg-black/50 bg-white">
      <div className="grid grid-rows-[auto_minmax(0,1fr)] max-h-[calc(100dvh-2rem)]">
        <div className="grid gap-3 p-4 border-b border-eu-line">
          <div className="flex items-center gap-2">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Τι θέλεις να προσθέσεις;</h2>
            <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="ml-auto size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
          </div>
          <div className="grid @xl:grid-cols-2 gap-2">
            <label className="relative">
              <span className="sr-only">Αναζήτηση</span>
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση: banner, κουπόνι, προϊόντα…" className="w-full rounded-xl border-2 border-eu-line pl-9 pr-3 min-h-12 text-[length:var(--fs-16)] bg-white" />
            </label>
            <label className="grid">
              <span className="sr-only">Θέση</span>
              <select value={pos} onChange={(e) => setPos(e.target.value)} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-15)] bg-white">
                <option value="">Θέση: στην κορυφή της σελίδας</option>
                {items.map((it) => <option key={it.key} value={it.key}>Θέση: κάτω από «{itemName(it)}»</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-y-auto p-4 grid gap-5">
          {groups.length ? groups.map((g) => (
            <section key={g.label} className="grid gap-2">
              <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{g.label}</h3>
              <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-2">
                {g.types.map((t) => {
                  return (
                    <button key={t} type="button" onClick={() => onAdd(t, pos || null)} className="text-left flex items-start gap-3 rounded-xl border-2 border-eu-line p-3 min-h-16 hover:border-eu-navy hover:bg-eu-chip/40 focus-visible:outline-2 focus-visible:outline-eu-blue">
                      <span className="size-10 shrink-0 grid place-items-center rounded-lg bg-eu-chip text-eu-blue">{ico(BLOCK_ICON[t] ?? Package, "size-5")}</span>
                      <span className="grid gap-0.5 min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{BLOCK_INFO[t].label}</span><span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{BLOCK_INFO[t].help}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>
          )) : <p className="m-0 text-eu-muted">Τίποτα με «{q}». Δοκίμασε άλλη λέξη.</p>}
        </div>
      </div>
    </dialog>
  );
}

/* ---------------- ζωντανή προεπισκόπηση ---------------- */
/**
 * Το πρόχειρο σε iframe (ίδιο origin): κυλά και τονίζει το επιλεγμένο στοιχείο· κλικ μέσα στην προεπισκόπηση επιλέγει
 * το στοιχείο αντί να ανοίγει συνδέσμους. Ανανεώνεται μετά από κάθε αποθήκευση.
 */
function LivePreview({ v, device, setDevice, saving, focus, onPick }: { v: number; device: "desktop" | "mobile"; setDevice: (d: "desktop" | "mobile") => void; saving: boolean; focus: string | null; onPick: (key: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [w, setW] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const pick = useRef(onPick);
  useEffect(() => { pick.current = onPick; }, [onPick]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // τονισμός + κύλιση στο επιλεγμένο
  useEffect(() => {
    const d = frame.current?.contentDocument;
    if (!d) return;
    d.querySelectorAll("[data-home-item]").forEach((n) => { (n as HTMLElement).style.outline = ""; (n as HTMLElement).style.outlineOffset = ""; });
    if (!focus) return;
    const el = d.querySelector(`[data-home-item="${focus}"]`) as HTMLElement | null;
    if (!el) return;
    el.style.outline = "4px solid #1d428a"; el.style.outlineOffset = "-4px";
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, loaded]);
  const onLoad = () => {
    const d = frame.current?.contentDocument;
    if (d) {
      const st = d.createElement("style");
      st.textContent = "[data-home-item]{cursor:pointer}[data-home-item]:hover{box-shadow:inset 0 0 0 3px rgba(29,66,138,.45)}";
      d.head.appendChild(st);
      d.addEventListener("click", (e) => {
        const t = (e.target as HTMLElement).closest("[data-home-item]");
        e.preventDefault(); e.stopPropagation();
        if (t) pick.current(t.getAttribute("data-home-item")!);
      }, true);
    }
    setLoaded((n) => n + 1);
  };
  const target = device === "desktop" ? 1280 : 390;
  const scale = w ? Math.min(1, w / target) : 1;
  const h = 900;
  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-2">Προεπισκόπηση{saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}<span className="font-normal text-eu-muted">· πάτα πάνω της για να επιλέξεις</span></span>
        <div className="flex gap-1 rounded-full bg-white border border-eu-line p-1" role="radiogroup" aria-label="Συσκευή προεπισκόπησης">
          {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] ${device === d ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{d === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}{d === "desktop" ? "Υπολογιστής" : "Κινητό"}</button>)}
        </div>
      </div>
      <div ref={box} className="rounded-2xl border border-eu-line bg-eu-line-2 overflow-hidden" style={{ height: Math.min(h * scale, 760) }}>
        <div style={{ width: target, height: Math.min(h * scale, 760) / scale, transform: `scale(${scale})`, transformOrigin: "top left", margin: device === "mobile" && w > target ? "0 auto" : undefined }}>
          <iframe ref={frame} key={v} onLoad={onLoad} title="Προεπισκόπηση αρχικής" src={`/?preview=1&v=${v}`} className="block bg-white" style={{ width: target, height: "100%", border: 0 }} />
        </div>
      </div>
    </div>
  );
}
