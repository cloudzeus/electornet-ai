"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CalendarClock, Check, ChevronDown, CircleAlert, ExternalLink, Eye, EyeOff, Info, Laptop, Loader2, Plus, Rocket, Smartphone, Tablet, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import type { BrandBlock, Device } from "@/lib/cms/brand-store";
import { DEVICES } from "@/lib/cms/brand-store";
import { checkBlocks, type Issue } from "@/lib/cms/brand-store-check";
import { afterZone, sectionDef, TOP_ZONE, type HomeAudience, type HomeDoc, type HomeSection, type SectionField } from "@/lib/cms/home-sections";
import { publishHomeAction, revertHomeAction, saveHomeAction } from "@/app/admin/(shell)/cms/home/actions";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { StatusPill, ResultBanner } from "@/components/admin/settings/ui";
import { ZoneBlocks } from "./ZoneBlocks";
import { Preview } from "./BrandStoreEditor";
import { PickerBrand } from "./brand/ImagePicker";
import { Area, DateTime, LinkField, MediaUrl, StringList, Txt } from "./brand/fields";

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));
const AUD: { v: HomeAudience; label: string }[] = [{ v: "all", label: "Σε όλους" }, { v: "guest", label: "Μόνο σε επισκέπτες χωρίς σύνδεση" }, { v: "customer", label: "Μόνο σε συνδεδεμένους πελάτες" }];

type Campaign = { id: string; brand: string; title: string; text: string; cta: string; href: string; image: string; alt: string };

const sectionState = (s: HomeSection): { s: "live" | "off" | "incomplete"; t: string } => {
  if (s.enabled === false) return { s: "off", t: "Κρυφή" };
  if (s.schedule?.from && new Date(s.schedule.from) > new Date()) return { s: "incomplete", t: `Από ${new Date(s.schedule.from).toLocaleDateString("el-GR")}` };
  if (s.schedule?.to && new Date(s.schedule.to) < new Date()) return { s: "off", t: "Έληξε" };
  return { s: "live", t: s.audience === "guest" ? "Μόνο επισκέπτες" : s.audience === "customer" ? "Μόνο πελάτες" : "Εμφανίζεται" };
};

