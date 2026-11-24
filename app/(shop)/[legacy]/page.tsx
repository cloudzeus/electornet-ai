import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { legacyTarget } from "@/lib/seo/legacy-urls";

/**
 * Διευθύνσεις του παλιού site (ένα τμήμα στη ρίζα): μόνιμη ανακατεύθυνση στη νέα σελίδα, ώστε τα αποτελέσματα της Google
 * να μη βγάζουν 404 και η κατάταξη να περάσει στο νέο URL. Οι κανονικές διαδρομές (/proion, /k, …) προηγούνται· ό,τι δεν
 * είναι στον χάρτη μένει 404.
 */
export default async function LegacyUrl({ params }: { params: Promise<{ legacy: string }> }) {
  const hit = legacyTarget((await params).legacy);
  if (!hit) notFound();
  if ("path" in hit) permanentRedirect(hit.path);
  const p = await db.product.findUnique({ where: { erpCode: hit.erpCode }, select: { slug: true } });
  if (!p) notFound();
  permanentRedirect(`/proion/${encodeURIComponent(p.slug)}`);
}
