"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, CircleAlert, ExternalLink, Info, Loader2, Rocket, TriangleAlert, Undo2, X } from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { INFO_ZONES, type InfoPage, type InfoZone } from "@/lib/cms/info-pages";
import { publishZonesAction, revertZonesAction, saveZonesAction } from "@/app/admin/(shell)/cms/pages/actions";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { StatusPill, ResultBanner } from "@/components/admin/settings/ui";
import { ZoneBlocks } from "./ZoneBlocks";
import { Preview } from "./BrandPreview";
import { PickerBrand } from "./brand/ImagePicker";

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

/** Σχεδιάγραμμα: πού βρίσκεται κάθε ζώνη στη σελίδα (με το πλήθος των components της). */
function ZoneMap({ page, counts, onPick }: { page: InfoPage; counts: Record<string, number>; onPick: (z: InfoZone) => void }) {
  const has = (z: InfoZone) => page.zones.includes(z);
  const cell = (z: InfoZone, cls: string) => has(z) ? (
    <button type="button" onClick={() => onPick(z)} className={`rounded-lg border-2 border-dashed px-2 py-1.5 text-left text-[length:var(--fs-13)] font-bold leading-tight hover:border-eu-navy ${counts[z] ? "border-eu-blue bg-eu-chip text-eu-navy" : "border-eu-line text-eu-muted"} ${cls}`}>{INFO_ZONES[z].label}<span className="block font-normal">{counts[z] ? `${counts[z]} ${counts[z] === 1 ? "component" : "components"}` : "κενή"}</span></button>
  ) : null;
  return (
    <div className="grid gap-1.5 max-w-md rounded-xl border border-eu-line bg-white p-2" aria-label="Οι ζώνες στη σελίδα">
      <div className="rounded-md bg-eu-navy text-white text-[length:var(--fs-13)] font-bold px-2 py-1">Τίτλος σελίδας · εισαγωγή</div>
      {cell("top", "")}
      <div className={`grid gap-1.5 ${has("aside") ? "grid-cols-2" : ""}`}>
        {has("aside") && <div className={`grid gap-1.5 content-start ${page.asideSide === "right" ? "order-2" : ""}`}>{page.asideSide !== "right" && <div className="rounded-md bg-eu-surface text-eu-muted text-[length:var(--fs-13)] px-2 py-1">Μενού</div>}{cell("aside", "")}</div>}
        <div className="grid gap-1.5 content-start"><div className="rounded-md bg-eu-surface text-eu-muted text-[length:var(--fs-13)] px-2 py-3">{page.main ?? "Κείμενο σελίδας"}</div>{cell("after", "")}</div>
      </div>
      {cell("bottom", "")}
    </div>
  );
}

