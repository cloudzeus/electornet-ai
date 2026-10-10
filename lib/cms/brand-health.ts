import "server-only";
import { resolveBlocks } from "./blocks-render";
import { blockActive, type BrandBlock, type BrandStore } from "./brand-store";
import { blkKey } from "./brand-diff";
import { pickAd, pickAdById } from "@/lib/promo/landing";
import type { HomeHealth } from "./home-health";

/**
 * «Υγεία» μιας σελίδας μάρκας για τον editor: ποια components βγαίνουν κενά τώρα (άρα δεν φαίνονται, αν και είναι
 * ενεργά) και τι να ελεγχθεί πριν τη δημοσίευση — ίδια μορφή με της αρχικής.
 */
export async function brandHealth(s: BrandStore): Promise<HomeHealth> {
  const now = new Date();
  const live = s.blocks.filter((b) => blockActive(b, now));
  const d = await resolveBlocks(live, { brandSlug: s.slug, extraProductIds: [s.hero.productId] }).catch(() => null);
  const empty: Record<string, string> = {};
  const has = (ids: string[] | undefined) => !!d && (ids ?? []).some((id) => d.products[id]);
  if (d) await Promise.all(live.map(async (b: BrandBlock) => {
    const k = blkKey(b.id);
    switch (b.type) {
      case "new-arrivals": case "offers": if (!has(b.productIds)) empty[k] = "Κανένα από τα προϊόντα του δεν είναι ενεργό — διάλεξε άλλα."; break;
      case "series": if (!b.items.some((it) => has(it.productIds))) empty[k] = "Καμία σειρά δεν έχει ενεργά προϊόντα."; break;
      case "products-auto": if (!d.auto[b.id]?.length) empty[k] = "Ο κατάλογος δεν δίνει προϊόντα με αυτά τα κριτήρια τώρα (π.χ. καμία προσφορά της μάρκας)."; break;
      case "categories": if (!d.tiles[b.id]?.length) empty[k] = "Δεν βρέθηκαν κατηγορίες με προϊόντα της μάρκας."; break;
      case "promo-products": case "countdown": if (!d.promo[b.id]?.productIds.length) empty[k] = b.promotionId ? "Η προσφορά έληξε ή δεν έχει προϊόντα." : "Δεν έχει επιλεγεί προσφορά."; break;
      case "promo-landing": if (!d.landing[b.id]) empty[k] = b.landingId ? "Η σελίδα προσφοράς δεν είναι πια ενεργή." : "Δεν έχει επιλεγεί σελίδα προσφοράς."; break;
      case "coupon": if (!d.coupon[b.id]) empty[k] = b.code ? "Το κουπόνι δεν ισχύει πια." : "Δεν έχει οριστεί κουπόνι."; break;
      case "deal-hero": if (!d.deal[b.id] || !d.products[d.deal[b.id]!.productId]) empty[k] = "Δεν υπάρχει ενεργό προϊόν για την «Προσφορά ημέρας»."; break;
      case "promo-grid": if (!d.landings[b.id]?.length) empty[k] = "Δεν υπάρχουν ενεργές σελίδες προσφορών."; break;
      case "ad": {
        const ad = b.mode === "placement" ? (b.placementId ? await pickAdById(b.placementId, { count: false }).catch(() => null) : null) : await pickAd(b.slot ?? "info-top", { count: false }).catch(() => null);
        if (!ad?.image) empty[k] = b.mode === "placement" && !b.placementId ? "Δεν έχει επιλεγεί διαφήμιση." : "Δεν υπάρχει ενεργό banner αυτή τη στιγμή.";
        break;
      }
    }
  }));

  const issues: { key: string; msg: string }[] = [];
  if (s.hero.productId) {
    // ίδια αναζήτηση με τη σελίδα (κατάλογος της βάσης ή προϊόντα επίδειξης)
    const p = d ? d.products[s.hero.productId] : null;
    if (d && !p) issues.push({ key: "part:hero", msg: "Το προϊόν του Hero δεν είναι πια ενεργό — διάλεξε άλλο." });
    else if (p && p.availability.kind === "order") issues.push({ key: "part:hero", msg: `Το προϊόν του Hero («${p.title}») δεν έχει απόθεμα — διατίθεται μόνο κατόπιν παραγγελίας.` });
  }
  for (const b of s.blocks) {
    if (b.enabled !== false && b.schedule?.to && new Date(b.schedule.to) < now) issues.push({ key: blkKey(b.id), msg: `Component «${b.title || b.type}»: η ημερομηνία λήξης πέρασε — δεν φαίνεται.` });
  }
  return { empty, issues };
}
