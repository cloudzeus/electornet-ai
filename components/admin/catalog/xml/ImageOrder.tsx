"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ImageOff, Star, Trash2 } from "lucide-react";

/**
 * Η σειρά των φωτογραφιών ενός προϊόντος του feed — ίδιο πρότυπο με το `ProductImages.tsx`: **σύρσιμο ΚΑΙ βελάκια**.
 * Τα βελάκια δεν είναι έξτρα: με πληκτρολόγιο ή σε οθόνη αφής το σύρσιμο δεν υπάρχει, και η σειρά (η πρώτη γίνεται η
 * κύρια φωτογραφία του προϊόντος) είναι πραγματική απόφαση.
 *
 * Οι διευθύνσεις είναι του προμηθευτή και κατεβαίνουν μόνο στην εισαγωγή: εδώ φαίνονται απευθείας από τον server του,
 * χωρίς βελτιστοποίηση (δεν είναι στα `remotePatterns` — ούτε πρέπει).
 */
export function ImageOrder({ urls, onChange, disabled }: { urls: string[]; onChange: (urls: string[]) => void; disabled?: boolean }) {
  const [dragAt, setDragAt] = useState<number | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const move = (from: number, to: number) => {
    if (disabled || from === to || to < 0 || to >= urls.length) return;
    const next = [...urls];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };
  const remove = (i: number) => { if (!disabled) onChange(urls.filter((_, n) => n !== i)); };

  if (!urls.length) return (
    <p className="m-0 flex items-center gap-2 rounded-xl border border-dashed border-eu-line-2 bg-eu-surface/50 px-3 py-4 text-eu-muted text-[length:var(--fs-13)]">
      <ImageOff className="size-4 shrink-0" aria-hidden /> Καμία φωτογραφία — το feed δεν έδωσε διευθύνσεις για αυτό το προϊόν, ή τις αφαίρεσες όλες.
    </p>
  );

  return (
    <div className="grid gap-2 min-w-0">
      <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,8.5rem),1fr))]">
        {urls.map((url, i) => (
          <li
            key={`${url}-${i}`}
            draggable={!disabled}
            onDragStart={(e) => { setDragAt(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
            onDragEnd={() => setDragAt(null)}
            onDragOver={(e) => { if (dragAt !== null && dragAt !== i) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
            onDrop={(e) => { if (dragAt !== null && dragAt !== i) { e.preventDefault(); move(dragAt, i); setDragAt(null); } }}
            className={`grid gap-1 rounded-xl border bg-white p-1.5 min-w-0 ${dragAt === i ? "border-eu-blue opacity-60" : "border-eu-line"} ${disabled ? "" : "cursor-grab"}`}
          >
            <div className="relative aspect-square rounded-lg bg-eu-surface overflow-hidden">
              {broken[url] ? (
                <span className="absolute inset-0 grid place-items-center gap-1 text-eu-muted text-[length:var(--fs-12)] text-center p-1">
                  <ImageOff className="size-5 mx-auto" aria-hidden /> Δεν ανοίγει
                </span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element -- διεύθυνση του προμηθευτή: δεν περνά από το /_next/image (δεν είναι στα remotePatterns) */
                <img src={url} alt={`Φωτογραφία ${i + 1} από το feed`} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
                  onError={() => setBroken((b) => ({ ...b, [url]: true }))} className="absolute inset-0 size-full object-contain" />
              )}
              <span className="absolute top-1 left-1 grid place-items-center size-6 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-12)] tabular-nums">{i + 1}</span>
              {i === 0 && <span className="absolute bottom-1 left-1 right-1 inline-flex items-center justify-center gap-1 rounded-full bg-eu-navy/90 px-1.5 py-0.5 text-white font-bold text-[length:var(--fs-12)]"><Star className="size-3" aria-hidden /> Κύρια</span>}
            </div>
            <div className="flex items-center justify-between gap-0.5">
              <button type="button" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} title="Μία θέση πριν"
                aria-label={`Μετακίνηση της φωτογραφίας ${i + 1} μία θέση πριν`}
                className="size-11 md:size-9 shrink-0 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-eu-blue"><ArrowLeft className="size-4" aria-hidden /></button>
              <button type="button" disabled={disabled || i === 0} onClick={() => move(i, 0)} title="Κάν' την κύρια"
                aria-label={`Ορισμός της φωτογραφίας ${i + 1} ως κύριας`}
                className="size-11 md:size-9 shrink-0 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-eu-blue"><Star className="size-4" aria-hidden /></button>
              <button type="button" disabled={disabled || i === urls.length - 1} onClick={() => move(i, i + 1)} title="Μία θέση μετά"
                aria-label={`Μετακίνηση της φωτογραφίας ${i + 1} μία θέση μετά`}
                className="size-11 md:size-9 shrink-0 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-eu-blue"><ArrowRight className="size-4" aria-hidden /></button>
              <button type="button" disabled={disabled} onClick={() => remove(i)} title="Αφαίρεση"
                aria-label={`Αφαίρεση της φωτογραφίας ${i + 1} από το προϊόν`}
                className="size-11 md:size-9 shrink-0 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-red/10 hover:text-eu-red disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-eu-blue"><Trash2 className="size-4" aria-hidden /></button>
            </div>
          </li>
        ))}
      </ul>
      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Η πρώτη γίνεται η κύρια φωτογραφία του προϊόντος. Σύρε μια κάρτα στη θέση που θες, ή χρησιμοποίησε τα βελάκια. Οι φωτογραφίες κατεβαίνουν στην εισαγωγή — όχι τώρα.</p>
    </div>
  );
}
