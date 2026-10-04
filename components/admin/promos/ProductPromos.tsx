import Link from "next/link";
import { BadgePercent, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { matches } from "@/lib/promo/engine";
import { promosWith } from "@/lib/promo/server";
import { STATUS_LABEL, describePromo, type PromoStatus } from "@/lib/promo/catalog";

const eur = (v: unknown) => `${Number(v).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Στην καρτέλα προϊόντος του admin: η τρέχουσα τιμή προσφοράς, ποιες προσφορές το αφορούν και γρήγορη δημιουργία νέας. */
export async function ProductPromos({ productId, canWrite, embedded = false }: { productId: string; canWrite: boolean; /** μέσα σε ενότητα (accordion): χωρίς δικό του πλαίσιο και τίτλο */ embedded?: boolean }) {
  const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, brandId: true, categoryId: true, variants: { select: { id: true }, take: 1 }, offer: true } });
  if (!p) return null;
  const cats = await db.category.findMany({ select: { id: true, parentId: true } });
  const parent = new Map(cats.map((c) => [c.id, c.parentId]));
  const chain: string[] = []; for (let c: string | null | undefined = p.categoryId, g = 0; c && g < 8; c = parent.get(c), g++) chain.push(c);
  const line = { productId: p.id, variantId: p.variants[0]?.id ?? "", brandId: p.brandId, categoryIds: chain };
  const promos = (await promosWith(["active", "scheduled", "paused", "pending", "draft"])).filter((x) => (x.mechanism === "special-price" ? x.reward.price?.[p.id] != null || x.reward.price?.[line.variantId] != null : x.targets.some((t) => !t.exclude) && matches(x, line)));
  const o = p.offer;
  const tags = (o?.tags as { label: string }[] | null) ?? [];
  return (
    <section className={embedded ? "grid gap-3" : "rounded-2xl border border-eu-line bg-white p-4 grid gap-3"} aria-labelledby="pp-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="pp-h" className={embedded ? "sr-only" : "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] inline-flex items-center gap-1.5"}><BadgePercent className="size-5 text-eu-blue" aria-hidden /> Προσφορές</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{o ? <>Στη βιτρίνα: <strong className="text-eu-red">{eur(o.price)}</strong>{Number(o.price) < Number(o.listPrice) && <> αντί <s>{eur(o.listPrice)}</s></>}{o.lowest30 != null && <> · χαμηλότερη 30 ημερών {eur(o.lowest30)}</>}{tags.length > 0 && <> · {tags.map((t) => t.label).join(", ")}</>}{o.endsAt && <> · λήγει {o.endsAt.toLocaleDateString("el-GR")}</>}</> : "Καμία ενεργή προσφορά στη βιτρίνα."}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {[["percent", "Έκπτωση %"], ["special", "Ειδική τιμή"], ["nplusm", "1+1 / 2+1"], ["service", "Δωρεάν υπηρεσία"]].map(([t, l]) => (
              <Link key={t} href={`/admin/prosfores/new?template=${t}&products=${p.id}`} className="inline-flex items-center gap-1 rounded-full bg-eu-surface text-eu-navy px-3 min-h-9 font-bold text-[length:var(--fs-13)] hover:bg-eu-navy hover:text-white transition-colors"><Plus className="size-3.5" aria-hidden /> {l}</Link>
            ))}
          </div>
        )}
      </div>
      {promos.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {promos.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)]"><span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-13)] ${STATUS_LABEL[x.status as PromoStatus]?.tone ?? ""}`}>{STATUS_LABEL[x.status as PromoStatus]?.label ?? x.status}</span><Link href={`/admin/prosfores/${x.id}`} className="font-bold hover:underline">{x.name}</Link><span className="text-eu-muted">{describePromo(x)}</span></li>)}
        </ul>
      )}
    </section>
  );
}
