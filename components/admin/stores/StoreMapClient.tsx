"use client";

import dynamic from "next/dynamic";
export type { MapMarker } from "./StoreMap";

/** Leaflet touches `window` — load it client-side only. */
export const StoreMapClient = dynamic(() => import("./StoreMap"), { ssr: false, loading: () => <div className="w-full rounded-xl bg-eu-surface animate-pulse" style={{ height: 420 }} /> });
