"use client";


import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { priceShort, instalment, priceLong } from "@/lib/format";
import { compareRows } from "@/lib/data/attributes";
import { useCart } from "@/components/commerce/CartProvider";
import { CompareStacked } from "./CompareStacked";
import { ProductImage } from "@/components/commerce/ProductImage";
import { CompareVerdict } from "./CompareVerdict";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("compare");

/**
 * Compare up to four products on their canonical characteristics
 * (lib/data/attributes): rows are grouped, differences are highlighted,
 * «μόνο διαφορές» hides identical rows, the first column is sticky so the
 * table works on a phone. Ids come from the cart store and sync to the URL.
 */
export function CompareTable({ initial }: { initial: Product[] }) {
  const { compare, toggleCompare, hydrated, add, openQuickBuy } = useCart();
  const router = useRouter();
  const [onlyDiff, setOnlyDiff] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const want = compare.join(",");
    const have = initial.map((p) => p.id).join(",");
    if (want !== have) router.replace(want ? `/sygkrisi?ids=${want}` : "/sygkrisi");
  }, [compare, hydrated, initial, router]);

  if (initial.length === 0) {
    return (
      <div className="rounded-2xl bg-eu-surface p-10 text-center">
        <div className="font-bold text-eu-ink text-[length:var(--fs-21)] mb-2">{c.den_echeis_epilexei_proionta}</div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-16)]">{c.tsekare_sygkrisi_se_eos}</p>
        <Link href="/proionta" className="inline-flex mt-5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 items-center hover:bg-eu-blue">
          {c.des_ola_ta_proionta}
        </Link>
      </div>
    );
  }
  const { groups, val } = compareRows(initial);
  const differs = (k: string) => new Set(initial.map((p) => val(p, k))).size > 1;
  const cheapest = Math.min(...initial.map((p) => p.price));
  const th = "text-left p-3 @md:p-4 font-bold text-eu-ink bg-eu-surface sticky left-0 z-10 w-[180px] text-[length:var(--fs-15)]";

  return (
    <div className="grid gap-4">
      <CompareVerdict products={initial} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 font-semibold text-eu-ink text-[length:var(--fs-15)] cursor-pointer min-h-11">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="size-[18px] accent-eu-blue" /> {c.mono_oi_diafores}
        </label>
        <div className="text-eu-muted text-[length:var(--fs-15)]">
          {initial.length} από 4 προϊόντα ·{" "}
          <Link href="/proionta" className="text-eu-blue font-bold hover:underline">
            {c.prosthese_ki_allo}
          </Link>
        </div>
      </div>
      <div className="@3xl:hidden">
        <CompareStacked products={initial} rows={groups.map(([group, keys]) => ({ group, keys: keys.filter((k) => !onlyDiff || differs(k)) })).filter((g) => g.keys.length)} val={val} />
      </div>
      <div className="hidden @3xl:block rounded-2xl border border-eu-line bg-white overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[length:var(--fs-16)]" style={{ minWidth: `${180 + initial.length * 220}px` }}>
          <thead>
            <tr className="align-top">
              <th className={`${th} bg-white`} />
              {initial.map((p) => (
                <th key={p.id} className="text-left align-top p-3 @md:p-4 font-normal border-b border-eu-line">
                  <div className="relative">
                    <button type="button" aria-label={c.afairesi} onClick={() => toggleCompare(p.id)} className="absolute top-0 right-0 size-10 rounded-full bg-white border border-eu-line inline-flex items-center justify-center hover:text-eu-red z-10">
                      <X className="size-4" aria-hidden />
                    </button>
                    <ProductImage src={p.image} sizes="240px" className="w-full mb-3" />
                    <div className="text-eu-muted-2 font-bold text-[length:var(--fs-14)] uppercase truncate">{p.brand}</div>
                    <Link href={`/proion/${p.slug}`} className="block font-bold text-eu-ink text-[length:var(--fs-17)] leading-tight hover:text-eu-blue line-clamp-2 min-h-[2.4em]">
                      {p.title}
                    </Link>
                    <div className="flex items-baseline gap-2 mt-2 min-h-[2.2em] flex-wrap">
                      <span className="font-extrabold text-eu-ink text-[length:var(--fs-26)] leading-none">{priceShort(p.price)}</span>
                      {p.wasPrice && <s className="text-eu-muted-2 text-[length:var(--fs-14)]">{priceShort(p.wasPrice)}</s>}
                      {!p.noPrice && p.price === cheapest && initial.length > 1 && <span className="rounded-full bg-eu-green text-white text-[length:var(--fs-13)] font-bold px-2 py-0.5">{c.fthinotero}</span>}
                    </div>
                    {!p.noPrice && <div className="text-eu-blue font-semibold text-[length:var(--fs-14)] mt-1 truncate">ή 12 × {priceLong(instalment(p.price))} χωρίς κάρτα</div>}
                    <div className="grid gap-2 mt-3">
                      <button type="button" onClick={() => openQuickBuy(p)} className="w-full rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] py-2.5 min-h-11 hover:bg-eu-yellow-dark">
                        {c.agora_me_1_klik}
                      </button>
                      <button type="button" onClick={() => add(p)} className="w-full rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] py-2.5 min-h-11 hover:bg-eu-surface">
                        {c.sto_kalathi}
                      </button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-eu-line-2">
              <th className={th}>{c.diathesimotita}</th>
              {initial.map((p) => (
                <td key={p.id} className={`p-3 @md:p-4 font-semibold ${p.availability.kind === "in-stock" ? "text-eu-green" : p.availability.kind === "days" ? "text-eu-amber" : "text-eu-muted"}`}>
                  {p.availability.kind === "in-stock" ? "Άμεσα διαθέσιμο" : p.availability.kind === "days" ? `Σε ${p.availability.min}–${p.availability.max} εργάσιμες` : "Κατόπιν παραγγελίας"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-eu-line-2">
              <th className={th}>{c.axiologisi}</th>
              {initial.map((p) => (
                <td key={p.id} className="p-3 @md:p-4 text-eu-ink-2">
                  {p.rating ? `★ ${p.rating.value.toLocaleString("el-GR")} (${p.rating.count} κριτικές)` : "—"}
                </td>
              ))}
            </tr>
            {groups.map(([g, keys], gi) => {
              const rows = keys.filter((k) => !onlyDiff || differs(k));
              if (!rows.length) return null;
              return (
                <GroupRows key={`${g}-${gi}`} title={g} cols={initial.length + 1}>
                  {rows.map((k) => {
                    const d = differs(k);
                    return (
                      <tr key={k} className={`border-b border-eu-line-2 ${d ? "bg-eu-yellow/10" : ""}`}>
                        <th className={th}>
                          {k}
                          {d && <span className="block text-eu-amber font-semibold text-[length:var(--fs-13)]">{c.diaferei}</span>}
                        </th>
                        {initial.map((p) => (
                          <td key={p.id} className={`p-3 @md:p-4 ${val(p, k) === "—" ? "text-eu-muted-2" : "text-eu-ink-2"}`}>
                            {val(p, k)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </GroupRows>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ title, cols, children }: { title: string; cols: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={cols} className="bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] tracking-wide px-3 @md:px-4 py-2 sticky left-0">
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}