/** Φόρμα των ρυθμίσεων μιας ενότητας (κείμενα, πλήθος, καμπάνιες) — τιμή = αλλαγή του διαχειριστή ή η προεπιλογή. */
function SectionFields({ s, set }: { s: HomeSection; set: (props: Record<string, unknown>) => void }) {
  const d = sectionDef(s.id)!;
  const base = (d.widget?.props ?? {}) as Record<string, unknown>;
  const val = (k: string) => (s.props && k in s.props ? s.props[k] : k === "limit" && d.widget?.query?.limit ? d.widget.query.limit : base[k]);
  const put = (k: string, v: unknown) => set({ ...(s.props ?? {}), [k]: v });
  const field = (f: SectionField) => {
    switch (f.kind) {
      case "text": return <Txt key={f.key} label={f.label} value={String(val(f.key) ?? "")} onChange={(v) => put(f.key, v)} help={f.help} max={f.max} />;
      case "number": {
        const raw = Number(val(f.key) ?? f.min);
        const shown = f.key === "intervalMs" ? Math.round(raw >= 100 ? raw / 1000 : raw) : raw;
        return (
          <label key={f.key} className="grid gap-1 min-w-0">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
            <input type="number" min={f.min} max={f.max} value={shown} onChange={(e) => { const n = Math.min(f.max, Math.max(f.min, Number(e.target.value) || f.min)); put(f.key, n); }} className="w-full max-w-[10rem] rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white tabular-nums" />
            {f.help && <span className="text-eu-muted text-[length:var(--fs-13)]">{f.help}</span>}
          </label>
        );
      }
      case "lines": return <StringList key={f.key} label={f.label} help={f.help} items={((val(f.key) as string[] | undefined) ?? []).map(String)} onChange={(v) => put(f.key, v)} max={f.max} addLabel="Νέο μήνυμα" />;
      case "link": {
        const l = (val(f.key) as { label?: string; href?: string } | undefined) ?? {};
        return (
          <div key={f.key} className="grid @xl:grid-cols-2 gap-3">
            <Txt label={`${f.label} · κείμενο`} value={l.label ?? ""} onChange={(v) => put(f.key, { ...l, label: v })} max={40} />
            <LinkField label={`${f.label} · σύνδεσμος`} value={l.href ?? ""} onChange={(v) => put(f.key, { ...l, href: v })} />
          </div>
        );
      }
      case "campaigns": {
        const list = ((val(f.key) as Campaign[] | undefined) ?? []).map((c) => ({ ...c }));
        const setList = (l: Campaign[]) => put(f.key, l);
        const upd = (i: number, p: Partial<Campaign>) => setList(list.map((c, k) => (k === i ? { ...c, ...p } : c)));
        return (
          <div key={f.key} className="grid gap-3">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{f.label}</span>
            {f.help && <span className="text-eu-muted text-[length:var(--fs-13)] -mt-2">{f.help}</span>}
            <ol className="m-0 p-0 list-none grid gap-3">
              {list.map((c, i) => (
                <li key={c.id || i} className="rounded-xl border border-eu-line p-3 grid gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{i + 1}. {c.brand || "Καμπάνια"}{c.title ? ` · ${c.title}` : ""}</span>
                    <span className="flex">
                      <button type="button" disabled={i === 0} onClick={() => { const l = [...list]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setList(l); }} aria-label="Πιο πάνω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                      <button type="button" disabled={i === list.length - 1} onClick={() => { const l = [...list]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; setList(l); }} aria-label="Πιο κάτω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                      <button type="button" onClick={() => { if (window.confirm("Διαγραφή της καμπάνιας;")) setList(list.filter((_, k) => k !== i)); }} aria-label="Διαγραφή" className="size-11 grid place-items-center rounded-full text-eu-red hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /></button>
                    </span>
                  </div>
                  <MediaUrl label="Εικόνα (key visual)" value={c.image} onChange={(v) => upd(i, { image: v })} help="Οριζόντια εικόνα της καμπάνιας, από τα Media ή τα προϊόντα." />
                  <div className="grid @xl:grid-cols-2 gap-3">
                    <Txt label="Μάρκα" value={c.brand} onChange={(v) => upd(i, { brand: v })} max={30} />
                    <Txt label="Τίτλος" value={c.title} onChange={(v) => upd(i, { title: v })} max={60} />
                  </div>
                  <Area label="Κείμενο" value={c.text} onChange={(v) => upd(i, { text: v })} max={160} rows={2} />
                  <div className="grid @xl:grid-cols-2 gap-3">
                    <Txt label="Κουμπί" value={c.cta} onChange={(v) => upd(i, { cta: v })} max={40} />
                    <LinkField label="Σύνδεσμος" value={c.href} onChange={(v) => upd(i, { href: v })} />
                  </div>
                  <Txt label="Περιγραφή εικόνας (alt)" value={c.alt} onChange={(v) => upd(i, { alt: v })} max={120} help="Για προσβασιμότητα και Google." />
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setList([...list, { id: `c-${Date.now().toString(36)}`, brand: "", title: "", text: "", cta: "Δες περισσότερα", href: "/prosfores", image: "", alt: "" }])} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Νέα καμπάνια</button>
          </div>
        );
      }
    }
  };
  return (
    <div className="grid gap-4">
      {d.managedAt && <p className="m-0 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Το περιεχόμενο ρυθμίζεται στο <a href={d.managedAt.href} className="text-eu-blue underline font-bold">{d.managedAt.label}</a>.</span></p>}
      {d.fields.map(field)}
      {s.props && Object.keys(s.props).length > 0 && <button type="button" onClick={() => set({})} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-10 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:bg-eu-surface"><Undo2 className="size-3.5" aria-hidden /> Επαναφορά στις αρχικές ρυθμίσεις</button>}
    </div>
  );
}

export function HomeEditor({ initial, published: pub, savedAt: initSavedAt, info: initInfo, canWrite, canPublish }: { initial: HomeDoc; published: HomeDoc | null; savedAt: string | null; info: Record<string, PickProduct>; canWrite: boolean; canPublish: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState<HomeDoc>(initial);
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
  const latest = useRef(doc);
  const savedJson = useRef(stable(initial));

  const onInfo = useCallback((list: PickProduct[]) => setInfo((x) => ({ ...x, ...Object.fromEntries(list.map((p) => [p.id, p])) })), []);
  const published = pubJson !== null;
  // χωρίς δημοσίευση: η πρώτη δημοσίευση «παίρνει» τη διαχείριση της αρχικής
  const changed = published ? stable(doc) !== pubJson : true;

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
    const t = setTimeout(() => { void flush(); }, 1200);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [doc, flush, canWrite]);
  useEffect(() => {
    if (save === "idle") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  const setBlocks = (fn: (b: BrandBlock[]) => BrandBlock[]) => setDoc((d) => ({ ...d, blocks: fn(d.blocks) }));
  const setSection = (i: number, s: HomeSection) => setDoc((d) => ({ ...d, sections: d.sections.map((x, k) => (k === i ? s : x)) }));
  const moveSection = (i: number, j: number) => setDoc((d) => { const x = [...d.sections]; [x[i], x[j]] = [x[j], x[i]]; return { ...d, sections: x }; });
  const { errors, warnings } = checkBlocks(doc.blocks);
  const go = (anchor?: string) => { if (!anchor) return; setView("edit"); if (anchor.startsWith("blk-")) setOpen((o) => new Set(o).add(anchor.slice(4))); setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const publish = () => {
    if (errors.length) { setShowIssues(true); setResult({ ok: false, message: `Υπάρχουν ${errors.length} θέματα που πρέπει να διορθωθούν πριν τη δημοσίευση.`, errors }); return; }
    if (!window.confirm("Δημοσίευση της αρχικής; Οι επισκέπτες θα δουν τις αλλαγές αμέσως.")) return;
    start(async () => {
      if (save !== "idle" && !(await flush())) { setResult({ ok: false, message: "Η αποθήκευση απέτυχε — δοκίμασε ξανά." }); return; }
      const r = await publishHomeAction();
      setResult(r);
      if (r.ok) { setPubJson(stable(latest.current)); router.refresh(); }
    });
  };
  const revert = () => { if (!window.confirm("Να χαθούν οι αλλαγές του πρόχειρου και να γυρίσει στη δημοσιευμένη αρχική;")) return; start(async () => { setResult(await revertHomeAction()); window.location.reload(); }); };
  const status = !published ? (["off", "Δεν έχει δημοσιευτεί — φαίνεται η αρχική όπως είναι"] as const) : changed ? (["incomplete", "Δημοσιευμένη · αλλαγές στο πρόχειρο"] as const) : (["live", "Δημοσιευμένη"] as const);
  const saveText = save === "saving" ? "Αποθήκευση…" : save === "pending" ? "Αλλαγές…" : save === "error" ? "Η αποθήκευση απέτυχε" : savedAt ? `Πρόχειρο αποθηκεύτηκε ${new Date(savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : "Δεν έχει αλλαγές";
  const zoneDefs = [{ key: TOP_ZONE, label: "Στην κορυφή", help: "Κάτω από το μενού, πριν την πρώτη ενότητα — για λεπτή λωρίδα ανακοίνωσης ή αντίστροφης μέτρησης." }, ...doc.sections.map((s) => ({ key: afterZone(s.id), label: `Μετά από «${sectionDef(s.id)!.label}»`, help: "Components ανάμεσα σε αυτή και την επόμενη ενότητα. Ακολουθούν την ενότητα αν αλλάξει η σειρά." }))];
  const zoneBlocks = (key: string) => (
    <ZoneBlocks
      blocks={doc.blocks} setBlocks={setBlocks}
      zones={zoneDefs.filter((z) => z.key === key)} moveZones={zoneDefs} defaultZone={TOP_ZONE}
      errors={errors} brandName="Euronics" ctx={{ brandId: null, brandName: "Euronics", info, onInfo }}
      open={open} setOpen={setOpen} adding={adding} setAdding={setAdding} audience compactEmpty
    />
  );

  return (
    <PickerBrand.Provider value={{ brandId: null, brandName: "Euronics" }}>
      <div className="grid gap-4 min-w-0">
        <div className="sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-3 bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)] min-w-0">Ζώνες αρχικής</h2>
            <StatusPill status={status[0]} text={status[1]} />
            <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold ${save === "error" ? "text-eu-red" : "text-eu-muted"}`}>{save === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === "idle" ? <Check className="size-3.5" aria-hidden /> : null}{saveText}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canPublish && <button type="button" onClick={publish} disabled={busy || !changed} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-4 @md:px-5 min-h-12 hover:bg-eu-blue disabled:opacity-50 flex-1 @md:flex-none min-w-0">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{changed ? (published ? "Δημοσίευση αλλαγών" : "Δημοσίευση") : "Χωρίς αλλαγές για δημοσίευση"}</button>}
            <button type="button" onClick={() => setShowIssues((x) => !x)} aria-expanded={showIssues} title="Έλεγχος πριν τη δημοσίευση" className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 px-4 min-h-12 font-bold text-[length:var(--fs-14)] ${errors.length ? "border-eu-red text-eu-red" : warnings.length ? "border-eu-amber text-eu-amber" : "border-eu-green text-eu-green"}`}>{errors.length ? <CircleAlert className="size-4" aria-hidden /> : warnings.length ? <TriangleAlert className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}{errors.length ? <>{errors.length}<span className="hidden @md:inline"> για διόρθωση</span></> : warnings.length ? <>{warnings.length}<span className="hidden @md:inline"> συστάσεις</span></> : "Έτοιμη"}</button>
          </div>
          {!canWrite && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Μόνο προβολή — δεν έχεις δικαίωμα επεξεργασίας της αρχικής.</p>}
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
          <a href="/?preview=1" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Προεπισκόπηση <ExternalLink className="size-4" aria-hidden /></a>
          <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Στο site <ExternalLink className="size-4" aria-hidden /></a>
          {published && changed && canWrite && <button type="button" onClick={revert} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Undo2 className="size-4" aria-hidden /> Ακύρωση αλλαγών</button>}
        </div>

        <div className="grid grid-cols-1 @7xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
          <div className={`${view === "edit" ? "min-w-0 grid gap-4" : "hidden @7xl:grid min-w-0 gap-4"} ${canWrite ? "" : "pointer-events-none opacity-80"}`}>
            <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-2">
              <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Τι κάνω εδώ;</h3>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] leading-relaxed">Η αρχική αποτελείται από <b>{doc.sections.length} ενότητες</b> (slides, κατηγορίες, προσφορές, καμπάνιες…). Μπορείς να αλλάξεις τη σειρά τους, να τις κρύψεις, να ορίσεις <b>πότε</b>, <b>σε ποιες συσκευές</b> και <b>σε ποιους</b> εμφανίζονται, και να διορθώσεις τα κείμενά τους. Ανάμεσά τους μπαίνουν <b>components</b> της συλλογής: banner, προϊόντα, προσφορά ημέρας, κουπόνι, διαφήμιση και άλλα.</p>
              <p className="m-0 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Οι αλλαγές αποθηκεύονται αυτόματα ως <b>πρόχειρο</b> και φαίνονται στην «Προεπισκόπηση». Οι επισκέπτες τις βλέπουν μόλις πατήσεις «Δημοσίευση».</span></p>
            </section>

            <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4 min-w-0" aria-label="Ενότητες και ζώνες">
              {zoneBlocks(TOP_ZONE)}
              {doc.sections.map((s, i) => {
                const d = sectionDef(s.id)!;
                const st = sectionState(s);
                const isOpen = open.has(`sec-${s.id}`);
                return (
                  <Fragment key={s.id}>
                    <article id={`sec-${s.id}`} className={`rounded-xl border-2 scroll-mt-40 min-w-0 ${s.enabled === false ? "border-eu-line bg-eu-surface/60" : "border-eu-navy/40 bg-eu-chip/40"}`}>
                      <div className="flex flex-wrap items-center gap-2 p-2 pl-3">
                        <button type="button" onClick={() => setOpen((o) => { const n = new Set(o); const k = `sec-${s.id}`; if (n.has(k)) n.delete(k); else n.add(k); return n; })} aria-expanded={isOpen} className="flex items-center gap-2 min-h-11 text-left flex-1 min-w-[12rem]">
                          <span className="shrink-0 rounded-lg bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] px-2 py-1">Ενότητα {i + 1}</span>
                          <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-16)] truncate">{d.label}</span><span className="flex flex-wrap gap-1.5 items-center"><StatusPill status={st.s} text={st.t} />{s.hideOn?.length ? <span className="rounded-full bg-eu-surface px-2 py-0.5 text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Όχι σε: {s.hideOn.map((x) => DEVICES.find((dv) => dv.key === x)?.label).join(", ")}</span> : null}{s.props && Object.keys(s.props).length ? <span className="rounded-full bg-eu-surface px-2 py-0.5 text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Με αλλαγές</span> : null}</span></span>
                          <ChevronDown className={`ml-auto size-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                        </button>
                        <span className="flex items-center">
                          <button type="button" onClick={() => setSection(i, { ...s, enabled: s.enabled === false ? undefined : false })} aria-label={s.enabled === false ? "Εμφάνιση" : "Απόκρυψη"} title={s.enabled === false ? "Εμφάνιση" : "Απόκρυψη"} className="size-11 grid place-items-center rounded-full hover:bg-white">{s.enabled === false ? <EyeOff className="size-4 text-eu-muted" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>
                          <button type="button" disabled={i === 0} onClick={() => moveSection(i, i - 1)} aria-label="Πιο πάνω" className="size-11 grid place-items-center rounded-full hover:bg-white disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                          <button type="button" disabled={i === doc.sections.length - 1} onClick={() => moveSection(i, i + 1)} aria-label="Πιο κάτω" className="size-11 grid place-items-center rounded-full hover:bg-white disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                        </span>
                      </div>
                      {isOpen && (
                        <div className="border-t border-eu-line bg-white rounded-b-xl p-3 @md:p-4 grid gap-4">
                          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{d.help}</p>
                          <SectionFields s={s} set={(props) => setSection(i, { ...s, props: Object.keys(props).length ? props : undefined })} />
                          <div className="grid @xl:grid-cols-2 gap-3">
                            <fieldset className="m-0 p-0 border-0 grid gap-1 min-w-0">
                              <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Ορατό σε</legend>
                              <div className="flex flex-wrap gap-2">
                                {DEVICES.map((dv) => {
                                  const on = !s.hideOn?.includes(dv.key);
                                  const Icon = dv.key === "mobile" ? Smartphone : dv.key === "tablet" ? Tablet : Laptop;
                                  return <button key={dv.key} type="button" aria-pressed={on} title={dv.help} onClick={() => { const cur = new Set<Device>(s.hideOn ?? []); if (on) cur.add(dv.key); else cur.delete(dv.key); setSection(i, { ...s, hideOn: cur.size ? [...cur] : undefined }); }} className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${on ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-muted line-through"}`}><Icon className="size-4" aria-hidden />{dv.label}</button>;
                                })}
                              </div>
                              <span className="text-eu-muted text-[length:var(--fs-13)]">Πάτα για να την κρύψεις σε μια συσκευή.</span>
                            </fieldset>
                            <label className="grid gap-1 min-w-0">
                              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Σε ποιους εμφανίζεται</span>
                              <select value={s.audience ?? "all"} onChange={(e) => setSection(i, { ...s, audience: e.target.value === "all" ? undefined : (e.target.value as HomeAudience) })} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white">{AUD.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select>
                            </label>
                          </div>
                          <details className="rounded-xl bg-eu-surface/60 border border-eu-line" open={!!(s.schedule?.from || s.schedule?.to)}>
                            <summary className="cursor-pointer list-none flex items-center gap-2 px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><CalendarClock className="size-4" aria-hidden /> Πότε εμφανίζεται (προαιρετικό)</summary>
                            <div className="px-3 pb-3 grid @xl:grid-cols-2 gap-x-5 gap-y-4">
                              <DateTime label="Από" value={s.schedule?.from} onChange={(v) => setSection(i, { ...s, schedule: { ...s.schedule, from: v } })} help="Κενό = από τώρα." />
                              <DateTime label="Έως" value={s.schedule?.to} onChange={(v) => setSection(i, { ...s, schedule: { ...s.schedule, to: v } })} help="Κενό = χωρίς λήξη." />
                            </div>
                          </details>
                        </div>
                      )}
                    </article>
                    {zoneBlocks(afterZone(s.id))}
                  </Fragment>
                );
              })}
            </section>
          </div>
          <div className={view === "preview" ? "min-w-0" : "hidden @7xl:block min-w-0"}><Preview src="/?preview=1" v={pv} device={device} setDevice={setDevice} saving={save !== "idle"} /></div>
        </div>
      </div>
    </PickerBrand.Provider>
  );
}
