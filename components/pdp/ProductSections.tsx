import Image from "next/image";
import type { ReactNode } from "react";
import { autoLayout, type PublishedSection, type SectionImage, type SectionFeature, type SectionLayout } from "@/lib/catalog/banner-doc";

/**
 * «Από τον κατασκευαστή»: οι ενότητες που βγήκαν από τα banners, ως πραγματικό κείμενο και καθαρές φωτογραφίες, σε
 * διατάξεις που διάλεξε ο σχεδιαστής (ή ο διαχειριστής):
 *   hero      φωτογραφία σε όλο το πλάτος, τίτλος και κείμενο στο κέντρο από κάτω
 *   split     φωτογραφία δίπλα στο κείμενο, εναλλάξ αριστερά / δεξιά (στενό: η μία κάτω από την άλλη)
 *   features  κάρτες χαρακτηριστικών με εικονίδια
 *   stats     τα βασικά νούμερα σε μεγάλα γράμματα
 *   gallery   πλέγμα φωτογραφιών με λεζάντες
 *   badges    πιστοποιήσεις / λογότυπα σε σειρά
 *   text      στενή στήλη κειμένου
 * Το ίδιο component αποδίδει και την προεπισκόπηση του εργαλείου — `renderImage` / `renderIcon` δείχνουν περικοπές πριν γίνουν αρχεία.
 */
type Render = { renderImage?: (im: SectionImage, variant: "main" | "more") => ReactNode; renderIcon?: (f: SectionFeature) => ReactNode };

function Img({ im, variant, sizes, r }: { im: SectionImage; variant: "main" | "more"; sizes: string; r: Render }) {
  // ποτέ μεγαλύτερη από το πραγματικό της πλάτος: μια περικοπή 270px απλωμένη στα 760px είναι θολή
  return <>{r.renderImage ? r.renderImage(im, variant) : <Image src={im.url} alt={im.alt} width={im.width} height={im.height} sizes={sizes} style={{ maxWidth: im.width }} className="w-full h-auto rounded-xl mx-auto" />}</>;
}
function Icon({ f, r, big }: { f: SectionFeature; r: Render; big?: boolean }) {
  if (r.renderIcon && f.iconUrl) return <>{r.renderIcon(f)}</>;
  if (f.iconUrl) return <Image src={f.iconUrl} alt="" width={f.iconW ?? 48} height={f.iconH ?? 48} className={`${big ? "size-14" : "size-11"} object-contain shrink-0`} />;
  return <span className="size-2 rounded-full bg-eu-yellow shrink-0 ml-1" aria-hidden />;
}

const flat = (x: string | null | undefined) => (x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-zα-ω0-9]+/g, "");
/** Η λεζάντα του εικονιδίου λέει το ίδιο με τον τίτλο (π.χ. «I-Sense» μέσα στο «Λειτουργία I-Sense»); */
const wordset = (x: string | null | undefined) => (x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-zα-ω0-9]+/).filter(Boolean).sort().join(" ");
const sameText = (a: string, b: string | null) => { const x = flat(a), y = flat(b); return !!x && !!y && (y.includes(x) || x.includes(y) || wordset(a) === wordset(b)); };

/**
 * Λεζάντα που κουβαλά ολόκληρη εξήγηση («Αθόρυβη Λειτουργία "QUIET": Επιλέξτε…») → τίτλος + κείμενο. Οι σύντομες
 * γραμμές προδιαγραφών («Ψυκτική απόδοση: 3,5 kW») μένουν ως έχουν.
 */
function splitFeature(f: SectionFeature): SectionFeature {
  if (f.text || f.label.length <= 40) return f;
  const m = f.label.match(/^([^\n]{3,70}?)\s*:\s+([\s\S]{12,})$/);
  return m ? { ...f, label: m[1].trim(), text: m[2].trim() } : f;
}

