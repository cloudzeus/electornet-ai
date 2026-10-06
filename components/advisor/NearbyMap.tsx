"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { X, Maximize2, Navigation, Phone } from "lucide-react";
import type { AdvisorMap } from "@/lib/advisor/answer";

/** @dynamic Χάρτης κοντινότερων καταστημάτων στη συνομιλία του Ερμή: μικρή προεπισκόπηση και μεγάλος χάρτης σε παράθυρο. */
const Leaflet = dynamic(() => import("./NearbyMapLeaflet"), { ssr: false, loading: () => <div className="w-full h-full bg-eu-chip animate-pulse" /> });
const directions = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export function NearbyMapPreview({ map, onOpen }: { map: AdvisorMap; onOpen: () => void }) {
  return (
    <div className="mt-2 grid gap-1.5">
      <button type="button" onClick={onOpen} aria-label="Άνοιγμα χάρτη με τη διεύθυνσή σου και τα κοντινότερα καταστήματα" className="relative block w-full h-40 rounded-xl overflow-hidden border border-eu-line cursor-pointer">
        <Leaflet map={map} compact />
        <span className="absolute inset-0 z-[500]" aria-hidden />
      </button>
      <button type="button" onClick={onOpen} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-3 min-h-11 hover:bg-eu-blue">
        <Maximize2 className="size-4" aria-hidden /> Άνοιγμα χάρτη
      </button>
    </div>
  );
}

export function NearbyMapDialog({ map, onClose }: { map: AdvisorMap; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-[90] bg-eu-navy/50 grid place-items-center @md:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="nearby-map-title" className="w-full h-dvh @md:h-[85dvh] max-w-4xl bg-white @md:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-eu-line">
          <div className="min-w-0 flex-1">
            <h2 id="nearby-map-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Κοντινότερα καταστήματα</h2>
            <p className="m-0 text-eu-muted text-[length:var(--fs-14)] truncate">από: {map.home.label}</p>
          </div>
          <button ref={close} type="button" onClick={onClose} aria-label="Κλείσιμο χάρτη" className="size-11 shrink-0 rounded-full inline-flex items-center justify-center hover:bg-eu-surface">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 min-h-0"><Leaflet map={map} /></div>
        <ul className="m-0 p-3 grid gap-2 @md:grid-cols-2 list-none border-t border-eu-line">
          {map.stores.map((s, i) => (
            <li key={s.slug} className="flex items-start gap-3 rounded-xl bg-eu-surface p-3">
              <span className="size-8 shrink-0 rounded-full bg-eu-navy text-white font-extrabold grid place-items-center text-[length:var(--fs-14)]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight">{s.name}</div>
                <div className="text-eu-ink-3 text-[length:var(--fs-14)]">{s.address}, {s.city} · {s.km.toLocaleString("el-GR")} km · {s.today}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <a href={directions(s.lat, s.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] px-3 min-h-11"><Navigation className="size-3.5" aria-hidden /> Οδηγίες</a>
                  {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-13)] px-3 min-h-11"><Phone className="size-3.5" aria-hidden /> {s.phone}</a>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
