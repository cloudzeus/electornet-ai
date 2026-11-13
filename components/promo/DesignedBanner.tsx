import type { BannerDesign, BannerProduct } from "@/lib/promo/banner-design";
import { EnergyChip } from "@/components/commerce/EnergyChip";
import { sx } from "@/components/ui/sx";

const eur = (v: number) => v.toLocaleString("el-GR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });

/**
 * Το σχεδιασμένο banner όπως το βλέπει ο πελάτης — και όπως το δείχνει ζωντανά ο editor (ίδιο component, χωρίς βάση).
 * Προσαρμόζεται στο πλάτος του ΧΩΡΟΥ του (container queries), όχι της οθόνης: φαρδιά λωρίδα → κείμενο αριστερά και
 * προϊόντα δεξιά· στενός χώρος (κινητό, πλευρική στήλη) → στήλη με ένα προϊόν. Κίνηση μόνο με transform/opacity,
 * σβηστή με prefers-reduced-motion (globals.css).
 */
export function DesignedBanner({ d, products, shape = "wide" }: { d: BannerDesign; products: BannerProduct[]; shape?: "wide" | "square" }) {
  const light = d.ink === "light";
  const bg = sx({ backgroundColor: d.bg.color });
  const accent = sx({ color: d.accent });
  const btn = sx({ backgroundColor: d.accent, color: light ? "#0b1020" : "#ffffff" });
  const list = products.slice(0, d.products.max);
  const one = list.length === 1;
  const sub = light ? "text-white/80" : "text-eu-ink-2";
  return (
    <div className={`@container relative isolate overflow-hidden rounded-2xl ${light ? "text-white" : "text-eu-navy"} ${bg.className}`}>
      {bg.node}{accent.node}{btn.node}
      {d.bg.image && <img src={d.bg.image} alt="" className={`absolute inset-0 -z-10 size-full object-cover ${d.bg.anim === "zoom" ? "eu-kenburns" : ""}`} />}
      {d.bg.video && <video src={d.bg.video} autoPlay muted loop playsInline aria-hidden className="absolute inset-0 -z-10 size-full object-cover motion-reduce:hidden" />}
      {/* πάνω σε εικόνα/video τα ανοιχτά κείμενα θέλουν σκούρο πέπλο για να διαβάζονται (αντίθεση ≥ 4,5:1) */}
      {light && (d.bg.image || d.bg.video) && <div aria-hidden className="absolute inset-0 -z-10 bg-black/45" />}
      {d.bg.anim === "spotlight" && <div aria-hidden className="eu-spot -z-10" />}
      {d.bg.anim === "ambient" && <div aria-hidden className="eu-ambient -z-10" />}
      {d.bg.anim === "rays" && <div aria-hidden className="eu-rays -z-10 w-[70%] right-[-10%] top-1/2 -mt-[35%] @max-xl:w-[140%] @max-xl:right-[-20%] @max-xl:-mt-[70%]" />}
      {d.bg.anim === "sweep" && <div aria-hidden className="eu-sweep -z-10" />}

      <div className={`grid items-center gap-4 p-4 @xl:gap-6 @xl:px-8 @xl:py-6 ${shape === "wide" && list.length ? "@xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""} ${shape === "wide" ? "min-h-40 @xl:min-h-52" : "min-h-72"}`}>
        {(d.logo || d.kicker || d.title || d.body || d.cta) && (
          <div className={`grid gap-2 content-center min-w-0 ${list.length ? "" : "justify-items-center text-center py-2"}`}>
            {d.logo && <img src={d.logo} alt="" className={`max-h-20 @xl:max-h-28 w-auto max-w-[70%] object-contain ${list.length ? "object-left justify-self-start" : ""}`} />}
            {d.kicker && <span className={`font-extrabold text-[length:var(--fs-13)] ${accent.className}`}>{d.kicker}</span>}
            {d.title && <strong className="font-heading font-extrabold leading-[1.08] text-balance text-[length:var(--fs-24)] @xl:text-[length:var(--fs-34)]">{d.title}</strong>}
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
                    <span className={`font-heading font-extrabold tabular-nums ${one ? "text-[length:var(--fs-34)] @xl:text-[length:var(--fs-44)]" : "text-[length:var(--fs-24)] @xl:text-[length:var(--fs-28)]"} ${accent.className}`}>{eur(p.price)}<span className="text-[0.5em] align-top ml-0.5">€</span></span>
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
