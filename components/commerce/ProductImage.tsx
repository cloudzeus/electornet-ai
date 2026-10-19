import Image from "@/components/ui/Image";
import type { ReactNode } from "react";
import { cutoutFor } from "@/lib/data/cutouts";

/**
 * The one product-image frame. Every product photo on the site (card,
 * row, compare, cart, mini cart, guide, recently viewed, order lines)
 * renders through this: a square white frame with the same relative
 * inner padding, so photos of different shapes and sizes never move the
 * title, price or buttons next to them. Missing photos get a neutral
 * placeholder of the same size. Badges and buttons overlay via children.
 * v4: when a transparent cutout exists for the photo it is used instead,
 * floating with a soft shadow on a light field — same square box, so
 * nothing around it moves. `cutout={false}` keeps the plain photo.
 */
export function ProductImage({ src, alt = "", sizes = "320px", priority = false, className = "w-full", pad = "p-[9%]", rounded = "rounded-xl", frame = true, cutout = true, children }: { src?: string | null; alt?: string; sizes?: string; priority?: boolean; className?: string; pad?: string; rounded?: string; frame?: boolean; cutout?: boolean; children?: ReactNode }) {
  const cut = cutout ? cutoutFor(src) : null;
  return (
    <div className={`relative aspect-square shrink-0 overflow-hidden ${cut ? "eu-cutout-field" : "bg-white"} ${rounded} ${frame ? "border border-eu-line-2" : ""} ${className}`}>
      {src ? (
        <Image src={cut ?? src} alt={alt} fill sizes={sizes} priority={priority} className={`object-contain ${cut ? "p-[7%] eu-cutout-shadow" : pad}`} unoptimized={src.startsWith("http")} />
      ) : (
        <div className="absolute inset-0 bg-eu-placeholder text-eu-placeholder-ink font-semibold text-[length:var(--fs-14)] flex items-center justify-center text-center p-2" aria-hidden>
          φωτογραφία προϊόντος
        </div>
      )}
      {children}
    </div>
  );
}
