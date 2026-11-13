import type { BannerDesign, BannerProduct } from "@/lib/promo/banner-design";
import { EnergyChip } from "@/components/commerce/EnergyChip";
import { Check } from "lucide-react";
import { sx } from "@/components/ui/sx";
import { StickerSvg, stickerAnimationClass } from "@/components/stickers/StickerSvg";
import { DEFAULT_STICKER, type StickerParams } from "@/lib/stickers/model";
import { Price } from "@/components/commerce/Price";
import { TileSlider } from "./TileSlider";
import { CardRotator } from "./CardRotator";

// θέση του sticker που διάλεξε ο διαχειριστής («auto» = η θέση που ταιριάζει στο στυλ, ώστε να μην πέφτει πάνω σε τιμή ή τίτλο)
const STICKER_POS: Record<string, string | undefined> = { tl: "left-[3%] top-[4%]", tr: "right-[3%] top-[4%]", ml: "left-[3%] top-[40%]", mr: "right-[3%] top-[40%]", bl: "left-[3%] bottom-[4%]", br: "right-[3%] bottom-[4%]" };
/** Sticker πάνω στο banner: κλιμακώνεται με το πλάτος του χώρου του (το SVG γεμίζει το κουτί του). */
function BannerSticker({ sticker, id, className }: { sticker: StickerParams; id: string; className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute [&>svg]:block [&>svg]:w-full [&>svg]:h-auto ${className}`}><StickerSvg p={{ ...sticker, size: 200 }} id={id} className={stickerAnimationClass[sticker.animation]} /></span>;
}

/** Σκούρα ή λευκά γράμματα πάνω σε ένα χρώμα (φωτεινότητα WCAG), ώστε η τιμή να διαβάζεται πάνω στο σχήμα της. */
const onColor = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0b1020" : "#ffffff"; };
const PRICE_ANIM = { pulse: "eu-sticker-breathe", wiggle: "eu-sticker-wiggle" } as Record<string, string | undefined>;

/**
 * Η τιμή μέσα σε σχήμα sticker (αστέρι, σφραγίδα, κύκλος, εξάγωνο) στο χρώμα έμφασης — όπως οι τιμές των φυλλαδίων.
 * Το σχήμα είναι το ίδιο SVG των stickers χωρίς κείμενο· η τιμή γράφεται από πάνω, με γράμματα που ξεχωρίζουν από το χρώμα.
 */
function PriceShapeBox({ d, p, className }: { d: BannerDesign; p: BannerProduct; className: string }) {
  const ink = sx({ color: onColor(d.accent) });
  return (
    <span className={`absolute grid place-items-center aspect-square ${PRICE_ANIM[d.tileAnim] ?? ""} ${className}`}>
      {ink.node}
      <span aria-hidden className="absolute inset-0 [&>svg]:block [&>svg]:size-full"><StickerSvg p={{ ...DEFAULT_STICKER, shape: d.priceShape as StickerParams["shape"], fill: d.accent, fill2: null, border: null, borderWidth: 0, rotate: 0, lines: [], icon: "none", animation: "none", size: 200 }} id={`bnp-${p.id}`} /></span>
      <span className={`relative grid justify-items-center leading-none ${ink.className}`}>
        {d.products.priceLabel && <span className="font-extrabold text-[length:clamp(0.6875rem,2.8cqw,0.875rem)]">{d.products.priceLabel}</span>}
        <span className="eu-sl-price font-heading font-extrabold tabular-nums text-[length:clamp(0.875rem,7cqw,2.5rem)]"><Price value={p.price} short euroSmall /></span>
        {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className="tabular-nums opacity-80 text-[length:clamp(0.6875rem,2.6cqw,0.875rem)]">{eur(p.wasPrice)} €</s>}
      </span>
    </span>
  );
}
/** Λάμψη που περνά πάνω από το τετράγωνο (κίνηση «Λάμψη»). */
const Shine = ({ d }: { d: BannerDesign }) => (d.tileAnim === "shine" ? <div aria-hidden className="eu-sweep -z-10" /> : null);
type TileProps = { d: BannerDesign; p: BannerProduct; tall: boolean; /** μόνο του στο banner: σε φαρδύ χώρο γίνεται πλατύ αντί για τεράστιο τετράγωνο */ solo?: boolean; bullets: string[]; sticker?: StickerParams | null };
const frame = (tall: boolean, solo?: boolean) => `eu-tile @container relative isolate block overflow-hidden rounded-2xl ${tall ? "aspect-[4/5]" : solo ? "aspect-square @2xl:aspect-[2/1] @5xl:aspect-[5/2]" : "aspect-square"} focus-visible:outline-2 focus-visible:outline-eu-blue`;

/** Τετράγωνο «Λευκή κάρτα»: λευκό, γραμμή καμπάνιας πάνω, προϊόν μεγάλο, μάρκα/τίτλος κάτω αριστερά, τιμή κάτω δεξιά. */
function CleanTile({ d, p, tall, solo, sticker }: TileProps) {
  const v = sx({ "--pb": d.bg.color, "--pa": d.accent, "--pk": onColor(d.bg.color) });
  const shaped = d.priceShape !== "auto";
  return (
    <a href={p.href} className={`${frame(tall, solo)} bg-white text-eu-ink border border-eu-line ${v.className}`}>
      {v.node}<Shine d={d} />
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2.5%] bg-[var(--pb)]" />
      {d.logo ? <img src={d.logo} alt="" className="absolute left-[5%] top-[6%] w-[26%] max-h-[16%] object-contain object-left-top" />
        : d.kicker ? <span className="absolute left-[5%] top-[7%] max-w-[60%] rounded-md bg-[var(--pb)] text-[var(--pk)] font-extrabold leading-none px-[2.5cqw] py-[1.8cqw] text-[length:clamp(0.6875rem,3.6cqw,1rem)]">{d.kicker}</span> : null}
      {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`eu-sl-img absolute left-[12%] top-[16%] w-[76%] h-[50%] object-contain object-center ${d.tileAnim === "float" ? "eu-float" : ""}`} />}
      {d.products.showEnergy && p.energy && <span className="absolute right-[5%] top-[7%]"><EnergyChip cls={p.energy} fiche="" compact /></span>}
      {sticker && <BannerSticker sticker={sticker} id={`bns-${p.id}`} className={`${STICKER_POS[d.stickerPos] ?? "left-[4%] top-[42%]"} w-[24%]`} />}
      <div className={`absolute left-[6%] bottom-[6%] grid gap-[0.6cqw] ${shaped ? "w-[52%]" : "w-[50%]"}`}>
        {d.products.showBrand && <span className="eu-sl-brand font-heading font-extrabold uppercase leading-none text-[length:clamp(0.75rem,5cqw,1.5rem)]">{p.brand}</span>}
        <span className="eu-sl-title font-semibold text-eu-ink-2 leading-tight line-clamp-2 text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{p.title}</span>
      </div>
      {shaped ? <PriceShapeBox d={d} p={p} className="right-[3%] bottom-[3%] w-[36%]" /> : (
        <span className={`absolute right-[6%] bottom-[6%] grid justify-items-end leading-none ${PRICE_ANIM[d.tileAnim] ?? ""}`}>
          {d.products.priceLabel && <span className="font-extrabold text-[#b52222] text-[length:clamp(0.6875rem,3.2cqw,0.9375rem)]">{d.products.priceLabel}</span>}
          <span className="eu-sl-price font-heading font-extrabold tabular-nums text-[var(--pa)] text-[length:clamp(1.25rem,10cqw,3.25rem)]"><Price value={p.price} short euroSmall /></span>
          {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className="tabular-nums text-eu-muted text-[length:clamp(0.6875rem,3.2cqw,0.9375rem)]">{eur(p.wasPrice)} €</s>}
        </span>
      )}
    </a>
  );
}

/** Τετράγωνο «Ζώνη τιμής»: το προϊόν πάνω στο χρώμα φόντου, και κάτω ζώνη στο χρώμα έμφασης με την τιμή μεγάλη. */
function BandTile({ d, p, tall, solo, sticker }: TileProps) {
  const light = d.ink === "light";
  const v = sx({ "--pa": d.accent, "--pi": onColor(d.accent), backgroundColor: d.bg.color });
  const shaped = d.priceShape !== "auto";
  return (
    <a href={p.href} className={`${frame(tall, solo)} ${light ? "text-white" : "text-eu-navy"} ${v.className}`}>
      {v.node}
      {d.bg.image && <img src={d.bg.image} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />}
      <Shine d={d} />
      {d.logo && <img src={d.logo} alt="" className="absolute left-[5%] top-[5%] w-[26%] max-h-[18%] object-contain object-left-top" />}
      <div className="absolute right-[5%] top-[6%] w-[58%] grid gap-[0.8cqw] text-right">
        {d.products.showBrand && <span className="eu-sl-brand font-heading font-extrabold uppercase leading-none text-[length:clamp(0.75rem,5.6cqw,1.75rem)]">{p.brand}</span>}
        <span className="eu-sl-title font-semibold leading-tight line-clamp-2 text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{p.title}</span>
      </div>
      {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`eu-sl-img absolute left-[14%] top-[24%] w-[72%] h-[46%] object-contain object-bottom ${p.cutout ? (light ? "eu-cutout-shadow-dark" : "eu-cutout-shadow") : "rounded-xl bg-white p-[3%]"} ${d.tileAnim === "float" ? "eu-float" : ""}`} />}
      {d.products.showEnergy && p.energy && <span className="absolute left-[5%] top-[30%]"><EnergyChip cls={p.energy} fiche="" compact /></span>}
      {sticker && <BannerSticker sticker={sticker} id={`bns-${p.id}`} className={`${STICKER_POS[d.stickerPos] ?? "left-[3%] top-[44%]"} w-[24%]`} />}
      <span className="absolute inset-x-0 bottom-0 h-[24%] bg-[var(--pa)] text-[var(--pi)] flex items-center justify-between gap-[2cqw] px-[6%] leading-none">
        <span className="grid gap-[0.6cqw] min-w-0">
          {d.products.priceLabel && <span className="font-extrabold text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{d.products.priceLabel}</span>}
          {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className="tabular-nums opacity-80 text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{eur(p.wasPrice)} €</s>}
        </span>
        {!shaped && <span className={`eu-sl-price font-heading font-extrabold tabular-nums text-[length:clamp(1.25rem,11cqw,3.75rem)] ${PRICE_ANIM[d.tileAnim] ?? ""}`}><Price value={p.price} short euroSmall /></span>}
      </span>
      {shaped && <PriceShapeBox d={{ ...d, accent: d.bg.color }} p={p} className="right-[3%] bottom-[2%] w-[38%]" />}
    </a>
  );
}

/**
 * Το σήμα της καμπάνιας ως πρωταγωνιστής: μπαίνει «σκάζοντας», μετά αιωρείται ελαφρά με λάμψη που πάλλεται, και κάθε λίγα δευτερόλεπτα
 * μια αντανάκλαση διασχίζει τα γράμματά του (το ίδιο το σήμα γίνεται μάσκα της αντανάκλασης). Με «λιγότερη κίνηση» μένει ακίνητο.
 */
function LogoHero({ src, className }: { src: string; className: string }) {
  const mask = sx({ maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` });
  return (
    <span className={`eu-logo-hero relative inline-block max-w-[70%] ${className}`}>
      {mask.node}
      <img src={src} alt="" className="block h-full w-auto max-w-full object-contain" />
      <span aria-hidden className={`eu-logo-glint ${mask.className}`} />
    </span>
  );
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
function PodiumTile({ d, p, tall, solo, bullets, sticker }: TileProps) {
  const light = d.ink === "light";
  const v = sx({ "--pb": d.bg.color, "--pa": d.accent, "--pi": onColor(d.accent), backgroundColor: d.bg.color });
  return (
    <a href={p.href} className={`${frame(tall, solo)} ${light ? "text-white" : "text-[#122a58]"} ${v.className} focus-visible:outline-2 focus-visible:outline-eu-blue`}>
      {v.node}
      {d.bg.image && <img src={d.bg.image} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />}
      {/* σκηνικό: ακτίνες φωτός που ξεκινούν πίσω από το προϊόν και μια λάμψη στο κέντρο — το προϊόν «φωτίζεται» αντί να κάθεται σε επίπεδο χρώμα */}
      <div aria-hidden className="eu-podium-rays absolute left-1/2 top-[52%] w-[150%] aspect-square -translate-x-1/2 -translate-y-1/2 -z-10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(52%_44%_at_50%_54%,rgba(255,255,255,.85),transparent_70%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[30%] -z-10 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--pb)_70%,#7a5200),transparent)] opacity-60" />
      {d.logo ? <img src={d.logo} alt="" className="absolute left-[5%] top-[5%] w-[30%] max-h-[22%] object-contain object-left-top" />
        : d.kicker ? <span className="absolute left-[5%] top-[6%] max-w-[40%] rounded-md bg-[var(--pa)] text-[var(--pi)] font-heading font-extrabold uppercase leading-none px-[2.5cqw] py-[2cqw] text-[length:clamp(0.6875rem,4.2cqw,1.25rem)]">{d.kicker}</span> : null}
      <div className="absolute right-[5%] top-[6%] w-[52%] grid gap-[0.8cqw] text-right">
        {d.products.showBrand && <span className="eu-sl-brand font-heading font-extrabold uppercase leading-none text-[length:clamp(0.875rem,7cqw,2.25rem)]">{p.brand}</span>}
        <span className="eu-sl-title font-semibold leading-tight line-clamp-2 text-[length:clamp(0.6875rem,3.5cqw,1.0625rem)]">{p.title}</span>
      </div>
      {bullets.length > 0 && (
        <ul className="absolute left-[5%] top-[30%] w-[40%] m-0 p-0 list-none grid gap-y-[2cqw] @max-[15rem]:hidden">
          {bullets.slice(0, 3).map((x) => (
            <li key={x} className="flex items-center gap-[1.5cqw] font-semibold leading-tight text-[length:clamp(0.6875rem,2.9cqw,0.9375rem)]">
              <span aria-hidden className="shrink-0 grid place-items-center size-[6.5cqw] min-w-4 min-h-4 rounded-[1.5cqw] bg-[var(--pa)] text-[var(--pi)]"><Check className="size-[70%]" strokeWidth={3} /></span>{x}
            </li>
          ))}
        </ul>
      )}
      <Shine d={d} />
      {/* βάθρο: σκιά δαπέδου, σώμα και φωτεινή πάνω όψη */}
      <span aria-hidden className="absolute left-1/2 -translate-x-1/2 bottom-[1.5%] w-[82%] h-[9%] rounded-[50%] bg-black/25 blur-[3cqw]" />
      <span aria-hidden className="absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[70%] h-[14%] rounded-b-[50%_60%] bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--pb)_74%,#7a5200),color-mix(in_srgb,var(--pb)_52%,#5c3d00))]" />
      <span aria-hidden className="absolute left-1/2 -translate-x-1/2 bottom-[11.5%] w-[70%] h-[12%] rounded-[50%] bg-[radial-gradient(60%_90%_at_50%_35%,#fff,color-mix(in_srgb,var(--pb)_80%,white))] shadow-[inset_0_-0.6cqw_1.4cqw_rgba(0,0,0,.14)]" />
      {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`eu-sl-img absolute left-1/2 -translate-x-1/2 bottom-[15.5%] w-[52%] h-[50%] object-contain object-bottom ${p.cutout ? "eu-cutout-shadow" : "rounded-xl bg-white p-[3%]"} ${d.tileAnim === "float" ? "eu-float" : ""}`} />}
      {/* τιμή: γεμάτος δίσκος στο χρώμα έμφασης, ελαφρά γερμένος σαν αυτοκόλλητο τιμής, με λευκό περίγραμμα και σκιά — το πιο δυνατό σημείο μετά το προϊόν */}
      {d.priceShape !== "auto" ? <PriceShapeBox d={d} p={p} className="right-[2%] top-[24%] w-[36%]" /> : <span className={`absolute right-[3%] top-[25%] size-[34%] -rotate-6 grid place-content-center justify-items-center rounded-full bg-[var(--pa)] text-[var(--pi)] ring-[1.2cqw] ring-white shadow-[0_2.5cqw_5cqw_-1cqw_rgba(0,0,0,.45)] leading-none ${PRICE_ANIM[d.tileAnim] ?? ""}`}>
        {d.products.priceLabel && <span className="font-extrabold text-[var(--pb)] tracking-wide text-[length:clamp(0.6875rem,3.2cqw,0.9375rem)]">{d.products.priceLabel}</span>}
        <span className="eu-sl-price font-heading font-extrabold tabular-nums text-[length:clamp(1rem,8cqw,2.75rem)]"><Price value={p.price} short euroSmall /></span>
        {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className="tabular-nums opacity-80 text-[length:clamp(0.6875rem,3cqw,0.9375rem)]">{eur(p.wasPrice)} €</s>}
      </span>}
      {/* sticker κάτω αριστερά (εκτός αν ο διαχειριστής διάλεξε άλλη θέση)· η ενεργειακή κλάση πάει τότε κάτω δεξιά */}
      {sticker && <BannerSticker sticker={sticker} id={`bns-${p.id}`} className={`${STICKER_POS[d.stickerPos] ?? "left-[3%] bottom-[3%]"} w-[26%]`} />}
      {d.products.showEnergy && p.energy && <span className={`absolute bottom-[6%] ${sticker && !["tl", "tr", "ml", "mr", "br"].includes(d.stickerPos) ? "right-[5%]" : "left-[6%]"}`}><EnergyChip cls={p.energy} fiche="" compact /></span>}
      {d.body && !(sticker && p.energy && d.products.showEnergy) && <span className="absolute right-[5%] bottom-[5%] max-w-[30%] text-right font-semibold leading-tight text-[length:clamp(0.6875rem,2.9cqw,0.9375rem)]">{d.body}</span>}
    </a>
  );
}

