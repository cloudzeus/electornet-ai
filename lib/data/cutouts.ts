import { CUTOUTS } from "./cutouts.generated";

/**
 * @dynamic Cutout (transparent) product photo for a catalogue image.
 * Demo: generated offline with rembg into public/img/cutouts/<basename>.webp
 * and listed in a build-time manifest. Production: the PIM/DAM stores a
 * cutout rendition per SKU (Icecat/manufacturer packshots are usually
 * delivered on white; the DAM produces the alpha version once).
 */
export function cutoutFor(image?: string | null): string | null {
  if (!image || image.startsWith("http")) return null;
  const base = image.split("/").pop()?.replace(/\.(jpe?g|png|webp)$/i, "");
  return base && CUTOUTS.has(base) ? `/img/cutouts/${base}.webp` : null;
}
