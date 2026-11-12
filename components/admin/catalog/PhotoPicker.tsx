"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, ImageOff, ImagePlus, Loader2, Scissors, Search, Undo2 } from "lucide-react";
import { addPhotosAction, cutoutPreviewAction, photoCandidatesAction, type PhotoCandidatesResult } from "@/app/admin/(shell)/catalog/enrich-actions";
import type { Toast } from "@/components/admin/customers/CustomerActions";
import { invalidateProductPeek } from "./ProductPeek";

const SRC: Record<string, { label: string; tone: string }> = {
  icecat: { label: "Icecat · επίσημη", tone: "bg-eu-green/10 text-eu-green" },
  web: { label: "Site κατασκευαστή", tone: "bg-eu-green/10 text-eu-green" },
  channel3: { label: "Channel3", tone: "bg-eu-chip text-eu-ink-2" },
  kotsovolos: { label: "Κωτσόβολος", tone: "bg-eu-chip text-eu-ink-2" },
  shop: { label: "Άλλο κατάστημα", tone: "bg-eu-amber/15 text-eu-ink" },
};
/** η πηγή κάθε «Νέας αναζήτησης», όπως τη λέμε στον χρήστη */
const SEARCHED: Record<string, string> = { icecat: "Icecat", web: "site του κατασκευαστή", channel3: "Channel3", kotsovolos: "Κωτσόβολο", shop: "άλλα καταστήματα" };
const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
/** όσες προεπιλέγονται: ελεγμένες και ώς 6, όπως το μαζικό πέρασμα */
const PRESELECT = 6;

/**
 * «Φωτογραφίες από το web» (μενού ⋯ της γραμμής προϊόντος): δείχνει τις φωτογραφίες που βρέθηκαν στο site του
 * κατασκευαστή / Icecat / καταστήματα, με διαστάσεις και προειδοποίηση για σχέδια ή μικρές. Ο χρήστης διαλέγει ποιες
 * μπαίνουν στο προϊόν. Μπαίνουν κεντραρισμένες στο τετράγωνο πλαίσιο του site.
 */
