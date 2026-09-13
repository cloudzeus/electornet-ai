"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPinned, LocateFixed, ExternalLink } from "lucide-react";
import { StoreMapClient } from "./StoreMapClient";
import { saveStore, geocodeStoreAction, type StoreInput } from "@/app/admin/(shell)/stores/actions";
import { MediaField } from "@/components/admin/media/MediaPicker";
import type { MediaAssetDTO } from "@/lib/media/types";

export interface StoreForm extends StoreInput { id: string; siteId: number | null; geocoded: string | null; geoLat: number | null; geoLng: number | null; geoDeltaKm: number | null; geoLabel: string | null; updatedAt: string }

const DAYS = [[1, "Δευτέρα"], [2, "Τρίτη"], [3, "Τετάρτη"], [4, "Πέμπτη"], [5, "Παρασκευή"], [6, "Σάββατο"], [0, "Κυριακή"]] as const;
export const SERVICES: { key: string; label: string }[] = [
  { key: "click-collect", label: "Click & Collect (παραλαβή σε 2 ώρες)" },
  { key: "installation", label: "Εγκατάσταση από τεχνικό" },
  { key: "service-point", label: "Σημείο service / επισκευών" },
  { key: "recycling", label: "Ανακύκλωση παλιάς συσκευής" },
  { key: "parking", label: "Parking" },
  { key: "delivery", label: "Παράδοση κατ' οίκον από το κατάστημα" },
  { key: "showroom", label: "Showroom / έκθεση" },
  { key: "b2b", label: "Επαγγελματικές πωλήσεις" },
];
const EMPTY: StoreForm = { id: "new", siteId: null, slug: "", name: "", member: "", kind: "", address: "", city: "", zip: "", region: "", phone: "", mobile: "", fax: "", email: "", erpBranch: "", lat: 0, lng: 0, geocoded: null, geoLat: null, geoLng: null, geoDeltaKm: null, geoLabel: null, hours: [1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "21:00" })).concat([{ day: 6, open: "09:00", close: "18:00" }]), services: ["click-collect"], photo: "", notes: "", active: true, sort: 0, updatedAt: "" };

