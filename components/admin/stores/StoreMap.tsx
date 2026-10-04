"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapMarker { id: string; lat: number; lng: number; label: string; href?: string; tone?: "navy" | "red" | "yellow" | "green" }

const COLORS = { navy: "#122A58", red: "#D62828", yellow: "#F1C400", green: "#1E7B3C" };
const icon = (tone: keyof typeof COLORS, big = false) =>
  L.divIcon({ className: "", iconSize: big ? [22, 22] : [14, 14], iconAnchor: big ? [11, 11] : [7, 7], html: `<span style="display:block;width:100%;height:100%;border-radius:50%;background:${COLORS[tone]};border:2px solid #fff;box-shadow:0 2px 6px rgba(18,42,88,.35)"></span>` });

/**
 * Leaflet + OpenStreetMap tiles. Two modes: many markers (list page) or one
 * draggable marker (editor; `onMove` fires with the new point). QA point
 * (`alt`) is drawn as a hollow circle joined by a dashed line.
 */
export default function StoreMap({ markers, editable, onMove, alt, height = 420, fit = true, zoom, highlight }: { markers: MapMarker[]; editable?: boolean; onMove?: (p: { lat: number; lng: number }) => void; alt?: { lat: number; lng: number; label?: string } | null; height?: number | string; fit?: boolean; zoom?: number; /** id δείκτη που φωτίζεται (π.χ. όταν ο δείκτης του ποντικιού είναι πάνω από τη γραμμή της λίστας) */ highlight?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const byId = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    if (!ref.current || map.current) return;
    map.current = L.map(ref.current, { scrollWheelZoom: true }).setView([38.5, 23.9], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers(); byId.current.clear();
    const pts: L.LatLngExpression[] = [];
    for (const mk of markers) {
      if (!mk.lat && !mk.lng) continue;
      pts.push([mk.lat, mk.lng]);
      const marker = L.marker([mk.lat, mk.lng], { icon: icon(mk.tone ?? "navy", !!editable), draggable: !!editable, title: mk.label });
      if (mk.href) marker.bindPopup(`<a href="${mk.href}" style="font-weight:700;color:#1D428A">${mk.label}</a>`);
      else marker.bindTooltip(mk.label);
      if (editable && onMove) marker.on("dragend", () => { const p = marker.getLatLng(); onMove({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }); });
      marker.addTo(g); byId.current.set(mk.id, marker);
    }
    if (alt && (alt.lat || alt.lng)) {
      L.circleMarker([alt.lat, alt.lng], { radius: 8, color: "#1E7B3C", weight: 2, fillColor: "#fff", fillOpacity: 0.9 }).bindTooltip(alt.label ?? "Γεωκωδικοποίηση").addTo(g);
      if (markers[0]) L.polyline([[markers[0].lat, markers[0].lng], [alt.lat, alt.lng]], { color: "#1E7B3C", dashArray: "4 4", weight: 2 }).addTo(g);
      pts.push([alt.lat, alt.lng]);
    }
    if (editable && onMove) m.off("click").on("click", (e) => onMove({ lat: Math.round(e.latlng.lat * 1e6) / 1e6, lng: Math.round(e.latlng.lng * 1e6) / 1e6 }));
    // το μέγεθος του κουτιού μπορεί να άλλαξε (φόρτωση με CSS ύψος, split view): πρώτα invalidateSize, μετά εστίαση
    m.invalidateSize();
    if (fit && pts.length) { if (pts.length === 1) m.setView(pts[0], zoom ?? 15); else m.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 13 }); }
  }, [markers, editable, onMove, alt, fit, zoom]);

  useEffect(() => {
    for (const [id, mk] of byId.current) { const on = id === highlight; mk.setIcon(icon((markers.find((x) => x.id === id)?.tone ?? "navy") as keyof typeof COLORS, on || !!editable)); mk.setZIndexOffset(on ? 1000 : 0); }
  }, [highlight, markers, editable]);

  useEffect(() => {
    const el = ref.current; if (!el || !map.current) return;
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={ref} style={{ height }} className="w-full rounded-xl overflow-hidden border border-eu-line z-0" role="region" aria-label="Χάρτης" />;
}
