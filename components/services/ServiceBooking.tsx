"use client";

import { useId, useState } from "react";
import { priceLong } from "@/lib/format";
import { AddressAutocomplete } from "@/components/site/AddressAutocomplete";
import type { AddressSuggestion } from "@/lib/geo/suggest";

/**
 * Κράτηση υπηρεσίας (εγκατάσταση, service, συμβουλή). Πεδία με ορατές
 * ετικέτες, σωστούς τύπους για το πληκτρολόγιο του κινητού, και διεύθυνση με
 * προτάσεις όσο γράφει ο πελάτης — από εκεί βγαίνει το κοντινότερο κατάστημα.
 * Η υποβολή είναι ακόμη επίδειξης: δεν αποθηκεύεται πουθενά.
 */
export function ServiceBooking({ service }: { service: { slug: string; title: string; priceFrom?: number } }) {
  const id = useId();
  const [done, setDone] = useState(false);
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<AddressSuggestion | null>(null);
  const input = "rounded-md border border-eu-line bg-white text-eu-ink px-3 py-2.5 min-h-11 text-[length:var(--fs-15)] w-full";
  const label = "font-bold text-eu-on-dark text-[length:var(--fs-14)]";
  if (done)
    return (
      <div className="bg-eu-green/10 border border-eu-green/30 rounded-xl p-4 text-[length:var(--fs-15)] text-eu-ink-2">
        <div className="font-extrabold text-eu-ink mb-1">Το αίτημα καταχωρήθηκε</div>
        Το κατάστημα της περιοχής σου{place?.city ? ` (${place.city})` : ""} θα σε καλέσει εντός 24 ωρών για ραντεβού.
      </div>
    );
  return (
    <form onSubmit={(e) => { e.preventDefault(); setDone(true); }} className="bg-eu-navy text-white rounded-xl p-5 grid gap-3" aria-labelledby={`${id}-title`}>
      <div>
        <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide">Κράτηση</div>
        <div id={`${id}-title`} className="font-bold text-[length:var(--fs-17)]">{service.title}</div>
        {service.priceFrom && <div className="text-eu-on-dark text-[length:var(--fs-14)]">από {priceLong(service.priceFrom)} · η τελική τιμή επιβεβαιώνεται τηλεφωνικά</div>}
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-name`} className={label}>Ονοματεπώνυμο <span aria-hidden>*</span></label>
        <input id={`${id}-name`} name="name" required autoComplete="name" placeholder="π.χ. Μαρία Παπαδοπούλου" className={input} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-phone`} className={label}>Κινητό <span aria-hidden>*</span></label>
        <input id={`${id}-phone`} name="phone" required type="tel" inputMode="tel" autoComplete="tel" pattern="[0-9+ ]{10,16}" placeholder="69Χ ΧΧΧ ΧΧΧΧ" className={input} />
      </div>
      <AddressAutocomplete label="Διεύθυνση" required dark value={address} onChange={(v) => { setAddress(v); setPlace(null); }} onSelect={setPlace} placeholder="Οδός και αριθμός, Τ.Κ. ή πόλη" />
      {place?.lat != null && <input type="hidden" name="lat" value={place.lat} />}
      {place?.lng != null && <input type="hidden" name="lng" value={place.lng} />}
      <button type="submit" className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] py-3 min-h-11 hover:bg-eu-yellow-dark">
        Κλείσε ραντεβού
      </button>
      <p className="m-0 text-eu-on-dark-2 text-[length:var(--fs-13)]">Τα στοιχεία χρησιμοποιούνται μόνο για να σε καλέσει το κατάστημα της περιοχής σου.</p>
    </form>
  );
}
