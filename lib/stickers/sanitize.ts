import type { StickerArt } from "./art";

/**
 * Καθαρισμός SVG που ανεβάζει χρήστης, πριν μπει μέσα στη σελίδα (inline): φεύγουν scripts, foreignObject, iframes,
 * γεγονότα (`on…`), εξωτερικοί σύνδεσμοι (επιτρέπονται μόνο `#τοπικά` και `data:image/png|jpeg|webp|gif`), DOCTYPE / ENTITY
 * και `style` με εξωτερικό `url(...)`/`@import`. Καθαρή συνάρτηση — τρέχει και στον server (ανέβασμα) και στο render.
 */
export const MAX_SVG_BYTES = 300 * 1024;
const BAD_TAGS = /<\s*(script|foreignObject|iframe|object|embed|audio|video|canvas|meta|link|base|form|input|button|textarea|animate|set|handler|listener)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|\/>)/gi;
const BAD_SINGLE = /<\s*\/?\s*(script|foreignObject|iframe|object|embed|meta|link|base|form|input|button|textarea|animate|set)\b[^>]*>/gi;

export function sanitizeSvgBody(body: string): string {
  return body
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!ENTITY[\s\S]*?>/gi, "").replace(/<\?[\s\S]*?\?>/g, "")
    .replace(BAD_TAGS, "").replace(BAD_SINGLE, "")
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _q, a, b) => { const v = (a ?? b ?? "").trim(); return v.startsWith("#") || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v) ? m : ""; })
    .replace(/(javascript|vbscript)\s*:/gi, "")
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*expression\([^"]*"|'[^']*expression\([^']*')/gi, "");
}

/** SVG αρχείο → artwork sticker (χρώματα όπως ανέβηκαν, περιοχή κειμένου στο κέντρο). */
export function svgToArt(svg: string, name: string): StickerArt {
  if (Buffer.byteLength(svg, "utf8") > MAX_SVG_BYTES) throw new Error(`Το SVG είναι μεγαλύτερο από ${MAX_SVG_BYTES / 1024} KB.`);
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg\s*>/i.exec(svg);
  if (!m) throw new Error("Δεν είναι έγκυρο SVG (λείπει το <svg>…</svg>).");
  const attrs = m[1];
  const num = (k: string) => { const r = new RegExp(`\\b${k}\\s*=\\s*["']\\s*([\\d.]+)`, "i").exec(attrs); return r ? Number(r[1]) : null; };
  const vb = /\bviewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(attrs);
  const x = vb ? Number(vb[1]) : 0, y = vb ? Number(vb[2]) : 0;
  const w = vb ? Number(vb[3]) : num("width") ?? 200, h = vb ? Number(vb[4]) : num("height") ?? 200;
  if (!(w > 0 && h > 0)) throw new Error("Το SVG δεν έχει διαστάσεις (viewBox ή width/height).");
  let body = sanitizeSvgBody(m[2]).trim();
  if (!body) throw new Error("Το SVG είναι κενό μετά τον καθαρισμό.");
  if (x || y) body = `<g transform="translate(${-x} ${-y})">${body}</g>`;
  return { id: "upload", name: name.slice(0, 80), w, h, body, recolor: false, text: { x: w * 0.15, y: h * 0.2, w: w * 0.7, h: h * 0.6 } };
}
