import Image from "@/components/ui/Image";
import { pickAd, pickAdById } from "@/lib/promo/landing";
import { normalizeBannerDesign } from "@/lib/promo/banner-design";
import { bannerProducts, bannerSticker } from "@/lib/promo/banner-products";
import { DesignedBanner } from "./DesignedBanner";

/**
 * Διαφημιστική θέση της βιτρίνας. Αν δεν υπάρχει ενεργό banner για το σημείο (ή η προσφορά του έληξε), δεν αποδίδει τίποτα.
 * Ο σύνδεσμος περνά από /api/ad/<id> για μέτρηση κλικ.
 */
/** count=false: δεύτερο αντίγραφο της ίδιας θέσης (π.χ. άλλη διάταξη για κινητό) — δεν μετρά δεύτερη εμφάνιση. */
export async function AdSlot({ slot, id, category, className = "", count = true, bleed = false }: { slot: string; id?: string; category?: string | null; className?: string; count?: boolean; /** σε όλο το πλάτος της οθόνης, χωρίς στρογγυλές γωνίες (π.χ. header καμπάνιας) */ bleed?: boolean }) {
  const ad = await (id ? pickAdById(id, { count }) : pickAd(slot, { category, count })).catch(() => null);
  if (!ad) return null;
  // σχεδιασμένο banner: φόντο/κίνηση/κείμενα από το σχέδιο, προϊόντα με την τωρινή τιμή τους
  const design = normalizeBannerDesign(ad.design);
  if (!design && !ad.image) return null;
  const img = design ? <DesignedBanner d={design} products={await bannerProducts(design, ad.promotionId).catch(() => [])} shape={ad.slot === "info-aside" ? "square" : "wide"} sticker={await bannerSticker(design.stickerKey)} href={ad.href ? `/api/ad/${ad.id}` : null} /> : (
    <picture className="block">
      {ad.imageMobile && <source media="(max-width: 767px)" srcSet={ad.imageMobile} />}
      <Image src={ad.image!} alt={ad.alt ?? ad.title} width={1600} height={slot === "pdp-below-buybox" ? 600 : slot === "info-aside" ? 1600 : 300} sizes="(max-width: 1280px) 100vw, 1280px" className={`w-full h-auto ${bleed ? "" : "rounded-2xl"}`} unoptimized={ad.image!.startsWith("http")} />
    </picture>
  );
  return (
    <aside aria-label="Προωθητική ενέργεια" className={className}>
      {ad.href && design?.layout !== "posts" ? <a href={`/api/ad/${ad.id}`} aria-label={design ? ad.alt ?? ad.title : undefined} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-eu-blue">{img}</a> : img}
    </aside>
  );
}
