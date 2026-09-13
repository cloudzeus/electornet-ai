"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openLabel } from "@/lib/stores/open";

export interface MapStore { id: string; slug: string; name: string; city: string; address?: string; zip?: string; phone?: string; openUntil?: string; lat: number; lng: number }

/**
 * @dynamic Storefront store map: OpenStreetMap tiles, grid clustering (no
 * plugin) so dense areas (Attica) never pile pins on top of each other,
 * popups with address / phone / links. Listens to `eu:store-focus`
 * (detail = store id) fired by the list to fly to a store and open it.
 */
const dot = (active = false) => L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8], html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${active ? "#F1C400" : "#1D428A"};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(18,42,88,.4)"></span>` });
const clusterIcon = (n: number) => { const s = n < 10 ? 32 : n < 50 ? 40 : 48; return L.divIcon({ className: "", iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<span style="display:grid;place-items:center;width:${s}px;height:${s}px;border-radius:50%;background:#122A58;color:#fff;font:800 ${s < 40 ? 13 : 14}px Manrope,system-ui,sans-serif;border:3px solid #fff;box-shadow:0 4px 12px rgba(18,42,88,.35)">${n}</span>` }); };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const popupHtml = (s: MapStore) => `<div style="font-family:Manrope,system-ui,sans-serif;min-width:220px"><div style="font-weight:800;color:#1a1a1a;font-size:15px;line-height:1.25">${esc(s.city)} — ${esc(s.name)}</div>${s.address ? `<div style="color:#4d4d4d;font-size:14px;margin-top:4px">${esc(s.address)}, ${esc(s.zip ?? "")} ${esc(s.city)}</div>` : ""}<div style="color:#4d4d4d;font-size:14px;margin-top:2px">${s.openUntil ? esc(openLabel(s.openUntil)) : ""}${s.phone ? ` · <a href="tel:${esc(s.phone)}" style="color:#1D428A;font-weight:700">${esc(s.phone)}</a>` : ""}</div><div style="display:flex;gap:6px;margin-top:8px"><a href="/katastimata/${esc(s.slug)}" style="background:#122A58;color:#fff;font-weight:800;font-size:13px;padding:7px 12px;border-radius:999px;text-decoration:none">Το κατάστημα</a><a href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank" rel="noreferrer" style="border:2px solid #122A58;color:#122A58;font-weight:800;font-size:13px;padding:5px 12px;border-radius:999px;text-decoration:none">Οδηγίες</a></div></div>`;

export default function StoreMapLeaflet({ stores, height = 520, single = false, className = "" }: { stores: MapStore[]; /** desktop height; phones get ~70% of it (min 320) */ height?: number; single?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!ref.current || map.current) return;
    const m = L.map(ref.current, { scrollWheelZoom: !single, attributionControl: true }).setView([38.4, 23.9], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, [single]);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    const valid = stores.filter((s) => s.lat || s.lng);
    const render = () => {
      g.clearLayers();
      markers.current.clear();
      const z = m.getZoom();
      const cell = z >= 15 ? 0 : 56;
      const buckets = new Map<string, MapStore[]>();
      for (const s of valid) {
        const p = m.project([s.lat, s.lng], z);
        const key = cell ? `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}` : s.id;
        (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(s);
      }
      for (const group of buckets.values()) {
        if (group.length === 1 || single) {
          for (const s of group) {
            const mk = L.marker([s.lat, s.lng], { icon: dot(), title: s.name }).bindPopup(popupHtml(s), { maxWidth: 300 });
            mk.on("popupopen", () => mk.setIcon(dot(true))).on("popupclose", () => mk.setIcon(dot()));
            mk.addTo(g);
            markers.current.set(s.id, mk);
          }
        } else {
          const lat = group.reduce((a, s) => a + s.lat, 0) / group.length, lng = group.reduce((a, s) => a + s.lng, 0) / group.length;
          const c = L.marker([lat, lng], { icon: clusterIcon(group.length), title: `${group.length} καταστήματα` });
          c.on("click", () => { const b = L.latLngBounds(group.map((s) => [s.lat, s.lng] as [number, number])); m.fitBounds(b.pad(0.4), { maxZoom: Math.min(17, z + 3) }); });
          c.addTo(g);
        }
      }
    };
    render();
    m.on("zoomend moveend", render);
    if (valid.length === 1) m.setView([valid[0].lat, valid[0].lng], 15);
    else if (valid.length) m.fitBounds(L.latLngBounds(valid.map((s) => [s.lat, s.lng] as [number, number])), { padding: [20, 20] });
    const focus = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const s = valid.find((x) => x.id === id);
      if (!s) return;
      m.flyTo([s.lat, s.lng], Math.max(m.getZoom(), 15), { duration: 0.6 });
      m.once("moveend", () => { render(); markers.current.get(id)?.openPopup(); });
    };
    window.addEventListener("eu:store-focus", focus);
    return () => { m.off("zoomend moveend", render); window.removeEventListener("eu:store-focus", focus); };
  }, [stores, single]);

  return <div ref={ref} style={{ height: `clamp(320px, 60dvh, ${height}px)` }} className={`w-full rounded-xl overflow-hidden border border-eu-line z-0 ${className}`} role="region" aria-label="Χάρτης καταστημάτων" />;
}
