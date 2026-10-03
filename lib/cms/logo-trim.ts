/**
 * Αυτόματη περικοπή λογοτύπου (τρέχει στον browser): αφαιρεί το κενό περιθώριο και το λευκό/διαφανές «φόντο-καμβά»,
 * ώστε όλα τα λογότυπα να μετρούν μόνο το σχέδιο τους και να εμφανίζονται με ίδιο οπτικό βάρος (βλ. logoBox).
 *  · SVG: υπολογίζει το πραγματικό πλαίσιο του σχεδίου (getBBox), βγάζει το ορθογώνιο φόντου που καλύπτει όλο τον
 *    καμβά, βάζει viewBox = σχέδιο + μικρό περιθώριο. Καθαρίζει scripts/handlers.
 *  · PNG/JPG/WebP: κόβει τα pixels που είναι διαφανή ή σχεδόν λευκά γύρω από το σχέδιο.
 */
export type TrimResult = { blob: Blob; ext: "svg" | "png"; aspect: number; before: { w: number; h: number }; after: { w: number; h: number }; removedBackground: boolean };

const WHITE = /^(#fff(f{3})?|white|#fefefe|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/i;
const PAD = 0.02;

export function trimSvg(text: string): TrimResult {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") throw new Error("Το αρχείο δεν είναι έγκυρο SVG.");
  // ασφάλεια: χωρίς scripts, foreignObject, on* handlers, εξωτερικά href
  svg.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
  svg.querySelectorAll("*").forEach((el) => { for (const a of [...el.attributes]) if (/^on/i.test(a.name) || ((a.name === "href" || a.name === "xlink:href") && /^\s*(javascript|https?):/i.test(a.value))) el.removeAttribute(a.name); });

  const vb0 = svg.viewBox?.baseVal && svg.getAttribute("viewBox") ? svg.viewBox.baseVal : null;
  const w0 = vb0?.width || parseFloat(svg.getAttribute("width") ?? "") || 100;
  const h0 = vb0?.height || parseFloat(svg.getAttribute("height") ?? "") || 100;

  // μέτρηση στο DOM της σελίδας (εκτός οθόνης)
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:1000px;height:1000px;visibility:hidden";
  const live = document.importNode(svg, true) as unknown as SVGSVGElement;
  if (!live.getAttribute("viewBox")) live.setAttribute("viewBox", `0 0 ${w0} ${h0}`);
  live.setAttribute("width", "1000"); live.setAttribute("height", "1000");
  host.appendChild(live);
  document.body.appendChild(host);
  let removedBackground = false;
  try {
    const area = w0 * h0;
    // φόντο-καμβάς: σχήμα με λευκό/κανένα γέμισμα που καλύπτει ≥ 90% του καμβά
    for (const el of [...live.querySelectorAll("rect, path, polygon")] as SVGGraphicsElement[]) {
      const fill = (el.getAttribute("fill") ?? el.style.fill ?? "").trim();
      if (!WHITE.test(fill) && fill !== "none") continue;
      const b = el.getBBox();
      if (b.width * b.height >= area * 0.9) {
        const idx = [...live.querySelectorAll("*")].indexOf(el);
        const orig = [...svg.querySelectorAll("*")][idx];
        el.remove(); orig?.remove();
        removedBackground = true;
      }
    }
    const g = live.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
    while (live.firstChild) g.appendChild(live.firstChild);
    live.appendChild(g);
    const b = g.getBBox();
    if (!b.width || !b.height) throw new Error("Το SVG δεν έχει ορατό σχέδιο.");
    const p = Math.max(b.width, b.height) * PAD;
    const vb = [b.x - p, b.y - p, b.width + 2 * p, b.height + 2 * p].map((n) => Math.round(n * 1000) / 1000);
    svg.setAttribute("viewBox", vb.join(" "));
    svg.setAttribute("width", String(vb[2]));
    svg.setAttribute("height", String(vb[3]));
    svg.removeAttribute("style");
    const out = new XMLSerializer().serializeToString(svg);
    return { blob: new Blob([out], { type: "image/svg+xml" }), ext: "svg", aspect: vb[2] / vb[3], before: { w: w0, h: h0 }, after: { w: vb[2], h: vb[3] }, removedBackground };
  } finally {
    host.remove();
  }
}

export async function trimRaster(dataUrl: string): Promise<TrimResult> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  const hasAlpha = (() => { for (let i = 3; i < data.length; i += 16) if (data[i] < 250) return true; return false; })();
  const bg = (i: number) => (hasAlpha ? data[i + 3] < 12 : data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; if (!bg(i)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) throw new Error("Η εικόνα δεν έχει ορατό σχέδιο.");
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const p = Math.round(Math.max(bw, bh) * PAD);
  const out = document.createElement("canvas");
  out.width = bw + 2 * p; out.height = bh + 2 * p;
  const o = out.getContext("2d")!;
  o.drawImage(c, x0, y0, bw, bh, p, p, bw, bh);
  // χωρίς διαφάνεια: το λευκό φόντο γίνεται διαφανές, για να ταιριάζει σε κάθε χρώμα σελίδας
  if (!hasAlpha) {
    const d = o.getImageData(0, 0, out.width, out.height);
    for (let i = 0; i < d.data.length; i += 4) if (d.data[i] > 245 && d.data[i + 1] > 245 && d.data[i + 2] > 245) d.data[i + 3] = 0;
    o.putImageData(d, 0, 0);
  }
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
  return { blob, ext: "png", aspect: out.width / out.height, before: { w: width, h: height }, after: { w: out.width, h: out.height }, removedBackground: !hasAlpha };
}

/**
 * Ομοιόμορφο μέγεθος λογοτύπων: ίδιο οπτικό «εμβαδόν» για όλα — ένα φαρδύ wordmark γίνεται χαμηλότερο,
 * ένα τετράγωνο σήμα ψηλότερο. base = ύψος (rem) για λογότυπο αναλογίας 3:1.
 */
export function logoBox(aspect: number | undefined, base = 2.5): { height: string; maxWidth: string } {
  const a = aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : 3;
  const h = Math.min(base * 1.75, Math.max(base * 0.62, base / Math.sqrt(a / 3)));
  return { height: `${Math.round(h * 100) / 100}rem`, maxWidth: `${Math.round(h * a * 100) / 100}rem` };
}
