import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { priceShort } from "@/lib/format";
import { CompareCheckbox } from "@/components/commerce/WishlistButton";
import { attributesOf } from "@/lib/data/attributes";
import { CompareStacked } from "@/components/catalog/CompareStacked";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("compareSimilar");

/**
 * In-page comparison: this product against up to three similar ones,
 * on the specs they share. Differences are highlighted. Any of them can
 * be pushed to the full compare page.
 */
export function CompareSimilar({ product: p, similar }: { product: Product; similar: Product[] }) {
  const all = [p, ...similar.slice(0, 3)];
  const attrs = new Map(all.map((x) => [x.id, attributesOf(x).filter((a) => !["Μάρκα", "Ενεργειακή κλάση"].includes(a.key))]));
  const keys = [...new Set(all.flatMap((x) => attrs.get(x.id)!.map((a) => a.key)))].filter((k) => all.filter((x) => attrs.get(x.id)!.some((a) => a.key === k)).length >= 2).slice(0, 10);
  const val = (x: Product, k: string) => attrs.get(x.id)!.find((a) => a.key === k)?.value ?? "—";
  const differs = (k: string) => new Set(all.map((x) => val(x, k))).size > 1;
  if (similar.length === 0) return null;
  return (
    <section id="compare" className="scroll-mt-24" aria-labelledby="compare-title">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">{c.sygkrisi}</div>
          <h2 id="compare-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight">
            {c.sygkrine_me_paromoia_proionta}
          </h2>
        </div>
        <Link href="/sygkrisi" className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-11 inline-flex items-center hover:bg-eu-surface">
          {c.pliris_sygkrisi}
        </Link>
      </div>
      <div className="@3xl:hidden">
        <CompareStacked products={all} rows={[{ group: "Χαρακτηριστικά", keys }]} val={val} current={p.id} />
      </div>
      <div className="hidden @3xl:block rounded-xl border border-eu-line">
        <table className="w-full table-fixed border-collapse text-[length:var(--fs-16)]" style={{ minWidth: `${160 + all.length * 170}px` }}>
          <thead>
            <tr className="align-top">
              <th className="text-left p-3 w-[160px] bg-eu-surface sticky left-0 z-10" />
              {all.map((x, i) => (
                <th key={x.id} className={`text-left p-3 font-normal ${i === 0 ? "bg-eu-chip" : "bg-eu-surface"}`}>
                  <ProductImage src={x.image} sizes="140px" className="w-full max-w-[140px] mb-2" rounded="rounded-lg" />
                  <div className="text-eu-muted text-[length:var(--fs-14)] truncate">{x.brand}</div>
                  {i === 0 ? <div className="font-bold text-eu-ink line-clamp-2 min-h-[2.6em] leading-tight">{x.title}</div> : <Link href={`/proion/${x.slug}`} className="block font-bold text-eu-ink hover:text-eu-blue line-clamp-2 min-h-[2.6em] leading-tight">{x.title}</Link>}
                  <div className="font-extrabold text-eu-ink text-[length:var(--fs-19)] mt-1 min-h-[1.3em]">{priceShort(x.price)}</div>
                  {i === 0 ? <div className="mt-1 inline-block rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13-5)] px-2 py-0.5">{c.ayto_to_proion}</div> : <div className="mt-1"><CompareCheckbox id={x.id} /></div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="text-left p-3 font-bold text-eu-ink bg-eu-surface">{c.energeiaki_klasi}</th>
              {all.map((x) => (
                <td key={x.id} className="p-3 text-eu-ink-2">
                  {x.energy?.cls ?? "—"}
                </td>
              ))}
            </tr>
            <tr>
              <th className="text-left p-3 font-bold text-eu-ink bg-eu-surface">{c.axiologisi}</th>
              {all.map((x) => (
                <td key={x.id} className="p-3 text-eu-ink-2">
                  {x.rating ? `★ ${x.rating.value.toLocaleString("el-GR")} (${x.rating.count})` : "—"}
                </td>
              ))}
            </tr>
            {keys.map((k) => (
              <tr key={k} className={differs(k) ? "bg-eu-yellow/10" : ""}>
                <th className="text-left p-3 font-bold text-eu-ink bg-eu-surface">
                  {k}
                  {differs(k) && <span className="block text-eu-amber font-semibold text-[length:var(--fs-13-5)]">{c.diaferei}</span>}
                </th>
                {all.map((x) => (
                  <td key={x.id} className="p-3 text-eu-ink-2">
                    {val(x, k)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
