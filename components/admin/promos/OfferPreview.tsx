"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Eye, Loader2 } from "lucide-react";
import { DesignedBanner } from "@/components/promo/DesignedBanner";
import type { BannerDesign, BannerProduct } from "@/lib/promo/banner-design";
import { SLOTS } from "@/lib/promo/landing-blocks";
import { StickerSvg } from "@/components/stickers/StickerSvg";
import type { StickerParams } from "@/lib/stickers/model";
import { bannerPreviewProductsAction } from "@/app/admin/(shell)/prosfores/theseis/actions";
import type { PromoDraft } from "@/lib/promo/admin";
import { offerDesignsAction, offerPreviewAction, savePlacementAction, stickerParamsAction, type OfferDesign, type PreviewCard } from "@/app/admin/(shell)/prosfores/actions";

const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

/**
 * «Έτσι θα το δει ο πελάτης»: πραγματικά προϊόντα του καλαθιού με την ετικέτα, τη διαγραμμένη και την τελική τιμή, όπως
 * βγαίνουν από το προσχέδιο. `row` = και η σειρά της αρχικής (τίτλος + κάρτες), όπως μπαίνει με το «Βάλε την στην αρχική».
 */
export function OfferPreview({ d, row = false, id = null }: { d: PromoDraft; row?: boolean; /** αποθηκευμένη προσφορά: ανοίγει η επιλογή σχεδιασμού και το «Φτιάξε banner» */ id?: string | null }) {
  const [cards, setCards] = useState<PreviewCard[] | null>(null);
  // μόνο ό,τι αλλάζει την εικόνα: είδος, έκπτωση / τιμές, προϊόντα, ετικέτα
  const key = JSON.stringify([d.mechanism, d.reward.percent, d.reward.amount, d.reward.price, d.targets, d.tagLabel]);
  useEffect(() => {
    let on = true;
    const t = setTimeout(() => { void offerPreviewAction(d).then((r) => { if (on) setCards(r.cards); }).catch(() => { if (on) setCards([]); }); }, 600);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- το key κρατά όσα πεδία του προσχεδίου μετράνε
  }, [key]);

  // το sticker που διάλεξε ο χρήστης στο βήμα «Εμφάνιση»: ζωγραφίζεται πάνω στις κάρτες και στο σχέδιο
  const [sticker, setSticker] = useState<StickerParams | null>(null);
  const skey = d.stickerKey ?? null;
  useEffect(() => { let on = true; void stickerParamsAction(skey).then((r) => { if (on) setSticker(r); }).catch(() => { if (on) setSticker(null); }); return () => { on = false; }; }, [skey]);

  // ---- σχεδιασμοί που υπάρχουν ήδη: διαλέγεις έναν, βλέπεις την προσφορά μέσα του, και τον εφαρμόζεις ως banner της ----
  const [designs, setDesigns] = useState<OfferDesign[]>([]);
  const [pick, setPick] = useState("");
  const [slot, setSlot] = useState("home-strip");
  const [prods, setProds] = useState<BannerProduct[] | null>(null);
  const [made, setMade] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { if (!id) return; let on = true; void offerDesignsAction().then((r) => { if (on) setDesigns(r); }).catch(() => {}); return () => { on = false; }; }, [id]);
  const chosen = designs.find((x) => x.key === pick) ?? null;
  // το σχέδιο με τα προϊόντα ΑΥΤΗΣ της προσφοράς· τα πρότυπα παίρνουν και το όνομά της για τίτλο
  const design: BannerDesign | null = chosen ? { ...chosen.design, ...(chosen.ownTexts ? {} : { title: d.name || chosen.design.title }), stickerKey: chosen.design.stickerKey ?? skey, products: { ...chosen.design.products, source: "promotion", ids: [] } } : null;
  const dkey = design ? JSON.stringify(design) : "";
  useEffect(() => {
    if (!id || !dkey) return;
    let on = true;
    void bannerPreviewProductsAction(JSON.parse(dkey) as BannerDesign, id).then((r) => { if (on) setProds(r); }).catch(() => { if (on) setProds([]); });
    return () => { on = false; };
  }, [id, dkey]);
  const choose = (k: string) => { setPick(k); setProds(null); setMade(null); const s = designs.find((x) => x.key === k)?.slot; if (s) setSlot(s); };
  const apply = () => start(async () => {
    if (!id || !design || !chosen) return;
    const where = SLOTS.find((x) => x.key === slot)?.label ?? slot;
    const r = await savePlacementAction({ slot, title: `${d.name || "Προσφορά"} · ${chosen.name}`.slice(0, 120), image: null, imageMobile: null, alt: d.name || null, href: null, promotionId: id, landingId: null, status: "active", startsAt: null, endsAt: null, priority: 100, categories: [], design });
    setMade(r.ok ? { ok: true, text: `Φτιάχτηκε banner με αυτό το σχέδιο στη θέση «${where}». Φαίνεται όσο τρέχει η προσφορά.`, href: `/admin/prosfores/theseis/${r.id}` } : { ok: false, text: "Δεν φτιάχτηκε το banner. Δοκίμασε ξανά." });
  });
  const groups = [...new Set(designs.map((x) => x.group))];

  return (
    <section data-help="promo.preview" aria-labelledby="pv-h" className="grid gap-3 rounded-2xl border-2 border-dashed border-eu-blue/40 bg-eu-chip/40 p-3 @md:p-4 @container">
      <div className="grid gap-0.5">
        <h4 id="pv-h" className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><Eye className="size-5 text-eu-blue" aria-hidden /> Έτσι θα το δει ο πελάτης</h4>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Πραγματικά προϊόντα από το καλάθι σου, με τις τιμές που βγαίνουν τώρα. Αλλάζει μόνο του καθώς αλλάζεις την προσφορά. Δεν έχει δημοσιευτεί τίποτα.</p>
      </div>
      {id && designs.length > 0 && (
        <label data-help="promo.design-pick" className="grid gap-1 font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Σχεδιασμός
          <select value={pick} onChange={(e) => choose(e.target.value)} className="w-full rounded-xl border-2 border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus-visible:border-eu-blue">
            <option value="">Απλές κάρτες προϊόντων (χωρίς σχέδιο)</option>
            {groups.map((g) => <optgroup key={g} label={g}>{designs.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</optgroup>)}
          </select>
          <span className="font-normal text-eu-ink-3 text-[length:var(--fs-13)]">Διάλεξε ένα σχέδιο που υπάρχει ήδη για να δεις την προσφορά μέσα του. Αν σου αρέσει, πάτα «Εφαρμογή» από κάτω.</span>
        </label>
      )}
      {!id && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Μόλις πατήσεις «Αποθήκευση πρόχειρου», εδώ εμφανίζεται και η λίστα «Σχεδιασμός», για να δεις την προσφορά μέσα σε ένα από τα banners που έχεις σχεδιάσει.</p>}
      {design ? (
        <div className="grid gap-3">
          {prods === null ? <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Στήνω το σχέδιο με τα προϊόντα της προσφοράς…</p> : (
            <>
              <div className="rounded-xl overflow-hidden border border-eu-line bg-white"><DesignedBanner d={design} products={prods} shape={slot === "info-aside" ? "square" : "wide"} href={null} sticker={design.stickerKey === skey ? sticker : null} /></div>
              {!prods.length && <p className="m-0 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">Το σχέδιο δεν έχει ακόμη προϊόντα να δείξει: γεμίζει μόνο του όταν η προσφορά δημοσιευτεί και γίνει ενεργή.</p>}
            </>
          )}
          <div className="grid gap-2 rounded-xl bg-white border border-eu-line p-3">
            <label className="grid gap-1 font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Σε ποια θέση του site;
              <select value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full rounded-xl border-2 border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus-visible:border-eu-blue @xl:max-w-md">
                {SLOTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy || !!made?.ok} onClick={apply} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50 cursor-pointer">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}Εφαρμογή: φτιάξε banner με αυτό το σχέδιο</button>
              <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Φτιάχνεται νέο banner για αυτή την προσφορά. Το banner από το οποίο πήρες το σχέδιο δεν αλλάζει.</span>
            </div>
            {made && <p role={made.ok ? "status" : "alert"} className={`m-0 rounded-lg px-3 py-2 font-bold text-[length:var(--fs-14)] ${made.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{made.text}{made.href && <> <Link href={made.href} target="_blank" className="underline">Άνοιξέ το για αλλαγές</Link></>}</p>}
          </div>
        </div>
      ) : cards === null ? <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Ετοιμάζω την προεπισκόπηση…</p>
        : !cards.length ? <p className="m-0 rounded-xl bg-white border border-eu-line px-3 py-3 text-eu-ink-2 text-[length:var(--fs-14)]">Δεν υπάρχει ακόμη κάτι να δείξω: βάλε προϊόντα στο καλάθι και έκπτωση ή τιμή προσφοράς. Προϊόν χωρίς χαμηλότερη τιμή δεν εμφανίζεται ως προσφορά.</p> : (
        <div className="rounded-xl bg-white border border-eu-line p-3 grid gap-3">
          {row && <div className="grid"><span className="font-bold text-eu-blue text-[length:var(--fs-12)]">Προσφορά</span><span className="font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight">{d.name || "Το όνομα της προσφοράς"}</span></div>}
          <ul className="m-0 p-0 list-none grid grid-cols-2 @3xl:grid-cols-4 gap-2">
            {cards.map((c) => (
              <li key={c.id} className="relative rounded-xl border border-eu-line p-2.5 grid gap-1.5 content-start">
                <span className="absolute left-2 top-2 z-10 rounded-full bg-eu-red text-white font-extrabold px-2 py-0.5 text-[length:var(--fs-12)]">{c.label}</span>
                {sticker && <span aria-hidden className="pointer-events-none absolute right-1.5 top-1.5 z-10 w-14 @3xl:w-16 [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"><StickerSvg p={{ ...sticker, size: 200 }} id={`pv-${c.id}`} /></span>}
                {/* eslint-disable-next-line @next/next/no-img-element -- μικρή εικόνα προεπισκόπησης στη διαχείριση */}
                {c.image ? <img src={c.image} alt="" loading="lazy" width={160} height={160} className="w-full aspect-square object-contain" /> : <span aria-hidden className="w-full aspect-square rounded-lg bg-eu-surface" />}
                <span className="text-eu-ink text-[length:var(--fs-13)] leading-snug line-clamp-2">{c.title}</span>
                <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums"><s className="text-eu-muted text-[length:var(--fs-13)]">{eur(c.before)}</s><b className="text-eu-ink text-[length:var(--fs-17)]">{eur(c.after)}</b></span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{row ? "Έτσι φαίνεται η σειρά της στην αρχική όταν τη βάλεις σε ζώνη. Οι ίδιες κάρτες φαίνονται στις λίστες, στην αναζήτηση και στη σελίδα /prosfores." : "Έτσι φαίνεται κάθε προϊόν στις λίστες, στην αναζήτηση και στη σελίδα /prosfores."}</p>
        </div>
      )}
    </section>
  );
}
