"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/Image";
import { Upload, Images, Star, ArrowLeft, ArrowRight, Trash2, EyeOff, RotateCcw, Loader2, AlertTriangle, Box, Check, Scissors, X } from "lucide-react";
import type { MediaAssetDTO } from "@/lib/media/types";
import type { ProductImageDTO, ProductMediaKind } from "@/lib/catalog/product-images";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import { useUploader } from "@/components/admin/media/useUploader";
import { attachFromGallery, saveImageOrder, saveImageAlt, removeProductImage, restoreProductImage, imageCutoutPreview, applyImageCutout } from "@/app/admin/(shell)/catalog/actions";
import { setArFrontImage } from "@/app/admin/(shell)/ar/actions";

const SOURCE: Record<string, string> = { "legacy-site": "Παλιό site", gallery: "Βιβλιοθήκη", upload: "Ανέβασμα" };
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue";
const icon = "size-11 inline-flex items-center justify-center rounded-full text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-eu-blue";

/**
 * Φωτογραφίες ενός προϊόντος: ανέβασμα (σύρσιμο αρχείων ή κουμπί), συσχετισμός από
 * τη βιβλιοθήκη πολυμέσων, σειρά (σύρσιμο ή βελάκια — η πρώτη είναι η κύρια),
 * εναλλακτικό κείμενο, αφαίρεση / επαναφορά. Κάθε αλλαγή αποθηκεύεται αμέσως.
 */
