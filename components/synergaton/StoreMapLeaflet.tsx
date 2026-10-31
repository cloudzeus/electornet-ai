"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * @dynamic Χάρτης ενός καταστήματος στην πύλη: το αποθηκευμένο σημείο (μπλε) και η πρόταση (κίτρινη, σύρεται).
 * Χωρίς πρόταση σύρεται το ίδιο το σημείο. Κάθε μετακίνηση → onMove.
 */
const pin = (cls: string) => L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 36], html: `<span class="block size-[30px] ${cls} rounded-[50%_50%_50%_0] -rotate-45 border-[3px] border-white shadow-[0_3px_10px_rgba(18,42,88,.45)]"></span>` });

export type Pt = { lat: number; lng: number };

export default function StoreMapLeaflet({ saved, proposal, onMove }: { saved: Pt | null; proposal: Pt | null; onMove: (p: Pt) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onMove);
  useEffect(() => { cb.current = onMove; }, [onMove]);
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, { zoomSnap: 0.5 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
    const editable = proposal ?? saved;
    if (saved && proposal) L.marker([saved.lat, saved.lng], { icon: pin("bg-eu-blue opacity-60"), title: "Σημερινό σημείο" }).addTo(m);
    if (editable) {
      const mk = L.marker([editable.lat, editable.lng], { icon: pin(proposal ? "bg-eu-yellow" : "bg-eu-navy"), draggable: true, autoPan: true, title: "Σύρε για διόρθωση" }).addTo(m);
      mk.on("dragend", () => { const p = mk.getLatLng(); cb.current({ lat: p.lat, lng: p.lng }); });
      const pts = [saved, proposal].filter((p): p is Pt => !!p);
      if (pts.length > 1) m.fitBounds(pts.map((p) => [p.lat, p.lng] as [number, number]), { padding: [48, 48], maxZoom: 17 });
      else m.setView([editable.lat, editable.lng], 17);
    } else m.setView([38.3, 23.8], 6);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); m.remove(); };
  }, [saved, proposal]);
  return <div ref={ref} className="w-full h-full z-0" role="region" aria-label="Χάρτης του καταστήματος· η καρφίτσα σύρεται για διόρθωση" />;
}
