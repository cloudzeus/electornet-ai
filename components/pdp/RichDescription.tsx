import Image from "@/components/ui/Image";
import { ProductSections } from "./ProductSections";
import type { PublishedSection } from "@/lib/catalog/banner-doc";
import { parseBlocks, withoutRepeats } from "@/lib/catalog/description-blocks";

/**
 * Η περιγραφή του ERP ως τίτλοι + λίστες + παράγραφοι (lib/catalog/description-blocks.ts)· από κάτω οι ενότητες
 * του κατασκευαστή και όσα banners δεν έχουν απόδελτιωθεί.
 */
export interface Banner { url: string; width: number | null; height: number | null; alt: string | null; blur?: string | null }

export function RichDescription({ text, banners = [], sections = [] }: { text: string; banners?: Banner[]; sections?: PublishedSection[] }) {
  const blocks = withoutRepeats(parseBlocks(text), sections);
  return (
    <div className="grid gap-5">
      {blocks.map((b, i) => b.kind === "p" ? (
        <p key={i} className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-[1.75] max-w-[78ch]">{b.text}</p>
      ) : (
        <div key={i}>
          {b.title && <h3 className="m-0 mb-2 font-bold text-eu-ink text-[length:var(--fs-17)]">{b.title}</h3>}
          <ul className="m-0 p-0 list-none grid gap-x-6 gap-y-1.5 grid-cols-2 @2xl:[grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
            {b.items.map((it) => <li key={it} className="flex gap-2 text-eu-ink-2 text-[length:var(--fs-15)] leading-snug"><span className="mt-[0.55em] size-1.5 rounded-full bg-eu-yellow shrink-0" aria-hidden />{it}</li>)}
          </ul>
        </div>
      ))}
      {sections.length > 0 && <div className={blocks.length ? "mt-4 pt-8 border-t border-eu-line" : ""}><ProductSections sections={sections} /></div>}
      {banners.length > 0 && (
        <div className="grid gap-3 mt-2">
          {banners.map((b) => b.width && b.height ? (
            <Image key={b.url} src={b.url} alt={b.alt ?? ""} width={b.width} height={b.height} sizes="(min-width: 1024px) 760px, 100vw" placeholder={b.blur ? "blur" : "empty"} blurDataURL={b.blur ?? undefined} className="w-full h-auto rounded-xl" />
          ) : null)}
        </div>
      )}
    </div>
  );
}
