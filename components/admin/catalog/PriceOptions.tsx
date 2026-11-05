"use client";

/**
 * **Πώς βγαίνει η τιμή σε κάθε εισαγωγή προϊόντων** — τα ίδια τρία ερωτήματα, όπου κι αν έρχονται τα προϊόντα
 * (XML προμηθευτή, ξένο Excel): από πού ξεκινά η τιμή, αν το ποσό του αρχείου έχει ΦΠΑ, και αν μπαίνει markup.
 *
 * Ένα component, δύο οθόνες: οι επιλογές πρέπει να λένε το ίδιο πράγμα και να υπολογίζονται το ίδιο (`policyPrice`),
 * αλλιώς η ίδια τιμή βγαίνει αλλιώς ανά δρόμο εισαγωγής.
 */
export interface PriceOpts {
  priceMode: "cost" | "retail";
  vatIncluded: boolean;
  /** `null` = ό,τι λέει ο κανόνας τιμολόγησης της μάρκας / κατηγορίας */
  markupPercent: number | null;
}

/** Το προτεινόμενο ποσοστό όταν ο χρήστης ανοίγει το markup χωρίς να έχει γράψει νούμερο. */
const DEFAULT_PERCENT = 30;

export function PriceOptions({ value, onChange }: { value: PriceOpts; onChange: (v: PriceOpts) => void }) {
  const { priceMode, vatIncluded, markupPercent } = value;
  const on = markupPercent != null;
  return (
    <fieldset className="rounded-lg border border-eu-line-2 p-3 grid gap-2">
      <legend className="px-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Πώς βγαίνει η τιμή</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[length:var(--fs-14)]">
        <label className="inline-flex items-center gap-2 min-h-11"><input type="radio" name="price-mode" checked={priceMode === "cost"} onChange={() => onChange({ ...value, priceMode: "cost" })} className="size-5" /> Από το κόστος του αρχείου</label>
        <label className="inline-flex items-center gap-2 min-h-11"><input type="radio" name="price-mode" checked={priceMode === "retail"} onChange={() => onChange({ ...value, priceMode: "retail" })} className="size-5" /> Από τη λιανική του αρχείου</label>
      </div>
      <label className="inline-flex items-start gap-2 min-h-11 text-[length:var(--fs-14)]">
        <input type="checkbox" checked={vatIncluded} onChange={(e) => onChange({ ...value, vatIncluded: e.target.checked })} className="size-5 mt-0.5" />
        <span>Η τιμή του αρχείου <b>περιλαμβάνει ΦΠΑ</b><span className="block text-eu-muted text-[length:var(--fs-12)]">{priceMode === "cost" ? "Αν ναι, ο ΦΠΑ αφαιρείται από το κόστος πριν από το markup και ξαναμπαίνει στο τέλος." : "Αν όχι, προστίθεται ο ΦΠΑ του είδους στη λιανική."}</span></span>
      </label>
      <div className="grid gap-2">
        <label className="inline-flex items-start gap-2 min-h-11 text-[length:var(--fs-14)]">
          <input type="checkbox" checked={on} onChange={(e) => onChange({ ...value, markupPercent: e.target.checked ? DEFAULT_PERCENT : null })} className="size-5 mt-0.5" />
          <span>Να μπει <b>markup</b> που ορίζω εδώ<span className="block text-eu-muted text-[length:var(--fs-12)]">{on ? "Ισχύει για όλα τα προϊόντα αυτής της εισαγωγής και υπερισχύει των κανόνων τιμολόγησης." : "Χωρίς αυτό: στο κόστος μπαίνει ο κανόνας τιμολόγησης της μάρκας / κατηγορίας· στη λιανική κανένα markup."}</span></span>
        </label>
        {on && (
          <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)]">
            <span className="font-bold text-eu-ink">Ποσοστό</span>
            <input type="number" min={0} max={1000} step={0.5} inputMode="decimal" value={markupPercent ?? DEFAULT_PERCENT}
              onChange={(e) => { const n = Number(e.target.value); onChange({ ...value, markupPercent: Number.isFinite(n) && n >= 0 && n <= 1000 ? n : 0 }); }}
              className="w-24 min-h-11 rounded-lg border border-eu-line px-2 text-right tabular-nums" aria-label="Ποσοστό markup" />
            <span className="text-eu-muted">%</span>
          </label>
        )}
      </div>
    </fieldset>
  );
}
