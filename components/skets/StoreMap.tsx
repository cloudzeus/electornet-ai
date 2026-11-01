"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Snapshot } from "@/lib/skets/types";
import css from "./skets.module.css";

/**
 * @dynamic Χάρτης του σκετς: ξεκινά από όλη την Ελλάδα, «πετά» στη Λάρισα, το σπίτι πάλλεται, οι πινέζες των καταστημάτων
 * πέφτουν μία-μία και οι διαδρομές σχεδιάζονται. Κλικ σε πινέζα = επιλογή καταστήματος (το ίδιο κάνει και το τηλεχειριστήριο).
 */
const HOUSE = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#122A58" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/></svg>`;
const pinIcon = (n: number, sel: boolean, still = false) => L.divIcon({ className: "", iconSize: [54, 54], iconAnchor: [27, 27], html: `<span class="${css.pin} ${still ? css.still : css[`d${Math.min(n, 5)}`]} ${sel ? css.pinSel : ""}">${n + 1}</span>` });

export default function StoreMap({ snap, selected, onSelect }: { snap: Snapshot; selected: number | null; onSelect: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const live = useRef<{ map: L.Map; pins: L.Marker[]; routes: L.Polyline[] } | null>(null);
  const pick = useRef(onSelect);
  useEffect(() => { pick.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!box.current) return;
    const { home, stores } = snap;
    const map = L.map(box.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.1, scrollWheelZoom: false }).setView([38.7, 23.2], 6.4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    const state = { map, pins: [] as L.Marker[], routes: [] as L.Polyline[] };
    live.current = state;
    const bounds = L.latLngBounds([[home.lat, home.lng], ...stores.map((s) => [s.lat, s.lng] as [number, number])]);
    // δεξιά στέκεται η λίστα καταστημάτων (≈ 26vw): ο χάρτης κεντράρει στο ελεύθερο κομμάτι
    const pad = (): L.FitBoundsOptions => ({ paddingTopLeft: [110, 110], paddingBottomRight: [window.innerWidth * 0.27 + 60, 110] });
    const t = setTimeout(() => {
      map.flyToBounds(bounds, { ...pad(), duration: 3.2, easeLinearity: 0.15 });
      map.once("moveend", () => {
        L.marker([home.lat, home.lng], { icon: L.divIcon({ className: "", iconSize: [52, 52], iconAnchor: [26, 26], html: `<span class="${css.home}">${HOUSE}</span>` }), zIndexOffset: 1000 }).addTo(map);
        stores.forEach((s, i) => {
          setTimeout(() => {
            state.routes[i] = L.polyline([[home.lat, home.lng], [s.lat, s.lng]], { color: "#1d428a", weight: 4, opacity: 0.75, className: css.route }).addTo(map);
            state.pins[i] = L.marker([s.lat, s.lng], { icon: pinIcon(i, false) }).on("click", () => pick.current(i)).addTo(map);
          }, 250 + i * 350);
        });
      });
    }, 500);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(box.current);
    return () => { clearTimeout(t); ro.disconnect(); map.remove(); live.current = null; };
  }, [snap]);

  useEffect(() => {
    const st = live.current;
    if (!st) return;
    st.pins.forEach((p, i) => p?.setIcon(pinIcon(i, i === selected, true)));
    st.routes.forEach((r, i) => {
      if (!r) return;
      r.setStyle({ color: i === selected ? "#f1c400" : "#1d428a", weight: i === selected ? 7 : 4, opacity: selected === null || i === selected ? 0.85 : 0.25 });
      const el = r.getElement();
      if (el) el.classList.toggle(css.routeSel, i === selected);
    });
    if (selected !== null) { const s = snap.stores[selected]; st.map.flyToBounds(L.latLngBounds([[snap.home.lat, snap.home.lng], [s.lat, s.lng]]), { paddingTopLeft: [120, 120], paddingBottomRight: [window.innerWidth * 0.36 + 60, 120], duration: 1.4, maxZoom: 16 }); }
  }, [selected, snap]);

  return <div ref={box} className="absolute inset-0 z-0" role="region" aria-label="Χάρτης: το νέο σπίτι και τα κοντινότερα καταστήματα" />;
}
