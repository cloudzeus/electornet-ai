"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, ExternalLink, FileUp, Loader2, Maximize2, Minimize2, Monitor, Plus, RotateCcw, ScanText, Smartphone, Sparkles, Upload } from "lucide-react";
import { BoxCanvas, type BoxSel } from "./BoxCanvas";
import { SectionEditor } from "./SectionEditor";
import { CropView } from "./CropView";
import { pdfToImages } from "./pdf";
import { StepTransition, SwapText, ScanOverlay, SuccessBurst, motion } from "./motion";
import { ProductSections } from "@/components/pdp/ProductSections";
import { emptySection, sectionHasContent, type Box, type PublishedSection, type StudioDoc, type StudioSection } from "@/lib/catalog/banner-doc";

export interface StudioBanner { id: string; url: string; width: number | null; height: number | null; hidden: boolean; extraction: { id: string; status: string } | null }
export interface StudioDraft { id: string; mediaId: string | null; sourceName: string | null; status: string; doc: StudioDoc; updatedAt: string }
export interface StudioProduct { id: string; title: string; brand: string; slug: string; path: string }

type ItemStatus = "queued" | "working" | "ready" | "error";
interface Item { key: string; name: string; thumb: string; mediaId?: string; file?: File; extractionId?: string; status: ItemStatus; error?: string; doc?: StudioDoc; save?: "saving" | "saved" | "error" | "denied"; savedAt?: string }
type Step = "pick" | "review" | "publish" | "done";

const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 hover:bg-eu-blue disabled:opacity-40 disabled:hover:bg-eu-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue";
const secondary = "inline-flex items-center justify-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue";
const ghost = "inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue";

const WORKING_DESIGN = ["Διαβάζω όλες τις ενότητες…", "Διαλέγω την εικόνα που ανοίγει τη σελίδα…", "Βάζω τα θέματα σε σειρά…", "Ψάχνω τα νούμερα που αξίζει να φανούν…"];
const WORKING = ["Διαβάζω το κείμενο…", "Εντοπίζω τις φωτογραφίες…", "Χωρίζω σε ενότητες…", "Μεταφράζω ό,τι είναι ξένο…"];

