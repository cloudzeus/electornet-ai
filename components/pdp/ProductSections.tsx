import Image from "next/image";
import type { ReactNode } from "react";
import type { PublishedSection, SectionImage, SectionFeature } from "@/lib/catalog/banner-doc";

/**
 * «Από τον κατασκευαστή»: οι ενότητες που βγήκαν από τα banners, ως πραγματικό κείμενο και καθαρές φωτογραφίες.
 * Φωτογραφία και κείμενο δίπλα-δίπλα σε φαρδύ χώρο (εναλλάξ αριστερά / δεξιά), το ένα κάτω από το άλλο σε στενό.
 * Το ίδιο component αποδίδει και την προεπισκόπηση στο εργαλείο απόδελτίωσης — ό,τι βλέπει ο διαχειριστής, αυτό βλέπει ο πελάτης.
 */
/** `renderImage` / `renderIcon`: η προεπισκόπηση του εργαλείου δείχνει περικοπές της αρχικής εικόνας πριν γίνουν αρχεία. */
export function ProductSections({ sections, sizes = "(min-width: 1024px) 380px, 100vw", renderImage, renderIcon }: { sections: PublishedSection[]; sizes?: string; renderImage?: (im: SectionImage, variant: "main" | "more") => ReactNode; renderIcon?: (f: SectionFeature) => ReactNode }) {
  if (!sections.length) return null;
  const img = (im: SectionImage, variant: "main" | "more") => renderImage ? renderImage(im, variant) : <Image src={im.url} alt={im.alt} width={im.width} height={im.height} sizes={variant === "main" ? sizes : "(min-width: 1024px) 260px, 50vw"} className="w-full h-auto rounded-xl" />;
  return (
    <div className="@container grid gap-10">
      {sections.map((s, i) => {
        const [main, ...more] = s.images;
        const text = (
          <div className="grid gap-3 content-start min-w-0">
            {s.title && <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight text-balance">{s.title}</h3>}
            {s.subtitle && <p className="m-0 font-bold text-eu-ink-2 text-[length:var(--fs-17)] leading-snug">{s.subtitle}</p>}
            {s.body?.split(/\n{2,}/).map((p, k) => <p key={k} className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-[1.7]">{p}</p>)}
            {s.features.length > 0 && (
              <ul className="m-0 p-0 list-none grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))] mt-1">
                {s.features.map((f, k) => (
                  <li key={k} className="flex items-center gap-3 min-w-0">
                    {renderIcon && f.iconUrl ? renderIcon(f) : f.iconUrl ? (
                      <Image src={f.iconUrl} alt="" width={f.iconW ?? 48} height={f.iconH ?? 48} className="size-11 object-contain shrink-0" />
                    ) : (
                      <span className="size-2 rounded-full bg-eu-yellow shrink-0 ml-1" aria-hidden />
                    )}
                    <span className="text-eu-ink font-semibold text-[length:var(--fs-15)] leading-snug">{f.label}</span>
                  </li>
                ))}
              </ul>
            )}
            {s.footnote && <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)] leading-snug">{s.footnote}</p>}
          </div>
        );
        return (
          <section key={s.id} className="grid gap-4">
            {main ? (
              <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-5 @2xl:gap-8 items-center">
                <div className={i % 2 ? "@2xl:order-2" : ""}>
                  {img(main, "main")}
                </div>
                {text}
              </div>
            ) : (
              <div className="max-w-[78ch]">{text}</div>
            )}
            {more.length > 0 && (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
                {more.map((im, k) => <div key={k}>{img(im, "more")}</div>)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
