"use client";

import { useEffect, useState } from "react";
import { MapPin, Package } from "lucide-react";

export interface Locker { id: string; name?: string; address?: string; zip?: string }
type Selected = { boxnowLockerId?: string | number; boxnowLockerName?: string; boxnowLockerAddressLine1?: string; boxnowLockerPostalCode?: string };

const SRC = "https://widget-cdn.boxnow.gr/map-widget/client/v5.js";

/**
 * Επιλογή θυρίδας BOX NOW με τον επίσημο χάρτη τους (popup). Το widget διαβάζει το `_bn_map_widget_config` όταν
 * φορτώνει· ανοίγει με κουμπί που έχει την κλάση του `buttonSelector` — γι' αυτό ο γονέας το κρατά πάντα στη σελίδα
 * (κρυφό όταν δεν έχει επιλεγεί BOX NOW), ώστε το κουμπί να μην ξαναφτιάχνεται. Χωρίς Partner ID δεν εμφανίζεται.
 */
export function BoxNowPicker({ partnerId, zip, value, onSelect }: { partnerId: string | null; zip?: string; value: Locker | null; onSelect: (l: Locker) => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!partnerId) return;
    const w = window as unknown as { _bn_map_widget_config?: unknown };
    w._bn_map_widget_config = {
      partnerId: Number(partnerId) || partnerId, type: "popup", parentElement: "#eu-boxnow-map", buttonSelector: ".eu-boxnow-open", autoclose: true, gps: !zip, ...(zip ? { zip } : {}),
      afterSelect: (s: Selected) => onSelect({ id: String(s.boxnowLockerId ?? ""), name: s.boxnowLockerName, address: s.boxnowLockerAddressLine1, zip: s.boxnowLockerPostalCode }),
    };
    if (document.querySelector(`script[src="${SRC}"]`)) { queueMicrotask(() => setReady(true)); return; }
    const e = document.createElement("script");
    e.src = SRC; e.async = true; e.defer = true; e.onload = () => setReady(true);
    document.head.appendChild(e);
  }, [partnerId, zip, onSelect]);

  if (!partnerId) return <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">Η παράδοση σε θυρίδα BOX NOW δεν είναι ακόμη διαθέσιμη. Διάλεξε άλλον courier.</p>;
  return (
    <div className="grid gap-3 rounded-xl bg-eu-surface p-4">
      <div id="eu-boxnow-map" />
      {value?.id ? (
        <div className="flex items-start gap-3">
          <Package className="size-5 mt-0.5 shrink-0 text-eu-green" aria-hidden />
          <div className="min-w-0 text-[length:var(--fs-15)]">
            <div className="font-bold text-eu-ink">{value.name ?? "Θυρίδα BOX NOW"}</div>
            <div className="text-eu-ink-2">{[value.address, value.zip].filter(Boolean).join(", ")}</div>
            <div className="text-eu-muted text-[length:var(--fs-14)]">Θα λάβεις SMS με τον κωδικό για να ανοίξεις τη θυρίδα.</div>
          </div>
        </div>
      ) : <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Διάλεξε τη θυρίδα BOX NOW όπου θα παραλάβεις — ανοιχτές 24/7.</p>}
      {/* ένα κουμπί που υπάρχει πάντα: το widget δένει το κλικ όταν φορτώνει */}
      <button type="button" disabled={!ready} className={`eu-boxnow-open justify-self-start inline-flex items-center gap-2 rounded-full font-extrabold px-5 min-h-12 text-[length:var(--fs-15)] disabled:opacity-60 cursor-pointer ${value?.id ? "border-2 border-eu-line bg-white text-eu-ink hover:border-eu-blue" : "bg-eu-navy text-white hover:bg-eu-blue"}`}>
        <MapPin className="size-5" aria-hidden /> {!ready ? "Φόρτωση χάρτη…" : value?.id ? "Αλλαγή θυρίδας" : "Επιλογή θυρίδας στον χάρτη"}
      </button>
    </div>
  );
}
