"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AdvisorMap } from "@/lib/advisor/answer";

/**
 * @dynamic Χάρτης του Ερμή: το σπίτι του πελάτη (κίτρινο) και τα κοντινότερα καταστήματα (αριθμημένα), με κέντρο το σπίτι.
 * `compact`: μικρή προεπισκόπηση μέσα στη συνομιλία, χωρίς αλληλεπίδραση — το κλικ ανοίγει τον μεγάλο χάρτη.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const homeIcon = (s: number) => L.divIcon({ className: "", iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<span style="display:grid;place-items:center;width:${s}px;height:${s}px;border-radius:50%;background:#F1C400;border:3px solid #fff;box-shadow:0 3px 10px rgba(18,42,88,.45)"><svg width="${s * 0.5}" height="${s * 0.5}" viewBox="0 0 24 24" fill="none" stroke="#122A58" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/></svg></span>` });
const storeIcon = (n: number, s: number) => L.divIcon({ className: "", iconSize: [s, s], iconAnchor: [s / 2, s / 2], popupAnchor: [0, -s / 2], html: `<span style="display:grid;place-items:center;width:${s}px;height:${s}px;border-radius:50%;background:#122A58;color:#fff;font:800 var(--fs-14) Manrope,system-ui,sans-serif;border:3px solid #fff;box-shadow:0 3px 10px rgba(18,42,88,.45)">${n}</span>` });
const directions = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
const popupHtml = (s: AdvisorMap["stores"][number], n: number) => `<div style="font-family:Manrope,system-ui,sans-serif;min-width:220px"><div style="font-weight:800;color:#1a1a1a;font-size:var(--fs-15);line-height:1.25">${n}. ${esc(s.name)}</div><div style="color:#4d4d4d;font-size:var(--fs-14);margin-top:4px">${esc(s.address)}, ${esc(s.city)} · ${s.km.toLocaleString("el-GR")} km</div><div style="color:#4d4d4d;font-size:var(--fs-14);margin-top:2px">${esc(s.today)}${s.phone ? ` · <a href="tel:${esc(s.phone)}" style="color:#1D428A;font-weight:700">${esc(s.phone)}</a>` : ""}</div><div style="display:flex;gap:6px;margin-top:8px"><a href="/katastimata/${esc(s.slug)}" style="background:#122A58;color:#fff;font-weight:800;font-size:var(--fs-13);padding:9px 12px;border-radius:999px;text-decoration:none">Το κατάστημα</a><a href="${directions(s.lat, s.lng)}" target="_blank" rel="noreferrer" style="border:2px solid #122A58;color:#122A58;font-weight:800;font-size:var(--fs-13);padding:7px 12px;border-radius:999px;text-decoration:none">Οδηγίες</a></div></div>`;

export default function NearbyMapLeaflet({ map: data, compact = false, className = "" }: { map: AdvisorMap; compact?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, { zoomSnap: 0.25, zoomControl: !compact, dragging: !compact, scrollWheelZoom: !compact, doubleClickZoom: !compact, touchZoom: !compact, boxZoom: !compact, keyboard: !compact, attributionControl: !compact });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
    const { home, stores } = data;
    const size = compact ? 26 : 34;
    L.marker([home.lat, home.lng], { icon: homeIcon(size + 4), zIndexOffset: 1000, interactive: !compact, title: home.label }).bindTooltip(`Η διεύθυνσή σου: ${esc(home.label)}`).addTo(m);
    stores.forEach((s, i) => { const mk = L.marker([s.lat, s.lng], { icon: storeIcon(i + 1, size), interactive: !compact, title: s.name }); if (!compact) mk.bindPopup(popupHtml(s, i + 1), { maxWidth: 300 }); mk.addTo(m); });
    // κέντρο το σπίτι: συμμετρικό πλαίσιο γύρω του, όσο χρειάζεται για να φαίνονται όλα τα καταστήματα
    const fit = () => {
      const dLat = Math.max(0.004, ...stores.map((s) => Math.abs(s.lat - home.lat))), dLng = Math.max(0.005, ...stores.map((s) => Math.abs(s.lng - home.lng)));
      m.fitBounds([[home.lat - dLat, home.lng - dLng], [home.lat + dLat, home.lng + dLng]], { padding: compact ? [18, 18] : [48, 48], maxZoom: 17 });
    };
    fit();
    const ro = new ResizeObserver(() => { m.invalidateSize(); });
    ro.observe(ref.current);
    return () => { ro.disconnect(); m.remove(); };
  }, [data, compact]);
  return <div ref={ref} className={`w-full h-full z-0 ${className}`} role="region" aria-label="Χάρτης με τη διεύθυνσή σου και τα κοντινότερα καταστήματα" />;
}
