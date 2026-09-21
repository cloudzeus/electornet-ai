"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Upload, Images, Star, ArrowLeft, ArrowRight, Trash2, EyeOff, RotateCcw, Loader2, AlertTriangle, GripVertical } from "lucide-react";
import type { MediaAssetDTO } from "@/lib/media/types";
import type { ProductImageDTO } from "@/lib/catalog/product-images";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import { useUploader } from "@/components/admin/media/useUploader";
import { attachFromGallery, saveImageOrder, saveImageAlt, removeProductImage, restoreProductImage } from "@/app/admin/(shell)/catalog/actions";

const SOURCE: Record<string, string> = { "legacy-site": "Παλιό site", gallery: "Βιβλιοθήκη", upload: "Ανέβασμα" };
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue";
const icon = "size-11 inline-flex items-center justify-center rounded-full text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-eu-blue";

/**
 * Φωτογραφίες ενός προϊόντος: ανέβασμα (σύρσιμο αρχείων ή κουμπί), συσχετισμός από
 * τη βιβλιοθήκη πολυμέσων, σειρά (σύρσιμο ή βελάκια — η πρώτη είναι η κύρια),
 * εναλλακτικό κείμενο, αφαίρεση / επαναφορά. Κάθε αλλαγή αποθηκεύεται αμέσως.
 */
