"use client";

import Link from "next/link";
import { MapPin, Phone, Clock, Map as MapIcon } from "lucide-react";
import type { Store } from "@/lib/data/types";
import { isOpenToday } from "@/lib/stores/open";
import { focusStore } from "./StoreMap";

/** List row of the locator. Title wraps (never truncates), distance stays on the right, «Στον χάρτη» flies the map to the pin. */
export function StoreListItem({ s, serviceLabel }: { s: Store; serviceLabel: Record<string, string> }) {
  return (
    <li className="bg-white rounded-xl border border-eu-line p-4 text-[length:var(--fs-15)] hover:border-eu-blue transition-colors">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-start">
        <Link href={`/katastimata/${s.slug}`} className="font-extrabold text-eu-ink text-[length:var(--fs-16)] leading-snug hover:text-eu-blue break-words">
          {s.city} — {s.name}
        </Link>
        <span className="text-eu-muted whitespace-nowrap tabular-nums">{s.distanceKm.toLocaleString("el-GR")} km</span>
      </div>
      <div className="text-eu-ink-2 mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-1.5 items-start">
        <MapPin className="size-3.5 text-eu-blue shrink-0 mt-1" aria-hidden /> <span className="break-words">{s.address}, {s.zip} {s.city}</span>
      </div>
      <div className="text-eu-ink-2 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="inline-flex items-center gap-1.5"><Clock className={`size-3.5 shrink-0 ${isOpenToday(s.openUntil) ? "text-eu-green" : "text-eu-muted"}`} aria-hidden /> {isOpenToday(s.openUntil) ? <><span className="text-eu-green font-bold">Ανοιχτό</span> · έως {s.openUntil}</> : <span className="text-eu-muted font-bold">Κλειστό σήμερα</span>}</span>
        {s.phone && (
          <span className="inline-flex items-center gap-1.5"><span className="text-eu-muted-3">·</span><Phone className="size-3.5 text-eu-blue shrink-0" aria-hidden /><a href={`tel:${s.phone}`} className="hover:text-eu-blue tabular-nums">{s.phone}</a></span>
        )}
      </div>
      {s.services.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {s.services.map((sv) => serviceLabel[sv] && <span key={sv} className="rounded-full bg-eu-surface text-eu-ink-2 font-semibold text-[length:var(--fs-13)] px-2 py-0.5">{serviceLabel[sv]}</span>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <Link href={`/katastimata/${s.slug}`} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-3.5 min-h-10 inline-flex items-center hover:bg-eu-blue">Το κατάστημα</Link>
        <button type="button" onClick={() => focusStore(s.id)} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3.5 min-h-10 inline-flex items-center gap-1.5 hover:bg-eu-surface"><MapIcon className="size-4" aria-hidden /> Στον χάρτη</button>
        <a href={`https://maps.google.com/?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="rounded-full border-2 border-eu-line text-eu-ink font-extrabold text-[length:var(--fs-14)] px-3.5 min-h-10 inline-flex items-center hover:border-eu-navy">Οδηγίες</a>
      </div>
    </li>
  );
}
