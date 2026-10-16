/**
 * security.txt (RFC 9116): πού αναφέρει κανείς ένα κενό ασφαλείας. Από το domain του αιτήματος, ώστε να ισχύει και
 * μετά τη μετάβαση στο τελικό domain· η λήξη ανανεώνεται μόνη της (πάντα έναν χρόνο μπροστά).
 */
export function GET(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || u.host;
  const origin = `https://${host}`;
  const expires = new Date(Date.now() + 365 * 86400_000).toISOString();
  const body = [
    `Contact: ${origin}/epikoinonia`,
    `Expires: ${expires}`,
    "Preferred-Languages: el, en",
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
