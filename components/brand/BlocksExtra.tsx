import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, Clock, Info, Mail, MapPin, Phone, Wrench } from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import type { Guide, Product, Service } from "@/lib/data/types";
import type { LandingData, PromoData } from "@/lib/cms/brand-auto";
import { Countdown } from "@/components/commerce/Countdown";
import { DealOfDayTile } from "@/components/widgets/DealOfDayTile";
import { NewsletterForm } from "@/components/widgets/NewsletterForm";
import { BlockHead } from "./BrandFrame";

/**
 * Νέα components για προσφορές και πληροφοριακές σελίδες, στο ίδιο ύφος με τη βιτρίνα (κάρτες, countdown, φόρμα
 * newsletter της αρχικής). Χρώματα μόνο από τα --bs-*, adaptive με container queries, χωρίς οριζόντια κύλιση.
 */
type B<T extends BrandBlock["type"]> = Extract<BrandBlock, { type: T }>;
const shell = "eu-canvas eu-gutter py-8 @lg:py-12";
const primary = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:brightness-110";

/** Προσφορά ημέρας: ένα προϊόν σε μεγάλη κάρτα (ίδια με το bento της αρχικής) με αντίστροφη μέτρηση και γρήγορη αγορά. */
export function DealHero({ b, product, endsAt }: { b: B<"deal-hero">; product: Product | null; endsAt: string | null }) {
  if (!product) return null;
  const end = endsAt ?? new Date(new Date().setHours(23, 59, 59, 0)).toISOString();
  return (
    <section className={shell} aria-label={b.title || "Προσφορά ημέρας"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <div className="max-w-3xl min-h-[20rem] @lg:min-h-[22rem]"><DealOfDayTile product={product} endsAt={end} /></div>
    </section>
  );
}

/** Όλες οι προσφορές που τρέχουν τώρα (με δημοσιευμένη landing page), ως κάρτες με αντίστροφη μέτρηση. */
export function PromoGrid({ b, items }: { b: B<"promo-grid">; items: LandingData[] }) {
  if (!items.length) return null;
  return (
    <section className={shell} aria-label={b.title || "Ενεργές προσφορές"}>
      <BlockHead kicker={b.kicker} title={b.title} right={<Link href="/prosfores" className="hidden @md:inline-flex items-center gap-1.5 font-bold text-[var(--bs-accent)] text-[length:var(--fs-15)] hover:underline shrink-0">Όλες οι προσφορές <ArrowRight className="size-4" aria-hidden /></Link>} />
      <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
        {items.map((l, k) => (
          <li key={`${k}-${l.href}`} className="min-w-0">
            <Link href={l.href} className="group h-full grid grid-rows-[auto_minmax(0,1fr)] rounded-2xl overflow-hidden bg-[var(--bs-bg2)] hover:shadow-[var(--shadow-raised)] transition-shadow">
              <span className="relative block aspect-[16/9] bg-[var(--bs-accent)]">{l.image ? <Image src={l.image} alt="" fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : <span className="absolute inset-0 grid place-items-center text-[var(--bs-accent-ink)] font-heading font-extrabold text-[length:var(--fs-24)] px-4 text-center">{l.title}</span>}</span>
              <span className="p-4 grid gap-2 content-start">
                {l.kicker && <span className="font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-13)] tracking-wide uppercase">{l.kicker}</span>}
                <span className="font-heading font-bold text-[length:var(--fs-19)] leading-tight">{l.title}</span>
                {l.endsAt && <span className="inline-flex items-center gap-1.5 text-[var(--bs-muted)] text-[length:var(--fs-14)]"><Clock className="size-4" aria-hidden />Λήγει σε <Countdown endsAt={l.endsAt} className="font-bold tabular-nums" /></span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Μεγάλη αντίστροφη μέτρηση μιας προσφοράς· κρύβεται όταν λήξει. */
export function CountdownBand({ b, data }: { b: B<"countdown">; data: PromoData | null }) {
  if (!data?.endsAt || new Date(data.endsAt) < new Date()) return null;
  const href = b.cta?.href || data.landingHref;
  return (
    <section className="eu-canvas eu-gutter py-6 @lg:py-8" aria-label={b.title || data.name}>
      <div className="rounded-3xl bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] p-5 @md:p-8 grid @3xl:grid-cols-[minmax(0,1fr)_auto] gap-5 items-center">
        <div className="grid gap-2 min-w-0">
          <span className="font-extrabold text-[length:var(--fs-13)] tracking-wide uppercase opacity-85">{b.kicker || "Λήγει σύντομα"}</span>
          <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-28)] @lg:text-[length:var(--fs-36)] leading-[1.05] tracking-[-0.02em]">{b.title || data.name}</h2>
          {b.body && <p className="m-0 text-[length:var(--fs-16)] opacity-90 leading-relaxed">{b.body}</p>}
        </div>
        <div className="grid gap-3 justify-items-start @3xl:justify-items-end">
          <Countdown endsAt={data.endsAt} variant="blocks" tone="dark" />
          {href && <Link href={href} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--bs-accent-ink)] text-[var(--bs-accent)] font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:opacity-90">{b.cta?.label || "Δες την προσφορά"} <ArrowRight className="size-4" aria-hidden /></Link>}
        </div>
      </div>
    </section>
  );
}

/** Βήματα «Πώς λειτουργεί»: αριθμημένα, σε στήλες όσο χωράνε. */
export function Steps({ b }: { b: B<"steps"> }) {
  const items = b.items.filter((x) => x.title.trim());
  if (!items.length) return null;
  return (
    <section className={shell} aria-label={b.title || "Βήματα"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <ol className={`m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-2 gap-3 ${items.length >= 4 ? "@5xl:grid-cols-4" : "@4xl:grid-cols-3"}`}>
        {items.map((it, k) => (
          <li key={k} className="rounded-2xl bg-[var(--bs-bg2)] p-5 grid gap-2 content-start">
            <span className="size-10 rounded-full bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] font-heading font-extrabold text-[length:var(--fs-18)] grid place-items-center" aria-hidden>{k + 1}</span>
            <span className="font-heading font-bold text-[length:var(--fs-18)] leading-tight">{it.title}</span>
            {it.text && <span className="text-[var(--bs-muted)] text-[length:var(--fs-15)] leading-relaxed">{it.text}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Επικοινωνία: τηλέφωνο και email από τις Ρυθμίσεις → Γενικά, ωράριο, καταστήματα. */
export function ContactCards({ b, contact }: { b: B<"contact">; contact: { phone: string | null; email: string | null } | null }) {
  const cards: { icon: typeof Phone; label: string; value: string; href?: string }[] = [];
  if (b.phone !== false && contact?.phone) cards.push({ icon: Phone, label: "Τηλέφωνο", value: contact.phone, href: `tel:${contact.phone.replace(/\s/g, "")}` });
  if (b.email !== false && contact?.email) cards.push({ icon: Mail, label: "Email", value: contact.email, href: `mailto:${contact.email}` });
  if (b.hours?.trim()) cards.push({ icon: Clock, label: "Ωράριο", value: b.hours.trim() });
  if (b.stores) cards.push({ icon: MapPin, label: "Καταστήματα", value: "Βρες το πιο κοντινό", href: "/katastimata" });
  if (!cards.length) return null;
  return (
    <section className={shell} aria-label={b.title || "Επικοινωνία"}>
      <BlockHead kicker={b.kicker} title={b.title} />
      <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-2 @5xl:grid-cols-4 gap-3">
        {cards.map((c) => {
          const I = c.icon;
          const inner = <><span className="size-11 rounded-xl bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] grid place-items-center shrink-0"><I className="size-5" aria-hidden /></span><span className="grid min-w-0"><span className="text-[var(--bs-muted)] text-[length:var(--fs-14)]">{c.label}</span><span className="font-bold text-[length:var(--fs-16)] break-words">{c.value}</span></span></>;
          return <li key={c.label} className="min-w-0">{c.href ? <a href={c.href} className="h-full flex items-center gap-3 rounded-2xl bg-[var(--bs-bg2)] p-4 min-h-16 hover:shadow-[var(--shadow-raised)] transition-shadow">{inner}</a> : <div className="h-full flex items-center gap-3 rounded-2xl bg-[var(--bs-bg2)] p-4 min-h-16">{inner}</div>}</li>;
        })}
      </ul>
    </section>
  );
}

/** Εγγραφή στο newsletter — η ίδια φόρμα με την αρχική, με το ενεργό κείμενο συγκατάθεσης (GDPR). */
export function NewsletterBlock({ b, consent }: { b: B<"newsletter">; consent: string | null }) {
  return (
    <section className={shell} aria-label={b.title || "Newsletter"}>
      <div className="rounded-3xl bg-[var(--bs-bg2)] p-5 @md:p-8 grid grid-cols-[minmax(0,1fr)] @3xl:grid-cols-2 gap-5 items-center [&>*]:min-w-0">
        <div className="grid gap-2">
          {b.kicker && <span className="font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-13)] tracking-wide uppercase">{b.kicker}</span>}
          <h2 className="m-0 font-heading font-bold text-[length:var(--fs-24)] leading-tight">{b.title || "Μάθε πρώτος τις προσφορές"}</h2>
          {b.body && <p className="m-0 text-[var(--bs-muted)] text-[length:var(--fs-15)] leading-relaxed">{b.body}</p>}
        </div>
        <NewsletterForm consentText={consent ?? "Συμφωνώ να λαμβάνω εμπορική επικοινωνία (newsletter) από τη Euronics και έχω διαβάσει την Πολιτική Απορρήτου."} labels={{ email: "Το email σου", submit: "Εγγραφή", privacy: "Πολιτική απορρήτου" }} />
      </div>
    </section>
  );
}

/** Οδηγοί αγοράς (από τους Οδηγούς): κάρτες με εικόνα, χρόνο ανάγνωσης και σύνδεσμο. */
export function GuidesBlock({ b, guides }: { b: B<"guides">; guides: Guide[] }) {
  const list = (b.mode === "manual" && b.slugs?.length ? b.slugs.map((s) => guides.find((g) => g.slug === s)).filter((g): g is Guide => !!g) : guides).slice(0, Math.max(1, Math.min(8, b.limit ?? 3)));
  if (!list.length) return null;
  return (
    <section className={shell} aria-label={b.title || "Οδηγοί αγοράς"}>
      <BlockHead kicker={b.kicker} title={b.title} right={<Link href="/odigoi" className="hidden @md:inline-flex items-center gap-1.5 font-bold text-[var(--bs-accent)] text-[length:var(--fs-15)] hover:underline shrink-0">Όλοι οι οδηγοί <ArrowRight className="size-4" aria-hidden /></Link>} />
      <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
        {list.map((g) => (
          <li key={g.slug} className="min-w-0">
            <Link href={g.ctaHref ?? `/odigoi/${g.slug}`} className="group h-full grid grid-rows-[auto_minmax(0,1fr)] rounded-2xl overflow-hidden bg-[var(--bs-bg2)] hover:shadow-[var(--shadow-raised)] transition-shadow">
              <span className="relative block aspect-[16/9] bg-[var(--bs-bg)]">{g.image && <Image src={g.image} alt="" fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}</span>
              <span className="p-4 grid gap-1.5 content-start">
                <span className="text-[var(--bs-accent)] font-extrabold text-[length:var(--fs-13)] uppercase tracking-wide">{g.kicker} · {g.minutes}′</span>
                <span className="font-heading font-bold text-[length:var(--fs-18)] leading-tight">{g.title}</span>
                <span className="text-[var(--bs-muted)] text-[length:var(--fs-14)] leading-snug line-clamp-3">{g.excerpt}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Υπηρεσίες Euronics (από τις Υπηρεσίες): κάρτες με τιμή «από» και σύνδεσμο στη σελίδα της υπηρεσίας. */
export function ServicesBlock({ b, services }: { b: B<"services">; services: Service[] }) {
  const list = (b.mode === "manual" && b.slugs?.length ? b.slugs.map((s) => services.find((x) => x.slug === s)).filter((x): x is Service => !!x) : services).slice(0, Math.max(1, Math.min(8, b.limit ?? 4)));
  if (!list.length) return null;
  return (
    <section className={shell} aria-label={b.title || "Υπηρεσίες"}>
      <BlockHead kicker={b.kicker} title={b.title} right={<Link href="/ypiresies" className="hidden @md:inline-flex items-center gap-1.5 font-bold text-[var(--bs-accent)] text-[length:var(--fs-15)] hover:underline shrink-0">Όλες οι υπηρεσίες <ArrowRight className="size-4" aria-hidden /></Link>} />
      <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-2 @5xl:grid-cols-4 gap-3">
        {list.map((s) => (
          <li key={s.slug} className="min-w-0">
            <Link href={`/ypiresies/${s.slug}`} className="group h-full grid gap-2 content-start rounded-2xl bg-[var(--bs-bg2)] p-5 hover:shadow-[var(--shadow-raised)] transition-shadow">
              <span className="size-11 rounded-xl bg-[var(--bs-accent)] text-[var(--bs-accent-ink)] grid place-items-center"><Wrench className="size-5" aria-hidden /></span>
              <span className="font-heading font-bold text-[length:var(--fs-18)] leading-tight">{s.title}</span>
              <span className="text-[var(--bs-muted)] text-[length:var(--fs-14)] leading-snug line-clamp-3">{s.blurb}</span>
              {s.priceFrom != null && <span className="font-bold text-[length:var(--fs-15)]">από {s.priceFrom.toLocaleString("el-GR")} €</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONE = {
  info: { icon: Info, cls: "bg-[#eef3fb] text-[#0f2a55] border-[#c9d8f0]" },
  warning: { icon: CircleAlert, cls: "bg-[#fff6e0] text-[#5a3b00] border-[#f1d58a]" },
  success: { icon: CircleCheck, cls: "bg-[#e9f7ef] text-[#0d4a2a] border-[#b9e2c9]" },
} as const;

/** Σημαντική σημείωση: πλαίσιο πληροφορίας / προσοχής / επιβεβαίωσης με προαιρετικό κουμπί. */
export function Callout({ b }: { b: B<"callout"> }) {
  if (!b.body?.trim()) return null;
  const t = TONE[b.tone] ?? TONE.info;
  const I = t.icon;
  return (
    <section className="eu-canvas eu-gutter py-4" aria-label={b.title || "Σημείωση"}>
      <div role={b.tone === "warning" ? "note" : undefined} className={`rounded-2xl border-2 p-4 @md:p-5 flex gap-3 items-start ${t.cls}`}>
        <I className="size-6 shrink-0 mt-0.5" aria-hidden />
        <div className="grid gap-1.5 min-w-0">
          {b.title && <span className="font-heading font-bold text-[length:var(--fs-18)] leading-tight">{b.title}</span>}
          <p className="m-0 text-[length:var(--fs-15)] leading-relaxed whitespace-pre-line">{b.body}</p>
          {b.cta?.label && b.cta.href && <Link href={b.cta.href} className={`${primary} justify-self-start mt-1`}>{b.cta.label} <ArrowRight className="size-4" aria-hidden /></Link>}
        </div>
      </div>
    </section>
  );
}
