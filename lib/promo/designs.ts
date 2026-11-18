import "server-only";
import { db } from "@/lib/db";
import { BANNER_TEMPLATES, DEFAULT_BANNER_DESIGN, applyLook, normalizeBannerDesign, type BannerDesign } from "./banner-design";

/**
 * Το σχέδιο πίσω από ένα κλειδί της ζώνης «Προϊόντα προσφοράς»: «b:<id>» = το σχέδιο ενός banner που υπάρχει,
 * «t:<κλειδί>» = έτοιμο πρότυπο. Άγνωστο κλειδί ή banner χωρίς σχέδιο → null (η ζώνη δείχνει απλές κάρτες).
 */
export async function designByKey(key: string | undefined | null): Promise<BannerDesign | null> {
  if (!key) return null;
  if (key.startsWith("t:")) { const t = BANNER_TEMPLATES.find((x) => x.key === key.slice(2)); return t ? applyLook(DEFAULT_BANNER_DESIGN, t.look) : null; }
  if (key.startsWith("b:")) { const a = await db.adPlacement.findUnique({ where: { id: key.slice(2) }, select: { design: true } }).catch(() => null); return a ? normalizeBannerDesign(a.design) : null; }
  return null;
}
