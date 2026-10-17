import { db } from "@/lib/db";
import { renderForWeb } from "@/lib/newsletter/dispatch";

/**
 * «Προβολή στον browser»: το HTML του email όπως στάλθηκε, ως ολόκληρη σελίδα (route και όχι page, ώστε το
 * κέλυφος του shop να μην μπερδευτεί με το δικό του <html>). Μόνο newsletters που έχουν ήδη προγραμματιστεί ή σταλεί·
 * χωρίς προσωπικά δεδομένα, χωρίς ευρετηρίαση, με αυστηρό CSP (μόνο εικόνες και inline στυλ).
 */
const VISIBLE = ["scheduled", "sending", "sent", "paused"];

const notFound = () => new Response("Δεν βρέθηκε.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 64) return notFound();
  const n = await db.newsletter.findUnique({ where: { id }, select: { id: true, subject: true, preheader: true, blocks: true, status: true, promotionId: true, campaignId: true } });
  if (!n || !VISIBLE.includes(n.status)) return notFound();
  const html = await renderForWeb(n);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    },
  });
}
