"use client";

import { useState } from "react";
import { Check, Crop, Images, Loader2, TriangleAlert, Undo2, X } from "lucide-react";
import { fetchLogoAction } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { trimRaster, trimSvg, logoBox } from "@/lib/cms/logo-trim";
import { ImagePickerDialog } from "./ImagePicker";

type V = { logo?: string; logoAspect?: number };
const measure = (url: string) => new Promise<number | undefined>((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth && i.naturalHeight ? i.naturalWidth / i.naturalHeight : undefined); i.onerror = () => res(undefined); i.src = url; });

/**
 * Λογότυπο με αυτόματη «Περικοπή & ομοιομορφία»: μόλις διαλέξεις αρχείο, αφαιρείται το κενό περιθώριο και το λευκό
 * φόντο-καμβάς, αποθηκεύεται νέο αρχείο στη βιβλιοθήκη και μετριέται η αναλογία του, ώστε να εμφανίζεται με το ίδιο
 * οπτικό βάρος με όλες τις άλλες μάρκες. Λογότυπα τρίτων (Brandfetch) δεν κατεβαίνουν — μετριέται μόνο η αναλογία.
 */
export function LogoField({ value, onChange, brandLogo, bg, dark, name }: { value: V; onChange: (v: V) => void; brandLogo: string | null; bg: string; dark: boolean; name: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [prev, setPrev] = useState<V | null>(null);

  const normalize = async (url: string, keepPrev = true) => {
    if (!url) { onChange({ logo: undefined, logoAspect: undefined }); return; }
    setBusy(true); setMsg(null);
    if (keepPrev) setPrev(value);
    try {
      const f = await fetchLogoAction(url);
      if (!f.ok) {
        const aspect = await measure(url);
        onChange({ logo: url, logoAspect: aspect });
        setMsg({ ok: !!aspect, text: aspect ? `Δεν περικόπηκε (${f.message}) — μετρήθηκε η αναλογία ${aspect.toFixed(1)}:1 για ομοιόμορφο μέγεθος.` : f.message });
        return;
      }
      const r = f.kind === "svg" ? trimSvg(f.text) : await trimRaster(f.dataUrl);
      const fd = new FormData();
      const base = (url.split("/").pop() ?? "logo").replace(/\.[a-z0-9]+$/i, "").replace(/-trim$/, "").slice(0, 60);
      fd.append("file", new File([r.blob], `${base}-trim.${r.ext}`, { type: r.ext === "svg" ? "image/svg+xml" : "image/png" }));
      fd.append("keepFormat", "1");
      const up = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
      const j = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!up.ok || !j.url) throw new Error(up.status === 403 ? "Χρειάζεται δικαίωμα ανεβάσματος στη βιβλιοθήκη media." : j.error ?? "Αποτυχία αποθήκευσης.");
      onChange({ logo: j.url, logoAspect: Math.round(r.aspect * 1000) / 1000 });
      const shrink = Math.round((1 - (r.after.w * r.after.h) / (r.before.w * r.before.h)) * 100);
      setMsg({ ok: true, text: `Έγινε περικοπή${r.removedBackground ? " και αφαιρέθηκε το λευκό φόντο" : ""}${shrink > 0 ? ` — το κενό ήταν ${shrink}% του αρχείου` : ""}. Αναλογία ${r.aspect.toFixed(1)}:1, ίδιο οπτικό βάρος με τις άλλες μάρκες. Το αρχικό αρχείο μένει στη βιβλιοθήκη.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Αποτυχία περικοπής." });
      onChange({ logo: url, logoAspect: value.logoAspect });
    } finally { setBusy(false); }
  };

  const box = logoBox(value.logoAspect);
  return (
    <div className="grid gap-2 min-w-0">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Λογότυπο (προαιρετικό)</span>
      <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug -mt-1">SVG ή PNG. Περικόπτεται αυτόματα ώστε όλα τα λογότυπα να έχουν το ίδιο οπτικό βάρος. {dark ? "Η σελίδα είναι σκούρα: χρειάζεται λευκή ή ανοιχτόχρωμη εκδοχή." : ""}</span>
      <div className="grid @xl:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
        <div className="rounded-xl border border-eu-line p-4 min-h-20 flex items-center gap-3 min-w-0" style={{ background: bg }} aria-label="Προεπισκόπηση λογοτύπου στο φόντο της σελίδας">
          {value.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- προεπισκόπηση
            <img src={value.logo} alt="" style={{ height: box.height, maxWidth: `min(${box.maxWidth}, 100%)` }} className="block w-auto object-contain" />
          ) : <span className="font-heading font-extrabold text-[length:var(--fs-24)]" style={{ color: dark ? "#fff" : "#111" }}>{name}</span>}
          {busy && <Loader2 className="size-5 animate-spin text-eu-blue shrink-0" aria-label="Επεξεργασία" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(true)} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white disabled:opacity-40 grow"><Images className="size-4" aria-hidden /> {value.logo ? "Αλλαγή" : "Επιλογή"}</button>
          {value.logo && <button type="button" onClick={() => { setPrev(value); onChange({ logo: undefined, logoAspect: undefined }); setMsg(null); }} disabled={busy} aria-label="Αφαίρεση λογοτύπου" className="inline-flex items-center justify-center size-11 rounded-full text-eu-red hover:bg-eu-red/10"><X className="size-4" aria-hidden /></button>}
        </div>
      </div>
      {value.logo && !value.logoAspect && !busy && (
        <div className="rounded-xl bg-eu-amber/10 px-3 py-2 flex flex-wrap items-center gap-2">
          <TriangleAlert className="size-4 text-eu-amber shrink-0" aria-hidden />
          <span className="text-eu-ink-2 text-[length:var(--fs-14)] flex-1 min-w-[12rem]">Δεν έχει γίνει περικοπή — το λογότυπο μπορεί να φαίνεται μικρό ή με φόντο.</span>
          <button type="button" onClick={() => normalize(value.logo!)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)]"><Crop className="size-4" aria-hidden /> Περικοπή & ομοιομορφία</button>
        </div>
      )}
      {brandLogo && value.logo !== brandLogo && !busy && <button type="button" onClick={() => normalize(brandLogo)} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Χρήση του λογοτύπου από τον κατάλογο</button>}
      {msg && (
        <div className={`rounded-xl px-3 py-2 flex flex-wrap items-start gap-2 text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-amber/10 text-eu-ink-2"}`}>
          {msg.ok ? <Check className="size-4 mt-0.5 shrink-0" aria-hidden /> : <TriangleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />}
          <span className="flex-1 min-w-[12rem] font-semibold">{msg.text}</span>
          {prev && <button type="button" onClick={() => { onChange(prev); setPrev(null); setMsg(null); }} className="inline-flex items-center gap-1.5 rounded-full border-2 border-current/30 px-3 min-h-9 font-bold"><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>}
        </div>
      )}
      {open && <ImagePickerDialog current={value.logo ?? ""} onPick={(u) => { void normalize(u); }} onClose={() => setOpen(false)} />}
    </div>
  );
}