function PostTile({ d, p, tall, solo, bullets, sticker }: TileProps) {
  const light = d.ink === "light";
  const bg = sx({ backgroundColor: d.bg.color, "--tb": d.bg.color });
  const accent = sx({ color: d.accent });
  return (
    <a href={p.href} className={`${frame(tall, solo)} ${light ? "text-white" : "text-eu-navy"} ${bg.className} focus-visible:outline-2 focus-visible:outline-eu-blue`}>
      {bg.node}{accent.node}
      {d.bg.image && <img src={d.bg.image} alt="" loading="lazy" className={`absolute inset-0 -z-10 size-full object-cover ${solo ? "object-left-top @2xl:object-contain @2xl:object-left" : ""}`} />}
      {/* πλατύ: το εικαστικό πιάνει μόνο το αριστερό μέρος — σβήνει ομαλά μέσα στο χρώμα φόντου, χωρίς να φαίνεται ραφή */}
      {solo && d.bg.image && <div aria-hidden className="hidden @2xl:block absolute inset-0 -z-10 bg-[linear-gradient(90deg,transparent_22%,var(--tb)_40%)]" />}
      {d.bg.anim === "spotlight" && <div aria-hidden className="eu-spot -z-10" />}
      <Shine d={d} />
      <div className={`absolute right-[6%] top-[7%] w-[48%] z-10 grid gap-[1cqw] text-right ${solo ? "@2xl:w-[30%]" : ""}`}>
        {d.products.showBrand && <span className="eu-sl-brand font-heading font-extrabold uppercase leading-none text-[length:clamp(0.8125rem,7cqw,2.25rem)]">{p.brand}</span>}
        <span className="eu-sl-title font-semibold leading-tight line-clamp-2 text-[length:clamp(0.6875rem,3.6cqw,1.125rem)]">{p.title}</span>
      </div>
      {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`eu-sl-img absolute left-[6%] top-[28%] w-[64%] h-[42%] ${solo ? "@2xl:left-[20%] @2xl:top-[7%] @2xl:w-[43%] @2xl:h-[86%]" : ""} object-contain object-center ${p.cutout ? (light ? "eu-cutout-shadow-dark" : "eu-cutout-shadow") : "rounded-xl bg-white p-[3%]"} ${d.tileAnim === "float" ? "eu-float" : ""}`} />}
      {d.products.showEnergy && p.energy && <span className="absolute right-[7%] top-[38%]"><EnergyChip cls={p.energy} fiche="" compact /></span>}
      {sticker && <BannerSticker sticker={sticker} id={`bns-${p.id}`} className={`${STICKER_POS[d.stickerPos] ?? "left-[3%] top-[56%]"} w-[24%]`} />}
      {bullets.length > 0 && <ul className="absolute left-[7%] bottom-[6%] w-[48%] m-0 pl-[1.1em] grid gap-[0.5cqw] font-semibold leading-tight text-[length:clamp(0.6875rem,3.8cqw,1.25rem)]">{bullets.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul>}
      {d.priceShape !== "auto" ? <PriceShapeBox d={d} p={p} className="right-[3%] bottom-[3%] w-[38%]" /> : <span className={`absolute right-[6%] bottom-[6%] grid justify-items-end leading-none ${PRICE_ANIM[d.tileAnim] ?? ""}`}>
        {d.products.priceLabel && <span className="font-bold tracking-wide text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{d.products.priceLabel}</span>}
        <span className={`eu-sl-price font-heading font-extrabold tabular-nums text-[length:clamp(1.375rem,11.5cqw,4rem)] ${accent.className}`}><Price value={p.price} short euroSmall /></span>
        {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className="tabular-nums opacity-80 text-[length:clamp(0.6875rem,3.4cqw,1rem)]">{eur(p.wasPrice)} €</s>}
      </span>}
    </a>
  );
}

// Λωρίδα: φαίνονται όσα προϊόντα χωράνε άνετα (κάθε πλαίσιο θέλει ~11,5rem) — το 2ο από 48rem πλάτος banner, το 3ο από 72rem. Ποτέ τρία στριμωγμένα.
const SHOW_FROM = ["", "hidden @3xl:grid", "hidden @6xl:grid"];
// κινητό: πάντα 2 ανά σειρά· όσο φαρδαίνει ο χώρος ανεβαίνει ως το «ανά σειρά» του σχεδίου
const COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 @3xl:grid-cols-3", 4: "grid-cols-2 @4xl:grid-cols-4", 5: "grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5", 6: "grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @6xl:grid-cols-6" };
const TILES: Record<BannerDesign["postStyle"], (props: TileProps) => React.ReactNode> = { visual: PostTile, podium: PodiumTile, clean: CleanTile, band: BandTile };

export function DesignedBanner({ d, products, shape = "wide", href, sticker, bleed = false }: { /** σε όλο το πλάτος της οθόνης: χωρίς στρογγυλές γωνίες, πιο ψηλό, με το περιεχόμενο στο πλάτος της σελίδας */ bleed?: boolean; d: BannerDesign; products: BannerProduct[]; shape?: "wide" | "square"; /** τα στοιχεία του sticker που διάλεξε ο διαχειριστής (d.stickerKey) */ sticker?: StickerParams | null; /** διάταξη «posts»: ο σύνδεσμος του «δες όλα» (κάθε post πάει στο προϊόν του) */ href?: string | null }) {
  const light = d.ink === "light";
  if (d.layout === "posts") {
    const tiles = products.slice(0, d.products.max);
    if (!tiles.length) return null;
    return (
      // τίτλος, υπέρτιτλος και σύνδεσμος ακολουθούν τα χρώματα του component της ζώνης (--bs-*), όταν έχουν οριστεί
      <div className="@container grid gap-[var(--bs-head-gap,0.75rem)]">
        {(d.title || (d.cta && href)) && (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <span className="grid">{d.kicker && <span className="font-extrabold text-[color:var(--bs-kicker,var(--bs-accent,var(--eu-blue)))] text-[length:var(--fs-13)]">{d.kicker}</span>}{d.title && <strong className="font-heading font-extrabold text-[color:var(--bs-title,var(--bs-ink,var(--eu-ink)))] leading-tight text-[length:var(--fs-24)] @3xl:text-[length:var(--fs-30)]">{d.title}</strong>}</span>
            {d.cta && href && <a href={href} className="inline-flex items-center min-h-11 font-extrabold text-[color:var(--bs-link,var(--bs-accent,var(--eu-blue)))] text-[length:var(--fs-15)] underline underline-offset-4 hover:opacity-80">{d.cta}</a>}
          </div>
        )}
        {d.slider ? (
          <TileSlider label={d.title || "Προϊόντα προσφοράς"}>
            {tiles.map((p) => { const Tile = TILES[d.postStyle] ?? PostTile; return <Tile key={p.id} d={d} p={p} tall={shape === "square"} solo bullets={[]} sticker={sticker} />; })}
          </TileSlider>
        ) : (
        <div className={`grid gap-3 @3xl:gap-4 ${tiles.length === 1 ? "" : COLS[Math.min(tiles.length, d.products.perRow)] ?? COLS[4]}`}>
          {tiles.map((p) => { const Tile = TILES[d.postStyle] ?? PostTile; return <Tile key={p.id} d={d} p={p} tall={shape === "square"} solo={tiles.length === 1} bullets={tiles.length === 1 ? d.products.bullets : []} sticker={sticker} />; })}
        </div>
        )}
      </div>
    );
  }
  const bg = sx({ backgroundColor: d.bg.color });
  const accent = sx({ color: d.accent });
  const btn = sx({ backgroundColor: d.accent, color: light ? "#0b1020" : "#ffffff" });
  // ένα προϊόν → μεγάλο, μόνο του· περισσότερα → κάρτες που εναλλάσσονται (όσες χωράνε κάθε φορά)
  const list = d.products.max === 1 ? products.slice(0, 1) : products.slice(0, Math.max(d.products.max, 9));
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
      {sticker && <BannerSticker sticker={sticker} id="bns-strip" className={`${STICKER_POS[d.stickerPos] ?? "right-3 top-3"} w-16 @xl:w-24`} />}

      <div className={`grid items-center gap-4 @xl:gap-6 ${bleed ? "eu-canvas eu-gutter py-6 @xl:py-10" : "p-4 @xl:px-8 @xl:py-6"} ${shape === "wide" && list.length ? "@xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""} ${shape === "wide" ? (bleed ? "min-h-56 @xl:min-h-80" : "min-h-40 @xl:min-h-52") : "min-h-72"}`}>
        {(d.logo || d.kicker || d.title || d.body || d.cta) && (
          <div className={`eu-hero-in grid gap-2 content-center min-w-0 ${list.length ? "" : "justify-items-center text-center py-2"}`}>
            {d.logo && <LogoHero src={d.logo} className={`${bleed ? "h-24 @xl:h-40" : "h-20 @xl:h-28"} ${list.length ? "justify-self-start" : ""}`} />}
            {d.kicker && <span className={`font-extrabold text-[length:var(--fs-13)] ${accent.className}`}>{d.kicker}</span>}
            {d.title && <strong className={`font-heading font-extrabold leading-[1.08] text-balance ${bleed ? "text-[length:var(--fs-28)] @xl:text-[length:var(--fs-44)]" : "text-[length:var(--fs-24)] @xl:text-[length:var(--fs-34)]"}`}>{d.title}</strong>}
            {d.body && <span className={`text-[length:var(--fs-14)] @xl:text-[length:var(--fs-16)] max-w-[52ch] ${sub}`}>{d.body}</span>}
            {d.cta && <span className={`mt-1 inline-flex items-center rounded-full px-4 min-h-11 font-extrabold text-[length:var(--fs-14)] ${list.length ? "justify-self-start" : "justify-self-center"} ${btn.className}`}>{d.cta}</span>}
          </div>
        )}

        {one && (
          <ul className={`m-0 p-0 list-none grid gap-3 min-w-0 ${one ? "" : "@xl:grid-flow-col @xl:auto-cols-fr"}`}>
            {list.map((p, i) => (
              <li key={p.id} className={`min-w-0 grid items-center gap-3 ${one ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[7rem_minmax(0,1fr)] @xl:grid-cols-1 @xl:justify-items-center @xl:text-center @xl:content-start"} ${i > 0 ? "hidden @xl:grid" : ""}`}>
                {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} loading="lazy" className={`w-full object-contain ${one ? "max-h-44 @xl:max-h-56" : "max-h-24 @xl:max-h-none @xl:h-28 @xl:object-bottom"} ${p.cutout ? (light ? "eu-cutout-shadow-dark" : "eu-cutout-shadow") : "rounded-xl bg-white p-2"}`} />}
                <div className="grid gap-1 min-w-0">
                  {d.products.showBrand && <span className={`font-heading font-extrabold uppercase text-[length:var(--fs-15)] @xl:text-[length:var(--fs-18)] ${one ? "" : "@xl:truncate"}`}>{p.brand}</span>}
                  <span className={`leading-snug line-clamp-2 text-[length:var(--fs-13)] @xl:text-[length:var(--fs-14)] ${one ? "" : "@xl:min-h-[2.75em]"} ${sub}`}>{p.title}</span>
                  {one && d.products.bullets.length > 0 && <ul className="m-0 pl-4 grid gap-0.5 text-[length:var(--fs-13)] @xl:text-[length:var(--fs-15)] font-semibold text-left">{d.products.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
                  {d.products.showEnergy && p.energy ? <span className={one ? "justify-self-start" : "justify-self-start @xl:justify-self-center @xl:h-7 inline-flex items-center"}><EnergyChip cls={p.energy} fiche="" compact /></span> : null}
                  <span className="grid leading-none mt-1">
                    {d.products.priceLabel && <span className="font-bold text-[length:var(--fs-12)] tracking-wide">{d.products.priceLabel}</span>}
                    <span className={`font-heading font-extrabold tabular-nums ${one ? "text-[length:var(--fs-34)] @xl:text-[length:var(--fs-44)]" : "text-[length:var(--fs-24)] @xl:text-[length:var(--fs-28)]"} ${accent.className}`}><Price value={p.price} short euroSmall /></span>
                    {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price ? <s className={`tabular-nums text-[length:var(--fs-13)] ${sub}`}>{eur(p.wasPrice)} €</s> : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.length > 1 && (
          <CardRotator label="Προϊόντα προσφοράς" hideUntil={SHOW_FROM}>
            {list.map((p) => (
              // τίτλος πάντα 2 γραμμών, τιμή και αρχική τιμή στην ίδια γραμμή. Έτσι όλα στοιχίζονται χωρίς κενές «θέσεις» και τα προϊόντα ξεχωρίζουν.
              <div key={p.id} className={`min-w-0 grid grid-cols-[7rem_minmax(0,1fr)] @xl:grid-cols-1 items-center @xl:content-start gap-3 @xl:gap-2.5 @xl:rounded-2xl @xl:p-3 ${light ? "@xl:bg-white/[0.07] @xl:ring-1 @xl:ring-white/15" : "@xl:bg-black/[0.04] @xl:ring-1 @xl:ring-black/10"}`}>
                {p.image && <img src={p.image} alt={`${p.brand} ${p.title}`} className={`eu-sl-img w-full object-contain max-h-24 @xl:max-h-none @xl:h-28 ${p.cutout ? (light ? "eu-cutout-shadow-dark" : "eu-cutout-shadow") : "rounded-xl bg-white p-2"}`} />}
                <div className="grid gap-1 min-w-0">
                  <span className="flex items-center justify-between gap-2 min-h-7">
                    {d.products.showBrand && <span className="eu-sl-brand font-heading font-extrabold uppercase truncate text-[length:var(--fs-15)] @xl:text-[length:var(--fs-17)]">{p.brand}</span>}
                    {d.products.showEnergy && p.energy && <span className="shrink-0 ml-auto"><EnergyChip cls={p.energy} fiche="" compact /></span>}
                  </span>
                  <span className={`eu-sl-title leading-snug line-clamp-2 @xl:min-h-[2.75em] text-[length:var(--fs-13)] @xl:text-[length:var(--fs-14)] ${light ? "text-white/85" : "text-eu-ink-2"}`}>{p.title}</span>
                  <span className="grid leading-none mt-1.5 gap-1">
                    {d.products.priceLabel && <span className="font-bold text-[length:var(--fs-12)] tracking-wide">{d.products.priceLabel}</span>}
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className={`eu-sl-price font-heading font-extrabold tabular-nums text-[length:var(--fs-24)] @xl:text-[length:var(--fs-28)] ${accent.className}`}><Price value={p.price} short euroSmall /></span>
                      {d.products.showWas && p.wasPrice != null && p.wasPrice > p.price && <s className={`tabular-nums text-[length:var(--fs-14)] ${sub}`}>{eur(p.wasPrice)} €</s>}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </CardRotator>
        )}
      </div>
    </div>
  );
}
