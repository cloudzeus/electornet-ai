import "server-only";
import type { BrandStore } from "./brand-store";
import type { PlanTarget } from "./doc-plans";

/** Σενάρια, έγκριση, ιστορικό και σύνδεσμος προεπισκόπησης μιας σελίδας μάρκας (CmsDocument «brand.stores»/<slug>). */
export const brandTarget = (slug: string): PlanTarget<BrandStore> => ({
  collection: "brand.stores", key: slug, plansCollection: "brand.stores.plans", plansKey: slug,
  publishAction: "cms.brandstore.publish", entityId: `brand.stores/${slug}`, normalize: (x) => x as BrandStore, scope: `brand:${slug}`,
});
