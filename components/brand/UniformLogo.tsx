"use client";

import { useEffect, useRef, useState } from "react";
import { logoBox } from "@/lib/cms/logo-trim";

/**
 * Λογότυπο με ομοιόμορφο οπτικό βάρος όταν δεν ξέρουμε από πριν την αναλογία του (π.χ. λογότυπα καταλόγου):
 * τη μετρά μόλις φορτώσει (και αν είχε ήδη φορτώσει πριν το hydration). Ο χώρος του είναι σταθερός (ύψος κουτιού).
 */
export function UniformLogo({ src, alt, aspect: known, base = 2, className = "" }: { src: string; alt: string; aspect?: number; base?: number; className?: string }) {
  const [aspect, setAspect] = useState<number | undefined>(known);
  const ref = useRef<HTMLImageElement>(null);
  const read = (i: HTMLImageElement | null) => { if (!known && i?.complete && i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight); };
  useEffect(() => { const t = setTimeout(() => read(ref.current), 0); return () => clearTimeout(t); });
  const box = logoBox(aspect, base);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- λογότυπα SVG/PNG (βιβλιοθήκη ή hotlink Brandfetch)
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={(e) => read(e.currentTarget)}
      style={{ height: box.height, maxWidth: `min(${box.maxWidth}, 100%)`, opacity: aspect ? 1 : 0 }}
      className={`block w-auto object-contain ${className}`}
    />
  );
}
