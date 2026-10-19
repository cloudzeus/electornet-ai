import Image from "@/components/ui/Image";
import type { Product } from "@/lib/data/types";
import { instalment, priceLong } from "@/lib/format";
import { ZoneBadge } from "@/components/site/ZoneBadge";

/** Zone 8 — what happens when «Αγορά με 1 κλικ» is pressed (static replica of the sheet, desktop/tablet only). */
export function QuickBuyExplainer({ product: p, zoneNo }: { product: Product; zoneNo?: number }) {
  return (
    <section className="relative bg-eu-surface-3 eu-container" aria-labelledby="qb-title">
      <ZoneBadge no={zoneNo} />
      <div className="eu-canvas eu-gutter py-8 grid grid-cols-1 @lg:grid-cols-[1fr_420px] gap-6 @lg:gap-[30px] items-center">
        <div>
          <div className="font-extrabold text-eu-red text-[length:var(--fs-13)] tracking-wide mb-2.5">Αγορά με 1 κλικ</div>
          <h2 id="qb-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-[1.15] tracking-[-0.02em] mb-3">
            Διεύθυνση, πληρωμή και δόσεις, σε ένα βήμα
          </h2>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] leading-[1.6] max-w-[44em]">
            Με λογαριασμό Euronics, το «Αγορά με 1 κλικ» ανοίγει ένα φύλλο με τη διεύθυνση, την κάρτα και τις δόσεις σου προσυμπληρωμένες. Βλέπεις το τελικό ποσό με μεταφορικά και ΦΠΑ, επιβεβαιώνεις με 3D Secure και τελείωσες. Διατηρείς το δικαίωμα υπαναχώρησης 14 ημερών.<strong>με</strong> μεταφορικά και ΦΠΑ, και ένα κουμπί με τη διατύπωση που απαιτεί η Οδηγία 2011/83/ΕΕ. Ο χρήστης δεν φεύγει από την αρχική, αλλά ούτε δεσμεύεται χωρίς να δει τι πληρώνει.
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-[var(--shadow-raised)]">
          <div className="flex justify-between items-center border-b border-eu-line-2 pb-3 mb-3.5">
            <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)]">Γρήγορη αγορά</span>
            <span className="font-semibold text-eu-muted-2 text-[length:var(--fs-14)]">Κλείσιμο ×</span>
          </div>
          <div className="flex gap-3 items-center mb-3.5">
            <div className="relative size-[52px] bg-eu-surface-2 rounded-md shrink-0">
              {p.image && <Image src={p.image} alt="" fill sizes="52px" className="object-contain" unoptimized />}
            </div>
            <div>
              <div className="font-bold text-eu-ink text-[length:var(--fs-14)]">
                {p.brand} {p.title}
              </div>
              <div className="font-semibold text-eu-blue text-[length:var(--fs-14)] mt-1">{priceLong(p.price)}</div>
            </div>
          </div>
          <div className="grid gap-1.5 mb-3">
            {["Παράδοση στη διεύθυνσή μου · Τρί 4/8", "Κάρτα •••• 4821", `12 άτοκες δόσεις × ${priceLong(instalment(p.price))}`].map((t) => (
              <div key={t} className="border border-eu-line rounded-md px-3 py-2.5 font-medium text-eu-ink-2 text-[length:var(--fs-14)] flex justify-between">
                {t} <span className="text-eu-muted-2">αλλαγή</span>
              </div>
            ))}
          </div>
          <div className="bg-eu-surface rounded-md p-3 font-medium text-eu-ink-2 text-[length:var(--fs-14)] leading-[1.6] mb-3">
            Προϊόν {priceLong(p.price)} · Μεταφορικά 0,00 € · ΦΠΑ 24% περιλαμβάνεται
            <br />
            <strong className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">Σύνολο {priceLong(p.price)}</strong>
          </div>
          <div className="rounded-full bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-15)] py-3.5">Πληρωμή {priceLong(p.price)} & ολοκλήρωση</div>
          <p className="m-0 mt-2.5 text-eu-muted text-[length:var(--fs-13)] leading-[1.5]">
            Χρεώνεται η κάρτα σου και η παραγγελία καταχωρείται αμέσως. Η τράπεζά σου θα ζητήσει επιβεβαίωση (3D Secure). Μπορείς να επιστρέψεις το προϊόν μέσα σε 14 ημέρες.
          </p>
        </div>
      </div>
    </section>
  );
}
