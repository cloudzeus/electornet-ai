"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openLabel } from "@/lib/stores/open";
import { sx } from "@/components/ui/sx";

export interface MapStore { id: string; slug: string; name: string; city: string; address?: string; zip?: string; phone?: string; openUntil?: string; lat: number; lng: number }

/**
 * @dynamic Storefront store map: OpenStreetMap tiles, grid clustering (no
 * plugin) so dense areas (Attica) never pile pins on top of each other,
 * popups with address / phone / links. Listens to `eu:store-focus`
 * (detail = store id) fired by the list to fly to a store and open it.
 */
// Markers / popups: HTML που περνά από innerHTML του Leaflet — μόνο κλάσεις, όχι style attributes (τα μπλοκάρει το CSP).
// Το «!» στα χρώματα των συνδέσμων: το `.leaflet-container a` έχει μεγαλύτερη ειδικότητα από μία κλάση (πριν υπερίσχυε το inline style).
const dot = (active = false) => L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8], html: `<span class="block size-[16px] rounded-full ${active ? "bg-[#F1C400]" : "bg-[#1D428A]"} border-[2.5px] border-solid border-white shadow-[0_2px_6px_rgba(18,42,88,.4)]"></span>` });
const CLUSTER: Record<number, string> = { 32: "size-[32px] text-[length:var(--fs-13)]", 40: "size-[40px] text-[length:var(--fs-14)]", 48: "size-[48px] text-[length:var(--fs-14)]" };
const clusterIcon = (n: number) => { const s = n < 10 ? 32 : n < 50 ? 40 : 48; return L.divIcon({ className: "", iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<span class="grid place-items-center ${CLUSTER[s]} rounded-full bg-[#122A58] text-white font-extrabold leading-[normal] [font-family:Manrope,system-ui,sans-serif] border-[3px] border-solid border-white shadow-[0_4px_12px_rgba(18,42,88,.35)]">${n}</span>` }); };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const popupHtml = (s: MapStore) => `<div class="[font-family:Manrope,system-ui,sans-serif] min-w-[220px]"><div class="font-extrabold text-[#1a1a1a] text-[length:var(--fs-15)] leading-[1.25]">${esc(s.city)} — ${esc(s.name)}</div>${s.address ? `<div class="text-[#4d4d4d] text-[length:var(--fs-14)] mt-[4px]">${esc(s.address)}, ${esc(s.zip ?? "")} ${esc(s.city)}</div>` : ""}<div class="text-[#4d4d4d] text-[length:var(--fs-14)] mt-[2px]">${s.openUntil ? esc(openLabel(s.openUntil)) : ""}${s.phone ? ` · <a href="tel:${esc(s.phone)}" class="text-[#1D428A]! font-bold">${esc(s.phone)}</a>` : ""}</div><div class="flex gap-[6px] mt-[8px]"><a href="/katastimata/${esc(s.slug)}" class="bg-[#122A58] text-white! font-extrabold text-[length:var(--fs-13)] py-[7px] px-[12px] rounded-[999px] no-underline">Το κατάστημα</a><a href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank" rel="noreferrer" class="border-2 border-solid border-[#122A58] text-[#122A58]! font-extrabold text-[length:var(--fs-13)] py-[5px] px-[12px] rounded-[999px] no-underline">Οδηγίες</a></div></div>`;

const visitorIcon = () => L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: `<span class="relative block size-[22px]"><span class="absolute inset-0 rounded-full bg-[rgba(29,66,138,.25)] animate-[eu-geo-pulse_1.8s_ease-out_infinite]"></span><span class="absolute inset-[5px] rounded-full bg-[#1D428A] border-[2.5px] border-solid border-white shadow-[0_2px_6px_rgba(18,42,88,.4)]"></span></span>` });

export default function StoreMapLeaflet({ stores, height = 520, single = false, className = "", visitor }: { stores: MapStore[]; /** desktop height; phones get ~70% of it (min 320) */ height?: number; single?: boolean; className?: string; visitor?: { lat: number; lng: number; label?: string } | null }) {
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
    const you = visitor ? L.marker([visitor.lat, visitor.lng], { icon: visitorIcon(), zIndexOffset: 1000, title: visitor.label ?? "Η θέση σου" }).bindTooltip(visitor.label ?? "Η θέση σου", { permanent: false }) : null;
    const renderAll = () => { render(); you?.addTo(g); };
    renderAll();
    m.on("zoomend moveend", renderAll);
    if (visitor && valid.length) {
      // the visitor plus the 5 nearest stores
      const near = [...valid].sort((a, b) => (a.lat - visitor.lat) ** 2 + (a.lng - visitor.lng) ** 2 - ((b.lat - visitor.lat) ** 2 + (b.lng - visitor.lng) ** 2)).slice(0, 5);
      m.fitBounds(L.latLngBounds([[visitor.lat, visitor.lng], ...near.map((s) => [s.lat, s.lng] as [number, number])]).pad(0.25), { maxZoom: 14 });
    } else if (valid.length === 1) m.setView([valid[0].lat, valid[0].lng], 15);
    else if (valid.length) m.fitBounds(L.latLngBounds(valid.map((s) => [s.lat, s.lng] as [number, number])), { padding: [20, 20] });
    const focus = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const s = valid.find((x) => x.id === id);
      if (!s) return;
      m.flyTo([s.lat, s.lng], Math.max(m.getZoom(), 15), { duration: 0.6 });
      m.once("moveend", () => { render(); markers.current.get(id)?.openPopup(); });
    };
    window.addEventListener("eu:store-focus", focus);
    return () => { m.off("zoomend moveend", renderAll); window.removeEventListener("eu:store-focus", focus); };
  }, [stores, single, visitor]);

  const h = sx({ height: `clamp(320px, 60dvh, ${height}px)` });
  return (
    <>
      {h.node}
      <div ref={ref} className={`w-full rounded-xl overflow-hidden border border-eu-line z-0 ${h.className} ${className}`} role="region" aria-label="Χάρτης καταστημάτων" />
    </>
  );
}
