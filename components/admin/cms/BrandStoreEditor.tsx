"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, CalendarClock, Check, ChevronDown, ChevronLeft, CircleAlert, Copy, ExternalLink, Eye, EyeOff, GalleryHorizontal, GripVertical, History,
  IdCard, Keyboard, List, Loader2, MoreHorizontal, Package, Palette, Plus, QrCode, Redo2, Rocket, RotateCcw, Send, Trash2, Undo2, X, type LucideIcon,
} from "lucide-react";
import type { BrandBlock, BrandStore } from "@/lib/cms/brand-store";
import { checkStore, type Issue } from "@/lib/cms/brand-store-check";
import { blkKey, diffBrand, flattenBrand, rebuildBrand, revertBrandChange, type BrandChange, type BrandItem } from "@/lib/cms/brand-diff";
import { stable } from "@/lib/cms/list-diff";
import type { HomeHealth } from "@/lib/cms/home-health";
import type { Review } from "@/lib/cms/doc-plans";
import { brandHealthAction, publishAction, revertAction, saveDraftAction, unpublishAction, type PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { clearReviewAction, plansAction, saveScenarioAction, submitReviewAction, type PlanRef } from "@/app/admin/(shell)/cms/plans-actions";
import { ResultBanner, StatusPill } from "@/components/admin/settings/ui";
import { HistoryDialog, KeysDialog, PlansDialog, PublishDialog, ShareDialog, type Noun } from "./EditorDialogs";
import { AddDialog, BLOCK_ICON, ico, LivePreview, RightSwitch, useFocusText, visSummary, VisibilityForm, type Vis } from "./EditorKit";
import { BLOCK_INFO, BlockFields, newBlock } from "./brand/BlockEditors";
import { ProductList } from "./brand/ProductPicker";
import { StylePanel } from "./brand/StylePanel";
import { Area, LinkField, MediaUrl, Txt } from "./brand/fields";
import { PickerBrand } from "./brand/ImagePicker";
import { LogoField } from "./brand/LogoField";

/** Στις σελίδες μαρκών: όλα εκτός από τα «Καταστήματα» (ταιριάζουν στις πληροφοριακές σελίδες). */
const BRAND_TYPES: BrandBlock["type"][] = ["new-arrivals", "series", "offers", "story", "tech", "support", "video", "announcement", "usp", "banner", "products-auto", "categories", "faq", "text", "gallery", "cta", "ad", "promo-products", "promo-landing", "coupon"];

type Item = BrandItem;
const PART: Record<"identity" | "theme" | "hero", { label: string; help: string; I: LucideIcon }> = {
  identity: { label: "Ταυτότητα & Google", help: "Όνομα, λογότυπο και πώς εμφανίζεται η σελίδα στη Google.", I: IdCard },
  theme: { label: "Χρώματα της μάρκας", help: "Όλη η σελίδα παίρνει αυτά τα χρώματα· το μενού, το καλάθι και ο Ερμής μένουν στα χρώματα της Euronics.", I: Palette },
  hero: { label: "Hero", help: "Το πρώτο που βλέπει ο επισκέπτης: τίτλος σε τρεις γραμμές (η τελευταία στο χρώμα της μάρκας), κείμενο, κουμπί και το κορυφαίο προϊόν.", I: GalleryHorizontal },
};
const itemName = (it: Item) => (it.kind === "part" ? PART[it.part].label : it.kind === "divider" ? "Κάτω ζώνη" : `${BLOCK_INFO[it.b.type].label}${it.b.title ? ` · ${it.b.title}` : ""}`);
const itemIcon = (it: Item): LucideIcon => (it.kind === "part" ? PART[it.part].I : it.kind === "block" ? BLOCK_ICON[it.b.type] ?? Package : List);
/** Από τον έλεγχο της σελίδας (anchor) στο στοιχείο του χάρτη. */
const issueKey = (e: Issue) => (e.anchor?.startsWith("blk-") ? blkKey(e.anchor.slice(4)) : e.anchor === "sec-hero" ? "part:hero" : e.anchor === "sec-identity" ? "part:identity" : e.where === "Χρώματα" ? "part:theme" : "");
const whenShort = (iso: string) => new Date(iso).toLocaleString("el-GR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");
const movable = (it: Item | undefined) => it?.kind === "block";

type Dialog = "publish" | "plans" | "history" | "share" | "keys" | null;
export type BrandPlansInfo = { review: Review | null; scheduled: { name: string; publishAt: string }[] };
type Props = {
  initial: BrandStore; published: BrandStore | null; savedAt: string; brand: { id: string; name: string; logo: string | null }; info: Record<string, PickProduct>;
  canPublish: boolean; health: HomeHealth; plans: BrandPlansInfo; me: string;
};

/**
 * Σελίδα μάρκας με το ίδιο μοτίβο με τις Ζώνες αρχικής: χάρτης της σελίδας (πάντα ορατός) · ρυθμίσεις του επιλεγμένου ·
 * ζωντανή προεπισκόπηση (κλικ = επιλογή). Αναίρεση, αυτόματη αποθήκευση, έλεγχος & δημοσίευση, σενάρια, ιστορικό, έγκριση, QR.
 */
export function BrandStoreEditor({ initial, published: pub, savedAt: initSavedAt, brand, info: initInfo, canPublish, health: initHealth, plans: initPlans, me }: Props) {
  const router = useRouter();
  const PLAN = useMemo<PlanRef>(() => ({ kind: "brand", slug: initial.slug }), [initial.slug]);
  const [s, setRaw] = useState<BrandStore>(initial);
  const NOUN: Noun = { the: `η σελίδα ${s.name}`, of: `της σελίδας ${s.name}`, order: "Νέα σειρά ενοτήτων" };
  const [past, setPast] = useState<BrandStore[]>([]);
  const [future, setFuture] = useState<BrandStore[]>([]);
  const lastPush = useRef<{ tag: string; at: number }>({ tag: "", at: 0 });
  const [info, setInfo] = useState(initInfo);
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [savedAt, setSavedAt] = useState(initSavedAt);
  const [published, setPublished] = useState<BrandStore | null>(pub);
  const [selected, setSelected] = useState<string | null>(null);
  const [right, setRight] = useState<"settings" | "preview">("settings");
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"s" | "m" | "l">("s");
  useEffect(() => {
    const el = root.current;
    if (!el) return;
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
  const [review, setReview] = useState<Review | null>(initPlans.review);
  const [scheduled, setScheduled] = useState(initPlans.scheduled);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [focusText, setFocusText] = useState<{ text: string; n: number } | null>(null);
  const [more, setMore] = useState(false);
  const latest = useRef(s);
  const savedJson = useRef(stable(initial));
  const onInfo = useCallback((list: PickProduct[]) => setInfo((x) => ({ ...x, ...Object.fromEntries(list.map((p) => [p.id, p])) })), []);

  /** Κάθε αλλαγή περνά από εδώ: ιστορικό αναίρεσης (συνεχόμενες πληκτρολογήσεις στο ίδιο πεδίο = ένα βήμα). */
  const update = useCallback((fn: (d: BrandStore) => BrandStore, tag = "") => {
    setRaw((d) => {
      const next = fn(d);
      const now = Date.now();
      if (!(tag && tag === lastPush.current.tag && now - lastPush.current.at < 1500)) { setPast((p) => [...p.slice(-49), d]); setFuture([]); }
      lastPush.current = { tag, at: now };
      return next;
    });
  }, []);
  const undo = useCallback(() => setPast((p) => { if (!p.length) return p; const prev = p[p.length - 1]; setFuture((f) => [latest.current, ...f]); setRaw(prev); lastPush.current = { tag: "", at: 0 }; return p.slice(0, -1); }), []);
  const redo = useCallback(() => setFuture((f) => { if (!f.length) return f; const nx = f[0]; setPast((p) => [...p, latest.current]); setRaw(nx); lastPush.current = { tag: "", at: 0 }; return f.slice(1); }), []);

  // αυτόματη αποθήκευση στο πρόχειρο· μετά, έλεγχος ποια components βγαίνουν κενά
  const flush = useCallback(async () => {
    setSave("saving");
    const r = await saveDraftAction(latest.current.slug, latest.current);
    if (!r.ok) { setSave("error"); return false; }
    savedJson.current = stable(latest.current);
    setSave("idle"); setSavedAt(r.at!); setPv((v) => v + 1);
    void brandHealthAction(latest.current).then(setHealth).catch(() => null);
    return true;
  }, []);
  useEffect(() => {
    latest.current = s;
    if (stable(s) === savedJson.current) return;
    const t0 = setTimeout(() => setSave("pending"), 0);
    const t = setTimeout(() => { void flush(); }, 1000);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [s, flush]);
  useEffect(() => {
    if (save === "idle") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  const items = useMemo(() => flattenBrand(s), [s]);
  const settingsItems = items.slice(0, 2);
  const pageItems = items.slice(2);
  const idx = (key: string) => items.findIndex((x) => x.key === key);
  const sel = selected ? items.find((x) => x.key === selected) ?? null : null;
  const { errors, warnings } = checkStore(s);
  const diff = useMemo(() => diffBrand(s, published), [s, published]);
  const changes = diff.length;
  const isPublished = published !== null;
  const canPublishNow = !isPublished || changes > 0;
  const issuesOf = (key: string) => [...health.issues.filter((i) => i.key === key), ...warnings.filter((w) => issueKey(w) === key).map((w) => ({ key, msg: w.msg }))];
  const errorsOf = (key: string) => errors.filter((e) => issueKey(e) === key);
  const nameOfKey = (key: string) => { const it = items.find((x) => x.key === key) ?? (published ? flattenBrand(published).find((x) => x.key === key) : undefined); return it ? itemName(it) : key; };

  /** μετακίνηση component: μόνο μέσα στη σελίδα (μετά τις ρυθμίσεις), οι ζώνες προκύπτουν από τη θέση */
  const move = (key: string, to: number) => update((d) => { const l = flattenBrand(d); const i = l.findIndex((x) => x.key === key); if (i < 0 || !movable(l[i])) return d; const [x] = l.splice(i, 1); l.splice(Math.max(2, Math.min(l.length, to > i ? to - 1 : to)), 0, x); return rebuildBrand(l, d); });
  const setBlock = (b: BrandBlock, tag = "") => update((d) => ({ ...d, blocks: d.blocks.map((x) => (x.id === b.id ? b : x)) }), tag);
  const toggle = (it: Item) => { if (it.kind === "block") setBlock({ ...it.b, enabled: it.b.enabled === false ? undefined : false }); };
  const remove = (it: Item) => { if (it.kind !== "block") return; update((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== it.b.id) })); setSelected(null); };
  const duplicate = (it: Item) => { if (it.kind !== "block") return; const c = { ...structuredClone(it.b), id: newBlock(it.b.type, s.name).id }; update((d) => { const l = flattenBrand(d); l.splice(l.findIndex((x) => x.key === it.key) + 1, 0, { key: blkKey(c.id), kind: "block", b: c }); return rebuildBrand(l, d); }); setSelected(blkKey(c.id)); };
  const add = (type: BrandBlock["type"], after: string | null) => {
    const b = newBlock(type, s.name);
    update((d) => { const l = flattenBrand(d); const at = after ? l.findIndex((x) => x.key === after) + 1 : 2 /* χωρίς θέση = στην κορυφή, πάνω από το Hero */; l.splice(Math.max(2, at), 0, { key: blkKey(b.id), kind: "block", b }); return rebuildBrand(l, d); });
    setAdding(null); setSelected(blkKey(b.id)); setRight("settings");
  };
  const open = (key: string) => { setSelected((cur) => (cur === key && mode === "s" ? null : key)); setRight("settings"); };
  const goKey = (key: string) => { if (!items.some((x) => x.key === key)) return; setDialog(null); setSelected(key); setRight("settings"); setView("page"); };
  const loadDoc = (d: BrandStore, label: string) => { update(() => ({ ...structuredClone(d), slug: s.slug })); setDialog(null); setSelected(null); setResult({ ok: true, message: `Φορτώθηκε στο πρόχειρο: ${label}. Δες την προεπισκόπηση και πάτα «Δημοσίευση» για να ανέβει (ή Αναίρεση για να γυρίσεις).` }); };
  const refreshPlans = () => { void plansAction(PLAN).then((p) => { setReview(p.review); setScheduled(p.scenarios.filter((x) => x.status === "scheduled" && x.publishAt).map((x) => ({ name: x.name, publishAt: x.publishAt! })).sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt))); }); };

  const ensureSaved = async () => save === "idle" || (await flush());
  const doPublish = () => start(async () => {
    if (!(await ensureSaved())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
    const r = await publishAction(s.slug);
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
  const unpub = () => { if (!window.confirm("Απόσυρση της σελίδας; Η μάρκα θα δείχνει μόνο τον κατάλογο. Το πρόχειρο μένει και μπορείς να ξαναδημοσιεύσεις.")) return; start(async () => { setResult(await unpublishAction(s.slug)); setPublished(null); setPv((v) => v + 1); router.refresh(); }); };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές του πρόχειρου και να γυρίσει στη δημοσιευμένη έκδοση;")) return; start(async () => { setResult(await revertAction(s.slug)); window.location.reload(); }); };

  // πλήκτρα (με e.code: ίδια και με ελληνικό πληκτρολόγιο)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.code === "KeyZ") { if (typing(e.target)) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.code === "KeyS") { e.preventDefault(); if (save !== "idle") void flush(); return; }
      if (mod && e.key === "Enter") { e.preventDefault(); if (canPublishNow) setDialog("publish"); return; }
      if (dialog || adding || more || mod || e.altKey || typing(e.target)) return;
      if (e.key === "Escape" && selected) { setSelected(null); return; }
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) { e.preventDefault(); setDialog("keys"); return; }
      if (e.code === "KeyJ" || e.code === "KeyK") {
        e.preventDefault();
        const nav = items.filter((x) => x.kind !== "divider");
        const i = selected ? nav.findIndex((x) => x.key === selected) : -1;
        const n = e.code === "KeyJ" ? Math.min(nav.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
        setSelected(nav[n].key); setRight("settings");
        document.getElementById(`map-${nav[n].key}`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.code === "KeyH" && sel) { e.preventDefault(); toggle(sel); }
    };
  });
  useEffect(() => { const k = (e: KeyboardEvent) => keys.current(e); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const ctx = { brandId: brand.id, brandName: s.name, info, onInfo };
  const inspector = (x: Item) => (
    <Inspector it={x} s={s} brand={brand} ctx={ctx} index={idx(x.key)} count={items.length} prevName={idx(x.key) > 2 ? itemName(items[idx(x.key) - 1]) : null}
      errors={errorsOf(x.key)} empty={health.empty[x.key] ?? null} issues={issuesOf(x.key)} focusText={focusText}
      onClose={() => setSelected(null)} update={update}
      onToggle={() => toggle(x)} onMove={(d) => move(x.key, d < 0 ? idx(x.key) - 1 : idx(x.key) + 2)} onDuplicate={() => duplicate(x)}
      onRemove={() => { if (window.confirm(`Διαγραφή του «${itemName(x)}»; (Για να μη φαίνεται χωρίς να χαθεί, πάτα το μάτι.)`)) remove(x); }}
      setBlock={setBlock} />
  );
  const saveText = save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : `Αποθηκεύτηκε ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}`;
  const status = !isPublished ? (["off", "Πρόχειρο — δεν φαίνεται"] as const) : changes ? (["incomplete", `Δημοσιευμένη · ${changes} ${changes === 1 ? "αλλαγή" : "αλλαγές"}`] as const) : (["live", "Δημοσιευμένη"] as const);
  const iconBtn = "size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30 disabled:hover:bg-transparent";
  const notice = sel && sel.kind === "block" ? (() => { const v = visSummary(sel.b as Vis); if (!v.live) return `«${itemName(sel)}» δεν φαίνεται τώρα: ${v.text}.`; const why = health.empty[sel.key]; return why ? `«${itemName(sel)}» δεν φαίνεται τώρα: ${why}` : null; })() : null;
  const emptyCount = items.filter((it) => it.kind === "block" && health.empty[it.key] && visSummary(it.b as Vis).live).length;
  const MENU: { t: string; I: LucideIcon; on: () => void; d?: string }[] = [
    { t: "Σενάρια & προγραμματισμός", I: CalendarClock, on: () => setDialog("plans"), d: "Έτοιμες εκδοχές της σελίδας, με ώρα δημοσίευσης" },
    { t: "Ιστορικό δημοσιεύσεων", I: History, on: () => setDialog("history"), d: "Επαναφορά παλιότερης εκδοχής" },
    { t: "Σύνδεσμος & QR προεπισκόπησης", I: QrCode, on: () => setDialog("share"), d: "Στο κινητό ή σε συνάδελφο, χωρίς λογαριασμό" },
    { t: "Προεπισκόπηση σε νέα καρτέλα", I: ExternalLink, on: () => window.open(`/brands/${s.slug}?preview=1`, "_blank", "noopener") },
    ...(isPublished && changes > 0 ? [{ t: "Ακύρωση αλλαγών", I: Undo2, on: revert, d: "Το πρόχειρο γυρίζει στη δημοσιευμένη" }] : []),
    ...(isPublished && canPublish ? [{ t: "Απόσυρση σελίδας", I: RotateCcw, on: unpub, d: "Η μάρκα δείχνει μόνο τον κατάλογο" }] : []),
    { t: "Συντομεύσεις πλήκτρων", I: Keyboard, on: () => setDialog("keys"), d: "Πάτα ? οποτεδήποτε" },
  ];

  const row = (it: Item, i: number) => {
    if (it.kind === "divider") return (
      <li key={it.key} id={`map-${it.key}`} className="relative"
        onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.over !== i + 1) setDrag({ ...drag, over: i + 1 }); }}
        onDrop={(e) => { e.preventDefault(); if (drag?.over != null) move(drag.from, drag.over); setDrag(null); }}>
        <div className="flex items-center gap-2 my-1.5 text-eu-muted text-[length:var(--fs-13)] font-bold"><span className="h-px flex-1 bg-eu-line" aria-hidden />Κάτω ζώνη · πριν τον κατάλογο<span className="h-px flex-1 bg-eu-line" aria-hidden /><button type="button" onClick={() => setAdding({ after: it.key })} aria-label="Προσθήκη στην κάτω ζώνη" title="Προσθήκη εδώ" className="size-9 grid place-items-center rounded-full hover:bg-eu-surface"><Plus className="size-4" aria-hidden /></button></div>
      </li>
    );
    const isBlock = it.kind === "block";
    const v = isBlock ? visSummary(it.b as Vis) : { live: true, text: "", plain: true, soon: false };
    const bad = errorsOf(it.key).length > 0;
    const warn = !bad && issuesOf(it.key).length > 0;
    const empty = v.live ? health.empty[it.key] : undefined;
    const meta = [bad ? "Θέλει διόρθωση" : warn ? "Θέλει έλεγχο" : "", empty ? "Κενό — δεν φαίνεται" : "", v.plain ? "" : v.text].filter(Boolean).join(" · ");
    return (
      <li key={it.key} id={`map-${it.key}`} className="relative"
        onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const over = e.clientY < r.top + r.height / 2 ? i : i + 1; if (over !== drag.over) setDrag({ ...drag, over }); }}
        onDrop={(e) => { e.preventDefault(); if (drag?.over != null) move(drag.from, drag.over); setDrag(null); }}>
        {drag?.over === i && i >= 2 && <span aria-hidden className="absolute -top-0.5 inset-x-0 h-1 rounded-full bg-eu-blue" />}
        <div className={`group flex items-center gap-1 rounded-xl border mb-1.5 ${selected === it.key ? "border-eu-navy ring-2 ring-eu-navy/30 bg-eu-chip" : isBlock ? "bg-eu-chip/50 border-eu-blue/30" : "bg-white border-eu-line"} ${isBlock ? "ml-4" : ""} ${drag?.from === it.key ? "opacity-40" : ""}`}>
          {isBlock ? <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ from: it.key, over: null }); }} onDragEnd={() => setDrag(null)} title="Σύρε για αλλαγή σειράς ή ζώνης" aria-hidden className="hidden @md:grid place-items-center w-7 self-stretch cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-4" /></span> : <span className="hidden @md:block w-7" aria-hidden />}
          <button type="button" onClick={() => open(it.key)}
            onKeyDown={(e) => { if (!e.altKey || !isBlock) return; if (e.key === "ArrowUp" && i > 2) { e.preventDefault(); move(it.key, i - 1); } if (e.key === "ArrowDown" && i < items.length - 1) { e.preventDefault(); move(it.key, i + 2); } }}
            aria-label={`${itemName(it)}${empty ? " — κενό, δεν φαίνεται" : ""}${meta ? ` — ${meta}` : ""}. Άνοιγμα ρυθμίσεων.${isBlock ? " Alt + βέλη για μετακίνηση." : ""}`}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-2 py-1.5 min-h-12 rounded-xl hover:bg-eu-surface/70 focus-visible:outline-2 focus-visible:outline-eu-blue">
            <span className={`relative size-9 shrink-0 grid place-items-center rounded-lg ${isBlock ? "bg-white text-eu-blue border border-eu-blue/30" : "bg-eu-navy text-white"} ${v.live && !empty ? "" : "opacity-50"}`}>
              {ico(itemIcon(it), "size-[18px]")}
              {(bad || warn || empty || v.soon) && <span aria-hidden className={`absolute -top-1 -right-1 size-3 rounded-full ring-2 ring-white ${bad ? "bg-eu-red" : "bg-eu-amber"}`} />}
            </span>
            <span className="grid min-w-0">
              <span className={`font-bold text-[length:var(--fs-15)] leading-snug line-clamp-2 ${v.live && !empty ? "text-eu-ink" : "text-eu-muted"} ${v.live ? "" : "line-through decoration-1"}`}>{itemName(it)}</span>
              {meta && <span className={`text-[length:var(--fs-13)] leading-snug ${bad ? "text-eu-red font-bold" : warn || empty || v.soon ? "text-eu-ink-2 font-bold" : "text-eu-muted"}`}>{meta}</span>}
            </span>
          </button>
          {isBlock && <button type="button" onClick={() => toggle(it)} aria-label={it.b.enabled === false ? `Εμφάνιση: ${itemName(it)}` : `Απόκρυψη: ${itemName(it)}`} title={it.b.enabled === false ? "Εμφάνιση (H)" : "Απόκρυψη (H)"} className={iconBtn}>{it.b.enabled === false ? <EyeOff className="size-4 text-eu-muted" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>}
          {i >= 2 && <button type="button" onClick={() => setAdding({ after: it.key })} aria-label={`Προσθήκη κάτω από: ${itemName(it)}`} title="Προσθήκη από κάτω" className={iconBtn}><Plus className="size-4" aria-hidden /></button>}
        </div>
        {mode === "s" && selected === it.key && sel && <div className="mb-3 ml-2 pl-3 border-l-4 border-eu-navy">{inspector(sel)}</div>}
        {drag?.over === items.length && i === items.length - 1 && <span aria-hidden className="absolute -bottom-0.5 inset-x-0 h-1 rounded-full bg-eu-blue" />}
      </li>
    );
  };

  return (
    <PickerBrand.Provider value={{ brandId: brand.id, brandName: s.name }}>
      <div ref={root} className="grid gap-3 min-w-0">
        {/* ---- πάνω μπάρα: κατάσταση, αναίρεση, δημοσίευση ---- */}
        <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2.5 bg-white/95 backdrop-blur border-b border-eu-line flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/admin/cms/brand-stores" aria-label="Σελίδες μαρκών" title="Σελίδες μαρκών" className={iconBtn}><ChevronLeft className="size-5" aria-hidden /></Link>
          <div className="min-w-0 grid">
            <div className="flex flex-wrap items-center gap-2"><h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">{s.name}</h1><StatusPill status={status[0]} text={status[1]} /></div>
            <span role="status" className={`inline-flex flex-wrap items-center gap-x-1.5 text-[length:var(--fs-13)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>
              {save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}
              {saveText} · /brands/{s.slug}
              {scheduled[0] && <button type="button" onClick={() => setDialog("plans")} className="inline-flex items-center gap-1 text-eu-blue underline font-bold min-h-6"><CalendarClock className="size-3.5" aria-hidden />«{scheduled[0].name}» {whenShort(scheduled[0].publishAt)}{scheduled.length > 1 ? ` +${scheduled.length - 1}` : ""}</button>}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={undo} disabled={!past.length} aria-label="Αναίρεση" title="Αναίρεση (Ctrl/⌘ Z)" className={iconBtn}><Undo2 className="size-5" aria-hidden /></button>
            <button type="button" onClick={redo} disabled={!future.length} aria-label="Επανάληψη" title="Επανάληψη (Ctrl/⌘ ⇧ Z)" className={iconBtn}><Redo2 className="size-5" aria-hidden /></button>
            <div className="relative">
              <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-haspopup="menu" aria-label="Περισσότερα" title="Σενάρια, ιστορικό, QR, απόσυρση" className={iconBtn}><MoreHorizontal className="size-5" aria-hidden /></button>
              {more && (
                <>
                  <button type="button" aria-label="Κλείσιμο μενού" onClick={() => setMore(false)} className="fixed inset-0 z-40 cursor-default" />
                  <ul role="menu" onKeyDown={(e) => { if (e.key === "Escape") setMore(false); }} className="absolute right-0 top-12 z-50 m-0 p-1.5 list-none w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-eu-line bg-white shadow-[var(--shadow-overlay)] grid gap-0.5">
                    {MENU.map((m) => (
                      <li key={m.t} role="none"><button type="button" role="menuitem" autoFocus={m === MENU[0]} onClick={() => { setMore(false); m.on(); }} className="w-full flex items-start gap-3 rounded-xl px-3 py-2 min-h-12 text-left hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue">
                        {ico(m.I, `size-5 mt-0.5 shrink-0 ${m.I === RotateCcw ? "text-eu-red" : "text-eu-blue"}`)}
                        <span className="grid"><span className={`font-bold text-[length:var(--fs-14)] ${m.I === RotateCcw ? "text-eu-red" : "text-eu-ink"}`}>{m.t}</span>{m.d && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{m.d}</span>}</span>
                      </button></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <button type="button" onClick={() => setDialog("publish")} disabled={busy || !canPublishNow} title="Έλεγχος & δημοσίευση (Ctrl/⌘ Enter)" className="ml-1 inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : canPublish ? <Rocket className="size-4" aria-hidden /> : <Send className="size-4" aria-hidden />}{canPublish ? "Δημοσίευση" : "Για έγκριση"}{canPublish && changes > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[length:var(--fs-13)] tabular-nums">{changes}</span>}
            </button>
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
              {result.errors?.length ? <ul className="m-0 mt-1 p-0 list-none grid gap-1">{result.errors.map((e, k) => <li key={k}><button type="button" onClick={() => goKey(issueKey(e))} className="text-left text-eu-red font-bold text-[length:var(--fs-14)] underline min-h-11">{e.where}: {e.msg}</button></li>)}</ul> : null}
              <button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button>
            </div>
          )}
          <div className={`${mode === "s" ? "" : "hidden"} basis-full grid grid-cols-2 gap-1 rounded-full bg-eu-surface p-1`} role="tablist" aria-label="Προβολή">
            {(["page", "preview"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full min-h-11 font-bold text-[length:var(--fs-14)] ${view === v ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{v === "page" ? "Σελίδα" : "Προεπισκόπηση"}</button>)}
          </div>
        </div>

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: mode === "s" ? "minmax(0,1fr)" : mode === "m" ? "minmax(18rem,22rem) minmax(0,1fr)" : sel ? "minmax(18rem,22rem) minmax(22rem,30rem) minmax(0,1fr)" : "minmax(18rem,24rem) minmax(0,1fr)" }}>
          {/* ---- ο χάρτης της σελίδας ---- */}
          <div className={`${mode === "s" && view !== "page" ? "hidden" : ""} min-w-0 ${mode === "s" ? "" : "sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1"}`}>
            <div className="grid gap-3">
              {errors.length > 0 || warnings.length > 0 ? (
                <p className={`m-0 inline-flex items-start gap-2 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold ${errors.length ? "bg-eu-red/10 text-eu-red" : "bg-eu-amber/15 text-eu-ink-2"}`}><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{errors.length ? `${errors.length} θέματα θέλουν διόρθωση πριν τη δημοσίευση — άνοιξε όσα έχουν κόκκινη ένδειξη.` : `${warnings.length} συστάσεις — άνοιξε όσα έχουν πορτοκαλί ένδειξη.`}</p>
              ) : null}
              {emptyCount > 0 && <p className="m-0 inline-flex items-start gap-2 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold bg-eu-amber/15 text-eu-ink-2"><EyeOff className="size-4 mt-0.5 shrink-0" aria-hidden />{emptyCount === 1 ? "1 component είναι ενεργό αλλά κενό — δεν φαίνεται στη σελίδα." : `${emptyCount} components είναι ενεργά αλλά κενά — δεν φαίνονται στη σελίδα.`}</p>}
              <section aria-label="Ρυθμίσεις σελίδας" className="grid gap-1">
                <h2 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Ρυθμίσεις σελίδας</h2>
                <ol className="m-0 p-0 list-none grid">{settingsItems.map((it, i) => row(it, i))}</ol>
              </section>
              <section aria-label="Η σελίδα από πάνω προς τα κάτω" className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Η σελίδα από πάνω προς τα κάτω</h2>
                  <button type="button" onClick={() => setAdding({ after: "part:hero" })} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-3 min-h-10 font-bold text-[length:var(--fs-13)] hover:bg-eu-chip"><Plus className="size-4" aria-hidden /> Προσθήκη</button>
                </div>
                <ol className="m-0 p-0 list-none grid" onDragOver={(e) => e.preventDefault()}>
                  {pageItems.map((it, k) => row(it, k + 2))}
                  <li className="flex items-center gap-2.5 rounded-xl border border-dashed border-eu-line px-3 py-2 min-h-12 text-eu-muted text-[length:var(--fs-14)] font-bold"><List className="size-5 shrink-0" aria-hidden /> Όλα τα προϊόντα {s.name} (κατάλογος με φίλτρα) — μπαίνει πάντα στο τέλος</li>
                </ol>
              </section>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-relaxed">Πάτα ένα στοιχείο για να το ρυθμίσεις ή πάτα πάνω στην προεπισκόπηση. Σύρε τα components από τη λαβή (ή Alt + βέλη): πάνω από το Hero, ανάμεσα ή στην κάτω ζώνη. Οι αλλαγές αποθηκεύονται μόνες τους· οι πελάτες τις βλέπουν μετά τη «Δημοσίευση». Πάτα <kbd className="rounded border border-eu-line px-1 font-mono">?</kbd> για τα πλήκτρα.</p>
            </div>
          </div>

          {/* ---- ρυθμίσεις ---- */}
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
              <LivePreview src={`/brands/${s.slug}?preview=1`} attr="data-cms-item" v={pv} device={device} setDevice={setDevice} saving={save !== "idle"} focus={sel && (sel.kind === "block" || sel.key === "part:hero") ? selected : null} notice={notice}
                onPick={(key, text) => { if (items.some((x) => x.key === key)) { setSelected(key); setRight("settings"); setView("page"); if (text) setFocusText((f) => ({ text, n: (f?.n ?? 0) + 1 })); } }} />
            </div>
          )}
        </div>
      </div>
      {adding && <AddDialog label={`Προσθήκη στη σελίδα ${s.name}`} allowed={BRAND_TYPES} top="Θέση: στην κορυφή, πάνω από το Hero" after={adding.after}
        positions={pageItems.map((it) => ({ key: it.key, label: it.kind === "divider" ? "Θέση: στην αρχή της κάτω ζώνης" : it.key === "part:hero" ? "Θέση: αμέσως κάτω από το Hero" : `Θέση: κάτω από «${itemName(it)}»` }))}
        onAdd={add} onClose={() => setAdding(null)} />}
      {dialog === "publish" && (
        <PublishDialog noun={NOUN} issueKey={issueKey} firstTime={!isPublished} changes={diff} nameOf={itemName} nameOfKey={nameOfKey} onRevert={(c: BrandChange) => published && update((d) => revertBrandChange(d, published, c))}
          health={health} errors={errors} warnings={warnings} canPublish={canPublish} busy={busy} review={review}
          onClose={() => setDialog(null)} onPublish={doPublish} onSchedule={doSchedule} onSubmitReview={doReview} onGo={goKey} />
      )}
      {dialog === "plans" && <PlansDialog planRef={PLAN} diffCount={(a, b) => diffBrand(a, b).length} doc={s} canWrite canPublish={canPublish} onLoad={loadDoc} onClose={() => setDialog(null)} onChanged={refreshPlans} />}
      {dialog === "history" && <HistoryDialog planRef={PLAN} noun={NOUN} diffCount={(a, b) => diffBrand(a, b).length} doc={s} canWrite onLoad={loadDoc} onClose={() => setDialog(null)} />}
      {dialog === "share" && <ShareDialog planRef={PLAN} noun={NOUN} onClose={() => setDialog(null)} />}
      {dialog === "keys" && <KeysDialog onClose={() => setDialog(null)} />}
    </PickerBrand.Provider>
  );
}

/* ---------------- ρυθμίσεις του επιλεγμένου ---------------- */
function Inspector({ it, s, brand, ctx, index, count, prevName, errors, empty, issues, focusText, onClose, update, onToggle, onMove, onDuplicate, onRemove, setBlock }: {
  it: Item; s: BrandStore; brand: { id: string; name: string; logo: string | null };
  ctx: { brandId: string | null; brandName: string; info: Record<string, PickProduct>; onInfo: (p: PickProduct[]) => void };
  index: number; count: number; prevName: string | null; errors: Issue[]; empty: string | null; issues: { msg: string }[]; focusText: { text: string; n: number } | null;
  onClose: () => void; update: (fn: (d: BrandStore) => BrandStore, tag?: string) => void;
  onToggle: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void; setBlock: (b: BrandBlock, tag?: string) => void;
}) {
  const box = useRef<HTMLElement>(null);
  useFocusText(box, focusText, it.key);
  const tag = `f:${it.key}`;
  const set = (patch: Partial<BrandStore>) => update((x) => ({ ...x, ...patch }), tag);
  const setHero = (patch: Partial<BrandStore["hero"]>) => update((x) => ({ ...x, hero: { ...x.hero, ...patch } }), tag);
  const isBlock = it.kind === "block";
  const v = isBlock ? (it.b as Vis) : null;
  const sum = v ? visSummary(v) : null;
  const iconBtn = "size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30";
  const title = isBlock ? BLOCK_INFO[it.b.type].label : it.kind === "part" ? PART[it.part].label : "";
  const help = isBlock ? BLOCK_INFO[it.b.type].help : it.kind === "part" ? PART[it.part].help : "";
  const where = it.kind === "part" && it.part !== "hero" ? "Ρύθμιση όλης της σελίδας" : `Θέση ${index - 1} από ${count - 2}${prevName ? ` · μετά από «${prevName}»` : " · στην κορυφή"}`;
  return (
    <section ref={box} aria-label={`Ρυθμίσεις: ${title}`} className="grid gap-3">
      <div className="sticky top-0 z-10 -mx-1 px-1 pb-1 bg-eu-surface grid gap-2">
        <div className="flex items-center gap-2">
          <span className="min-w-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug font-bold">{where}</span>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο ρυθμίσεων (Esc)" title="Κλείσιμο (Esc)" className="ml-auto size-11 shrink-0 grid place-items-center rounded-full hover:bg-white"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="rounded-2xl border border-eu-line bg-white grid">
          <div className="flex items-center gap-3 px-3 pt-3 pb-2">
            <span className={`size-10 shrink-0 grid place-items-center rounded-lg ${isBlock ? "bg-eu-chip text-eu-blue" : "bg-eu-navy text-white"}`}>{ico(itemIcon(it), "size-5")}</span>
            <h2 className="m-0 min-w-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight">{title}</h2>
          </div>
          {isBlock && (
            <div className="flex flex-wrap items-center gap-1 border-t border-eu-line px-2 py-1">
              <button type="button" onClick={onToggle} title="Εμφάνιση / απόκρυψη (H)" className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-surface">{it.b.enabled === false ? <><Eye className="size-4" aria-hidden /> Εμφάνιση</> : <><EyeOff className="size-4" aria-hidden /> Απόκρυψη</>}</button>
              <button type="button" onClick={() => onMove(-1)} disabled={index <= 2} aria-label="Πιο πάνω" title="Πιο πάνω" className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Πιο κάτω" title="Πιο κάτω" className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
              <button type="button" onClick={onDuplicate} aria-label="Αντίγραφο" title="Αντίγραφο" className={iconBtn}><Copy className="size-4" aria-hidden /></button>
              <button type="button" onClick={onRemove} aria-label="Διαγραφή" title="Διαγραφή" className={`${iconBtn} ml-auto text-eu-red hover:bg-eu-red/10`}><Trash2 className="size-4" aria-hidden /></button>
            </div>
          )}
        </div>
      </div>
      <p className="m-0 -mt-1 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{help}</p>
      {empty && sum?.live && <p role="status" className="m-0 flex items-start gap-2 rounded-xl bg-eu-amber/15 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]"><EyeOff className="size-4 mt-0.5 shrink-0" aria-hidden /><span><b>Δεν φαίνεται στη σελίδα τώρα.</b> {empty}</span></p>}
      {errors.length > 0 && <ul className="m-0 p-0 list-none grid gap-1 rounded-xl bg-eu-red/10 px-3 py-2">{errors.map((e, k) => <li key={k} className="text-eu-red font-bold text-[length:var(--fs-14)]">{e.msg}</li>)}</ul>}
      {issues.length > 0 && <ul className="m-0 p-0 list-none grid gap-1 rounded-xl bg-eu-amber/15 px-3 py-2">{issues.map((e, k) => <li key={k} className="flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{e.msg}</li>)}</ul>}
      {isBlock && v && sum && (
        <details className="group rounded-2xl border border-eu-line bg-white">
          <summary className="list-none cursor-pointer flex items-center gap-2 px-3 @md:px-4 min-h-12">
            <CalendarClock className="size-5 shrink-0 text-eu-blue" aria-hidden />
            <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Πότε & σε ποιες συσκευές</span><span className={`text-[length:var(--fs-13)] ${sum.live && !sum.soon ? "text-eu-muted" : "text-eu-ink-2 font-bold"}`}>{sum.plain ? "Πάντα · όλες οι συσκευές" : sum.text}</span></span>
            <ChevronDown className="ml-auto size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-3 @md:px-4 pb-4"><VisibilityForm audience={false} v={v} summary={sum.plain ? "Πάντα · όλες οι συσκευές" : sum.text} onChange={(p) => setBlock({ ...it.b, ...p } as BrandBlock)} /></div>
        </details>
      )}
      <div className="rounded-2xl border border-eu-line bg-white p-3 @md:p-4 grid gap-4">
        {isBlock && <BlockFields b={it.b} set={(nb) => setBlock(nb, `b:${it.key}`)} ctx={ctx} />}
        {it.kind === "part" && it.part === "identity" && <>
          <Txt label="Όνομα μάρκας" value={s.name} onChange={(x) => set({ name: x })} max={30} help="Σε κείμενα της σελίδας («Όλα τα προϊόντα LG»)." />
          <Txt label="Wordmark (κείμενο αντί λογοτύπου)" value={s.wordmark} onChange={(x) => set({ wordmark: x })} max={20} help="Χρησιμοποιείται όταν δεν υπάρχει λογότυπο." />
          <Txt label="Slogan" value={s.tagline} onChange={(x) => set({ tagline: x })} max={50} placeholder="π.χ. Life's Good" help="Στη σελίδα /brands, κάτω από το όνομα." />
          <LogoField value={{ logo: s.logo, logoAspect: s.logoAspect }} onChange={(x) => set({ logo: x.logo, logoAspect: x.logoAspect })} brandLogo={brand.logo} bg={s.theme.bg} dark={s.theme.mode === "dark"} name={s.wordmark || s.name} />
          <Txt label="Τίτλος για Google" value={s.seo.title} onChange={(x) => set({ seo: { ...s.seo, title: x } })} max={60} />
          <Area label="Περιγραφή για Google" value={s.seo.description} onChange={(x) => set({ seo: { ...s.seo, description: x } })} max={155} rows={3} />
          <div className="rounded-xl border border-eu-line p-3 grid gap-0.5 min-w-0" aria-label="Προεπισκόπηση στη Google">
            <span className="text-eu-muted text-[length:var(--fs-13)]">Έτσι περίπου στη Google</span>
            <span className="text-[#1a0dab] text-[length:var(--fs-18)] leading-snug line-clamp-1 break-all">{s.seo.title || "—"}</span>
            <span className="text-[#006621] text-[length:var(--fs-13)] truncate">euronics.gr › brands › {s.slug}</span>
            <span className="text-eu-ink-3 text-[length:var(--fs-14)] line-clamp-2">{s.seo.description || "—"}</span>
          </div>
        </>}
        {it.kind === "part" && it.part === "theme" && <StylePanel theme={s.theme} onTheme={(t) => set({ theme: t })} website={s.website ?? ""} onWebsite={(x) => set({ website: x })} name={s.wordmark || s.name} />}
        {it.kind === "part" && it.part === "hero" && <>
          <Txt label="Μικρός τίτλος δίπλα στο λογότυπο" value={s.hero.kicker} onChange={(x) => setHero({ kicker: x })} max={40} placeholder="π.χ. LG στη Euronics" />
          {[0, 1, 2].map((i) => <Txt key={i} label={`Τίτλος · γραμμή ${i + 1}${i === 2 ? " (χρώμα μάρκας)" : ""}`} value={s.hero.title[i] ?? ""} onChange={(x) => { const t = [...s.hero.title]; while (t.length < 3) t.push(""); t[i] = x; setHero({ title: t.filter((y, k) => y || k < 3) }); }} max={18} />)}
          <span className="text-eu-muted text-[length:var(--fs-13)] -mt-2">Λίγες, δυνατές λέξεις ανά γραμμή — σε κινητό ο τίτλος είναι πολύ μεγάλος.</span>
          <Area label="Κείμενο" value={s.hero.body} onChange={(x) => setHero({ body: x })} max={220} rows={3} help="2 προτάσεις: τι προσφέρει η μάρκα και γιατί να την αγοράσεις από τη Euronics." />
          <Txt label="Κουμπί · κείμενο" value={s.hero.cta.label} onChange={(x) => setHero({ cta: { ...s.hero.cta, label: x } })} max={36} />
          <LinkField label="Κουμπί · σύνδεσμος" value={s.hero.cta.href} onChange={(x) => setHero({ cta: { ...s.hero.cta, href: x } })} />
          <ProductList single label="Προϊόν του hero" help="Φαίνεται μεγάλο, χωρίς φόντο (cutout) όπου υπάρχει. Διάλεξε το πιο αντιπροσωπευτικό, με καλή φωτογραφία." ids={s.hero.productId ? [s.hero.productId] : []} onChange={(ids) => setHero({ productId: ids[0] ?? "" })} info={ctx.info} onInfo={ctx.onInfo} brandId={brand.id} brandName={s.name} />
          <MediaUrl label="Εικόνα φόντου (προαιρετική)" value={s.hero.image ?? ""} onChange={(x) => setHero({ image: x || undefined })} help="Μπαίνει αχνά πίσω από όλο το hero. Οριζόντια, τουλάχιστον 1920 px." />
        </>}
      </div>
    </section>
  );
}

