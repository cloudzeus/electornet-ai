import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { priceShort } from "@/lib/format";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("compareStacked");

const TONES = ["bg-eu-navy", "bg-eu-blue", "bg-eu-green", "bg-eu-amber"];

/**
 * Comparison for narrow containers (phones, small tablets): no
 * horizontal scrolling. Products get a number and a colour; every
 * characteristic becomes a row with one cell per product. Differences
 * are tinted exactly like in the table.
 */
export function CompareStacked({ products, rows, val, current }: { products: Product[]; rows: { group: string; keys: string[] }[]; val: (p: Product, k: string) => string; current?: string }) {
  const differs = (k: string) => new Set(products.map((p) => val(p, k))).size > 1;
  const cols = products.length <= 2 ? "grid-cols-2" : "grid-cols-2";
  const extra: { key: string; get: (p: Product) => string }[] = [
    { key: "Διαθεσιμότητα", get: (p) => (p.availability.kind === "in-stock" ? "Άμεσα διαθέσιμο" : p.availability.kind === "days" ? `Σε ${p.availability.min}–${p.availability.max} εργάσιμες` : "Κατόπιν παραγγελίας") },
    { key: "Αξιολόγηση", get: (p) => (p.rating ? `★ ${p.rating.value.toLocaleString("el-GR")} (${p.rating.count})` : "—") },
  ];
  return (
    <div className="grid gap-4">
      <ul className={`m-0 p-0 list-none grid ${cols} gap-2`}>
        {products.map((p, i) => (
          <li key={p.id} className={`rounded-xl border-2 p-2.5 grid gap-2 ${p.id === current ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
            <div className="flex items-center gap-2">
              <span className={`size-6 rounded-full text-white font-extrabold text-[length:var(--fs-13)] inline-flex items-center justify-center ${TONES[i % 4]}`}>{i + 1}</span>
              <ProductImage src={p.image} sizes="56px" className="size-14" rounded="rounded-md" />
            </div>
            <div className="min-w-0">
              <div className="text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase truncate">{p.brand}</div>
              <Link href={`/proion/${p.slug}`} className="block font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-2 min-h-[2.4em] hover:text-eu-blue">
                {p.title}
              </Link>
              <div className="font-extrabold text-eu-ink text-[length:var(--fs-17)] mt-1">{priceShort(p.price)}</div>
            </div>
          </li>
        ))}
      </ul>
      {[{ group: "Γενικά", keys: extra.map((e) => e.key) }, ...rows].map((g, gi) => (
        <div key={`${g.group}-${gi}`} className="rounded-xl border border-eu-line overflow-hidden">
          <div className="bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] tracking-wide px-3 py-2">{g.group}</div>
          <dl className="m-0 divide-y divide-eu-line-2">
            {g.keys.map((k) => {
              const ex = extra.find((e) => e.key === k);
              const get = ex ? ex.get : (p: Product) => val(p, k);
              const d = ex ? new Set(products.map(get)).size > 1 : differs(k);
              return (
                <div key={k} className={`p-3 ${d ? "bg-eu-yellow/10" : ""}`}>
                  <dt className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1.5">
                    {k}
                    {d && <span className="ml-2 text-eu-amber font-semibold text-[length:var(--fs-13)]">{c.diaferei}</span>}
                  </dt>
                  <dd className={`m-0 grid ${cols} gap-x-3 gap-y-1`}>
                    {products.map((p, i) => (
                      <span key={p.id} className="flex items-start gap-1.5 text-[length:var(--fs-14)] text-eu-ink-2 min-w-0">
                        <span className={`size-4 mt-0.5 shrink-0 rounded-full text-white font-extrabold text-[10px] inline-flex items-center justify-center ${TONES[i % 4]}`}>{i + 1}</span>
                        <span className="min-w-0 break-words">{get(p)}</span>
                      </span>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}
