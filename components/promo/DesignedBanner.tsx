import type { BannerDesign, BannerProduct } from "@/lib/promo/banner-design";
import { EnergyChip } from "@/components/commerce/EnergyChip";
import { Check } from "lucide-react";
import { sx } from "@/components/ui/sx";
import { StickerSvg, stickerAnimationClass } from "@/components/stickers/StickerSvg";
import type { StickerParams } from "@/lib/stickers/model";
import { Price } from "@/components/commerce/Price";

/** Sticker πάνω στο banner: κλιμακώνεται με το πλάτος του χώρου του (το SVG γεμίζει το κουτί του). */
function BannerSticker({ sticker, id, className }: { sticker: StickerParams; id: string; className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute [&>svg]:block [&>svg]:w-full [&>svg]:h-auto ${className}`}><StickerSvg p={{ ...sticker, size: 200 }} id={id} className={stickerAnimationClass[sticker.animation]} /></span>;
}

const eur = (v: number) => v.toLocaleString("el-GR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });

/**
 * Το σχεδιασμένο banner όπως το βλέπει ο πελάτης — και όπως το δείχνει ζωντανά ο editor (ίδιο component, χωρίς βάση).
 * Προσαρμόζεται στο πλάτος του ΧΩΡΟΥ του (container queries), όχι της οθόνης: φαρδιά λωρίδα → κείμενο αριστερά και
 * προϊόντα δεξιά· στενός χώρος (κινητό, πλευρική στήλη) → στήλη με ένα προϊόν. Κίνηση μόνο με transform/opacity,
 * σβηστή με prefers-reduced-motion (globals.css).
 */
/**
 * Ένα τετράγωνο post προϊόντος στη μορφή των post της καμπάνιας: το εικαστικό (με το σήμα πάνω αριστερά) ως φόντο,
 * μάρκα και τίτλος πάνω δεξιά, το προϊόν μεγάλο στο κέντρο, κουκκίδες κάτω αριστερά, «ΜΟΝΟ» + τιμή κάτω δεξιά.
 * Τα μεγέθη ακολουθούν το πλάτος του post (cqw, με όρια) ώστε να κλιμακώνεται σαν εικόνα και να μένει ευανάγνωστο.
 */
/**
 * Τετράγωνο post «βάθρο» (όπως τα post προσφορών των φυλλαδίων): φωτεινό φόντο με λάμψη στο κέντρο, σήμα καμπάνιας πάνω
 * αριστερά, μάρκα και προϊόν πάνω δεξιά, χαρακτηριστικά με εικονίδιο αριστερά, στρογγυλή τιμή δεξιά, το προϊόν πάνω σε βάθρο.
 * Το βάθρο και η λάμψη βγαίνουν από το χρώμα φόντου (color-mix), ώστε να δουλεύει με όποιο χρώμα καμπάνιας.
 */
function PodiumTile({ d, p, tall, bullets, sticker }: { d: BannerDesign; p: BannerProduct; tall: boolean; bullets: string[]; sticker?: StickerParams | null }) {
  const light = d.ink === "light";
  const v = sx({ "--pb": d.bg.color, "--pa": d.accent, backgroundColor: d.bg.color });
  return (
    <a href={p.href} className={`@container relative isolate block overflow-hidden rounded-2xl ${tall ? "aspect-[4/5]" : "aspect-square"} ${light ? "text-white" : "text-[#122a58]"} ${v.className} focus-visible:outline-2 focus-visible:outline-eu-blue`}>
      {v.node}
      {d.bg.image && <img src={d.bg.image} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(58%_46%_at_50%_52%,rgba(255,255,255,.7),transparent_72%)]" />
      {d.logo ? <img src={d.logo} alt="" className="absolute left-[5%] top-[5%] w-[30%] max-h-[22%] object-contain object-left-top" />
        : d.kicker ? <span className="absolute left-[5%] top-[6%] max-w-[40%] rounded-md bg-[var(--pa)] text-white font-heading font-extrabold uppercase leading-none px-[2.5cqw] py-[2cqw] text-[length:clamp(0.6875rem,4.2cqw,1.25rem)]">{d.kicker}</span> : null}
      <div className="absolute right-[5%] top-[6%] w-[52%] grid gap-[0.8cqw] text-right">
        {d.products.showBrand && <span className="font-heading font-extrabold uppercase leading-none text-[length:clamp(0.8125rem,6cqw,2rem)]">{p.brand}</span>}
        <span className="font-semibold leading-tight line-clamp-2 text-[length:clamp(0.6875rem,3.5cqw,1.0625rem)]">{p.title}</span>
      </div>
      {bullets.length > 0 && (
        <ul className="absolute left-[5%] top-[30%] w-[44%] m-0 p-0 list-none grid grid-cols-2 gap-x-[2cqw] gap-y-[2.5cqw] @max-[15rem]:hidden">
          {bullets.slice(0, 4).map((x) => (
            <li key={x} className="flex items-center gap-[1.5cqw] font-semibold leading-tight text-[length:clamp(0.625rem,2.9cqw,0.9375rem)]">
              <span aria-hidden className="shrink-0 grid place-items-center size-[6.5cqw] min-w-4 min-h-4 rounded-[1.5cqw] bg-[var(--pa)] text-white"><Check className="size-[70%]" strokeWidth={3} /></span>{x}
            </li>
          ))}
        </ul>
      )}
      {/* στρογγυλή τιμή: δαχτυλίδι στο χρώμα έμφασης, «ΜΟΝΟ» κόκκινο όπως στα φυλλάδια */}
      <span className="absolute right-[4%] top-[25%] size-[30%] grid place-content-center justify-items-center rounded-full bg-[color-mix(in_srgb,var(--pb)_82%,white)] ring-[1cqw] ring-[var(--pa)] leading-none">
        {d.products.priceLabel && <span className="font-extrabold text-[#d62828] text-[length:clamp(0.5625rem,3cqw,0.875rem)]">{d.products.priceLabel}</span>}
        <span className="font-heading font-extrabold tabular-nums text-[var(--pa)] text-[length:clamp(0.875rem,6.6cqw,2.25rem)]"><Price value={p.price} short euroSmall /></span>
        {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className="tabular-nums opacity-70 text-[length:clamp(0.5625rem,2.8cqw,0.875rem)]">{eur(p.wasPrice)} €</s>}
      </span>
      {/* βάθρο: έλλειψη (πάνω όψη) πάνω σε πιο σκούρο σώμα */}
      <span aria-hidden className="absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[62%] h-[13%] rounded-b-[50%_60%] bg-[color-mix(in_srgb,var(--pb)_78%,#7a5200)]" />
      <span aria-hidden className="absolute left-1/2 -translate-x-1/2 bottom-[11%] w-[62%] h-[11%] rounded-[50%] bg-[color-mix(in_srgb,var(--pb)_86%,white)] shadow-[inset_0_-0.6cqw_1.2cqw_rgba(0,0,0,.12)]" />
      {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`absolute left-1/2 -translate-x-1/2 bottom-[15%] w-[40%] h-[44%] object-contain object-bottom ${p.cutout ? "eu-cutout-shadow" : "rounded-xl bg-white p-[3%]"}`} />}
      {d.products.showEnergy && p.energy && <span className="absolute left-[6%] bottom-[7%]"><EnergyChip cls={p.energy} fiche="" compact /></span>}
      {sticker && <BannerSticker sticker={sticker} id={`bns-${p.id}`} className="left-[4%] top-[46%] w-[24%]" />}
      {d.body && <span className="absolute right-[5%] bottom-[5%] max-w-[36%] text-right font-semibold leading-tight text-[length:clamp(0.625rem,2.9cqw,0.9375rem)]">{d.body}</span>}
    </a>
  );
}

function PostTile({ d, p, tall, bullets, sticker }: { d: BannerDesign; p: BannerProduct; tall: boolean; bullets: string[]; sticker?: StickerParams | null }) {
  const light = d.ink === "light";
  const bg = sx({ backgroundColor: d.bg.color });
  const accent = sx({ color: d.accent });
  return (
    <a href={p.href} className={`@container relative isolate block overflow-hidden rounded-2xl ${tall ? "aspect-[4/5]" : "aspect-square"} ${light ? "text-white" : "text-eu-navy"} ${bg.className} focus-visible:outline-2 focus-visible:outline-eu-blue`}>
      {bg.node}{accent.node}
      {d.bg.image && <img src={d.bg.image} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />}
      {d.bg.anim === "spotlight" && <div aria-hidden className="eu-spot -z-10" />}
      <div className="absolute right-[6%] top-[7%] w-[48%] grid gap-[1cqw] text-right">
        {d.products.showBrand && <span className="font-heading font-extrabold uppercase leading-none text-[length:clamp(0.8125rem,7cqw,2.25rem)]">{p.brand}</span>}
        <span className="font-semibold leading-tight line-clamp-2 text-[length:clamp(0.6875rem,3.6cqw,1.125rem)]">{p.title}</span>
      </div>
      {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`absolute left-[6%] top-[28%] w-[64%] h-[42%] object-contain object-center ${p.cutout ? (light ? "eu-cutout-shadow-dark" : "eu-cutout-shadow") : "rounded-xl bg-white p-[3%]"}`} />}
      {d.products.showEnergy && p.energy && <span className="absolute right-[7%] top-[38%]"><EnergyChip cls={p.energy} fiche="" compact /></span>}
      {sticker && <BannerSticker sticker={sticker} id={`bns-${p.id}`} className="left-[3%] top-[56%] w-[24%]" />}
      {bullets.length > 0 && <ul className="absolute left-[7%] bottom-[6%] w-[48%] m-0 pl-[1.1em] grid gap-[0.5cqw] font-semibold leading-tight text-[length:clamp(0.6875rem,3.8cqw,1.25rem)]">{bullets.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul>}
      <span className="absolute right-[6%] bottom-[6%] grid justify-items-end leading-none">
        {d.products.priceLabel && <span className="font-bold tracking-wide text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{d.products.priceLabel}</span>}
        <span className={`font-heading font-extrabold tabular-nums text-[length:clamp(1.375rem,11.5cqw,4rem)] ${accent.className}`}><Price value={p.price} short euroSmall /></span>
        {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className="tabular-nums opacity-80 text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{eur(p.wasPrice)} €</s>}
      </span>
    </a>
  );
}

export function DesignedBanner({ d, products, shape = "wide", href, sticker, bleed = false }: { /** σε όλο το πλάτος της οθόνης: χωρίς στρογγυλές γωνίες, πιο ψηλό, με το περιεχόμενο στο πλάτος της σελίδας */ bleed?: boolean; d: BannerDesign; products: BannerProduct[]; shape?: "wide" | "square"; /** τα στοιχεία του sticker που διάλεξε ο διαχειριστής (d.stickerKey) */ sticker?: StickerParams | null; /** διάταξη «posts»: ο σύνδεσμος του «δες όλα» (κάθε post πάει στο προϊόν του) */ href?: string | null }) {
  const light = d.ink === "light";
  if (d.layout === "posts") {
    const tiles = products.slice(0, d.products.max);
    if (!tiles.length) return null;
    return (
      <div className="@container grid gap-3">
        {(d.title || (d.cta && href)) && (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <span className="grid">{d.kicker && <span className="font-extrabold text-eu-blue text-[length:var(--fs-13)]">{d.kicker}</span>}{d.title && <strong className="font-heading font-extrabold text-eu-ink leading-tight text-[length:var(--fs-24)] @3xl:text-[length:var(--fs-30)]">{d.title}</strong>}</span>
            {d.cta && href && <a href={href} className="inline-flex items-center min-h-11 font-extrabold text-eu-blue text-[length:var(--fs-15)] underline underline-offset-4 hover:text-eu-navy">{d.cta}</a>}
          </div>
        )}
        <div className={`grid gap-3 @3xl:gap-4 ${tiles.length === 1 ? "" : tiles.length === 2 ? "grid-cols-2" : tiles.length === 3 ? "grid-cols-2 @3xl:grid-cols-3" : "grid-cols-2 @4xl:grid-cols-4"}`}>
          {tiles.map((p) => { const Tile = d.postStyle === "podium" ? PodiumTile : PostTile; return <Tile key={p.id} d={d} p={p} tall={shape === "square"} bullets={tiles.length === 1 ? d.products.bullets : []} sticker={sticker} />; })}
        </div>
      </div>
    );
  }
  const bg = sx({ backgroundColor: d.bg.color });
  const accent = sx({ color: d.accent });
  const btn = sx({ backgroundColor: d.accent, color: light ? "#0b1020" : "#ffffff" });
  const list = products.slice(0, d.products.max);
  const one = list.length === 1;
  const sub = light ? "text-white/80" : "text-eu-ink-2";
  return (
    <div className={`@container relative isolate overflow-hidden ${bleed ? "" : "rounded-2xl"} ${light ? "text-white" : "text-eu-navy"} ${bg.className}`}>
      {bg.node}{accent.node}{btn.node}
      {d.bg.image && <img src={d.bg.image} alt="" className={`absolute inset-0 -z-10 size-full object-cover ${d.bg.anim === "zoom" ? "eu-kenburns" : ""}`} />}
      {d.bg.video && <video src={d.bg.video} autoPlay muted loop playsInline aria-hidden className="absolute inset-0 -z-10 size-full object-cover motion-reduce:hidden" />}
      {/* πάνω σε εικόνα/video τα ανοιχτά κείμενα θέλουν σκούρο πέπλο για να διαβάζονται (αντίθεση ≥ 4,5:1) */}
      {light && (d.bg.image || d.bg.video) && <div aria-hidden className="absolute inset-0 -z-10 bg-black/55" />}
      {d.bg.anim === "spotlight" && <div aria-hidden className="eu-spot -z-10" />}
      {d.bg.anim === "ambient" && <div aria-hidden className="eu-ambient -z-10" />}
      {d.bg.anim === "rays" && <div aria-hidden className="eu-rays -z-10 w-[70%] right-[-10%] top-1/2 -mt-[35%] @max-xl:w-[140%] @max-xl:right-[-20%] @max-xl:-mt-[70%]" />}
      {d.bg.anim === "sweep" && <div aria-hidden className="eu-sweep -z-10" />}
      {sticker && <BannerSticker sticker={sticker} id="bns-strip" className="right-3 top-3 w-16 @xl:w-24" />}

      <div className={`grid items-center gap-4 @xl:gap-6 ${bleed ? "eu-canvas eu-gutter py-6 @xl:py-10" : "p-4 @xl:px-8 @xl:py-6"} ${shape === "wide" && list.length ? "@xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""} ${shape === "wide" ? (bleed ? "min-h-56 @xl:min-h-80" : "min-h-40 @xl:min-h-52") : "min-h-72"}`}>
        {(d.logo || d.kicker || d.title || d.body || d.cta) && (
          <div className={`grid gap-2 content-center min-w-0 ${list.length ? "" : "justify-items-center text-center py-2"}`}>
            {d.logo && <img src={d.logo} alt="" className={`${bleed ? "max-h-24 @xl:max-h-40" : "max-h-20 @xl:max-h-28"} w-auto max-w-[70%] object-contain ${list.length ? "object-left justify-self-start" : ""}`} />}
            {d.kicker && <span className={`font-extrabold text-[length:var(--fs-13)] ${accent.className}`}>{d.kicker}</span>}
            {d.title && <strong className={`font-heading font-extrabold leading-[1.08] text-balance ${bleed ? "text-[length:var(--fs-28)] @xl:text-[length:var(--fs-44)]" : "text-[length:var(--fs-24)] @xl:text-[length:var(--fs-34)]"}`}>{d.title}</strong>}
            {d.body && <span className={`text-[length:var(--fs-14)] @xl:text-[length:var(--fs-16)] max-w-[52ch] ${sub}`}>{d.body}</span>}
            {d.cta && <span className={`mt-1 inline-flex items-center rounded-full px-4 min-h-11 font-extrabold text-[length:var(--fs-14)] ${list.length ? "justify-self-start" : "justify-self-center"} ${btn.className}`}>{d.cta}</span>}
          </div>
        )}

        {list.length > 0 && (
          <ul className={`m-0 p-0 list-none grid gap-3 min-w-0 ${one ? "" : "@xl:grid-flow-col @xl:auto-cols-fr"}`}>
            {list.map((p, i) => (
              <li key={p.id} className={`min-w-0 grid items-center gap-3 ${one ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[7rem_minmax(0,1fr)] @xl:grid-cols-1 @xl:justify-items-center @xl:text-center"} ${i > 0 ? "hidden @xl:grid" : ""}`}>
                {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`w-full object-contain ${one ? "max-h-44 @xl:max-h-56" : "max-h-24 @xl:max-h-28"} ${p.cutout ? (light ? "eu-cutout-shadow-dark" : "eu-cutout-shadow") : "rounded-xl bg-white p-2"}`} />}
                <div className="grid gap-1 min-w-0">
                  {d.products.showBrand && <span className="font-heading font-extrabold uppercase text-[length:var(--fs-15)] @xl:text-[length:var(--fs-18)]">{p.brand}</span>}
                  <span className={`leading-snug line-clamp-2 text-[length:var(--fs-13)] @xl:text-[length:var(--fs-14)] ${sub}`}>{p.title}</span>
                  {one && d.products.bullets.length > 0 && <ul className="m-0 pl-4 grid gap-0.5 text-[length:var(--fs-13)] @xl:text-[length:var(--fs-15)] font-semibold text-left">{d.products.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
                  {d.products.showEnergy && p.energy && <span className={one ? "justify-self-start" : "justify-self-start @xl:justify-self-center"}><EnergyChip cls={p.energy} fiche="" compact /></span>}
                  <span className="grid leading-none mt-1">
                    {d.products.priceLabel && <span className="font-bold text-[length:var(--fs-12)] tracking-wide">{d.products.priceLabel}</span>}
                    <span className={`font-heading font-extrabold tabular-nums ${one ? "text-[length:var(--fs-34)] @xl:text-[length:var(--fs-44)]" : "text-[length:var(--fs-24)] @xl:text-[length:var(--fs-28)]"} ${accent.className}`}><Price value={p.price} short euroSmall /></span>
                    {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className={`tabular-nums text-[length:var(--fs-13)] ${sub}`}>{eur(p.wasPrice)} €</s>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
