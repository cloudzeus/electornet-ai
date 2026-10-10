import type { ProductAr } from "@prisma/client";
import type { Product } from "@/lib/data/types";
import type { ArRowData } from "@/app/admin/(shell)/ar/ArRow";
import { cutoutFor } from "@/lib/data/cutouts";
import { profileFor } from "./placement";
import { arPlan, productDims, type ArCats } from "./plan";

/** Η γραμμή AR της διαχείρισης για ένα προϊόν — ίδια στη σελίδα AR και στην καρτέλα «Διαστάσεις · AR · EPREL» του προϊόντος. */
export function arRowDataFor(pr: Product, s: ProductAr | null, cats?: ArCats | null): ArRowData {
  const dims = productDims(pr);
  const plan = arPlan(pr, s, cats);
  const prof = profileFor(pr);
  return {
    id: pr.id, slug: pr.slug, brand: pr.brand, title: pr.title, image: pr.image ?? null, cutout: cutoutFor(pr.image),
    dims: dims ? { w: dims.w, h: dims.h, d: dims.d, source: dims.source } : null,
    plan: { on: plan.on, reason: plan.reason ?? null, fix: plan.fix ?? null, surface: plan.surface, tv: plan.archetype === "tv", dims: plan.on && plan.dims ? { w: plan.dims.w, h: plan.dims.h, d: plan.dims.d } : null },
    enabled: plan.on, explicit: !!s, glbUrl: s?.glbUrl ?? null, usdzUrl: s?.usdzUrl ?? null, fitToDims: s?.fitToDims ?? true,
    modelBox: (s?.modelBox as { w: number; h: number; d: number } | null) ?? null,
    glbLightUrl: s?.glbLightUrl ?? null, source: s?.source ?? null, rotationY: s?.rotationY ?? 0, fitMode: s?.fitMode ?? "box", placement: s?.placement ?? null, frontImage: s?.frontImage ?? null, autoPlacement: prof.surface, autoHint: prof.hint,
    images: [...new Set([pr.image, ...(pr.images ?? []), cutoutFor(pr.image)].filter((x): x is string => !!x))],
  };
}
