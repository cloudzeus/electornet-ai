"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, Check, ChevronLeft, ChevronRight, CircleAlert, Copy, ExternalLink, Eye, EyeOff, GripVertical, Loader2, Lock, Package, Plus, Rocket, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { INFO_ZONES, type InfoPage, type InfoZone } from "@/lib/cms/info-pages";
import { publishZonesAction, revertZonesAction, saveZonesAction } from "@/app/admin/(shell)/cms/pages/actions";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { StatusPill, ResultBanner } from "@/components/admin/settings/ui";
import { BLOCK_INFO, BlockFields, newBlock } from "./brand/BlockEditors";
import { AddDialog, BLOCK_ICON, ico, LivePreview, useFocusText, visSummary, VisibilityForm, type Vis } from "./EditorKit";
import { PickerBrand } from "./brand/ImagePicker";

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));
const zoneOf = (b: BrandBlock) => (b.zone ?? "top") as InfoZone;
/** Όνομα γραμμής: το είδος και ΤΙ δείχνει (τίτλος, banner, προσφορά, κωδικός κουπονιού). */
export const blockName = (b: BrandBlock) => {
  const what = b.title || ("placementTitle" in b && b.placementTitle) || ("promotionName" in b && b.promotionName) || (b.type === "coupon" && b.code) || "";
  return `${BLOCK_INFO[b.type].label}${what ? ` · ${what}` : ""}`;
};
const iconBtn = "size-11 md:size-9 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30";

/**
 * Ζώνες μιας πληροφοριακής σελίδας. Αριστερά ο ΧΑΡΤΗΣ της σελίδας: τα σταθερά μέρη (κλειδωμένα) και οι ζώνες στη θέση
 * που έχουν στη σελίδα, κάθε component μία γραμμή. Πάτημα σε γραμμή → οι ρυθμίσεις της στη θέση του χάρτη, ώστε η
 * προεπισκόπηση δεξιά να μένει πάντα ορατή. Ίδια κομμάτια (EditorKit) με τις Ζώνες αρχικής και τις σελίδες μαρκών.
 */