export function ProductImages({ productId, initial, canWrite, canUploadToLibrary, ar, embedded = false, kind = "image" }: { productId: string; initial: ProductImageDTO[]; canWrite: boolean; canUploadToLibrary: boolean; /** μέσα σε ενότητα (accordion): χωρίς δικό του πλαίσιο και τίτλο */ embedded?: boolean; /** banner = εικόνες του κατασκευαστή με κείμενο (χωρίς «κύρια» / AR) */ kind?: ProductMediaKind; /** «Δες το στον χώρο σου»: ποια φωτογραφία γεμίζει την πρόσοψη του στερεού (null = αυτόματα η πιο μετωπική) */ ar?: { front: string | null } }) {
  const [images, setImages] = useState(initial);
  // νέα δεδομένα από τον server (router.refresh, π.χ. μετά από δημοσίευση απόδελτίωσης): η λίστα ακολουθεί χωρίς να χαθεί το μήνυμα
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setImages(initial); }
  const [arFront, setArFront] = useState(ar?.front ?? null);
  const banner = kind === "banner";
  const noun = banner ? "του banner" : "της φωτογραφίας";
  const router = useRouter();
  // Banners: η απόδελτίωση πιο κάτω στην ίδια οθόνη πρέπει να δει τα νέα/κρυμμένα banners
  const ids = images.filter((i) => !i.hidden).map((i) => i.id).join(",");
  const firstIds = useRef(ids);
  useEffect(() => { if (banner && ids !== firstIds.current) { firstIds.current = ids; router.refresh(); } }, [banner, ids, router]);
  const chooseArFront = (url: string | null) => { setArFront(url); start(async () => { await setArFrontImage(productId, url); say(url ? "Αυτή η φωτογραφία είναι πλέον η όψη του στερεού στο AR." : "Η όψη του στερεού επιλέγεται πάλι αυτόματα (η πιο μετωπική)."); }); };
  const [picker, setPicker] = useState(false);
  const [cutFor, setCutFor] = useState<{ im: ProductImageDTO; n: number } | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropFiles, setDropFiles] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const visible = images.filter((i) => !i.hidden), hidden = images.filter((i) => i.hidden);
  const say = (text: string, tone: "ok" | "warn" = "ok") => setMsg({ text, tone });

  const onUploaded = useCallback((asset: MediaAssetDTO) => {
    const image = asset as unknown as ProductImageDTO; // το endpoint των προϊόντων επιστρέφει ProductImageDTO
    setImages((xs) => (xs.some((x) => x.id === image.id) ? xs : [...xs, image]));
    setMsg({ text: `Ανέβηκε και μπήκε στο τέλος της σειράς${image.lowRes ? " — προσοχή, είναι μικρή (κάτω από 600px)" : ""}. Υπάρχει πλέον και στη βιβλιοθήκη, στον φάκελο «Προϊόντα».`, tone: image.lowRes ? "warn" : "ok" });
  }, []);
  const uploader = useUploader(onUploaded, `/api/admin/catalog/products/${productId}/images${kind === "banner" ? "?kind=banner" : ""}`);
  const busyUploads = uploader.items.filter((u) => u.status === "queued" || u.status === "uploading");
  const failedUploads = uploader.items.filter((u) => u.status === "error");

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /^image\/(jpeg|png|webp|avif)$/.test(f.type));
    const rejected = Array.from(files).length - list.length;
    if (list.length) uploader.add(list);
    if (rejected) say(`${rejected} αρχεία αγνοήθηκαν — δεκτά είναι JPEG, PNG, WebP και AVIF.`, "warn");
  };

  // optimistic: η αλλαγή φαίνεται αμέσως· αν ο server αποτύχει, επιστρέφει η προηγούμενη κατάσταση
  const persistOrder = (next: ProductImageDTO[]) => {
    const prev = images;
    setImages([...next, ...hidden]);
    start(async () => { try { setImages(await saveImageOrder(productId, next.map((i) => i.id), kind)); } catch { setImages(prev); say("Η σειρά δεν αποθηκεύτηκε και επανήλθε η προηγούμενη. Δοκίμασε ξανά.", "warn"); } });
  };
  const remove = (im: ProductImageDTO) => {
    const prev = images;
    setImages((xs) => (im.source === "legacy-site" ? xs.map((x) => (x.id === im.id ? { ...x, hidden: true } : x)) : xs.filter((x) => x.id !== im.id)));
    start(async () => {
      try { const r = await removeProductImage(productId, im.id, kind); setImages(r.images); say(r.how === "hidden" ? (banner ? "Το banner κρύφτηκε. Θα το βρεις στα «Κρυμμένα»." : "Η φωτογραφία κρύφτηκε. Θα τη βρεις στις «Κρυμμένες».") : "Αφαιρέθηκε από το προϊόν. Το αρχείο παραμένει στη βιβλιοθήκη."); }
      catch { setImages(prev); say(banner ? "Το banner δεν αφαιρέθηκε και επανήλθε. Δοκίμασε ξανά." : "Η φωτογραφία δεν αφαιρέθηκε και επανήλθε. Δοκίμασε ξανά.", "warn"); }
    });
  };
  const move = (id: string, to: number) => {
    const from = visible.findIndex((i) => i.id === id);
    if (from === -1 || to < 0 || to >= visible.length || from === to) return;
    const next = visible.slice(); const [it] = next.splice(from, 1); next.splice(to, 0, it);
    persistOrder(next);
    say(to === 0 ? "Ορίστηκε ως κύρια φωτογραφία." : `Μετακινήθηκε στη θέση ${to + 1}.`);
  };

  return (
    <section
      className={`grid gap-4 transition-colors ${embedded ? `rounded-xl ${dropFiles ? "outline-2 outline-dashed outline-eu-blue bg-eu-chip/40" : ""}` : `rounded-2xl border-2 bg-white p-4 ${dropFiles ? "border-eu-blue bg-eu-chip/40" : "border-eu-line"}`}`}
      onDragOver={(e) => { if (canWrite && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropFiles(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropFiles(false); }}
      onDrop={(e) => { if (canWrite && e.dataTransfer.files.length) { e.preventDefault(); setDropFiles(false); addFiles(e.dataTransfer.files); } }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={embedded ? "sr-only" : "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]"}>{banner ? "Banners" : "Φωτογραφίες"} <span className="text-eu-muted font-normal tabular-nums">· {visible.length}</span></h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{banner ? "Εικόνες του κατασκευαστή με κείμενο (π.χ. από το site του ή το φυλλάδιο). Εμφανίζονται στη σελίδα του προϊόντος με αυτή τη σειρά· πιο κάτω η απόδελτίωση τις κάνει κείμενο και φωτογραφίες." : "Η πρώτη είναι η κύρια. Σύρε για να αλλάξεις σειρά, ή χρησιμοποίησε τα βελάκια."} Κάθε αλλαγή αποθηκεύεται αμέσως.{ar && !banner ? <> Η «Όψη AR» μπαίνει στην πρόσοψη του στερεού στο «Δες το στον χώρο σου»{arFront ? "" : " — τώρα επιλέγεται αυτόματα η πιο μετωπική"}.</> : null}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}><Upload className="size-4" aria-hidden /> Ανέβασμα</button>
            <button type="button" onClick={() => setPicker(true)} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}><Images className="size-4" aria-hidden /> Από τη βιβλιοθήκη</button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
          </div>
        )}
      </div>

      <p role="status" aria-live="polite" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${msg ? (msg.tone === "warn" ? "bg-eu-red/10 text-eu-red" : "bg-eu-green/12 text-eu-ink") : "sr-only"}`}>{msg?.text ?? ""}{pending && <Loader2 className="inline size-4 ml-2 animate-spin align-[-2px]" aria-hidden />}</p>

      {(busyUploads.length > 0 || failedUploads.length > 0) && (
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {[...busyUploads, ...failedUploads].map((u) => (
            <li key={u.id} className="grid gap-1 rounded-xl bg-eu-surface px-3 py-2 text-[length:var(--fs-14)]">
              <span className="flex items-center justify-between gap-3"><span className="truncate">{u.file.name}</span><span className={u.status === "error" ? "text-eu-red font-bold" : "text-eu-muted tabular-nums"}>{u.status === "error" ? u.error : u.status === "queued" ? "σε αναμονή" : u.progress < 1 ? `${Math.round(u.progress * 100)}%` : "μετατροπή σε WebP…"}</span></span>
              {u.status !== "error" && <span className="h-1.5 rounded-full bg-eu-line overflow-hidden"><span className="block h-full bg-eu-blue transition-[width] duration-200" style={{ width: `${Math.round(u.progress * 100)}%` }} /></span>}
            </li>
          ))}
        </ul>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-eu-line p-8 text-center text-eu-ink-3 text-[length:var(--fs-15)]">
          {banner ? "Το προϊόν δεν έχει banners." : "Το προϊόν δεν έχει φωτογραφία."}{canWrite ? " Σύρε αρχεία εδώ, πάτησε «Ανέβασμα», ή διάλεξε από τη βιβλιοθήκη." : ""}
        </div>
      ) : (
        <ol className="m-0 p-0 list-none grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]">
          {visible.map((im, i) => (
            <li
              key={im.id}
              draggable={canWrite}
              onDragStart={(e) => { setDragId(im.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", im.id); }}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => { if (dragId && dragId !== im.id) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
              onDrop={(e) => { if (dragId && dragId !== im.id) { e.preventDefault(); e.stopPropagation(); move(dragId, i); setDragId(null); } }}
              className={`grid gap-1 rounded-xl border-2 p-1.5 bg-white min-w-0 ${canWrite ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === im.id ? "opacity-40 border-eu-blue" : i === 0 && !banner ? "border-eu-yellow" : "border-eu-line"}`}
            >
              <div className="relative aspect-square rounded-lg bg-white overflow-hidden border border-eu-line">
                {/* Μία εκδοχή στο CDN· το μέγεθος για κάθε οθόνη το παράγει το <Image> */}
                <Image src={im.url} alt={im.alt ?? ""} fill sizes="160px" draggable={false} placeholder={im.blur ? "blur" : "empty"} blurDataURL={im.blur ?? undefined} className="object-contain p-1" />
                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-white/90 text-eu-ink-3 font-bold tabular-nums px-1.5 py-0.5 text-[length:var(--fs-11)]">{i + 1}</span>
                {ar && !banner && arFront === im.url && <span className="absolute left-1 top-7 inline-flex items-center gap-0.5 rounded-full bg-eu-blue text-white font-extrabold px-1.5 py-0.5 text-[length:var(--fs-11)]"><Box className="size-3" aria-hidden /> AR</span>}
                {im.source === "eprel-label" && <span className="absolute left-1 bottom-1 inline-flex items-center rounded-full bg-eu-green text-white font-extrabold px-1.5 py-0.5 text-[length:var(--fs-11)]" title="Μπαίνει αυτόματα από το EPREL και μένει πάντα τελευταία">Ετικέτα EPREL</span>}
                {i === 0 && !banner && <span className="absolute left-1 bottom-1 inline-flex items-center gap-0.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold px-1.5 py-0.5 text-[length:var(--fs-11)]"><Star className="size-3" aria-hidden /> Κύρια</span>}
                {im.lowRes && <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded-full bg-eu-red text-white font-bold px-1.5 py-0.5 text-[length:var(--fs-11)]"><AlertTriangle className="size-3" aria-hidden /> μικρή</span>}
                {canWrite && (
                  <button
                    type="button" className="absolute right-0 top-0 size-11 grid place-items-center cursor-pointer group/rm focus-visible:outline-2 focus-visible:outline-eu-blue rounded-full"
                    aria-label={im.source === "legacy-site" ? `Απόκρυψη ${noun} ${i + 1}` : `Αφαίρεση ${noun} ${i + 1} από το προϊόν`}
                    title={im.source === "legacy-site" ? "Απόκρυψη" : "Αφαίρεση από το προϊόν"}
                    onClick={() => remove(im)}
                  ><span className="size-7 grid place-items-center rounded-full bg-white/95 text-eu-muted shadow-sm group-hover/rm:bg-eu-red group-hover/rm:text-white">{im.source === "legacy-site" ? <EyeOff className="size-3.5" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}</span></button>
                )}
              </div>
              <div className="truncate text-eu-muted text-[length:var(--fs-12)] tabular-nums" title={`${SOURCE[im.source ?? ""] ?? "—"}${im.width && im.height ? ` · ${im.width}×${im.height}` : ""}`}>
                {SOURCE[im.source ?? ""] ?? "—"}{im.width && im.height ? ` · ${im.width}×${im.height}` : ""}
              </div>
              {canWrite && (
                <div className="flex items-center justify-between -my-1">
                  <button type="button" className={icon} disabled={i === 0} onClick={() => move(im.id, i - 1)} aria-label={`Μετακίνηση ${banner ? "του banner" : "της φωτογραφίας"} ${i + 1} μία θέση πριν`} title="Μία θέση πριν"><ArrowLeft className="size-4" aria-hidden /></button>
                  {banner ? <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{i + 1}</span> : <button type="button" className={icon} disabled={i === 0} onClick={() => move(im.id, 0)} aria-label={`Ορισμός ${noun} ${i + 1} ως κύριας`} title="Κάν' την κύρια"><Star className="size-4" aria-hidden /></button>}
                  <button type="button" className={icon} disabled={i === visible.length - 1} onClick={() => move(im.id, i + 1)} aria-label={`Μετακίνηση ${noun} ${i + 1} μία θέση μετά`} title="Μία θέση μετά"><ArrowRight className="size-4" aria-hidden /></button>
                </div>
              )}
              {ar && !banner && canWrite && im.source !== "eprel-label" && (
                <button type="button" onClick={() => chooseArFront(arFront === im.url ? null : im.url)} aria-pressed={arFront === im.url}
                  title="Η φωτογραφία που μπαίνει στην πρόσοψη του στερεού στο «Δες το στον χώρο σου». Καλύτερα κατά μέτωπο, χωρίς γωνία."
                  className={`inline-flex items-center justify-center gap-1 rounded-full min-h-9 px-2 text-[length:var(--fs-12)] font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-eu-blue ${arFront === im.url ? "bg-eu-blue text-white" : "bg-eu-surface text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy"}`}>
                  {arFront === im.url ? <Check className="size-3.5" aria-hidden /> : <Box className="size-3.5" aria-hidden />} Όψη AR
                </button>
              )}
              {canWrite && !banner && im.source !== "eprel-label" && (
                <button type="button" data-help="product.photos-cutout" onClick={() => setCutFor({ im, n: i + 1 })}
                  title="Βγάζει το φόντο και κεντράρει το προϊόν σε λευκό τετράγωνο. Πρώτα βλέπεις το αποτέλεσμα."
                  className="inline-flex items-center justify-center gap-1 rounded-full min-h-9 px-2 text-[length:var(--fs-12)] font-bold cursor-pointer bg-eu-surface text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue">
                  <Scissors className="size-3.5" aria-hidden /> Χωρίς φόντο
                </button>
              )}
              <details className="group/alt min-w-0">
                <summary className={`cursor-pointer list-none flex items-center gap-1 min-h-8 rounded-md px-1 text-[length:var(--fs-12)] font-bold hover:bg-eu-chip ${im.alt ? "text-eu-ink-3" : "text-eu-amber"}`}>
                  <span className="truncate">{im.alt ? `Alt: ${im.alt}` : "Χωρίς εναλλακτικό κείμενο"}</span>
                </summary>
                <label className="grid gap-1 mt-1">
                  <span className="sr-only">Εναλλακτικό κείμενο</span>
                  <input
                    defaultValue={im.alt ?? ""} disabled={!canWrite} maxLength={200} placeholder="Τι δείχνει η φωτογραφία"
                    onBlur={(e) => { const v = e.target.value; if (v.trim() !== (im.alt ?? "")) start(async () => { const alt = await saveImageAlt(productId, im.id, v); setImages((xs) => xs.map((x) => (x.id === im.id ? { ...x, alt: alt || null } : x))); say("Το εναλλακτικό κείμενο αποθηκεύτηκε."); }); }}
                    className="w-full rounded-lg border border-eu-line px-2 min-h-10 text-[length:var(--fs-13)] focus-visible:outline-2 focus-visible:outline-eu-blue"
                  />
                </label>
              </details>
            </li>
          ))}
        </ol>
      )}

      {hidden.length > 0 && (
        <details className="rounded-xl bg-eu-surface p-3">
          <summary className="cursor-pointer font-bold text-eu-ink text-[length:var(--fs-14)] min-h-11 inline-flex items-center">{banner ? "Κρυμμένα banners" : "Κρυμμένες φωτογραφίες"} · {hidden.length}</summary>
          <p className="m-0 mb-2 text-eu-ink-3 text-[length:var(--fs-13)]">Προέρχονται από την αρχική εισαγωγή. Δεν εμφανίζονται στο κατάστημα· δεν διαγράφονται, ώστε να μην ξαναεμφανιστούν μόνες τους.</p>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
            {hidden.map((im) => (
              <li key={im.id} className="flex items-center gap-2 rounded-xl bg-white border border-eu-line p-1.5 pr-2">
                <Image src={im.url} alt="" width={56} height={56} className="size-14 rounded-lg object-contain opacity-60" />
                {canWrite && <button type="button" onClick={() => start(async () => { setImages(await restoreProductImage(productId, im.id, kind)); say(banner ? "Το banner επανήλθε στο τέλος της σειράς." : "Η φωτογραφία επανήλθε στο τέλος της σειράς."); })} className={`${btn} border-2 border-eu-line text-eu-navy hover:border-eu-navy !px-3`}><RotateCcw className="size-4" aria-hidden /> Επαναφορά</button>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {cutFor && (
        <CutoutDialog productId={productId} im={cutFor.im} n={cutFor.n} onClose={() => setCutFor(null)}
          onSaved={(imgs, mode) => { setImages(imgs); setCutFor(null); say(mode === "replace" ? `Η φωτογραφία ${cutFor.n} αντικαταστάθηκε με την εκδοχή χωρίς φόντο.` : `Η εκδοχή χωρίς φόντο μπήκε αμέσως μετά τη φωτογραφία ${cutFor.n}.`); }} />
      )}

      {picker && (
        <MediaPickerDialog
          accept={["image"]} multiple canWrite={canUploadToLibrary} onClose={() => setPicker(false)}
          onSelect={(assets) => { setPicker(false); if (!assets.length) return; start(async () => { const r = await attachFromGallery(productId, assets.map((a) => a.id), kind); setImages(r.images); say(`${r.added} ${r.added === 1 ? "φωτογραφία προστέθηκε" : "φωτογραφίες προστέθηκαν"}${r.skipped ? ` · ${r.skipped} ήταν ήδη στο προϊόν` : ""}.`, r.added ? "ok" : "warn"); }); }}
        />
      )}
    </section>
  );
}

/**
 * «Αφαίρεση φόντου» μιας φωτογραφίας: ο server βγάζει το φόντο (isnet μέσα στην εφαρμογή, αλλιώς μονόχρωμο φόντο από τις
 * άκρες) και κεντράρει το προϊόν σε λευκό τετράγωνο. Ο χρήστης βλέπει πριν/μετά και διαλέγει αντικατάσταση ή να μείνουν και
 * οι δύο· τίποτα δεν αποθηκεύεται πριν από αυτό.
 */
function CutoutDialog({ productId, im, n, onClose, onSaved }: { productId: string; im: ProductImageDTO; n: number; onClose: () => void; onSaved: (images: ProductImageDTO[], mode: "replace" | "both") => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [res, setRes] = useState<Awaited<ReturnType<typeof imageCutoutPreview>> | null>(null);
  const [saving, setSaving] = useState<"replace" | "both" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    dlg.current?.showModal();
    let live = true;
    imageCutoutPreview(productId, im.id).then((r) => { if (live) setRes(r); }, () => { if (live) setRes({ ok: false, error: "Η αφαίρεση φόντου απέτυχε." }); });
    return () => { live = false; };
  }, [productId, im.id]);
  const save = (mode: "replace" | "both") => {
    setSaving(mode); setErr(null);
    applyImageCutout(productId, im.id, mode).then(
      (r) => { if (r.ok) onSaved(r.images, mode); else { setErr(r.error); setSaving(null); } },
      () => { setErr("Η αποθήκευση απέτυχε. Δοκίμασε ξανά."); setSaving(null); },
    );
  };
  const ok = res?.ok ? res : null;
  const frame = "relative aspect-square rounded-lg border border-eu-line overflow-hidden bg-white";
  return (
    <dialog ref={dlg} onClose={onClose} aria-labelledby="cutout-title" data-help="product.photos-cutout-dialog"
      className="m-auto w-[min(44rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] rounded-xl p-0 backdrop:bg-eu-ink/45 shadow-[var(--shadow-overlay)]">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b border-eu-line px-3 py-2">
        <h3 id="cutout-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><Scissors className="size-4 text-eu-blue" aria-hidden /> Αφαίρεση φόντου · φωτογραφία {n}</h3>
        <button type="button" aria-label="Κλείσιμο" onClick={() => dlg.current?.close()} className="size-11 md:size-8 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface cursor-pointer"><X className="size-4" aria-hidden /></button>
      </div>
      <div className="p-3 grid gap-3 text-[length:var(--fs-14)]">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <figure className="m-0 grid gap-1 min-w-0">
            <figcaption className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">Πριν{im.width && im.height ? ` · ${im.width}×${im.height}` : ""}</figcaption>
            <div className={frame}><Image src={im.url} alt={im.alt ?? ""} fill sizes="(min-width: 640px) 340px, 90vw" className="object-contain" /></div>
          </figure>
          <figure className="m-0 grid gap-1 min-w-0">
            <figcaption className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">Μετά{ok ? ` · ${ok.width}×${ok.height}, λευκό φόντο` : ""}</figcaption>
            <div className={frame} aria-busy={!res}>
              {/* eslint-disable-next-line @next/next/no-img-element -- προεπισκόπηση data: από τον server */}
              {ok ? <img src={ok.src} alt="Η φωτογραφία χωρίς φόντο" className="size-full object-contain" />
                : !res ? <span className="absolute inset-0 grid place-items-center content-center gap-2 text-eu-ink-3 text-[length:var(--fs-13)]"><Loader2 className="size-6 animate-spin text-eu-blue" aria-hidden />Βγάζω το φόντο… (μέχρι 20″)</span>
                : <span className="absolute inset-0 grid place-items-center p-4 text-center text-eu-red font-bold text-[length:var(--fs-13)]"><AlertTriangle className="size-5 mb-1" aria-hidden />{!res.ok ? res.error : ""}</span>}
            </div>
          </figure>
        </div>
        {ok && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{ok.method === "ai" ? "Με AI μέσα στην εφαρμογή. Το προϊόν μένει στα pixel του, κεντραρισμένο σε λευκό τετράγωνο." : "Το AI δεν τα κατάφερε· βγήκε το μονόχρωμο φόντο από τις άκρες. Έλεγξε τις άκρες του προϊόντος πριν το κρατήσεις."} Η νέα φωτογραφία μπαίνει και στη βιβλιοθήκη, στον φάκελο «Προϊόντα».</p>}
        {err && <p role="alert" className="m-0 rounded-lg bg-eu-red/10 text-eu-red px-3 py-2 font-bold text-[length:var(--fs-13)]">{err}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => dlg.current?.close()} className="rounded-full px-4 min-h-11 font-bold text-eu-ink-2 hover:bg-eu-surface cursor-pointer">Ακύρωση</button>
          <button type="button" disabled={!ok || !!saving} onClick={() => save("both")} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>{saving === "both" && <Loader2 className="size-4 animate-spin" aria-hidden />}Κράτα και τις δύο</button>
          <button type="button" disabled={!ok || !!saving} onClick={() => save("replace")} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{saving === "replace" && <Loader2 className="size-4 animate-spin" aria-hidden />}Αντικατάσταση</button>
        </div>
      </div>
    </dialog>
  );
}
