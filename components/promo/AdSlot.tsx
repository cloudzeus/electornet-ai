import Image from "next/image";
import { pickAd, pickAdById } from "@/lib/promo/landing";

/**
 * Διαφημιστική θέση της βιτρίνας. Αν δεν υπάρχει ενεργό banner για το σημείο (ή η προσφορά του έληξε), δεν αποδίδει τίποτα.
 * Ο σύνδεσμος περνά από /api/ad/<id> για μέτρηση κλικ.
 */
/** count=false: δεύτερο αντίγραφο της ίδιας θέσης (π.χ. άλλη διάταξη για κινητό) — δεν μετρά δεύτερη εμφάνιση. */
export async function AdSlot({ slot, id, category, className = "", count = true }: { slot: string; id?: string; category?: string | null; className?: string; count?: boolean }) {
  const ad = await (id ? pickAdById(id, { count }) : pickAd(slot, { category, count })).catch(() => null);
  if (!ad?.image) return null;
  const img = (
    <picture className="block">
      {ad.imageMobile && <source media="(max-width: 767px)" srcSet={ad.imageMobile} />}
      <Image src={ad.image} alt={ad.alt ?? ad.title} width={1600} height={slot === "pdp-below-buybox" ? 600 : slot === "info-aside" ? 1600 : 300} sizes="(max-width: 1280px) 100vw, 1280px" className="w-full h-auto rounded-2xl" unoptimized={ad.image.startsWith("http")} />
    </picture>
  );
  return (
    <aside aria-label="Προωθητική ενέργεια" className={className}>
      {ad.href ? <a href={`/api/ad/${ad.id}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-eu-blue">{img}</a> : img}
    </aside>
  );
}