export function ZonePageEditor({ page, initial, published: pub, savedAt: initSavedAt, info: initInfo }: { page: InfoPage; initial: BrandBlock[]; published: BrandBlock[] | null; savedAt: string | null; info: Record<string, PickProduct> }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<BrandBlock[]>(initial);
  const [info, setInfo] = useState(initInfo);
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [savedAt, setSavedAt] = useState(initSavedAt);
  const [pubJson, setPubJson] = useState(pub ? stable(pub) : null);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState<InfoZone | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  // τονισμός ζώνης στην προεπισκόπηση: προσωρινός (ποντίκι/εστίαση) ή μόνιμος (πάτημα στον τίτλο της ζώνης)
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; zone: InfoZone; over: number } | null>(null);
  const [focusText, setFocusText] = useState<{ text: string; n: number } | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pv, setPv] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: Issue[] } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [busy, start] = useTransition();
  const latest = useRef(blocks);
  const savedJson = useRef(stable(initial));
  const previewBox = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLDivElement>(null);

  const onInfo = useCallback((list: PickProduct[]) => setInfo((x) => ({ ...x, ...Object.fromEntries(list.map((p) => [p.id, p])) })), []);
  const published = pubJson !== null;
  const changed = published ? stable(blocks) !== pubJson : blocks.length > 0;

  const flush = useCallback(async () => {
    setSave("saving");
    const r = await saveZonesAction(page.key, latest.current);
    if (!r.ok) { setSave("error"); return false; }
    savedJson.current = stable(latest.current);
    setSave("idle"); setSavedAt(r.at!); setPv((v) => v + 1);
    return true;
  }, [page.key]);
  useEffect(() => {
    latest.current = blocks;
    if (stable(blocks) === savedJson.current) return;
    const t0 = setTimeout(() => setSave("pending"), 0);
    const t = setTimeout(() => { void flush(); }, 1200);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [blocks, flush]);
  useEffect(() => {
    if (save === "idle") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  const inZone = (z: InfoZone) => blocks.filter((b) => zoneOf(b) === z);
  const setBlock = (nb: BrandBlock) => setBlocks((bl) => bl.map((y) => (y.id === nb.id ? nb : y)));
  /** Μετακίνηση στη ζώνη `zone`, πριν από το component που είναι τώρα στη θέση `idx` της (ή στο τέλος της). */
  const moveTo = (id: string, zone: InfoZone, idx: number) => setBlocks((bl) => {
    const b = bl.find((x) => x.id === id);
    const target = bl.filter((x) => zoneOf(x) === zone)[idx];
    if (!b || target?.id === id) return bl;
    const rest = bl.filter((x) => x.id !== id);
    const at = target ? rest.findIndex((x) => x.id === target.id) : rest.length;
    return [...rest.slice(0, at), { ...b, zone }, ...rest.slice(at)];
  });
  const addBlock = (t: BrandBlock["type"], zone: string | null) => {
    const nb = { ...newBlock(t, "Euronics"), zone: zone ?? page.zones[0] };
    setBlocks((bl) => [...bl, nb]);
    setAdding(null); setSel(nb.id); setView("edit");
  };
  const openBlock = (id: string) => { setSel(id); setView("edit"); setFocusText(null); };

  const { errors, warnings } = checkBlocks(blocks);
  const errorsOf = (id: string) => errors.filter((e) => e.anchor === `blk-${id}`);
  const go = (anchor?: string) => { if (anchor?.startsWith("blk-")) openBlock(anchor.slice(4)); setShowIssues(false); };
  const publish = () => {
    if (errors.length) { setShowIssues(true); setResult({ ok: false, message: `Υπάρχουν ${errors.length} θέματα που πρέπει να διορθωθούν πριν τη δημοσίευση.`, errors }); return; }
    if (!window.confirm(`Δημοσίευση των ζωνών της σελίδας «${page.title}»; Οι επισκέπτες θα τις δουν αμέσως.`)) return;
    start(async () => {
      if (save !== "idle" && !(await flush())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
      const r = await publishZonesAction(page.key);
      setResult(r);
      if (r.ok) { setPubJson(stable(latest.current)); router.refresh(); }
    });
  };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές του πρόχειρου και να γυρίσει στη δημοσιευμένη έκδοση;")) return; start(async () => { setResult(await revertZonesAction(page.key)); window.location.reload(); }); };
  const status = !published ? (blocks.length ? (["off", "Πρόχειρο · δεν φαίνεται ακόμη στο site"] as const) : (["off", "Κενή σελίδα"] as const)) : changed ? (["incomplete", "Έχει αλλαγές που δεν φαίνονται ακόμη στο site"] as const) : (["live", "Στο site όπως τη βλέπεις"] as const);
  const saveText = save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : savedAt ? `Αποθηκεύτηκε ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : "Χωρίς αλλαγές";

  const selB = blocks.find((b) => b.id === sel) ?? null;
  useFocusText(inspector, focusText, sel ?? "");
  const pin = (z: InfoZone) => {
    const next = pinned === z ? null : z;
    setPinned(next);
    // στενή οθόνη (καρτέλες): η προεπισκόπηση είναι κρυφή → πήγαινε εκεί για να φανεί η ζώνη
    if (next && previewBox.current?.offsetParent === null) setView("preview");
  };
  /** Κλικ μέσα στην προεπισκόπηση: ανοίγει το component της ζώνης που έχει το κείμενο που πατήθηκε (αλλιώς το πρώτο)· κενή ζώνη → προσθήκη. */
  const onPick = (zone: string, text: string | null) => {
    const here = inZone(zone as InfoZone);
    if (!here.length) { setAdding(zone as InfoZone); return; }
    const hit = (text && here.find((b) => JSON.stringify(b).includes(text))) || here[0];
    setSel(hit.id); setView("edit"); setFocusText(text ? { text, n: Date.now() } : null);
  };
  const selVis = selB ? visSummary(selB as Vis) : null;
  const notice = selB && selVis && !selVis.live ? `«${blockName(selB)}» δεν φαίνεται τώρα: ${selVis.text}.` : null;

  const fixed = (text: string, cls = "") => <div className={`flex items-start gap-1.5 rounded-lg bg-eu-surface text-eu-muted text-[length:var(--fs-13)] px-2.5 py-2 ${cls}`}><Lock className="size-3.5 mt-0.5 shrink-0" aria-hidden />{text}</div>;

  /** Μια ζώνη του χάρτη. compact = στενή στήλη (δίπλα-δίπλα με το κείμενο): γραμμές χωρίς λαβή και μάτι. */
  const zone = (z: InfoZone, compact = false) => {
    if (!page.zones.includes(z)) return null;
    const here = inZone(z);
    const lit = (hover ?? pinned) === z || (drag?.zone === z);
    return (
      <section key={z} id={`zone-${z}`} aria-label={`Ζώνη «${INFO_ZONES[z].label}»`} onMouseEnter={() => setHover(z)} onMouseLeave={() => setHover(null)}
        onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.zone !== z) setDrag({ ...drag, zone: z, over: here.length }); }}
        onDrop={(e) => { e.preventDefault(); if (drag) moveTo(drag.id, drag.zone, drag.over); setDrag(null); }}
        className={`grid gap-1.5 content-start rounded-xl border p-2 min-w-0 transition-colors ${lit ? "border-eu-yellow bg-eu-yellow/10" : "border-eu-line bg-white"}`}>
        <button type="button" onClick={() => pin(z)} onFocus={() => setHover(z)} onBlur={() => setHover(null)} aria-pressed={pinned === z} title={`${INFO_ZONES[z].help} Πάτα για να μείνει τονισμένη στην προεπισκόπηση.`}
          className="flex items-baseline justify-between gap-2 text-left min-h-11 md:min-h-7 px-1 rounded-lg hover:text-eu-blue">
          <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight">{INFO_ZONES[z].label}</span>
          <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums shrink-0">{here.length || "κενή"}</span>
        </button>
        {here.length > 0 && (
          <ol className="m-0 p-0 list-none grid gap-1.5">
            {here.map((b, k) => {
              const v = visSummary(b as Vis);
              const bad = errorsOf(b.id).length > 0;
              const meta = bad ? "Θέλει διόρθωση" : v.live && v.plain ? "Φαίνεται" : v.text;
              return (
                <li key={b.id} id={`blk-${b.id}`} className="relative"
                  onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const over = e.clientY < r.top + r.height / 2 ? k : k + 1; if (drag.zone !== z || drag.over !== over) setDrag({ ...drag, zone: z, over }); }}>
                  {drag?.zone === z && drag.over === k && <span aria-hidden className="absolute -top-1 inset-x-0 h-1 rounded-full bg-eu-blue" />}
                  <div className={`flex items-center rounded-xl border bg-white ${sel === b.id ? "border-eu-navy ring-2 ring-eu-navy/30" : bad ? "border-eu-red/60" : "border-eu-line"} ${drag?.id === b.id ? "opacity-40" : ""}`}>
                    {!compact && <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ id: b.id, zone: z, over: k }); }} onDragEnd={() => setDrag(null)} title="Σύρε για αλλαγή σειράς ή ζώνης" aria-hidden className="hidden md:grid place-items-center w-6 self-stretch cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-4" /></span>}
                    <button type="button" onClick={() => openBlock(b.id)}
                      onKeyDown={(e) => { if (!e.altKey) return; if (e.key === "ArrowUp" && k > 0) { e.preventDefault(); moveTo(b.id, z, k - 1); } if (e.key === "ArrowDown" && k < here.length - 1) { e.preventDefault(); moveTo(b.id, z, k + 2); } }}
                      aria-label={`${blockName(b)} — ${meta}. Άνοιγμα ρυθμίσεων. Alt + βέλη για αλλαγή σειράς.`}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left px-1.5 py-1.5 min-h-12 rounded-xl hover:bg-eu-surface/70 focus-visible:outline-2 focus-visible:outline-eu-blue">
                      {b.type === "banner" && b.image
                        ? <img src={b.image} alt="" loading="lazy" className={`shrink-0 rounded-md object-cover bg-eu-surface ${compact ? "size-8" : "w-12 h-9"} ${v.live ? "" : "opacity-50"}`} />
                        : <span className={`shrink-0 grid place-items-center rounded-md bg-eu-chip text-eu-blue ${compact ? "size-8" : "w-12 h-9"} ${v.live ? "" : "opacity-50"}`}>{ico(BLOCK_ICON[b.type] ?? Package, "size-[18px]")}</span>}
                      <span className="grid min-w-0">
                        <span className={`font-bold leading-snug line-clamp-2 text-[length:var(--fs-14)] ${v.live ? "text-eu-ink" : "text-eu-muted line-through decoration-1"}`}>{blockName(b)}</span>
                        <span className={`inline-flex items-center gap-1 text-[length:var(--fs-12)] ${bad ? "text-eu-red font-bold" : v.live ? (v.soon ? "text-eu-amber font-bold" : "text-eu-green") : "text-eu-muted"}`}>{bad ? <CircleAlert className="size-3.5 shrink-0" aria-hidden /> : v.live ? <Check className="size-3.5 shrink-0" aria-hidden /> : <EyeOff className="size-3.5 shrink-0" aria-hidden />}<span className="truncate">{meta}</span></span>
                      </span>
                      {!compact && <ChevronRight className="ml-auto size-4 shrink-0 text-eu-muted" aria-hidden />}
                    </button>
                  </div>
                  {drag?.zone === z && drag.over === k + 1 && k === here.length - 1 && <span aria-hidden className="absolute -bottom-1 inset-x-0 h-1 rounded-full bg-eu-blue" />}
                </li>
              );
            })}
          </ol>
        )}
        <button type="button" onClick={() => setAdding(z)} aria-label={`Προσθήκη στη ζώνη «${INFO_ZONES[z].label}»`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-eu-ink-3/50 text-eu-ink-2 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy hover:text-eu-navy hover:bg-eu-chip/50"><Plus className="size-4" aria-hidden />{compact ? "Προσθήκη" : "Προσθήκη εδώ"}</button>
      </section>
    );
  };

  const hasAside = page.zones.includes("aside");
  const map = (
    <div data-help="zones.blocks" className="grid gap-1.5 min-w-0">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Η σελίδα από πάνω προς τα κάτω. Τα γκρι είναι σταθερά· στις ζώνες βάζεις banner, προσφορές, κουπόνι, καταστήματα. Τίποτα δεν φαίνεται στο site πριν τη «Δημοσίευση».</p>
      {fixed("Τίτλος και εισαγωγή")}
      {zone("top")}
      <div className={`grid gap-1.5 items-start ${hasAside ? "grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
        <div className="grid gap-1.5 min-w-0">{fixed(page.main ?? "Κείμενο της σελίδας", "min-h-16")}{zone("after", hasAside)}</div>
        {hasAside && <div className={`grid gap-1.5 min-w-0 ${page.asideSide === "right" ? "" : "order-first"}`}>{page.asideSide !== "right" && fixed("Μενού")}{zone("aside", true)}</div>}
      </div>
      {zone("bottom")}
    </div>
  );

  const settings = selB && (() => {
    const z = zoneOf(selB), here = inZone(z), k = here.findIndex((b) => b.id === selB.id), errs = errorsOf(selB.id), v = visSummary(selB as Vis);
    return (
      <div ref={inspector} data-help="zones.settings" className="rounded-xl bg-white border border-eu-line min-w-0">
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-eu-line">
          <button type="button" onClick={() => setSel(null)} className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-9 font-bold text-eu-blue text-[length:var(--fs-13)] hover:bg-eu-surface"><ArrowLeft className="size-4" aria-hidden /> Όλη η σελίδα</button>
          <span className="ml-auto flex items-center">
            <button type="button" disabled={k <= 0} onClick={() => moveTo(selB.id, z, k - 1)} aria-label="Πιο πάνω στη ζώνη" title="Πιο πάνω" className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
            <button type="button" disabled={k >= here.length - 1} onClick={() => moveTo(selB.id, z, k + 2)} aria-label="Πιο κάτω στη ζώνη" title="Πιο κάτω" className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => { const c = { ...structuredClone(selB), id: newBlock(selB.type, "Euronics").id }; setBlocks((bl) => { const i = bl.findIndex((y) => y.id === selB.id); return [...bl.slice(0, i + 1), c, ...bl.slice(i + 1)]; }); setSel(c.id); }} aria-label="Αντίγραφο" title="Αντίγραφο" className={iconBtn}><Copy className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => { if (!window.confirm(`Διαγραφή του «${blockName(selB)}»; (Για να μη φαίνεται χωρίς να χαθεί, πάτα «Απόκρυψη».)`)) return; setBlocks((bl) => bl.filter((y) => y.id !== selB.id)); setSel(null); }} aria-label="Διαγραφή" title="Διαγραφή" className={`${iconBtn} text-eu-red hover:bg-eu-red/10`}><Trash2 className="size-4" aria-hidden /></button>
          </span>
        </div>
        <div className="p-3 grid gap-4">
          <div className="grid gap-1">
            <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-snug">{blockName(selB)}</h3>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{BLOCK_INFO[selB.type].help}</p>
          </div>
          {errs.length > 0 && <ul className="m-0 p-0 list-none grid gap-1 rounded-xl bg-eu-red/10 px-3 py-2">{errs.map((e, i) => <li key={i} className="flex items-start gap-2 text-eu-red font-bold text-[length:var(--fs-13)]"><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{e.msg}</li>)}</ul>}
          <button type="button" aria-pressed={selB.enabled === false} onClick={() => setBlock({ ...selB, enabled: selB.enabled === false })} className={`inline-flex items-center gap-2 rounded-xl border px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${selB.enabled === false ? "border-eu-amber bg-eu-amber/10 text-eu-ink" : "border-eu-line text-eu-ink-2 hover:border-eu-navy"}`}>{selB.enabled === false ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}{selB.enabled === false ? "Κρυφό — πάτα για να εμφανιστεί" : "Φαίνεται — πάτα για απόκρυψη"}</button>
          <BlockFields b={selB} set={setBlock} ctx={{ brandId: null, brandName: "Euronics", info, onInfo }} />
          <label className="grid gap-1 min-w-0">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Ζώνη</span>
            <select value={z} onChange={(e) => setBlock({ ...selB, zone: e.target.value })} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white">{page.zones.map((zz) => <option key={zz} value={zz}>{INFO_ZONES[zz].label}</option>)}</select>
            <span className="text-eu-muted text-[length:var(--fs-13)]">{INFO_ZONES[z].help}</span>
          </label>
          <details className="rounded-xl border border-eu-line" open={!v.plain}>
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><CalendarClock className="size-4 shrink-0" aria-hidden /><span>Πότε και σε ποιες συσκευές</span><span className="ml-auto font-normal text-eu-muted text-[length:var(--fs-13)] truncate">{v.plain ? "πάντα, παντού" : v.text}</span></summary>
            <div className="px-3 pb-3"><VisibilityForm v={selB as Vis} summary={v.text} audience={false} onChange={(p) => setBlock({ ...selB, ...p } as BrandBlock)} /></div>
          </details>
        </div>
      </div>
    );
  })();

  return (
    <PickerBrand.Provider value={{ brandId: null, brandName: "Euronics" }}>
      <div className="@container grid gap-3 min-w-0">
        {/* λεπτή σταθερή κεφαλίδα: πού είσαι, κατάσταση, έλεγχος, δημοσίευση */}
        <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2 bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Link href="/admin/cms/pages" aria-label="Πίσω στις ζώνες σελίδων" className="inline-flex items-center gap-0.5 text-eu-blue font-bold text-[length:var(--fs-13)] min-h-11 md:min-h-8 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Σελίδες</Link>
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] min-w-0">{page.title}</h2>
            <StatusPill status={status[0]} text={status[1]} />
            <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-12)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>{save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}{saveText}</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {published && <a href={page.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:bg-white">Στο site <ExternalLink className="size-3.5" aria-hidden /></a>}
              {published && changed && <button type="button" onClick={revert} disabled={busy} title="Το πρόχειρο γυρίζει στη δημοσιευμένη έκδοση" className="inline-flex items-center gap-1 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><Undo2 className="size-4" aria-hidden /> Ακύρωση αλλαγών</button>}
              {(errors.length > 0 || warnings.length > 0) && <button type="button" onClick={() => setShowIssues((x) => !x)} aria-expanded={showIssues} className={`inline-flex items-center gap-1 rounded-full border px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] bg-white ${errors.length ? "border-eu-red text-eu-red" : "border-eu-amber text-eu-ink-2"}`}>{errors.length ? <CircleAlert className="size-4" aria-hidden /> : <TriangleAlert className="size-4 text-eu-amber" aria-hidden />}{errors.length ? `${errors.length} για διόρθωση` : `${warnings.length} συστάσεις`}</button>}
              <button data-help="zones.publish" type="button" onClick={publish} disabled={busy || !changed} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-4 min-h-11 md:min-h-9 hover:bg-eu-blue disabled:opacity-45">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{changed ? "Δημοσίευση" : "Δημοσιευμένη"}</button>
            </div>
          </div>
          {result && <div className="relative"><ResultBanner ok={result.ok}><span className="block pr-8">{result.message}</span></ResultBanner><button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button></div>}
          {showIssues && (errors.length > 0 || warnings.length > 0) && (
            <ul className="m-0 list-none grid gap-1 rounded-xl bg-white border border-eu-line p-2">
              {[...errors.map((e) => ({ ...e, err: true })), ...warnings.map((w) => ({ ...w, err: false }))].map((x, k) => (
                <li key={k}><button type="button" onClick={() => go(x.anchor)} className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 min-h-11 hover:bg-eu-surface">{x.err ? <CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden /> : <TriangleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />}<span className="text-[length:var(--fs-13)]"><b>{x.where}:</b> {x.msg}</span></button></li>
              ))}
            </ul>
          )}
          <div className="@4xl:hidden grid grid-cols-2 gap-1 rounded-full bg-white border border-eu-line p-0.5" role="tablist" aria-label="Προβολή">
            {(["edit", "preview"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full min-h-11 font-bold text-[length:var(--fs-13)] ${view === v ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{v === "edit" ? "Επεξεργασία" : "Προεπισκόπηση"}</button>)}
          </div>
        </div>

        {/* χάρτης ή ρυθμίσεις αριστερά, προεπισκόπηση δεξιά — πάντα μαζί από 896 px */}
        <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(21rem,27rem)_minmax(0,1fr)] gap-3 items-start">
          {/* φαρδιά οθόνη: η στήλη μένει στη θέση της και κυλά μόνη της (όπως στις Ζώνες αρχικής) — η σελίδα δεν κυλά */}
          <div className={`${view === "edit" ? "" : "hidden @4xl:block"} min-w-0 @4xl:sticky @4xl:top-16 @4xl:max-h-[calc(100dvh-7.5rem)] @4xl:overflow-y-auto @4xl:pr-1`}>{settings || map}</div>
          <div ref={previewBox} data-help="zones.preview" className={view === "preview" ? "min-w-0" : "hidden @4xl:block min-w-0 @4xl:sticky @4xl:top-16"}>
            <LivePreview src={`${page.path}?preview=1`} attr="data-zone" v={pv} device={device} setDevice={setDevice} saving={save !== "idle"} focus={selB ? zoneOf(selB) : null} notice={notice} onPick={onPick} peek={selB ? null : hover ?? pinned} />
          </div>
        </div>
        {adding && <AddDialog after={adding} top={null} positions={page.zones.map((z) => ({ key: z, label: `Ζώνη: ${INFO_ZONES[z].label}` }))} onAdd={addBlock} onClose={() => setAdding(null)} />}
      </div>
    </PickerBrand.Provider>
  );
}