export function ZonePageEditor({ page, initial, published: pub, savedAt: initSavedAt, info: initInfo }: { page: InfoPage; initial: BrandBlock[]; published: BrandBlock[] | null; savedAt: string | null; info: Record<string, PickProduct> }) {
  const router = useRouter();
  const [blocks, setBlocksState] = useState<BrandBlock[]>(initial);
  const [info, setInfo] = useState(initInfo);
  const [save, setSave] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const [savedAt, setSavedAt] = useState(initSavedAt);
  const [pubJson, setPubJson] = useState(pub ? stable(pub) : null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pv, setPv] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: Issue[] } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [busy, start] = useTransition();
  const latest = useRef(blocks);
  const savedJson = useRef(stable(initial));

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

  const { errors, warnings } = checkBlocks(blocks);
  const go = (anchor?: string) => { if (!anchor) return; setView("edit"); if (anchor.startsWith("blk-")) setOpen((o) => new Set(o).add(anchor.slice(4))); setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
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
  const counts = Object.fromEntries(page.zones.map((z) => [z, blocks.filter((b) => (b.zone ?? "top") === z).length]));
  const status = !published ? (blocks.length ? (["off", "Πρόχειρο — δεν φαίνεται"] as const) : (["off", "Χωρίς components"] as const)) : changed ? (["incomplete", "Δημοσιευμένη · αλλαγές στο πρόχειρο"] as const) : (["live", "Δημοσιευμένη"] as const);
  const saveText = save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : savedAt ? `Πρόχειρο αποθηκεύτηκε ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : "Δεν έχει αλλαγές";

  return (
    <PickerBrand.Provider value={{ brandId: null, brandName: "Euronics" }}>
      <div className="grid gap-4 min-w-0">
        <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-3 bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link href="/admin/cms/pages" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Ζώνες σελίδων</Link>
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)] min-w-0">{page.title}</h2>
            <StatusPill status={status[0]} text={status[1]} />
            <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>{save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}{saveText}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={publish} disabled={busy || !changed} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-4 @md:px-5 min-h-12 hover:bg-eu-blue disabled:opacity-50 flex-1 @md:flex-none min-w-0">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{changed ? (published ? "Δημοσίευση αλλαγών" : "Δημοσίευση") : "Χωρίς αλλαγές για δημοσίευση"}</button>
            <button type="button" onClick={() => setShowIssues((x) => !x)} aria-expanded={showIssues} title="Έλεγχος πριν τη δημοσίευση" className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 px-4 min-h-12 font-bold text-[length:var(--fs-14)] ${errors.length ? "border-eu-red text-eu-red" : warnings.length ? "border-eu-amber text-eu-amber" : "border-eu-green text-eu-green"}`}>{errors.length ? <CircleAlert className="size-4" aria-hidden /> : warnings.length ? <TriangleAlert className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}{errors.length ? <>{errors.length}<span className="hidden @md:inline"> για διόρθωση</span></> : warnings.length ? <>{warnings.length}<span className="hidden @md:inline"> συστάσεις</span></> : "Έτοιμη"}</button>
          </div>
          {result && <div className="relative"><ResultBanner ok={result.ok}><span className="block pr-8">{result.message}</span></ResultBanner><button type="button" onClick={() => setResult(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button></div>}
          {showIssues && (errors.length > 0 || warnings.length > 0) && (
            <ul className="m-0 p-0 list-none grid gap-1 max-h-[40vh] overflow-y-auto rounded-xl bg-white border border-eu-line p-2">
              {[...errors.map((e) => ({ ...e, err: true })), ...warnings.map((w) => ({ ...w, err: false }))].map((x, k) => (
                <li key={k}><button type="button" onClick={() => go(x.anchor)} className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 min-h-11 hover:bg-eu-surface">{x.err ? <CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden /> : <TriangleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />}<span className="text-[length:var(--fs-14)]"><b>{x.where}:</b> {x.msg}</span></button></li>
              ))}
            </ul>
          )}
          <div className="@7xl:hidden grid grid-cols-2 gap-1 rounded-full bg-white border border-eu-line p-1" role="tablist" aria-label="Προβολή">
            {(["edit", "preview"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full min-h-10 font-bold text-[length:var(--fs-14)] ${view === v ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{v === "edit" ? "Επεξεργασία" : "Προεπισκόπηση"}</button>)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a href={`${page.path}?preview=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Προεπισκόπηση <ExternalLink className="size-4" aria-hidden /></a>
          {published && <a href={page.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Στο site <ExternalLink className="size-4" aria-hidden /></a>}
          {published && changed && <button type="button" onClick={revert} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Undo2 className="size-4" aria-hidden /> Ακύρωση αλλαγών</button>}
        </div>

        <div className="grid grid-cols-1 @7xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
          <div className={view === "edit" ? "min-w-0 grid gap-4" : "hidden @7xl:grid min-w-0 gap-4"}>
            <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] gap-4 items-start">
              <div className="grid gap-2">
                <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Τι κάνω εδώ;</h3>
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] leading-relaxed">Η σελίδα «{page.title}» έχει {page.zones.length} <b>ζώνες</b> — σημεία όπου μπορείς να βάλεις components: διαφημίσεις από τις Προσφορές, προϊόντα προσφοράς, κουπόνι, banner, καταστήματα, συχνές ερωτήσεις κ.ά. Το κείμενο της σελίδας δεν αλλάζει.</p>
                <p className="m-0 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Όσα συνδέονται με προσφορές <b>κρύβονται μόνα τους</b> όταν η προσφορά λήξει. Κάθε αλλαγή μένει πρόχειρο μέχρι να πατήσεις «Δημοσίευση».</span></p>
              </div>
              <ZoneMap page={page} counts={counts} onPick={(z) => { setAdding(z); setTimeout(() => document.getElementById(`zone-${z}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
            </section>
            <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4 min-w-0" aria-label="Ζώνες">
              <ZoneBlocks
                blocks={blocks}
                setBlocks={(fn) => setBlocksState((x) => fn(x))}
                zones={page.zones.map((z) => ({ key: z, label: INFO_ZONES[z].label, help: INFO_ZONES[z].help }))}
                defaultZone="top"
                errors={errors}
                brandName="Euronics"
                ctx={{ brandId: null, brandName: "Euronics", info, onInfo }}
                open={open}
                setOpen={setOpen}
                adding={adding}
                setAdding={setAdding}
                markers={{ after: { before: "↑ Κείμενο της σελίδας" } }}
              />
            </section>
          </div>
          <div className={view === "preview" ? "min-w-0" : "hidden @7xl:block min-w-0"}><Preview src={`${page.path}?preview=1`} v={pv} device={device} setDevice={setDevice} saving={save !== "idle"} /></div>
        </div>
      </div>
    </PickerBrand.Provider>
  );
}