/** Βήματα στην κορυφή: πού είσαι, τι ακολουθεί. Τα ολοκληρωμένα πατιούνται για επιστροφή. */
function Stepper({ step, can, go }: { step: Step; can: (s: Step) => boolean; go: (s: Step) => void }) {
  const steps: { k: Step; t: string; d: string }[] = [
    { k: "pick", t: "Επιλογή", d: "banners ή αρχείο" },
    { k: "review", t: "Έλεγχος", d: "κείμενο και φωτογραφίες" },
    { k: "publish", t: "Δημοσίευση", d: "όπως θα το δει ο πελάτης" },
  ];
  const at = step === "done" ? 3 : steps.findIndex((s) => s.k === step);
  return (
    <ol className="m-0 p-0 list-none grid grid-cols-3 gap-2" aria-label="Βήματα απόδελτίωσης">
      {steps.map((s, i) => {
        const state = i < at ? "done" : i === at ? "now" : "next";
        const clickable = state === "done" && can(s.k);
        const body = (
          <>
            <span key={state} className={`size-9 shrink-0 rounded-full inline-flex items-center justify-center font-extrabold text-[length:var(--fs-15)] ${state !== "next" ? "eu-pop" : ""} ${state === "now" ? "bg-eu-navy text-white ring-4 ring-eu-yellow/60" : state === "done" ? "bg-eu-green text-white" : "bg-eu-surface text-eu-muted"}`}>{state === "done" ? <Check className="size-5" aria-hidden /> : i + 1}</span>
            <span className="min-w-0 text-left">
              <span className={`block font-extrabold text-[length:var(--fs-15)] ${state === "next" ? "text-eu-muted" : "text-eu-ink"}`}>{s.t}</span>
              <span className="block text-eu-muted text-[length:var(--fs-13)] truncate">{s.d}</span>
            </span>
          </>
        );
        return (
          <li key={s.k} aria-current={state === "now" ? "step" : undefined}>
            {clickable ? <button type="button" onClick={() => go(s.k)} className="w-full flex items-center gap-3 rounded-2xl p-2 hover:bg-eu-chip min-h-14">{body}</button> : <div className="flex items-center gap-3 p-2 min-h-14">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

/** Οδηγία του τρέχοντος βήματος — μία πρόταση για το «τι κάνω εδώ». */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="m-0 flex gap-2 items-start rounded-xl bg-eu-chip text-eu-ink px-4 py-3 text-[length:var(--fs-15)] leading-relaxed"><Sparkles className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden /><span>{children}</span></p>;
}

/** Από έγγραφο → ενότητες σελίδας, με περικοπές της αρχικής εικόνας (για προεπισκόπηση). */
function previewSections(docs: StudioDoc[]): (PublishedSection & { _doc: StudioDoc; _boxes: Box[]; _icons: Record<string, { box: Box; doc: StudioDoc }>; _rank: number })[] {
  return docs.flatMap((doc, di) => doc.sections.map((s, si) => ({ s, rank: s.rank ?? 10000 + di * 100 + si })).filter(({ s }) => s.include && sectionHasContent(s)).map(({ s, rank }) => {
    const imgs = s.images.filter((i) => i.include);
    const icons: Record<string, { box: Box; doc: StudioDoc }> = {};
    return {
      id: s.id, title: s.title?.text.trim() || s.heading || null, subtitle: s.subtitle?.text.trim() || null, footnote: s.footnote?.text.trim() || null,
      body: s.paragraphs.map((p) => p.text.trim()).filter(Boolean).join("\n\n") || null,
      features: s.features.filter((f) => f.include && f.label.trim()).map((f) => { if (f.includeIcon && f.icon) icons[f.id] = { box: f.icon, doc: (f.src && docs.find((d) => d.sourceUrl === f.src)) || doc }; return { label: f.label.trim(), ...(f.detail?.trim() ? { text: f.detail.trim() } : {}), ...(f.includeIcon && f.icon ? { iconUrl: f.id } : {}) }; }),
      images: imgs.map((i) => ({ url: i.id, width: Math.round(i.box[2] * doc.width), height: Math.round(i.box[3] * doc.height), alt: i.alt })),
      layout: s.layout ?? null, stats: (s.stats ?? []).filter((x) => x.value.trim() && x.label.trim()),
      _doc: doc, _boxes: imgs.map((i) => i.box), _icons: icons, _rank: rank,
    };
  })).sort((a, b) => a._rank - b._rank);
}

export function BannerStudio({ product, banners, drafts, publishedCount, nextHref }: { product: StudioProduct; banners: StudioBanner[]; drafts: StudioDraft[]; publishedCount: number; nextHref: string | null }) {
  const [step, setStepRaw] = useState<Step>("pick");
  const [dir, setDir] = useState<1 | -1>(1);
  const ORDER: Record<Step, number> = { pick: 0, review: 1, publish: 2, done: 3 };
  /** Αλλαγή βήματος με κατεύθυνση, για να γλιστρά η μετάβαση προς τα εμπρός ή προς τα πίσω. */
  const setStep = (next: Step) => { setDir(ORDER[next] >= ORDER[step] ? 1 : -1); setStepRaw(next); };
  const visible = banners.filter((b) => !b.hidden), hidden = banners.filter((b) => b.hidden);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(visible.filter((b) => !b.extraction || b.extraction.status !== "published").map((b) => b.id)));
  const [uploads, setUploads] = useState<{ key: string; file: File; thumb: string }[]>([]);
  const [converting, setConverting] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [selSection, setSelSection] = useState<string | null>(null);
  const [selBox, setSelBox] = useState<BoxSel | null>(null);
  const [drawFor, setDrawFor] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [hideSources, setHideSources] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ sections: number; crops: number; hidden: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [designing, setDesigning] = useState(false);
  const [designBy, setDesignBy] = useState<"ai" | "rules" | null>(null);
  const [tick, setTick] = useState(0);
  const drop = useRef<HTMLInputElement>(null);
  const draftByMedia = useMemo(() => new Map(drafts.filter((d) => d.mediaId).map((d) => [d.mediaId!, d])), [drafts]);
  /** «Banner 3» με τη σειρά της σελίδας — όχι το τεχνικό όνομα αρχείου της εισαγωγής. */
  const nameOf = (d: { mediaId?: string | null; sourceName?: string | null }, i: number) => { const k = d.mediaId ? banners.findIndex((b) => b.id === d.mediaId) : -1; return k >= 0 ? `Banner ${k + 1}` : d.sourceName?.replace(/\.\w+$/, "") || `Αρχείο ${i + 1}`; };
  const openDrafts = drafts.filter((d) => d.status === "draft");
  const base = `/api/admin/catalog/products/${product.id}/extractions`;

  const item = items[active];
  const doc = item?.doc;
  const updateItem = useCallback((key: string, fn: (it: Item) => Item) => setItems((xs) => xs.map((x) => (x.key === key ? fn(x) : x))), []);
  const setDoc = (fn: (d: StudioDoc) => StudioDoc) => item && updateItem(item.key, (it) => ({ ...it, doc: it.doc ? fn(it.doc) : it.doc, save: "saving" }));
  const setSection = (id: string, s: StudioSection) => setDoc((d) => ({ ...d, sections: d.sections.map((x) => (x.id === id ? s : x)) }));

  // ---------- ανάλυση: έως δύο ταυτόχρονα ----------
  useEffect(() => {
    const working = items.filter((i) => i.status === "working").length;
    const next = items.find((i) => i.status === "queued");
    if (!next || working >= 2) return;
    // εκτός του σώματος του effect: η αλλαγή κατάστασης και το αίτημα ξεκινούν στο επόμενο tick (ακυρώνεται αν αλλάξει η λίστα)
    const t = setTimeout(() => {
      updateItem(next.key, (it) => ({ ...it, status: "working", error: undefined }));
      const fd = new FormData();
      if (next.mediaId) fd.set("mediaId", next.mediaId); else if (next.file) fd.set("file", next.file);
      fetch(base, { method: "POST", body: fd })
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? "Η ανάλυση απέτυχε."); return j as { id: string; doc: StudioDoc }; })
        .then((j) => updateItem(next.key, (it) => ({ ...it, status: "ready", extractionId: j.id, doc: j.doc, save: "saved" })))
        .catch((e: Error) => updateItem(next.key, (it) => ({ ...it, status: "error", error: e.message })));
    }, 0);
    return () => clearTimeout(t);
  }, [items, base, updateItem]);
  const analysing = items.some((i) => i.status === "working" || i.status === "queued");
  useEffect(() => { if (!analysing && !designing) return; const t = setInterval(() => setTick((n) => n + 1), 1800); return () => clearInterval(t); }, [analysing, designing]);

  // ---------- αυτόματη αποθήκευση πρόχειρου ----------
  useEffect(() => {
    const pending = items.filter((i) => i.save === "saving" && i.extractionId && i.doc);
    if (!pending.length) return;
    const t = setTimeout(() => {
      for (const it of pending) {
        fetch(`${base}/${it.extractionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: it.doc }) })
          .then(async (r) => { if (!r.ok) throw Object.assign(new Error("save"), { status: r.status }); return r.json(); })
          .then((j: { savedAt: string }) => updateItem(it.key, (x) => (x.doc === it.doc ? { ...x, save: "saved", savedAt: j.savedAt } : x)))
          .catch((e: { status?: number }) => {
            const denied = e.status === 401 || e.status === 403;
            updateItem(it.key, (x) => ({ ...x, save: denied ? "denied" : "error" }));
            // προσωρινό πρόβλημα δικτύου: νέα προσπάθεια σε 5 δευτερόλεπτα· χωρίς δικαίωμα (έληξε η σύνδεση) δεν έχει νόημα
            if (!denied) setTimeout(() => updateItem(it.key, (x) => (x.save === "error" ? { ...x, save: "saving" } : x)), 5000);
          });
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [items, base, updateItem]);
  useEffect(() => {
    const busy = analysing || items.some((i) => i.save === "saving") || publishing;
    const h = (e: BeforeUnloadEvent) => { if (busy) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [analysing, items, publishing]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setDrawFor(null); setSelBox(null); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  // ---------- βήμα 1 ----------
  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    for (const f of Array.from(files)) {
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        try {
          setConverting(`Μετατρέπω το «${f.name}» σε εικόνες…`);
          const pages = await pdfToImages(f, { onPage: (n, t) => setConverting(`«${f.name}»: σελίδα ${n} από ${t}…`) });
          setUploads((u) => [...u, ...pages.map((p) => ({ key: `u${Math.random().toString(36).slice(2)}`, file: p, thumb: URL.createObjectURL(p) }))]);
        } catch { setError(`Το PDF «${f.name}» δεν άνοιξε. Δοκίμασε να το αποθηκεύσεις ξανά ή ανέβασε εικόνα.`); }
        finally { setConverting(null); }
      } else if (/^image\/(jpeg|png|webp|avif)$/.test(f.type)) {
        setUploads((u) => [...u, { key: `u${Math.random().toString(36).slice(2)}`, file: f, thumb: URL.createObjectURL(f) }]);
      } else setError(`Το «${f.name}» δεν είναι εικόνα ή PDF.`);
    }
  };
  const startReview = (forceNew = false) => {
    const fromBanners: Item[] = visible.concat(hidden).filter((b) => picked.has(b.id)).map((b, i) => {
      const d = forceNew ? undefined : draftByMedia.get(b.id), name = nameOf({ mediaId: b.id }, i);
      return d ? { key: `m${b.id}`, name, thumb: b.url, mediaId: b.id, extractionId: d.id, status: "ready", doc: d.doc, save: "saved" } : { key: `m${b.id}`, name, thumb: b.url, mediaId: b.id, status: "queued" };
    });
    const fromUploads: Item[] = uploads.map((u) => ({ key: u.key, name: u.file.name.replace(/\.\w+$/, ""), thumb: u.thumb, file: u.file, status: "queued" }));
    setItems([...fromBanners, ...fromUploads]); setActive(0); setSelSection(null); setSelBox(null); setStep("review");
  };
  const resumeDrafts = () => {
    setItems(openDrafts.map((d, i) => ({ key: `d${d.id}`, name: nameOf(d, i), thumb: d.doc.sourceUrl, mediaId: d.mediaId ?? undefined, extractionId: d.id, status: "ready", doc: d.doc, save: "saved" })));
    setActive(0); setStep("review");
  };
  const editPublished = () => {
    const pub = drafts.filter((d) => d.status === "published");
    setItems(pub.map((d, i) => ({ key: `p${d.id}`, name: nameOf(d, i), thumb: d.doc.sourceUrl, mediaId: d.mediaId ?? undefined, extractionId: d.id, status: "ready", doc: d.doc, save: "saved" })));
    setActive(0); setStep("review");
  };
  const unpublishAll = async () => {
    if (!confirm("Να αφαιρεθούν οι δημοσιευμένες ενότητες από τη σελίδα του προϊόντος; Τα αρχικά banners θα ξαναεμφανιστούν.")) return;
    for (const d of drafts.filter((x) => x.status === "published")) await fetch(`${base}/${d.id}?unpublish=1`, { method: "DELETE" });
    location.reload();
  };
  const pickCount = picked.size + uploads.length;

  // ---------- βήμα 2: ενέργειες ενοτήτων ----------
  const moveSection = (id: string, dir: -1 | 1) => setDoc((d) => { const i = d.sections.findIndex((s) => s.id === id), j = i + dir; if (j < 0 || j >= d.sections.length) return d; const xs = [...d.sections]; [xs[i], xs[j]] = [xs[j], xs[i]]; return { ...d, sections: xs }; });
  const removeSection = (id: string) => setDoc((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }));
  const mergeUp = (id: string) => setDoc((d) => {
    const i = d.sections.findIndex((s) => s.id === id); if (i < 1) return d;
    const a = d.sections[i - 1], b = d.sections[i];
    const merged: StudioSection = { ...a, subtitle: a.subtitle ?? b.title ?? b.subtitle, paragraphs: [...a.paragraphs, ...(a.subtitle && b.title ? [b.title] : []), ...(b.subtitle && (a.subtitle || !b.title) ? [b.subtitle] : []), ...b.paragraphs], features: [...a.features, ...b.features], images: [...a.images, ...b.images], footnote: a.footnote && b.footnote ? { ...a.footnote, text: `${a.footnote.text} ${b.footnote.text}` } : a.footnote ?? b.footnote };
    return { ...d, sections: [...d.sections.slice(0, i - 1), merged, ...d.sections.slice(i + 1)] };
  });
  const onBoxChange = (sel: BoxSel, box: Box) => setDoc((d) => ({ ...d, sections: d.sections.map((s) => s.id !== sel.sectionId ? s : sel.kind === "image" ? { ...s, images: s.images.map((im) => (im.id === sel.id ? { ...im, box } : im)) } : { ...s, features: s.features.map((f) => (f.id === sel.id ? { ...f, icon: box } : f)) }) }));
  const onDraw = (sectionId: string, box: Box) => {
    const id = `i${Date.now().toString(36)}`;
    setDoc((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sectionId ? { ...s, images: [...s.images, { id, box, alt: "", kind: "detail", overlayText: false, include: true }] } : s)) }));
    setDrawFor(null); setSelBox({ sectionId, kind: "image", id });
  };
  const selectSection = (id: string) => { setSelSection(id); document.getElementById(`sec-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  /** Όλο το κείμενο του banner στα ελληνικά ή στο πρωτότυπο (για όσα μεταφράστηκαν). */
  const switchLanguage = (lang: "el" | "original") => setDoc((d) => {
    const greek = (t: string) => /[α-ωά-ώ]/i.test(t);
    const want = <T extends { text: string; original?: string }>(t: T): T => (t.original && greek(t.text) !== (lang === "el") && greek(t.original) === (lang === "el") ? { ...t, text: t.original, original: t.text } : t);
    return { ...d, sections: d.sections.map((s) => ({ ...s, title: s.title && want(s.title), subtitle: s.subtitle && want(s.subtitle), paragraphs: s.paragraphs.map(want), footnote: s.footnote && want(s.footnote), features: s.features.map((x) => { if (!x.original) return x; const r = want({ text: x.label, original: x.original }); return { ...x, label: r.text, original: r.original }; }) })) };
  });
  const retry = (key: string, fresh = false) => {
    const old = items.find((i) => i.key === key)?.extractionId;
    if (fresh && old) void fetch(`${base}/${old}`, { method: "DELETE" }); // το παλιό πρόχειρο απορρίπτεται — όχι διπλά πρόχειρα
    updateItem(key, (it) => ({ ...it, status: "queued", error: undefined, ...(fresh ? { doc: undefined, extractionId: undefined } : {}) }));
  };

  const ready = items.filter((i) => i.status === "ready" && i.doc);
  const preview = useMemo(() => previewSections(ready.map((i) => i.doc!)), [ready]);
  const stats = { sections: preview.length, images: preview.reduce((n, s) => n + s.images.length, 0), icons: preview.reduce((n, s) => n + Object.keys(s._icons).length, 0) };

  /** Ο σχεδιαστής AI στήνει τη σελίδα από ΟΛΑ τα έτοιμα banners: διάταξη, σειρά, διπλές, νούμερα. */
  const design = async () => {
    const list = items.filter((i) => i.status === "ready" && i.doc);
    if (!list.length) return;
    setDesigning(true); setError(null);
    try {
      const r = await fetch(`${base}/design`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ docs: list.map((i) => i.doc) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Ο σχεδιασμός απέτυχε.");
      const docs = j.docs as StudioDoc[];
      setItems((xs) => xs.map((x) => { const k = list.findIndex((l) => l.key === x.key); return k >= 0 && docs[k] ? { ...x, doc: docs[k], save: "saving" } : x; }));
      setDesignBy(j.by);
    } catch (e) { setError((e as Error).message); } finally { setDesigning(false); }
  };
  const toPreview = () => {
    setDrawFor(null); setStep("publish");
    // πρώτη φορά στην προεπισκόπηση: ο σχεδιαστής στήνει τη σελίδα μόνος του
    if (!items.some((i) => i.doc?.sections.some((s) => s.designedBy || s.layout))) void design();
  };

  const publish = async () => {
    setPublishing(true); setError(null);
    try {
      const r = await fetch(`${base}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: ready.map((i) => ({ id: i.extractionId, doc: i.doc })), hideSources }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Η δημοσίευση απέτυχε.");
      setResult(j); setStep("done");
    } catch (e) { setError((e as Error).message); } finally { setPublishing(false); }
  };

  const ratio = doc ? doc.width / doc.height : 1;
  const translated = !!doc?.sections.some((s) => [s.title, s.subtitle, s.footnote, ...s.paragraphs].some((t) => t?.original) || s.features.some((f) => f.original));
  const saveLabel = item?.save === "saving" ? "Αποθήκευση…" : item?.save === "error" ? "Δεν αποθηκεύτηκε — νέα προσπάθεια σε λίγο" : item?.save === "denied" ? "Δεν αποθηκεύτηκε: έληξε η σύνδεση — άνοιξε το admin σε νέα καρτέλα και συνδέσου ξανά" : item?.savedAt ? `Αποθηκεύτηκε ${new Date(item.savedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` : item?.save === "saved" ? "Αποθηκευμένο πρόχειρο" : "";

  return (
    <div className="grid gap-5 min-w-0 @container">
      <div className="grid gap-1">
        <Link href={`/admin/catalog/${product.id}`} className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline w-fit"><ArrowLeft className="size-4" aria-hidden /> Καρτέλα προϊόντος</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><ScanText className="size-4" aria-hidden /> Απόδελτίωση banners · {product.path}</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] text-balance">{product.brand} {product.title}</h2>
      </div>

      <div className="rounded-2xl border border-eu-line bg-white p-2"><Stepper step={step} can={(s) => s === "pick" || (s === "review" && ready.length > 0)} go={setStep} /></div>

      {error && <p role="alert" className="eu-card-in m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 text-eu-ink px-4 py-3 text-[length:var(--fs-15)]"><CircleAlert className="size-5 text-eu-red shrink-0 mt-0.5" aria-hidden />{error}</p>}

      <StepTransition stepKey={step} dir={dir}>
      <div className="grid gap-5">
      {/* ---------------- 1. Επιλογή ---------------- */}
      {step === "pick" && (
        <div className="grid gap-5">
          <Hint>Τα banners είναι εικόνες του κατασκευαστή με φωτογραφίες και κείμενο κλειδωμένα μαζί. Ο βοηθός <strong>διαβάζει το κείμενο</strong>, <strong>ξεχωρίζει τις φωτογραφίες</strong> και τα κάνει ενότητες της σελίδας — εσύ ελέγχεις πριν δημοσιευτούν. Διάλεξε banners του προϊόντος ή ανέβασε JPG, PNG ή PDF από το site του κατασκευαστή.</Hint>

          {openDrafts.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-eu-yellow bg-eu-yellow/10 px-4 py-3">
              <RotateCcw className="size-5 text-eu-navy" aria-hidden />
              <span className="flex-1 min-w-[16rem] text-eu-ink text-[length:var(--fs-15)]">Υπάρχει <strong>πρόχειρο</strong> για {openDrafts.length} {openDrafts.length === 1 ? "banner" : "banners"} (τελευταία αλλαγή {new Date(openDrafts[0].updatedAt).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}).</span>
              <button type="button" className={secondary} onClick={resumeDrafts}>Συνέχεια από εκεί που έμεινες</button>
            </div>
          )}
          {publishedCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-eu-green/40 bg-eu-green/10 px-4 py-3">
              <Check className="size-5 text-eu-green" aria-hidden />
              <span className="flex-1 min-w-[16rem] text-eu-ink text-[length:var(--fs-15)]">Το προϊόν έχει ήδη <strong>{publishedCount} {publishedCount === 1 ? "ενότητα" : "ενότητες"}</strong> από απόδελτίωση στη σελίδα του.</span>
              {drafts.some((d) => d.status === "published") && <button type="button" className={ghost} onClick={editPublished}>Διόρθωση</button>}
              {drafts.some((d) => d.status === "published") && <button type="button" className={`${ghost} text-eu-red`} onClick={unpublishAll}>Αφαίρεση από τη σελίδα</button>}
            </div>
          )}

          <section className="grid gap-3" aria-labelledby="pick-banners">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h3 id="pick-banners" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Banners του προϊόντος <span className="text-eu-muted font-normal">({visible.length})</span></h3>
              {visible.length > 0 && (
                <div className="flex gap-1">
                  <button type="button" className={ghost} onClick={() => setPicked(new Set(visible.map((b) => b.id)))}>Όλα</button>
                  <button type="button" className={ghost} onClick={() => setPicked(new Set())}>Κανένα</button>
                </div>
              )}
            </div>
            {visible.length === 0 ? (
              <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Το προϊόν δεν έχει banners. Ανέβασε ένα αρχείο παρακάτω.</p>
            ) : (
              <ul className="m-0 p-0 list-none grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
                {visible.map((b, i) => {
                  const on = picked.has(b.id), st = b.extraction?.status;
                  return (
                    <li key={b.id}>
                      <label style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }} className={`block rounded-2xl border-2 bg-white overflow-hidden cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 eu-card-in ${on ? "border-eu-navy shadow-[0_6px_18px_rgba(18,42,88,.14)]" : "border-eu-line hover:border-eu-blue"}`}>
                        <span className="relative block bg-eu-surface" style={{ aspectRatio: b.width && b.height ? `${b.width} / ${Math.min(b.height, b.width * 1.2)}` : "2 / 1" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover object-top" />
                          <span className={`absolute top-2 left-2 size-8 rounded-lg inline-flex items-center justify-center border-2 ${on ? "bg-eu-navy border-eu-navy text-white" : "bg-white/90 border-eu-line"}`}>{on && <Check className="size-5 eu-pop" aria-hidden />}</span>
                          {st && <span className={`absolute top-2 right-2 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] ${st === "published" ? "bg-eu-green text-white" : "bg-eu-yellow text-eu-navy"}`}>{st === "published" ? "Δημοσιευμένο" : "Πρόχειρο"}</span>}
                        </span>
                        <span className="flex items-center gap-2 px-3 py-2 min-h-11">
                          <input type="checkbox" className="sr-only" checked={on} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} />
                          <span className="font-bold text-eu-ink text-[length:var(--fs-15)]">Banner {i + 1}</span>
                          <span className="ml-auto text-eu-muted text-[length:var(--fs-13)] tabular-nums">{b.width}×{b.height}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {hidden.length > 0 && (
              <details className="rounded-xl border border-eu-line bg-white px-4 py-2">
                <summary className="cursor-pointer min-h-10 flex items-center font-bold text-eu-ink-3 text-[length:var(--fs-15)]">Κρυμμένα από τη σελίδα ({hidden.length}) — ήδη αποδελτιωμένα ή κρυμμένα με το χέρι</summary>
                <ul className="m-0 mt-2 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]">
                  {hidden.map((b) => (
                    <li key={b.id}><label className="flex items-center gap-2 min-h-11 cursor-pointer"><input type="checkbox" className="size-5 accent-eu-blue" checked={picked.has(b.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.url} alt="" loading="lazy" className="h-12 w-24 object-cover object-top rounded border border-eu-line" /></label></li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="grid gap-3" aria-labelledby="pick-upload">
            <h3 id="pick-upload" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ή ανέβασε αρχείο</h3>
            <div
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.dataset.over = "1"; }}
              onDragLeave={(e) => { delete e.currentTarget.dataset.over; }}
              onDrop={(e) => { e.preventDefault(); delete e.currentTarget.dataset.over; void addFiles(e.dataTransfer.files); }}
              className="rounded-2xl border-2 border-dashed border-eu-line bg-white px-5 py-8 grid justify-items-center gap-3 text-center data-[over]:border-eu-blue data-[over]:bg-eu-chip transition-colors">
              <FileUp className="size-10 text-eu-blue" aria-hidden />
              <p className="m-0 text-eu-ink text-[length:var(--fs-16)]"><strong>Σύρε εδώ</strong> εικόνες ή PDF του κατασκευαστή</p>
              <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">JPG, PNG, WebP ή PDF (κάθε σελίδα γίνεται ξεχωριστό banner, έως 12) · έως 40 MB</p>
              <button type="button" className={secondary} onClick={() => drop.current?.click()}><Upload className="size-4" aria-hidden /> Επιλογή αρχείων</button>
              <input ref={drop} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,application/pdf,.pdf" className="sr-only" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
              {converting && <p className="m-0 inline-flex items-center gap-2 text-eu-blue font-bold text-[length:var(--fs-15)]" role="status"><Loader2 className="size-4 animate-spin" aria-hidden /> {converting}</p>}
            </div>
            {uploads.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-wrap gap-3">
                {uploads.map((u) => (
                  <li key={u.key} className="relative rounded-xl border border-eu-line bg-white overflow-hidden w-40 eu-card-in">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.thumb} alt="" className="w-full h-24 object-cover object-top" />
                    <span className="block px-2 py-1.5 text-eu-ink text-[length:var(--fs-13)] truncate" title={u.file.name}>{u.file.name}</span>
                    <button type="button" onClick={() => setUploads((xs) => xs.filter((x) => x.key !== u.key))} aria-label={`Αφαίρεση ${u.file.name}`} className="absolute top-1 right-1 size-9 rounded-full bg-white/95 border border-eu-line inline-flex items-center justify-center text-eu-ink-3 hover:text-eu-red">×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-gradient-to-t from-eu-surface via-eu-surface to-transparent flex flex-wrap items-center gap-3 justify-end">
            <span className="text-eu-ink-3 text-[length:var(--fs-15)] mr-auto">{pickCount ? `${pickCount} για ανάλυση · περίπου ${Math.max(5, pickCount * 6)} δευτερόλεπτα` : "Διάλεξε τουλάχιστον ένα banner ή ανέβασε αρχείο"}</span>
            <button type="button" className={primary} disabled={!pickCount || !!converting} onClick={() => startReview()}>Ανάλυση <ArrowRight className="size-5" aria-hidden /></button>
          </div>
        </div>
      )}

      {/* ---------------- 2. Έλεγχος ---------------- */}
      {step === "review" && (
        <div className="grid gap-4">
          <Hint>Αριστερά το banner, δεξιά ό,τι διάβασε ο βοηθός, χωρισμένο σε ενότητες. <strong>Διόρθωσε το κείμενο</strong>, κράτησε ό,τι χρειάζεται. Πάτα μια <span className="bg-eu-yellow/40 px-1 rounded">φωτογραφία</span> για να μετακινήσεις ή να αλλάξεις το πλαίσιό της (με το ποντίκι ή με τα βελάκια). Όλα αποθηκεύονται αυτόματα.</Hint>

          {items.length > 1 && (
            <div role="tablist" aria-label="Banners" className="flex flex-wrap gap-2">
              {items.map((it, i) => (
                <button key={it.key} role="tab" aria-selected={i === active} type="button" onClick={() => { setActive(i); setSelSection(null); setSelBox(null); setDrawFor(null); }}
                  className={`inline-flex items-center gap-2 rounded-full border-2 pl-1 pr-3 min-h-12 font-bold text-[length:var(--fs-14)] ${i === active ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink hover:border-eu-blue"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.thumb} alt="" className="size-9 rounded-full object-cover object-top bg-white" />
                  <span className="max-w-[10rem] truncate">{it.name}</span>
                  {it.status === "ready" ? <Check className={`size-4 ${i === active ? "text-eu-yellow" : "text-eu-green"}`} aria-label="έτοιμο" /> : it.status === "error" ? <CircleAlert className="size-4 text-eu-red" aria-label="σφάλμα" /> : <Loader2 className="size-4 animate-spin" aria-label="σε ανάλυση" />}
                </button>
              ))}
            </div>
          )}

          {item && (item.status === "queued" || item.status === "working") && (
            <div className="rounded-2xl border border-eu-line bg-white p-6 grid @3xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-6 items-center" role="status" aria-live="polite">
              <ScanOverlay src={item.thumb} />
              <div className="grid gap-3">
                <p className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]"><Loader2 className="size-6 animate-spin text-eu-blue shrink-0" aria-hidden /> <SwapText text={item.status === "queued" ? "Στη σειρά…" : WORKING[tick % WORKING.length]} /></p>
                <div className="grid gap-2" aria-hidden>{[88, 64, 76, 42].map((w, k) => <span key={k} className="h-3 rounded-full bg-eu-blue/15 eu-skeleton" style={{ width: `${w}%`, animationDelay: `${k * 180}ms` }} />)}</div>
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)]">Συνήθως 5–10 δευτερόλεπτα· τα ψηλά banners κόβονται σε κομμάτια και θέλουν λίγο παραπάνω. Μπορείς να δουλεύεις σε όσα είναι ήδη έτοιμα.</p>
              </div>
            </div>
          )}
          {item?.status === "error" && (
            <div className="rounded-2xl border-2 border-eu-red/40 bg-white p-5 grid gap-3" role="alert">
              <p className="m-0 flex gap-2 items-start text-eu-ink text-[length:var(--fs-16)]"><CircleAlert className="size-5 text-eu-red shrink-0 mt-0.5" aria-hidden /> {item.error}</p>
              <div><button type="button" className={secondary} onClick={() => retry(item.key)}><RotateCcw className="size-4" aria-hidden /> Ξανά ανάλυση</button></div>
            </div>
          )}

          {item?.status === "ready" && doc && (
            <div className="grid grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
              <div className={`grid gap-2 ${zoom ? "" : "@5xl:sticky @5xl:top-4"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-14)]"><span className="size-3 rounded-sm border-2 border-eu-blue" aria-hidden /> κείμενο</span>
                  <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-14)]"><span className="size-3 rounded-sm border-2 border-eu-yellow" aria-hidden /> φωτογραφία</span>
                  <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-14)]"><span className="size-3 rounded-sm border-2 border-dashed border-eu-yellow" aria-hidden /> εικονίδιο</span>
                  <button type="button" className={`${ghost} ml-auto`} onClick={() => setZoom((z) => !z)} aria-pressed={zoom}>{zoom ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />} {zoom ? "Προσαρμογή στην οθόνη" : "Πλήρες πλάτος"}</button>
                </div>
                {drawFor && <p className="m-0 rounded-lg bg-eu-yellow text-eu-navy font-bold px-3 py-2 text-[length:var(--fs-15)]" role="status">Σύρε πάνω στο banner για να ορίσεις τη νέα φωτογραφία · Esc για ακύρωση</p>}
                <div style={zoom ? undefined : { width: `min(100%, calc((100dvh - 10rem) * ${ratio}))` }} className="mx-auto w-full">
                  <BoxCanvas doc={doc} selectedSection={selSection} selectedBox={selBox} drawFor={drawFor} onSelectSection={selectSection} onSelectBox={setSelBox} onBoxChange={onBoxChange} onDraw={onDraw} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-eu-muted text-[length:var(--fs-14)]">
                  <span>{translated ? "Ό,τι ήταν σε ξένη γλώσσα μεταφράστηκε στα ελληνικά — το πρωτότυπο φαίνεται κάτω από κάθε πεδίο." : "Το κείμενο είναι στα ελληνικά, όπως στο banner."}</span>
                  {translated && <><button type="button" className={ghost} onClick={() => switchLanguage("el")}>Όλα στα ελληνικά</button><button type="button" className={ghost} onClick={() => switchLanguage("original")}>Όλα στο πρωτότυπο</button></>}
                  <button type="button" className={`${ghost} ml-auto`} onClick={() => { if (confirm("Νέα ανάλυση αυτού του banner; Οι διορθώσεις σου εδώ θα χαθούν.")) retry(item.key, true); }}><RotateCcw className="size-4" aria-hidden /> Νέα ανάλυση</button>
                </div>
              </div>

              <div className="grid gap-3 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{doc.sections.length} {doc.sections.length === 1 ? "ενότητα" : "ενότητες"}</h3>
                  <span className={`text-[length:var(--fs-14)] ${item?.save === "denied" || item?.save === "error" ? "text-eu-red font-semibold" : "text-eu-muted"}`} aria-live="polite">{saveLabel}</span>
                </div>
                {doc.sections.length === 0 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)]">Δεν βρέθηκε κείμενο ή φωτογραφία. Πρόσθεσε ενότητα με το χέρι ή δοκίμασε νέα ανάλυση.</p>}
                {doc.sections.map((s, i) => (
                  <motion.div key={s.id} layout="position" transition={{ type: "spring", stiffness: 420, damping: 38 }} className="eu-card-in" style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}>
                  <SectionEditor doc={doc} s={s} index={i} total={doc.sections.length} selected={selSection === s.id} selectedBox={selBox} drawing={drawFor === s.id}
                    onSelect={() => setSelSection(s.id)} onChange={(x) => setSection(s.id, x)} onMove={(d) => moveSection(s.id, d)} onRemove={() => removeSection(s.id)} onMergeUp={() => mergeUp(s.id)}
                    onSelectBox={(sel) => { setSelSection(s.id); setSelBox(sel); }} onDraw={() => setDrawFor((d) => (d === s.id ? null : s.id))} />
                  </motion.div>
                ))}
                <button type="button" className={`${secondary} justify-self-start`} onClick={() => setDoc((d) => ({ ...d, sections: [...d.sections, emptySection()] }))}><Plus className="size-4" aria-hidden /> Νέα ενότητα</button>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-gradient-to-t from-eu-surface via-eu-surface to-transparent flex flex-wrap items-center gap-3">
            <button type="button" className={secondary} onClick={() => setStep("pick")}><ArrowLeft className="size-4" aria-hidden /> Επιλογή</button>
            <span className="text-eu-ink-3 text-[length:var(--fs-15)] mr-auto">{ready.length} από {items.length} έτοιμα{analysing ? " · η ανάλυση συνεχίζεται" : ""}</span>
            {items.length > 1 && active < items.length - 1 && <button type="button" className={secondary} onClick={() => { setActive(active + 1); setSelSection(null); setSelBox(null); }}>Επόμενο banner <ArrowRight className="size-4" aria-hidden /></button>}
            <button type="button" className={primary} disabled={!ready.length} onClick={toPreview}>Προεπισκόπηση <ArrowRight className="size-5" aria-hidden /></button>
          </div>
        </div>
      )}

      {/* ---------------- 3. Προεπισκόπηση & δημοσίευση ---------------- */}
      {step === "publish" && (
        <div className="grid gap-4">
          <Hint>Έτσι θα δει ο πελάτης τις ενότητες στη σελίδα του προϊόντος — κείμενο που διαβάζεται και προσαρμόζεται σε κάθε οθόνη, και καθαρές φωτογραφίες. Δες και το <strong>κινητό</strong> πριν δημοσιεύσεις.</Hint>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Συσκευή προεπισκόπησης" className="inline-flex rounded-full border border-eu-line bg-white p-1">
              {([["desktop", "Υπολογιστής", Monitor], ["mobile", "Κινητό", Smartphone]] as const).map(([k, t, Icon]) => (
                <button key={k} type="button" role="radio" aria-checked={device === k} onClick={() => setDevice(k)} className={`inline-flex items-center gap-1.5 rounded-full px-4 min-h-10 font-bold text-[length:var(--fs-14)] ${device === k ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:text-eu-ink"}`}><Icon className="size-4" aria-hidden /> {t}</button>
              ))}
            </div>
            <span className="text-eu-ink-3 text-[length:var(--fs-15)]">{stats.sections} ενότητες · {stats.images} φωτογραφίες · {stats.icons} εικονίδια</span>
            <button type="button" className={`${ghost} ml-auto`} onClick={design} disabled={designing}>{designing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {designBy ? "Ξανασχεδίαση με AI" : "Σχεδίαση με AI"}</button>
          </div>
          {designing ? (
            <p className="m-0 flex items-center gap-2 rounded-xl bg-eu-navy text-white px-4 py-3 text-[length:var(--fs-15)] eu-card-in" role="status"><Sparkles className="size-5 text-eu-yellow eu-breathe" aria-hidden /> <SwapText text={WORKING_DESIGN[tick % WORKING_DESIGN.length]} /></p>
          ) : designBy && (
            <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-eu-chip px-4 py-3 text-eu-ink text-[length:var(--fs-15)] eu-card-in"><Sparkles className="size-5 text-eu-blue shrink-0" aria-hidden /> {designBy === "ai" ? "Ο σχεδιαστής AI διάλεξε διάταξη και σειρά για κάθε ενότητα, και έβγαλε εκτός τις διπλές." : "Η σελίδα στήθηκε με κανόνες (το AI δεν ήταν διαθέσιμο)."} <button type="button" className="font-bold text-eu-blue underline-offset-2 hover:underline min-h-8" onClick={() => setStep("review")}>Άλλαξε ό,τι θες στον έλεγχο</button></p>
          )}
          <div className="rounded-2xl border border-eu-line bg-eu-surface p-3 @3xl:p-6 overflow-hidden">
            <motion.div key={device} initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className={`mx-auto bg-white rounded-xl shadow-[0_8px_30px_rgba(18,42,88,.10)] p-4 @3xl:p-8 ${device === "mobile" ? "max-w-[390px]" : "max-w-[1000px]"}`}>
              {preview.length ? (
                <ProductSections sections={preview}
                  renderImage={(im) => { const s = preview.find((x) => x.images.includes(im)); const k = s ? s.images.indexOf(im) : -1; return s && k >= 0 ? <CropView src={s._doc.sourceUrl} box={s._boxes[k]} width={s._doc.width} height={s._doc.height} alt={im.alt} className="w-full rounded-xl" /> : null; }}
                  renderIcon={(f) => { const b = preview.find((x) => x._icons[f.iconUrl!])?._icons[f.iconUrl!]; return b ? <CropView src={b.doc.sourceUrl} box={b.box} width={b.doc.width} height={b.doc.height} className="w-11 shrink-0" /> : null; }} />
              ) : <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Καμία ενότητα για δημοσίευση — γύρνα στον έλεγχο.</p>}
            </motion.div>
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-eu-line bg-white px-4 py-3 cursor-pointer">
            <input type="checkbox" checked={hideSources} onChange={(e) => setHideSources(e.target.checked)} className="size-5 mt-0.5 accent-eu-blue" />
            <span className="text-eu-ink text-[length:var(--fs-15)]"><strong>Κρύψε τα αρχικά banners</strong> από τη σελίδα του προϊόντος (προτείνεται) — αλλιώς ο πελάτης θα βλέπει το ίδιο περιεχόμενο δύο φορές. <span className="text-eu-muted">Δεν σβήνονται· ξαναεμφανίζονται αν αναιρέσεις τη δημοσίευση.</span></span>
          </label>
          <div className="sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-gradient-to-t from-eu-surface via-eu-surface to-transparent flex flex-wrap items-center gap-3">
            <button type="button" className={secondary} onClick={() => setStep("review")}><ArrowLeft className="size-4" aria-hidden /> Έλεγχος</button>
            <span className="mr-auto" />
            <button type="button" className={primary} disabled={!preview.length || publishing} onClick={publish}>{publishing ? <><Loader2 className="size-5 animate-spin" aria-hidden /> Κόβω τις φωτογραφίες και δημοσιεύω…</> : <>Δημοσίευση στο προϊόν <Check className="size-5" aria-hidden /></>}</button>
          </div>
        </div>
      )}

      {/* ---------------- Ολοκληρώθηκε ---------------- */}
      {step === "done" && result && (
        <div className="rounded-2xl border-2 border-eu-green/50 bg-white p-6 grid gap-4 justify-items-start" role="status">
          <p className="m-0 inline-flex items-center gap-4 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]"><SuccessBurst /> Δημοσιεύτηκε</p>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)]">{result.sections} {result.sections === 1 ? "ενότητα" : "ενότητες"} με {result.crops} {result.crops === 1 ? "φωτογραφία/εικονίδιο" : "φωτογραφίες και εικονίδια"} μπήκαν στη σελίδα του προϊόντος{result.hidden ? ` · ${result.hidden} ${result.hidden === 1 ? "banner κρύφτηκε" : "banners κρύφτηκαν"}` : ""}.</p>
          <div className="flex flex-wrap gap-3">
            <a href={`/proion/${product.slug}#description`} target="_blank" rel="noreferrer" className={primary}>Δες τη σελίδα <ExternalLink className="size-4" aria-hidden /></a>
            {nextHref && <Link href={nextHref} className={secondary}>Επόμενο προϊόν <ArrowRight className="size-4" aria-hidden /></Link>}
            <Link href={`/admin/catalog/${product.id}`} className={ghost}>Πίσω στην καρτέλα</Link>
          </div>
        </div>
      )}
      </div>
      </StepTransition>
    </div>
  );
}
