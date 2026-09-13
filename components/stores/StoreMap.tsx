"use client";

import dynamic from "next/dynamic";
import type { MapStore } from "./StoreMapLeaflet";
export type { MapStore };

/**
 * @dynamic Store map (Leaflet + OpenStreetMap, clustered). Loaded client-side
 * only; the placeholder keeps the layout height so nothing jumps.
 */
const Lazy = dynamic(() => import("./StoreMapLeaflet"), { ssr: false, loading: () => <div className="w-full rounded-xl bg-eu-chip border border-eu-line animate-pulse" style={{ height: "clamp(320px, 60dvh, 520px)" }} /> });

export function StoreMap({ stores, height, single, visitor }: { stores: MapStore[]; height?: number; single?: boolean; visitor?: { lat: number; lng: number; label?: string } | null }) {
  return (
    <div className="grid gap-2">
      <Lazy stores={stores} height={height} single={single} visitor={visitor} />
      {!single && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">{stores.length} καταστήματα στον χάρτη · οι αριθμοί ομαδοποιούν κοντινά καταστήματα, κλικ για μεγέθυνση.</p>}
    </div>
  );
}

/** Button/link helper: focus a store on the map (list ↔ map sync). */
export function focusStore(id: string) {
  window.dispatchEvent(new CustomEvent("eu:store-focus", { detail: id }));
}