function Heading({ s, center }: { s: PublishedSection; center?: boolean }) {
  return (
    <>
      {s.title && <h3 className={`m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight text-balance ${center ? "text-center" : ""}`}>{s.title}</h3>}
      {s.subtitle && <p className={`m-0 font-bold text-eu-ink-2 text-[length:var(--fs-17)] leading-snug ${center ? "text-center" : ""}`}>{s.subtitle}</p>}
    </>
  );
}
function Body({ s, center }: { s: PublishedSection; center?: boolean }) {
  return <>{s.body?.split(/\n{2,}/).map((p, k) => <p key={k} className={`m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-[1.7] ${center ? "text-center mx-auto max-w-[68ch]" : ""}`}>{p}</p>)}</>;
}
function Foot({ s, center }: { s: PublishedSection; center?: boolean }) {
  return s.footnote ? <p className={`m-0 mt-1 text-eu-muted text-[length:var(--fs-14)] leading-snug ${center ? "text-center mx-auto max-w-[80ch]" : ""}`}>{s.footnote}</p> : null;
}
function FeatureList({ s, r }: { s: PublishedSection; r: Render }) {
  if (!s.features.length) return null;
  return (
    <ul className="m-0 p-0 list-none grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))] mt-1">
      {s.features.map((f, k) => <li key={k} className="flex items-start gap-3 min-w-0"><Icon f={f} r={r} /><span className="grid gap-0.5"><span className="text-eu-ink font-semibold text-[length:var(--fs-15)] leading-snug">{f.label}</span>{f.text && <span className="text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{f.text}</span>}</span></li>)}
    </ul>
  );
}
function Stats({ s }: { s: PublishedSection }) {
  if (!s.stats?.length) return null;
  return (
    <dl className="m-0 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
      {s.stats.map((x, k) => (
        <div key={k} className="rounded-2xl bg-eu-chip px-4 py-4 text-center">
          <dd className="m-0 font-heading font-extrabold text-eu-navy text-[length:var(--fs-36)] leading-none tracking-tight">{x.value}</dd>
          <dt className="mt-2 text-eu-ink-2 font-semibold text-[length:var(--fs-15)] leading-snug">{x.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** Μία λειτουργία με το εικονίδιό της και χωρίς φωτογραφία. */
const oneIcon = (s: PublishedSection) => !s.images.length && s.features.length === 1 && !!s.features[0].iconUrl;
/** Εικονίδιο δίπλα στον τίτλο — όχι μόνο του σε μια γραμμή κάτω από το κείμενο. */
function IconText({ s, r }: { s: PublishedSection; r: Render }) {
  const f = s.features[0];
  // κινητό: εικονίδιο δίπλα στον τίτλο, κείμενο σε όλο το πλάτος από κάτω· φαρδιά οθόνη: κείμενο στη στήλη του τίτλου
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 @2xl:gap-x-6 gap-y-2 items-center max-w-[82ch]">
      <span className="rounded-2xl bg-eu-surface p-2 @2xl:p-3 shrink-0 @2xl:row-span-2 @2xl:self-start"><Icon f={f} r={r} /></span>
      <div className="grid gap-1 min-w-0"><Heading s={s} />{!sameText(f.label, s.title) && <p className="m-0 text-eu-ink font-semibold text-[length:var(--fs-15)]">{f.label}</p>}</div>
      <div className="col-span-2 @2xl:col-span-1 @2xl:col-start-2 grid gap-2 min-w-0">
        <Body s={s} />
        {f.text && !sameText(f.text, f.label) && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">{f.text}</p>}
        <Foot s={s} />
      </div>
    </div>
  );
}

function Section({ s, layout, flip, sizes, r }: { s: PublishedSection; layout: SectionLayout; flip: boolean; sizes: string; r: Render }) {
  const [main, ...more] = s.images;
  switch (layout) {
    case "hero":
      return (
        <section className="grid gap-5">
          {main && <Img im={main} variant="main" sizes="(min-width: 1024px) 760px, 100vw" r={r} />}
          <div className="grid gap-3 justify-items-center"><Heading s={s} center /><Body s={s} center /></div>
          {s.features.length > 0 && <div className="mx-auto w-full max-w-[60rem]"><FeatureList s={s} r={r} /></div>}
          <Foot s={s} center />
        </section>
      );
    case "features":
      // χωρίς εικονίδια (π.χ. πίνακας προδιαγραφών): πυκνή λίστα, όχι δεκάδες κάρτες
      if (!s.features.some((f) => f.iconUrl)) return (
        <section className="grid gap-4">
          <div className="grid gap-2"><Heading s={s} /><Body s={s} /></div>
          {main && <div className="w-full max-w-[36rem]"><Img im={main} variant="main" sizes={sizes} r={r} /></div>}
          <ul className="m-0 p-0 list-none grid gap-x-6 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
            {s.features.map((f, k) => <li key={k} className="flex gap-2 text-eu-ink-2 text-[length:var(--fs-15)] leading-snug border-b border-eu-line-2 pb-2"><span className="mt-[0.5em] size-1.5 rounded-full bg-eu-yellow shrink-0" aria-hidden /><span>{f.text ? <><strong className="text-eu-ink">{f.label}</strong> — {f.text}</> : f.label}</span></li>)}
          </ul>
          <Foot s={s} />
        </section>
      );
      // κάρτες με εξήγηση: λίστα σε δύο στήλες — εικονίδιο αριστερά, τίτλος, κανονικό κείμενο (όχι έντονη παράγραφος στο κέντρο)
      if (s.features.some((f) => f.text || f.label.length > 48)) return (
        <section className="grid gap-6">
          <div className="grid gap-2"><Heading s={s} /><Body s={s} /></div>
          {main && <div className="w-full max-w-[36rem]"><Img im={main} variant="main" sizes={sizes} r={r} /></div>}
          <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 gap-x-10 gap-y-7">
            {s.features.map((f, k) => (
              <li key={k} className="flex items-start gap-4 min-w-0">
                {f.iconUrl ? <span className="rounded-2xl bg-eu-surface p-2.5 shrink-0"><Icon f={f} r={r} /></span> : <span className="mt-2.5 size-2 rounded-full bg-eu-yellow shrink-0" aria-hidden />}
                <div className="grid gap-1 min-w-0">
                  <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-snug text-pretty">{f.label}</h4>
                  {f.text && !sameText(f.text, f.label) && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed text-pretty">{f.text}</p>}
                </div>
              </li>
            ))}
          </ul>
          <Foot s={s} />
        </section>
      );
      return (
        <section className="grid gap-5">
          <div className="grid gap-2 justify-items-center"><Heading s={s} center /><Body s={s} center /></div>
          {main && <div className="mx-auto w-full max-w-[36rem]"><Img im={main} variant="main" sizes={sizes} r={r} /></div>}
          <ul className="m-0 p-0 list-none grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
            {s.features.map((f, k) => (
              <li key={k} className="rounded-2xl bg-eu-surface px-4 py-5 grid gap-3 content-start justify-items-center text-center">
                {f.iconUrl && <Icon f={f} r={r} big />}
                <span className="text-eu-ink font-bold text-[length:var(--fs-15)] leading-snug text-balance">{f.label}</span>
              </li>
            ))}
          </ul>
          <Foot s={s} center />
        </section>
      );
    case "stats":
      return (
        <section className="grid gap-5">
          <div className="grid gap-2 justify-items-center"><Heading s={s} center /></div>
          <Stats s={s} />
          {main ? (
            <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-5 @2xl:gap-8 items-center">
              <div className={flip ? "@2xl:order-2" : ""}><Img im={main} variant="main" sizes={sizes} r={r} /></div>
              <div className="grid gap-3 content-start"><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></div>
            </div>
          ) : <div className="grid gap-3"><Body s={s} center /><FeatureList s={s} r={r} /><Foot s={s} center /></div>}
        </section>
      );
    case "gallery":
      return (
        <section className="grid gap-4">
          {(s.title || s.subtitle || s.body) && <div className="grid gap-2 justify-items-center"><Heading s={s} center /><Body s={s} center /></div>}
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
            {s.images.map((im, k) => <figure key={k} className="m-0 grid gap-2 content-start"><Img im={im} variant="more" sizes="(min-width: 1024px) 360px, 50vw" r={r} />{im.alt && <figcaption className="text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{im.alt}</figcaption>}</figure>)}
          </div>
          <FeatureList s={s} r={r} /><Foot s={s} center />
        </section>
      );
    case "badges":
      return (
        <section className="grid gap-4 justify-items-center text-center">
          <Heading s={s} center />
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {s.images.map((im, k) => <div key={k} className="w-[min(100%,28rem)] [&_img]:max-h-24 [&_img]:w-auto [&_img]:mx-auto [&_img]:rounded-none"><Img im={im} variant="more" sizes="(min-width: 1024px) 420px, 90vw" r={r} /></div>)}
          </div>
          <Body s={s} center /><Foot s={s} center />
        </section>
      );
    case "text":
      if (oneIcon(s)) return <section><IconText s={s} r={r} /></section>;
      return <section className="grid gap-3 max-w-[72ch]"><Heading s={s} /><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></section>;
    case "split":
    default:
      return (
        <section className="grid gap-4">
          {main ? (
            <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-5 @2xl:gap-8 items-center">
              <div className={flip ? "@2xl:order-2" : ""}><Img im={main} variant="main" sizes={sizes} r={r} /></div>
              <div className="grid gap-3 content-start min-w-0"><Heading s={s} /><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></div>
            </div>
          ) : oneIcon(s) ? <IconText s={s} r={r} /> : <div className="grid gap-3 max-w-[78ch]"><Heading s={s} /><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></div>}
          {/* δευτερεύουσες φωτογραφίες: μέτριο μέγεθος στο κέντρο — ποτέ μια λεπτομέρεια σε όλο το πλάτος */}
          {more.length > 0 && <div className="flex flex-wrap justify-center gap-4">{more.map((im, k) => <div key={k} className="w-[min(100%,24rem)]"><Img im={im} variant="more" sizes="(min-width: 1024px) 384px, 90vw" r={r} /></div>)}</div>}
        </section>
      );
  }
}

const MIN_HERO_W = 640;

export function ProductSections({ sections, sizes = "(min-width: 1024px) 380px, 100vw", renderImage, renderIcon }: { sections: PublishedSection[]; sizes?: string } & Render) {
  if (!sections.length) return null;
  const r: Render = { renderImage, renderIcon };
  let splits = 0; // το εναλλάξ αριστερά / δεξιά μετρά μόνο τις ενότητες με φωτογραφία δίπλα στο κείμενο
  return (
    <div className="@container grid gap-12">
      {sections.map((s0) => {
        const s = { ...s0, features: s0.features.map(splitFeature) };
        const layout0 = s.layout ?? autoLayout({ images: s.images.map((i) => ({ kind: "product", ratio: i.width / Math.max(1, i.height), overlayText: false })), features: s.features.length, stats: s.stats?.length ?? 0, textChars: (s.body ?? "").length });
        // «hero» μόνο με φωτογραφία που αντέχει το πλάτος — αλλιώς δίπλα στο κείμενο, στο πραγματικό της μέγεθος
        const layout = layout0 === "hero" && (s.images[0]?.width ?? 0) < MIN_HERO_W ? "split" : layout0;
        const flip = layout === "split" || layout === "stats" ? splits++ % 2 === 1 : false;
        return <Section key={s.id} s={s} layout={layout} flip={flip} sizes={sizes} r={r} />;
      })}
    </div>
  );
}
