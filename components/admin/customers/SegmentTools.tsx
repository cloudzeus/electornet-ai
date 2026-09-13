"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Map as MapIcon, Download, X, Store as StoreIcon } from "lucide-react";

/** Location segmentation controls for the customers list: prefecture, store catchment, radius from a place; map toggle; CSV export of the segment. */
export function SegmentTools({ regions, stores, current, center, matched, canExport, exportRows }: { regions: { value: string; count: number }[]; stores: { id: string; label: string; count: number }[]; current: { region: string; store: string; near: string; km: string; view: string }; center: { lat: number; lng: number; label: string } | null; matched: number; canExport: boolean; exportRows: { email: string; name: string; phone: string; city: string; region: string; newsletter: boolean; points: number }[] }) {
  const [near, setNear] = useState(current.near);
  const [km, setKm] = useState(current.km);
  const q = (o: Record<string, string>) => { const u = new URLSearchParams({ ...current, ...o }); [...u.keys()].forEach((k) => !u.get(k) && u.delete(k)); return `?${u}`; };
  const field = "rounded-full border-2 border-eu-line px-3 min-h-10 text-[length:var(--fs-14)] outline-none focus:border-eu-blue bg-white";
  const active = current.region || current.store || current.near;
  const exportCsv = () => { const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`; const csv = ["email,name,phone,city,region,newsletter,points", ...exportRows.map((r) => [r.email, r.name, r.phone, r.city, r.region, r.newsletter ? "yes" : "no", r.points].map(esc).join(","))].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = `segment-${current.region || current.store || current.near || "all"}.csv`; a.click(); };
  return (
    <div className="rounded-2xl bg-white border border-eu-line p-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)]">
        <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink"><MapPin className="size-4 text-eu-blue" aria-hidden /> Segmentation ανά τοποθεσία</span>
        <form action="" className="flex flex-wrap items-center gap-2">
          {Object.entries(current).filter(([k, v]) => v && !["region", "store", "near", "km"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <select name="region" defaultValue={current.region} className={field} aria-label="Νομός"><option value="">Όλοι οι νομοί</option>{regions.map((r) => <option key={r.value} value={r.value}>{r.value} ({r.count})</option>)}</select>
          <select name="store" defaultValue={current.store} className={field} aria-label="Κατάστημα"><option value="">Όλα τα καταστήματα</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.count})</option>)}</select>
          <input name="near" value={near} onChange={(e) => setNear(e.target.value)} placeholder="Ακτίνα γύρω από: πόλη / Τ.Κ. / διεύθυνση" className={`${field} min-w-[240px]`} aria-label="Κέντρο ακτίνας" />
          <label className="inline-flex items-center gap-1 font-bold">έως <input name="km" type="number" min={1} max={500} value={km} onChange={(e) => setKm(e.target.value)} className={`${field} w-20`} aria-label="Ακτίνα km" /> km</label>
          <button type="submit" className="rounded-full bg-eu-navy text-white font-bold px-4 min-h-10">Εφαρμογή</button>
          {active && <Link href={q({ region: "", store: "", near: "" })} className="inline-flex items-center gap-1 rounded-full px-3 min-h-10 font-bold text-eu-muted hover:bg-eu-surface"><X className="size-4" aria-hidden /> Καθαρισμός</Link>}
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)]">
        <span className="text-eu-ink-3">{center ? <>Κέντρο <b>{center.label}</b> ({center.lat.toFixed(4)}, {center.lng.toFixed(4)}), ακτίνα {current.km} km · </> : null}<b className="text-eu-ink">{matched}</b> πελάτες στο segment</span>
        <Link href={q({ view: current.view === "map" ? "" : "map" })} className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold ${current.view === "map" ? "bg-eu-navy text-white" : "border-2 border-eu-line hover:border-eu-navy"}`}><MapIcon className="size-4" aria-hidden /> Χάρτης πελατών</Link>
        {canExport && <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-3 min-h-10 font-bold hover:bg-eu-navy hover:text-white"><Download className="size-4" aria-hidden /> Εξαγωγή segment (CSV)</button>}
        <span className="inline-flex items-center gap-1 text-eu-muted text-[length:var(--fs-13)]"><StoreIcon className="size-3.5" aria-hidden /> Κάθε διεύθυνση γεωκωδικοποιείται και δένεται με το κοντινότερο κατάστημα.</span>
      </div>
    </div>
  );
}
