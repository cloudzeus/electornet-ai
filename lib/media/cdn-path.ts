/**
 * Διεύθυνση CDN → σχετική διαδρομή στο storage. Χρειάζεται όταν φτιάχνουμε ένα δεύτερο αρχείο ΔΙΠΛΑ σε υπάρχον
 * (π.χ. τη μικρογραφία email `*.email.jpg`) και έχουμε μόνο τη δημόσια διεύθυνσή του.
 * `https://cdn.…/euronics/products/x/y-01.webp` με basePath `/euronics` → `products/x/y-01.webp`.
 */
export function relOfCdnUrl(url: string, cdnUrl: string, basePath: string): string {
  if (!cdnUrl || !url.startsWith(`${cdnUrl}/`)) throw new Error("η εικόνα δεν είναι στο CDN μας");
  let rel = decodeURI(url.slice(cdnUrl.length));
  const base = basePath.replace(/\/$/, "");
  if (base && rel.startsWith(`${base}/`)) rel = rel.slice(base.length);
  return rel.replace(/^\/+/, "");
}

/** `…/y-01.webp` → `…/y-01.email.jpg` (ίδια σύμβαση σε CDN και τοπικά αρχεία). */
export const emailThumbPath = (p: string) => p.replace(/\.[^./]+$/, "") + ".email.jpg";