export function ProductImages({ productId, initial, canWrite, canUploadToLibrary }: { productId: string; initial: ProductImageDTO[]; canWrite: boolean; canUploadToLibrary: boolean }) {
  const [images, setImages] = useState(initial);
  const [picker, setPicker] = useState(false);
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
  const uploader = useUploader(onUploaded, `/api/admin/catalog/products/${productId}/images`);
  const busyUploads = uploader.items.filter((u) => u.status === "queued" || u.status === "uploading");
  const failedUploads = uploader.items.filter((u) => u.status === "error");

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /^image\/(jpeg|png|webp|avif)$/.test(f.type));
    const rejected = Array.from(files).length - list.length;
    if (list.length) uploader.add(list);
    if (rejected) say(`${rejected} αρχεία αγνοήθηκαν — δεκτά είναι JPEG, PNG, WebP και AVIF.`, "warn");
  };

  const persistOrder = (next: ProductImageDTO[]) => {
    setImages([...next, ...hidden]);
    start(async () => { try { setImages(await saveImageOrder(productId, next.map((i) => i.id))); } catch { say("Η σειρά δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "warn"); } });
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
      className={`grid gap-4 rounded-2xl border-2 bg-white p-4 transition-colors ${dropFiles ? "border-eu-blue bg-eu-chip/40" : "border-eu-line"}`}
      onDragOver={(e) => { if (canWrite && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropFiles(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropFiles(false); }}
      onDrop={(e) => { if (canWrite && e.dataTransfer.files.length) { e.preventDefault(); setDropFiles(false); addFiles(e.dataTransfer.files); } }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Φωτογραφίες <span className="text-eu-muted font-normal tabular-nums">· {visible.length}</span></h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Η πρώτη είναι η κύρια. Σύρε για να αλλάξεις σειρά, ή χρησιμοποίησε τα βελάκια. Κάθε αλλαγή αποθηκεύεται αμέσως.</p>
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
          Το προϊόν δεν έχει φωτογραφία.{canWrite ? " Σύρε αρχεία εδώ, πάτησε «Ανέβασμα», ή διάλεξε από τη βιβλιοθήκη." : ""}
        </div>
      ) : (
        <ol className="m-0 p-0 list-none grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
          {visible.map((im, i) => (
            <li
              key={im.id}
              draggable={canWrite}
              onDragStart={(e) => { setDragId(im.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", im.id); }}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => { if (dragId && dragId !== im.id) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
              onDrop={(e) => { if (dragId && dragId !== im.id) { e.preventDefault(); e.stopPropagation(); move(dragId, i); setDragId(null); } }}
              className={`grid gap-2 rounded-2xl border-2 p-2 bg-white ${dragId === im.id ? "opacity-40 border-eu-blue" : i === 0 ? "border-eu-yellow" : "border-eu-line"}`}
            >
              <div className="relative aspect-square rounded-xl bg-white overflow-hidden border border-eu-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.thumbUrl ?? im.url} alt={im.alt ?? ""} loading="lazy" draggable={false} className="size-full object-contain" />
                {i === 0 && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-eu-yellow text-eu-navy font-extrabold px-2.5 py-1 text-[length:var(--fs-13)]"><Star className="size-3.5" aria-hidden /> Κύρια</span>}
                {canWrite && <span className="absolute right-2 top-2 size-8 rounded-full bg-white/90 text-eu-muted inline-flex items-center justify-center cursor-grab" aria-hidden><GripVertical className="size-4" /></span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-13)]">
                <span className="rounded-full bg-eu-surface text-eu-ink-3 px-2 py-0.5">{SOURCE[im.source ?? ""] ?? "—"}</span>
                {im.width && im.height ? <span className="text-eu-muted tabular-nums">{im.width}×{im.height}</span> : null}
                {im.lowRes && <span className="inline-flex items-center gap-1 rounded-full bg-eu-red/10 text-eu-red font-bold px-2 py-0.5"><AlertTriangle className="size-3.5" aria-hidden /> μικρή</span>}
              </div>
              <label className="grid gap-1">
                <span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Εναλλακτικό κείμενο</span>
                <input
                  defaultValue={im.alt ?? ""} disabled={!canWrite} maxLength={200}
                  onBlur={(e) => { const v = e.target.value; if (v.trim() !== (im.alt ?? "")) start(async () => { const alt = await saveImageAlt(productId, im.id, v); setImages((xs) => xs.map((x) => (x.id === im.id ? { ...x, alt: alt || null } : x))); say("Το εναλλακτικό κείμενο αποθηκεύτηκε."); }); }}
                  className="w-full rounded-lg border border-eu-line px-2.5 min-h-11 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue"
                />
              </label>
              {canWrite && (
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <button type="button" className={icon} disabled={i === 0} onClick={() => move(im.id, i - 1)} aria-label={`Μετακίνηση της φωτογραφίας ${i + 1} μία θέση πριν`}><ArrowLeft className="size-4.5" aria-hidden /></button>
                    <button type="button" className={icon} disabled={i === visible.length - 1} onClick={() => move(im.id, i + 1)} aria-label={`Μετακίνηση της φωτογραφίας ${i + 1} μία θέση μετά`}><ArrowRight className="size-4.5" aria-hidden /></button>
                    <button type="button" className={icon} disabled={i === 0} onClick={() => move(im.id, 0)} aria-label={`Ορισμός της φωτογραφίας ${i + 1} ως κύριας`}><Star className="size-4.5" aria-hidden /></button>
                  </div>
                  <button
                    type="button" className={`${icon} hover:!bg-eu-red/10 hover:!text-eu-red`}
                    aria-label={im.source === "legacy-site" ? `Απόκρυψη της φωτογραφίας ${i + 1}` : `Αφαίρεση της φωτογραφίας ${i + 1} από το προϊόν`}
                    onClick={() => start(async () => { const r = await removeProductImage(productId, im.id); setImages(r.images); say(r.how === "hidden" ? "Η φωτογραφία κρύφτηκε. Θα τη βρεις στις «Κρυμμένες»." : "Αφαιρέθηκε από το προϊόν. Το αρχείο παραμένει στη βιβλιοθήκη."); })}
                  >{im.source === "legacy-site" ? <EyeOff className="size-4.5" aria-hidden /> : <Trash2 className="size-4.5" aria-hidden />}</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {hidden.length > 0 && (
        <details className="rounded-xl bg-eu-surface p-3">
          <summary className="cursor-pointer font-bold text-eu-ink text-[length:var(--fs-14)] min-h-11 inline-flex items-center">Κρυμμένες φωτογραφίες · {hidden.length}</summary>
          <p className="m-0 mb-2 text-eu-ink-3 text-[length:var(--fs-13)]">Προέρχονται από την αρχική εισαγωγή. Δεν εμφανίζονται στο κατάστημα· δεν διαγράφονται, ώστε να μην ξαναεμφανιστούν μόνες τους.</p>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
            {hidden.map((im) => (
              <li key={im.id} className="flex items-center gap-2 rounded-xl bg-white border border-eu-line p-1.5 pr-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.thumbUrl ?? im.url} alt="" loading="lazy" className="size-14 rounded-lg object-contain opacity-60" />
                {canWrite && <button type="button" onClick={() => start(async () => { setImages(await restoreProductImage(productId, im.id)); say("Η φωτογραφία επανήλθε στο τέλος της σειράς."); })} className={`${btn} border-2 border-eu-line text-eu-navy hover:border-eu-navy !px-3`}><RotateCcw className="size-4" aria-hidden /> Επαναφορά</button>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {picker && (
        <MediaPickerDialog
          accept={["image"]} multiple canWrite={canUploadToLibrary} onClose={() => setPicker(false)}
          onSelect={(assets) => { setPicker(false); if (!assets.length) return; start(async () => { const r = await attachFromGallery(productId, assets.map((a) => a.id)); setImages(r.images); say(`${r.added} ${r.added === 1 ? "φωτογραφία προστέθηκε" : "φωτογραφίες προστέθηκαν"}${r.skipped ? ` · ${r.skipped} ήταν ήδη στο προϊόν` : ""}.`, r.added ? "ok" : "warn"); }); }}
        />
      )}
    </section>
  );
}
