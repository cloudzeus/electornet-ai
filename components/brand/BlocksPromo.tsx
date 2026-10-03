import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Phone, Ticket } from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import type { Product, Store } from "@/lib/data/types";
import type { CouponData, LandingData, PromoData } from "@/lib/cms/brand-auto";
import { ProductCard } from "@/components/commerce/ProductCard";
import { Countdown } from "@/components/commerce/Countdown";
import { CopyCoupon } from "@/components/promo/CopyCoupon";
import { AdSlot } from "@/components/promo/AdSlot";
import { BlockHead } from "./BrandFrame";

/**
 * Components συνδεδεμένα με τις Προσφορές και τα καταστήματα. Κρύβονται μόνα τους όταν η προσφορά λήξει,
 * το κουπόνι εξαντληθεί ή το banner σταματήσει — ο διαχειριστής δεν χρειάζεται να τα αφαιρέσει.
 */
type B<T extends BrandBlock["type"]> = Extract<BrandBlock, { type: T }>;
const shell = "eu-canvas eu-gutter py-8 @lg:py-12";

/** Banner από τις Διαφημιστικές θέσεις (με μέτρηση εμφανίσεων/κλικ): όποιο είναι ενεργό στη θέση, ή συγκεκριμένο. */
export function AdBlock({ b, count = true }: { b: B<"ad">; count?: boolean }) {
  return (
    <div className="eu-canvas eu-gutter py-4 @lg:py-6">
      <AdSlot slot={b.slot ?? "info-top"} id={b.mode === "placement" ? b.placementId : undefined} count={count} />
    </div>
  );
}