/** Store editor: details, contact, hours, services, coordinates on a map (drag / click / geocode), photo from the media library. */
export function StoreEditor({ store, regions, canWrite }: { store: StoreForm | null; regions: string[]; canWrite: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<StoreForm>(store ?? EMPTY);
  const [photo, setPhoto] = useState<MediaAssetDTO | null>(store?.photo ? ({ id: "", kind: "image", url: store.photo, thumbUrl: store.photo, filename: "photo", title: "Φωτογραφία καταστήματος", focalX: 0.5, focalY: 0.5, storage: "bunny", tags: [], alt: null, caption: null, mime: "image/webp", size: 0, width: null, height: null, duration: null, folderId: null, blur: null, createdAt: "", updatedAt: "" } as MediaAssetDTO) : null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof StoreForm>(k: K, v: StoreForm[K]) => setF((s) => ({ ...s, [k]: v }));
  const hour = (day: number) => f.hours.find((h) => h.day === day);
  const setHour = (day: number, patch: { open?: string; close?: string } | null) => setF((s) => ({ ...s, hours: patch === null ? s.hours.filter((h) => h.day !== day) : s.hours.some((h) => h.day === day) ? s.hours.map((h) => (h.day === day ? { ...h, ...patch } : h)) : [...s.hours, { day, open: "09:00", close: "21:00", ...patch }] }));
  const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue bg-white w-full disabled:bg-eu-surface";
  const label = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]";

  const save = () => start(async () => {
    const { id, siteId, geocoded, geoLat, geoLng, geoDeltaKm, geoLabel, updatedAt, ...input } = f;
    void siteId; void geocoded; void geoLat; void geoLng; void geoDeltaKm; void geoLabel; void updatedAt;
    const r = await saveStore(id === "new" ? null : id, { ...input, photo: photo?.url ?? "" });
    if (!r.ok) return setMsg(r.error);
    setMsg("Αποθηκεύτηκε.");
    if (id === "new") router.replace(`/admin/stores/${r.id}`);
  });
  const geocode = (force: boolean) => start(async () => {
    if (f.id === "new") return setMsg("Αποθήκευσε πρώτα το κατάστημα.");
    const r = await geocodeStoreAction(f.id, force);
    if (!r.ok) return setMsg(r.error);
    setF((s) => ({ ...s, geoLat: r.lat, geoLng: r.lng, geoLabel: r.label, geoDeltaKm: r.deltaKm ?? null, ...(r.applied ? { lat: r.lat, lng: r.lng, geocoded: "nominatim" } : {}) }));
    setMsg(r.applied ? `Οι συντεταγμένες ορίστηκαν από τη γεωκωδικοποίηση (${r.label}).` : `Γεωκωδικοποίηση: ${r.label} — απόκλιση ${r.deltaKm?.toFixed(2)} km από το τρέχον σημείο.`);
  });

  return (
    <div className="eu-container">
    <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
      <div className="grid gap-4">
        <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">{f.siteId ? `euronics.gr #${f.siteId}` : "Νέο κατάστημα"}</div><h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">{f.name || "Κατάστημα"}</h2></div>
            {f.slug && <a href={`/katastimata/${f.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ExternalLink className="size-4" aria-hidden /> Προβολή στο site</a>}
          </div>
          {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
          <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3">
            <label className={label}>Όνομα καταστήματος<input value={f.name} onChange={(e) => set("name", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>Επωνυμία μέλους<input value={f.member} onChange={(e) => set("member", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={`${label} @2xl:col-span-2`}>Τύπος (όπως δημοσιεύεται)<input value={f.kind} onChange={(e) => set("kind", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={`${label} @2xl:col-span-2`}>Διεύθυνση<input value={f.address} onChange={(e) => set("address", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>Πόλη<input value={f.city} onChange={(e) => set("city", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>ΤΚ<input value={f.zip} onChange={(e) => set("zip", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>Νομός<input list="regions" value={f.region} onChange={(e) => set("region", e.target.value)} disabled={!canWrite} className={field} /><datalist id="regions">{regions.map((r) => <option key={r} value={r} />)}</datalist></label>
            <label className={label}>Slug (URL)<input value={f.slug} onChange={(e) => set("slug", e.target.value)} disabled={!canWrite} className={`${field} font-mono`} placeholder="αυτόματο από πόλη + όνομα" /></label>
            <label className={label}>Τηλέφωνο<input value={f.phone} onChange={(e) => set("phone", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>Κινητό<input value={f.mobile} onChange={(e) => set("mobile", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>Fax<input value={f.fax} onChange={(e) => set("fax", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>Email<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={!canWrite} className={field} /></label>
            <label className={label}>Κωδικός υποκαταστήματος ERP (SoftOne branch)<input value={f.erpBranch} onChange={(e) => set("erpBranch", e.target.value)} disabled={!canWrite} className={`${field} font-mono`} placeholder="π.χ. 1001" /></label>
            <label className={label}>Σειρά εμφάνισης<input type="number" value={f.sort} onChange={(e) => set("sort", Number(e.target.value))} disabled={!canWrite} className={field} /></label>
          </div>
        </section>
        <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-3">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ωράριο</h3>
          <div className="grid gap-2">
            {DAYS.map(([d, name]) => { const h = hour(d); return (
              <div key={d} className="grid grid-cols-[110px_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[length:var(--fs-14)]">
                <label className="inline-flex items-center gap-2 font-bold min-h-11"><input type="checkbox" checked={!!h} onChange={(e) => setHour(d, e.target.checked ? {} : null)} disabled={!canWrite} className="size-4 accent-eu-navy" /> {name}</label>
                <span className="text-eu-muted">από</span><input type="time" value={h?.open ?? ""} disabled={!h || !canWrite} onChange={(e) => setHour(d, { open: e.target.value })} className={field} />
                <span className="text-eu-muted">έως</span><input type="time" value={h?.close ?? ""} disabled={!h || !canWrite} onChange={(e) => setHour(d, { close: e.target.value })} className={field} />
              </div>
            ); })}
          </div>
        </section>
        <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-3">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Υπηρεσίες</h3>
          <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-2">
            {SERVICES.map((s) => (
              <label key={s.key} className="inline-flex items-center gap-2 rounded-xl border-2 border-eu-line px-3 min-h-11 cursor-pointer has-checked:border-eu-navy text-[length:var(--fs-14)] font-bold"><input type="checkbox" checked={f.services.includes(s.key)} disabled={!canWrite} onChange={(e) => set("services", e.target.checked ? [...f.services, s.key] : f.services.filter((x) => x !== s.key))} className="size-4 accent-eu-navy" /> {s.label}</label>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-3">
          <MediaField label="Φωτογραφία καταστήματος" value={photo} accept={["image"]} canWrite={canWrite} onChange={setPhoto} help="Εμφανίζεται στη σελίδα του καταστήματος και στην κάρτα «κοντά σου»." />
          <label className={label}>Σημειώσεις (εσωτερικές)<textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={!canWrite} className={`${field} py-2`} /></label>
        </section>
      </div>

      <aside className="grid gap-4 @4xl:sticky @4xl:top-4">
        <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Θέση στον χάρτη</h3>
          <StoreMapClient markers={f.lat || f.lng ? [{ id: f.id, lat: f.lat, lng: f.lng, label: f.name || "Κατάστημα", tone: (f.geoDeltaKm ?? 0) > 2 ? "red" : "navy" }] : []} editable={canWrite} onMove={(p) => setF((s) => ({ ...s, lat: p.lat, lng: p.lng }))} alt={f.geoLat != null && f.geoLng != null ? { lat: f.geoLat, lng: f.geoLng, label: `OSM: ${f.geoLabel ?? ""}` } : null} height={320} />
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Lat<input type="number" step="0.000001" value={f.lat} onChange={(e) => set("lat", Number(e.target.value))} disabled={!canWrite} className={`${field} font-mono`} /></label>
            <label className={label}>Lng<input type="number" step="0.000001" value={f.lng} onChange={(e) => set("lng", Number(e.target.value))} disabled={!canWrite} className={`${field} font-mono`} /></label>
          </div>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Σύρε τον δείκτη ή κάνε κλικ στον χάρτη. Πηγή: {f.geocoded === "manual" ? "χειροκίνητα" : f.geocoded === "nominatim" ? "γεωκωδικοποίηση OSM" : f.geocoded === "site" ? "euronics.gr" : "—"}.{f.geoDeltaKm != null && <> Έλεγχος OSM: <b className={f.geoDeltaKm > 2 ? "text-eu-red" : "text-eu-green"}>{f.geoDeltaKm.toFixed(2)} km</b> απόκλιση{f.geoLabel ? ` (${f.geoLabel})` : ""}.</>}</p>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => geocode(false)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50"><MapPinned className="size-4" aria-hidden /> Έλεγχος με γεωκωδικοποίηση</button>
              <button type="button" disabled={pending} onClick={() => geocode(true)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50"><LocateFixed className="size-4" aria-hidden /> Χρήση σημείου OSM</button>
            </div>
          )}
          <a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer" className="text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline">Άνοιγμα στο Google Maps</a>
        </section>
        {canWrite && (
          <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
            <label className="inline-flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-14)] min-h-11"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="size-5 accent-eu-navy" /> Ενεργό (εμφανίζεται στο site)</label>
            <button type="button" disabled={pending} onClick={save} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-blue disabled:opacity-50"><Check className="size-4" aria-hidden /> {pending ? "Αποθήκευση…" : "Αποθήκευση"}</button>
            {f.updatedAt && <span className="text-eu-muted text-[length:var(--fs-13)]">Τελευταία αλλαγή {new Date(f.updatedAt).toLocaleString("el-GR")}</span>}
          </section>
        )}
      </aside>
    </div>
    </div>
  );
}
