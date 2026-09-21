"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { ViewTransition } from "react";
import type { Product } from "@/lib/data/types";
import { EnergyChip } from "@/components/commerce/EnergyChip";
import { ProductImage } from "@/components/commerce/ProductImage";
import { cutoutFor } from "@/lib/data/cutouts";
import { Tilt } from "@/components/motion/Tilt";
import { copyOf } from "@/lib/cms/copy";
import { ZoomImage } from "./ZoomImage";

const c = copyOf("gallery");

/**
 * Main image with thumbnails; swipe rail on phones; badge and energy chip
 * overlaid. v4: the first photo is the transparent cutout on a soft light
 * field (the same element the card morphs from — View Transition
 * `product-<id>`), it tilts with the pointer; extra photos stay framed.
 * `actions` renders under the image (AR button, fit badge).
 */
export function Gallery({
  productId,
  images,
  title,
  badge,
  energy,
  actions,
}: {
  productId: string;
  images: string[];
  title: string;
  badge?: Product["badge"];
  energy?: Product["energy"];
  actions?: ReactNode;
}) {
  const [i, setI] = useState(0);
  const src = images[i];
  const cutout = i === 0 ? cutoutFor(src) : null;
  return (
    <div className="grid gap-3">
      <div
        className={`grid grid-cols-1 gap-3 ${images.length > 1 ? "@md:grid-cols-[72px_minmax(0,1fr)]" : ""}`}
      >
        {images.length > 1 && (
          <ul className="m-0 p-0 list-none flex flex-wrap @md:flex-col gap-2 order-2 @md:order-1">
            {images.map((im, k) => (
              <li key={im} className="shrink-0">
                <button
                  type="button"
                  aria-label={`Εικόνα ${k + 1}`}
                  aria-pressed={k === i}
                  onClick={() => setI(k)}
                  className={`block rounded-lg border-2 transition-colors ${k === i ? "border-eu-blue" : "border-transparent hover:border-eu-line"}`}
                >
                  <ProductImage
                    src={im}
                    sizes="64px"
                    className="size-16"
                    rounded="rounded-md"
                    frame={false}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Tilt max={3} scale={1} className="order-1 @md:order-2 min-w-0">
          <div
            className={`relative aspect-square rounded-2xl border border-eu-line-2 overflow-hidden ${cutout ? "eu-cutout-field" : "bg-white"}`}
          >
            <span
              className="eu-rays"
              style={{
                width: "120%",
                left: "-10%",
                top: "-10%",
                opacity: cutout ? 0.5 : 0,
              }}
              aria-hidden
            />
            <ViewTransition name={`product-${productId}`}>
              <div data-tilt-layer className="absolute inset-0">
                {src ? (
                  cutout ? (
                    <Image key={src} src={cutout} alt={title} fill priority sizes="(max-width: 1024px) 100vw, 60vw" className="object-contain p-[7%] eu-cutout-shadow eu-float" />
                  ) : (
                    <ZoomImage images={images} index={i} onIndex={setI} alt={title} priority className="object-contain p-[9%]" />
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-eu-placeholder-ink font-semibold">
                    {c.fotografia_proiontos}
                  </div>
                )}
              </div>
            </ViewTransition>
            {badge?.kind === "discount" && (
              <span className="absolute top-3 left-3 bg-eu-red text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5 rounded-md eu-shimmer">
                {c.prosfora}
              </span>
            )}
            {badge?.kind === "new" && (
              <span className="absolute top-3 left-3 bg-eu-blue text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5 rounded-md">
                {c.neo}
              </span>
            )}
            {badge?.kind === "renew" && (
              <span className="absolute top-3 left-3 bg-eu-green text-white font-extrabold text-[length:var(--fs-14)] px-3 py-1.5 rounded-md">
                Renew · Grade {badge.grade}
              </span>
            )}
            {energy && (
              <div className="absolute bottom-3 left-3 flex gap-1.5">
                <EnergyChip cls={energy.cls} fiche={energy.fiche} />
              </div>
            )}
          </div>
        </Tilt>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
