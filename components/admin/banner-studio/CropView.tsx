import type { Box } from "@/lib/catalog/banner-doc";

/**
 * Προεπισκόπηση ενός πλαισίου της αρχικής εικόνας χωρίς κόψιμο στον server: η εικόνα ως φόντο, μεγεθυμένη και
 * μετατοπισμένη ώστε να φαίνεται μόνο το πλαίσιο. Ίδιες αναλογίες με το τελικό WebP.
 */
export function CropView({ src, box, width, height, className = "", alt = "" }: { src: string; box: Box; width: number; height: number; className?: string; alt?: string }) {
  const [x, y, w, h] = box;
  const ratio = (w * width) / Math.max(1, h * height);
  const pos = (v: number, s: number) => (s >= 0.999 ? 0 : (v / (1 - s)) * 100);
  return (
    <div
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      className={`bg-no-repeat bg-white ${className}`}
      style={{ aspectRatio: String(ratio), backgroundImage: `url("${src}")`, backgroundSize: `${100 / w}% ${100 / h}%`, backgroundPosition: `${pos(x, w)}% ${pos(y, h)}%` }}
    />
  );
}