export function PromoProducts({ b, data, products }: { b: B<"promo-products">; data: PromoData | null; products: Product[] }) {
  if (!data || !products.length) return null;
  const href = b.cta?.href || data.landingHref;
  return (
    <section className={shell} aria-label={b.title || data.name}>
      <BlockHead kicker={b.kicker || "Προσφορά"} title={b.title || data.name} right={b.countdown !== false && data.endsAt ? <Countdown endsAt={data.endsAt} variant="blocks" tone="light" className="shrink-0 hidden @md:flex" /> : undefined} />
      {b.countdown !== false && data.endsAt && <div className="@md:hidden mb-4"><Countdown endsAt={data.endsAt} variant="blocks" tone="light" /></div>}
      <div className="grid grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 gap-3">
        {products.map((p, k) => <div key={p.id} className={`min-w-0 h-full ${k >= 4 ? "hidden @sm:block" : ""}`}><ProductCard product={p} dealEndsAt={data.endsAt ?? undefined} /></div>)}
      </div>
      {href && <Link href={href} className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:brightness-110 w-full @md:w-auto">{b.cta?.label || "Όλα τα προϊόντα της προσφοράς"} <ArrowRight className="size-4" aria-hidden /></Link>}
    </section>
  );
}

export function PromoLandingCard({ data }: { data: LandingData | null }) {
  if (!data) return null;
  return (
    <section className="eu-canvas eu-gutter py-6 @lg:py-8" aria-label={data.title}>
      <Link href={data.href} className="group grid @2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] rounded-3xl overflow-hidden bg-[var(--bs-bg2)] hover:shadow-[var(--shadow-raised)] transition-shadow">
        {data.image && <span className="relative block aspect-[16/9] @2xl:aspect-auto @2xl:min-h-[16rem]"><Image src={data.image} alt="" fill sizes="(max-width: 1024px) 100vw, 640px" className="object-cover" /></span>}
        <span className="p-5 @lg:p-8 grid gap-3 content-center">
          {data.kicker && <span className="font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-13)] tracking-wide uppercase">{data.kicker}</span>}
          <span className="font-heading font-extrabold text-[length:var(--fs-26)] @lg:text-[length:var(--fs-32)] leading-[1.08] tracking-[-0.02em]">{data.title}</span>
          {data.subtitle && <span className="text-[var(--bs-muted)] text-[length:var(--fs-16)] leading-relaxed">{data.subtitle}</span>}
          {data.endsAt && <Countdown endsAt={data.endsAt} className="font-bold text-[length:var(--fs-14)] tabular-nums text-[var(--bs-muted)]" />}
          <span className="inline-flex items-center gap-2 justify-self-start rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] font-extrabold text-[length:var(--fs-15)] px-5 min-h-12">Δες την προσφορά <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
        </span>
      </Link>
    </section>
  );
}

export function CouponBlock({ b, data }: { b: B<"coupon">; data: CouponData | null }) {
  if (!data) return null;
  return (
    <section className="eu-canvas eu-gutter py-6" aria-label={b.title || "Κουπόνι"}>
      <div className="rounded-3xl border-2 border-dashed border-[var(--bs-accent)] bg-[var(--bs-bg2)] p-5 @lg:p-6 grid @2xl:grid-cols-[minmax(0,1fr)_auto] gap-4 items-center">
        <div className="flex items-start gap-3 min-w-0">
          <span className="shrink-0 size-12 rounded-2xl bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] grid place-items-center"><Ticket className="size-6" aria-hidden /></span>
          <div className="grid gap-1 min-w-0">
            <span className="font-heading font-extrabold text-[length:var(--fs-22)] leading-tight">{b.title || data.value}</span>
            <span className="text-[var(--bs-muted)] text-[length:var(--fs-15)]">{b.text || `Γράψε τον κωδικό στο καλάθι · ${data.promo}`}</span>
            {data.expiresAt && <span className="inline-flex items-center gap-1.5 text-[var(--bs-muted)] text-[length:var(--fs-14)]"><Clock className="size-4" aria-hidden />Ισχύει έως {new Date(data.expiresAt).toLocaleDateString("el-GR", { day: "numeric", month: "long" })}</span>}
          </div>
        </div>
        <CopyCoupon code={data.code} />
      </div>
    </section>
  );
}

export function StoresBlock({ b, stores }: { b: B<"stores">; stores: Store[] }) {
  if (!stores.length) return null;
  return (
    <section className={shell} aria-label={b.title || "Καταστήματα"}>
      <BlockHead kicker={b.kicker} title={b.title} right={<Link href="/katastimata" className="hidden @md:inline-flex items-center gap-1.5 font-bold text-[var(--bs-accent)] text-[length:var(--fs-15)] hover:underline shrink-0">Όλα τα καταστήματα <ArrowRight className="size-4" aria-hidden /></Link>} />
      <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
        {stores.map((s) => (
          <li key={s.id} className="min-w-0">
            <div className="h-full rounded-2xl bg-[var(--bs-bg2)] p-4 grid gap-2 content-start">
              <Link href={`/katastimata/${s.slug}`} className="font-heading font-bold text-[length:var(--fs-18)] hover:underline">{s.name}</Link>
              <span className="inline-flex items-start gap-2 text-[var(--bs-muted)] text-[length:var(--fs-15)]"><MapPin className="size-4 mt-0.5 shrink-0 text-[var(--bs-accent)]" aria-hidden />{s.address}, {s.city}{b.mode === "near" && s.distanceKm ? ` · ${s.distanceKm.toLocaleString("el-GR", { maximumFractionDigits: 1 })} km` : ""}</span>
              {s.openUntil && <span className="inline-flex items-center gap-2 text-[length:var(--fs-14)]"><Clock className="size-4 shrink-0 text-[var(--bs-accent)]" aria-hidden />{s.openUntil}</span>}
              <span className="flex flex-wrap gap-2 mt-1">
                {s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] px-4 min-h-11 font-bold text-[length:var(--fs-14)]"><Phone className="size-4" aria-hidden />{s.phone}</a>}
                <Link href={`/katastimata/${s.slug}`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-current/25 px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-current">Οδηγίες</Link>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
