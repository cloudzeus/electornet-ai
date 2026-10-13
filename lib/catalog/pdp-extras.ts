import "server-only";
import { db } from "@/lib/db";
import { swrMap } from "@/lib/cache/swr";
import { onCatalogReset } from "@/lib/data/db-catalog";
import { setPartsForSite } from "@/lib/catalog/sets";
import { extEligibleMap, productWarranty } from "@/lib/warranty/server";

/**
 * Τα «extra» της σελίδας προϊόντος (set ειδών, εγγύηση κατασκευαστή, δωρεάν επέκταση, ρύθμιση AR) — ίδια για όλους τους
 * επισκέπτες· στη μνήμη 1′ ανά προϊόν (έως 3′), «παλιά» σε κάθε αλλαγή καταλόγου. Πριν: 4 ερωτήματα σε κάθε προβολή.
 */
type Extras = { setParts: Awaited<ReturnType<typeof setPartsForSite>> | null; maker: Awaited<ReturnType<typeof productWarranty>> | null; extOk: boolean; ar: Awaited<ReturnType<typeof db.productAr.findUnique>> };
const extrasCache = swrMap<Extras>(60_000, { maxStaleMs: 3 * 60_000, max: 600 });
onCatalogReset(extrasCache.invalidateAll);

export const pdpExtras = (productId: string, fromDb: boolean): Promise<Extras> =>
  extrasCache(productId, async () => {
    const [setParts, maker, extOk, ar] = await Promise.all([
      fromDb ? setPartsForSite(productId).catch(() => null) : null,
      fromDb ? productWarranty(productId).catch(() => null) : null,
      fromDb ? extEligibleMap([productId]).then((m) => m.get(productId) ?? false).catch(() => false) : false,
      db.productAr.findUnique({ where: { productId } }).catch(() => null),
    ]);
    return { setParts, maker, extOk, ar };
  });