export function PhotoPicker({ productId, canWrite, onDone }: { productId: string; canWrite: boolean; /** χωρίς onDone (σελίδα προϊόντος) το αποτέλεσμα φαίνεται μέσα στο παράθυρο */ onDone?: (t: Toast) => void }) {
  const router = useRouter();
  const [data, setData] = useState<PhotoCandidatesResult | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [hideSmall, setHideSmall] = useState(true);
  const [mode, setMode] = useState<"load" | "search" | "save" | null>("load");
  const [, start] = useTransition();
  const [note, setNote] = useState<Toast>(null);
  // η πηγή της τελευταίας αναζήτησης: η επόμενη πάει σε άλλη
  const [lastSource, setLastSource] = useState<string | null>(null);
  // «Αφαίρεση φόντου» ανά φωτογραφία: προεπισκόπηση από τον server, η ίδια επεξεργασία γίνεται και στην αποθήκευση
  const [cut, setCut] = useState<Record<string, { busy: true } | { src: string } | { error: string }>>({});
  const toggleCut = (id: string) => {
    if (cut[id] && !("error" in cut[id])) { setCut((c) => { const n = { ...c }; delete n[id]; return n; }); return; }
    setCut((c) => ({ ...c, [id]: { busy: true } }));
    cutoutPreviewAction(productId, id).then(
      (r) => { setCut((c) => ({ ...c, [id]: r.ok ? { src: r.src } : { error: r.error } })); if (r.ok) setOn((s) => new Set(s).add(id)); },
      () => setCut((c) => ({ ...c, [id]: { error: "Η αφαίρεση φόντου απέτυχε." } })),
    );
  };
  const done = (t: Toast) => (onDone ? onDone(t) : setNote(t));

  const apply = (r: PhotoCandidatesResult) => { setData(r); if (r.step) setLastSource(r.step.source); setOn(new Set(r.candidates.filter((c) => c.ok).slice(0, PRESELECT).map((c) => c.id))); };
  const fail = (e: unknown) => done({ ok: false, text: e instanceof Error ? e.message : "Η αναζήτηση απέτυχε." });
  const load = (search: boolean) => {
    setMode(search ? "search" : "load");
    start(async () => { try { apply(await photoCandidatesAction(productId, search, lastSource)); } catch (e) { fail(e); } setMode(null); });
  };
  // πρώτη φόρτωση (δωρεάν) όταν ανοίγει το παράθυρο
  useEffect(() => {
    let live = true;
    photoCandidatesAction(productId, false).then((r) => { if (live) apply(r); }, (e) => { if (live) fail(e); }).finally(() => { if (live) setMode(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- μία φόρτωση ανά προϊόν
  }, [productId]);

  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = () => {
    setMode("save");
    start(async () => {
      const r = await addPhotosAction(productId, [...on], hideSmall && !!data?.small, [...on].filter((id) => cut[id] && "src" in cut[id]));
      const n = (x: number, a: string, b: string) => `${x} ${x === 1 ? a : b}`;
      done(r.images
        ? { ok: true, text: `${r.images === 1 ? "Μπήκε" : "Μπήκαν"} ${n(r.images, "φωτογραφία", "φωτογραφίες")} στο προϊόν${r.hidden ? ` · κρύφτηκαν ${n(r.hidden, "μικρή", "μικρές")}` : ""}${r.failed ? ` · ${r.failed} δεν κατέβηκαν (${r.firstError})` : ""}.` }
        : { ok: false, text: `Καμία φωτογραφία δεν μπήκε${r.firstError ? `: ${r.firstError}` : "."}` });
      invalidateProductPeek(productId);
      router.refresh();
      setMode(null);
    });
  };

  const busy = mode !== null;
  const list = data?.candidates ?? [];
  const status = !data ? null : data.current === 0
    ? { tone: "border-eu-red/30 bg-eu-red/5", icon: <ImageOff className="size-4 shrink-0 text-eu-red" aria-hidden />, text: "Το προϊόν δεν έχει καμία φωτογραφία, γι' αυτό δεν φαίνεται στο eshop." }
    : data.small === data.current
      ? { tone: "border-eu-amber/40 bg-eu-amber/10", icon: <AlertTriangle className="size-4 shrink-0 text-eu-amber" aria-hidden />, text: `Έχει ${data.current === 1 ? "1 φωτογραφία, μικρή" : `${data.current} φωτογραφίες, όλες μικρές`} (κάτω από 600 px). Μια μεγαλύτερη θα φαίνεται καθαρότερη.` }
      : { tone: "border-eu-line bg-eu-surface/60", icon: <Check className="size-4 shrink-0 text-eu-green" aria-hidden />, text: `Έχει ήδη ${data.current === 1 ? "1 φωτογραφία" : `${data.current} φωτογραφίες`}. Όσες προσθέσεις μπαίνουν μετά από αυτές.` };

  return (
    <div className="grid gap-3 min-w-0" data-help="catalog.photo-picker">
      {note && <p role="status" className={`m-0 rounded-xl px-3 py-2 font-bold text-[length:var(--fs-13)] ${note.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{note.text}</p>}
      {status && <p className={`m-0 flex gap-2 rounded-xl border px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)] ${status.tone}`}>{status.icon}{status.text}</p>}

      {mode === "load" && <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση φωτογραφιών που βρέθηκαν…</p>}
      {mode === "search" && <p className="m-0 inline-flex items-center gap-2 text-eu-ink-2 text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin text-eu-blue" aria-hidden /> Ψάχνω σε {lastSource ? "άλλη πηγή από την προηγούμενη" : "μία πηγή"} (έως ~1 λεπτό)…</p>}
      {data?.step && mode !== "search" && (
        <p role="status" data-help="catalog.photo-picker.source" className={`m-0 flex gap-2 rounded-xl border px-3 py-2 text-[length:var(--fs-13)] ${data.step.images ? "border-eu-green/30 bg-eu-green/5 text-eu-ink" : "border-eu-amber/40 bg-eu-amber/10 text-eu-ink"}`}>
          <Search className={`size-4 shrink-0 mt-0.5 ${data.step.images ? "text-eu-green" : "text-eu-amber"}`} aria-hidden />
          <span>Αυτή η αναζήτηση έψαξε σε: <b>{SEARCHED[data.step.source] ?? data.step.source}</b>{data.step.sourceName ? ` (${data.step.sourceName})` : ""} · {data.step.images ? `βρήκε ${data.step.images === 1 ? "1 φωτογραφία" : `${data.step.images} φωτογραφίες`}` : `δεν έδωσε νέες φωτογραφίες${data.step.note ? ` (${data.step.note})` : ""}`}. Η επόμενη «Νέα αναζήτηση» θα ψάξει σε άλλη πηγή.</span>
        </p>
      )}

      {data && mode !== "search" && !list.length && (
        <div className="grid justify-items-center gap-1 rounded-xl border border-dashed border-eu-line px-3 py-6 text-center">
          <ImagePlus className="size-6 text-eu-muted" aria-hidden />
          <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">{data.searched ? "Η αναζήτηση δεν βρήκε φωτογραφίες για αυτό το μοντέλο." : "Δεν υπάρχουν ακόμη φωτογραφίες από το web."}</p>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{data.searched ? "Δοκίμασε να ανεβάσεις φωτογραφία από την καρτέλα «Φωτογραφίες & βίντεο»." : "Πάτα «Αναζήτηση στο web» για να ψάξω στο site του κατασκευαστή."}</p>
        </div>
      )}

      {list.length > 0 && mode !== "search" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)]"><b className="text-eu-ink">{list.length}</b> φωτογραφίες βρέθηκαν · επίλεξε όσες είναι το ίδιο προϊόν. Μπαίνουν στο κέντρο του τετράγωνου πλαισίου του site. Σε banner με χρωματιστό φόντο πάτα «Αφαίρεση φόντου».</p>
            {canWrite && <div className="flex gap-1.5">
              <button type="button" onClick={() => setOn(new Set(list.map((c) => c.id)))} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-8 font-bold text-eu-navy text-[length:var(--fs-12)] hover:border-eu-navy">Όλες</button>
              <button type="button" onClick={() => setOn(new Set())} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-8 font-bold text-eu-ink-2 text-[length:var(--fs-12)] hover:border-eu-navy">Καμία</button>
            </div>}
          </div>
          <ul className="m-0 p-0 list-none grid grid-cols-2 @md:grid-cols-3 @2xl:grid-cols-4 gap-2" data-help="catalog.photo-picker.grid">
            {list.map((c) => {
              const sel = on.has(c.id), src = SRC[c.source] ?? { label: c.source, tone: "bg-eu-chip text-eu-ink-2" };
              const k = cut[c.id], cutSrc = k && "src" in k ? k.src : null, cutBusy = !!k && "busy" in k, cutErr = k && "error" in k ? k.error : null;
              return (
                <li key={c.id} className="min-w-0">
                  <label className={`grid gap-1 rounded-xl border-2 bg-white p-1.5 ${canWrite ? "cursor-pointer" : ""} ${sel ? "border-eu-navy" : c.ok ? "border-eu-line-2" : "border-eu-amber/50"}`}>
                    <span className="relative block aspect-square rounded-lg bg-white border border-eu-line-2 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element -- εξωτερική προεπισκόπηση πριν την έγκριση */}
                      <img src={cutSrc ?? c.url} alt="" loading="lazy" referrerPolicy="no-referrer" className={`size-full object-contain ${cutSrc ? "" : "p-[6%]"}`} />
                      {cutBusy && <span className="absolute inset-0 grid place-items-center bg-white/70"><Loader2 className="size-6 animate-spin text-eu-blue" aria-hidden /></span>}
                      {canWrite && <input type="checkbox" checked={sel} onChange={() => toggle(c.id)} className="absolute top-1.5 left-1.5 size-5 accent-eu-navy" aria-label={`Επιλογή φωτογραφίας ${c.width ?? "?"}×${c.height ?? "?"} από ${src.label}`} />}
                      {!cutSrc && c.width && c.height && <span className="absolute bottom-1 right-1 rounded bg-eu-ink/75 px-1.5 py-px font-mono text-white text-[length:var(--fs-11)] tabular-nums">{c.width}×{c.height}</span>}
                    </span>
                    <span className="flex items-center gap-1 min-w-0"><span className={`shrink-0 rounded-full px-1.5 py-px font-bold text-[length:var(--fs-11)] ${src.tone}`}>{src.label}</span><span className="truncate text-eu-muted text-[length:var(--fs-12)]">{host(c.pageUrl ?? c.url)}</span></span>
                    {cutSrc ? <span className="flex gap-1 font-bold text-eu-green text-[length:var(--fs-12)] leading-snug"><Check className="size-3.5 shrink-0 mt-0.5" aria-hidden />Χωρίς φόντο, κεντραρισμένη στο τετράγωνο</span>
                      : cutErr ? <span className="flex gap-1 text-eu-red text-[length:var(--fs-12)] leading-snug"><AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="line-clamp-3">{cutErr}</span></span>
                      : c.note && <span className="flex gap-1 text-eu-ink-2 text-[length:var(--fs-12)] leading-snug"><AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-eu-amber" aria-hidden /><span className="line-clamp-2">{c.note}</span></span>}
                    {canWrite && <button type="button" disabled={cutBusy} onClick={(e) => { e.preventDefault(); toggleCut(c.id); }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-12)] disabled:opacity-50 ${cutSrc ? "border border-eu-line text-eu-ink-2 hover:border-eu-navy" : "border border-eu-blue/40 text-eu-blue hover:bg-eu-chip"}`}>
                      {cutSrc ? <><Undo2 className="size-3.5" aria-hidden />Αρχική φωτογραφία</> : <><Scissors className="size-3.5" aria-hidden />{cutBusy ? "Αφαίρεση φόντου…" : "Αφαίρεση φόντου"}</>}
                    </button>}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="m-0 flex gap-2 text-eu-muted text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-eu-amber" aria-hidden />Οι φωτογραφίες τρίτων έχουν πνευματικά δικαιώματα: προτίμησε του κατασκευαστή (πράσινη ετικέτα). Των καταστημάτων μόνο αν επιτρέπεται.</p>
        </>
      )}

      {canWrite && data && (
        <div className="flex flex-wrap items-center gap-2 border-t border-eu-line-2 pt-3">
          {data.small > 0 && list.length > 0 && <label className="flex items-center gap-2 min-h-11 md:min-h-8 text-eu-ink-2 text-[length:var(--fs-13)] cursor-pointer"><input type="checkbox" checked={hideSmall} onChange={(e) => setHideSmall(e.target.checked)} className="size-4 accent-eu-navy" />Κρύψε τις {data.small} μικρές που έχει τώρα (δεν σβήνονται)</label>}
          <span className="flex-1" />
          <button type="button" disabled={busy} onClick={() => load(true)} data-help="catalog.photo-picker.search" className={`inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] disabled:opacity-50 ${list.length ? "border border-eu-navy text-eu-navy hover:bg-eu-navy hover:text-white" : "bg-eu-navy text-white hover:bg-eu-blue"}`}>
            {mode === "search" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}{data.searched || list.length ? "Νέα αναζήτηση σε άλλη πηγή" : "Αναζήτηση στο web"}<span className="font-normal opacity-75">έως ~$0,02</span>
          </button>
          {list.length > 0 && <button type="button" disabled={busy || !on.size} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-50">
            {mode === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}{mode === "save" ? "Αποθήκευση…" : on.size ? `Προσθήκη ${on.size === 1 ? "1 φωτογραφίας" : `${on.size} φωτογραφιών`}` : "Επίλεξε φωτογραφίες"}
          </button>}
        </div>
      )}
      {data?.searched && data.costUsd > 0 && <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Κόστος αναζήτησης: ${data.costUsd.toFixed(3)}</p>}
      <a href={`/admin/catalog/${productId}?tab=media`} className="justify-self-start inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-12)] hover:underline"><ExternalLink className="size-3.5" aria-hidden />Όλες οι φωτογραφίες του προϊόντος</a>
    </div>
  );
}
