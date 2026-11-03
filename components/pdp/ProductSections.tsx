import Image from "@/components/ui/Image";
import { Fragment, type ReactNode } from "react";
import { autoLayout, calmTitle, type ImageSize, type PublishedSection, type SectionImage, type SectionFeature, type SectionLayout } from "@/lib/catalog/banner-doc";
import { sx } from "@/components/ui/sx";

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
type Render = {
  renderImage?: (im: SectionImage, variant: "main" | "more") => ReactNode;
  renderIcon?: (f: SectionFeature) => ReactNode;
  /** προεπισκόπηση του εργαλείου: κάθε ενότητα / φωτογραφία / κάρτα γίνεται επιλέξιμη (data-*), `sel` = τι είναι επιλεγμένο */
  editable?: boolean;
  sel?: string | null;
};
// πλάτη ως σταθερές κλάσεις (όχι style attribute — το CSP δεν το επιτρέπει)
const SIZE_W: Record<ImageSize, string> = { s: "w-[min(100%,14rem)]", m: "w-[min(100%,24rem)]", l: "w-[min(100%,38rem)]", full: "w-full" };
/** Πλάτος θέσης φωτογραφίας (κλάση): η επιλογή του διαχειριστή, αλλιώς η προεπιλογή της διάταξης. */
const slotW = (im: SectionImage | undefined, def: string) => (im?.size ? SIZE_W[im.size] : def);
/** Σημάδια επεξεργασίας (μόνο στην προεπισκόπηση του εργαλείου). */
const mark = (r: Render, key: string) => (r.editable ? { "data-edit": key, ...(r.sel === key ? { "data-selected": "" } : {}) } : {});
const featKey = (s: PublishedSection, f: SectionFeature, k: number) => `feat:${s.id}:${f.fid ?? k}`;

function Img({ im, variant, sizes, r }: { im: SectionImage; variant: "main" | "more"; sizes: string; r: Render }) {
  // ποτέ μεγαλύτερη από το πραγματικό της πλάτος: μια περικοπή 270px απλωμένη στα 760px είναι θολή
  const maxW = sx({ maxWidth: im.width });
  return (
    <div {...mark(r, `img:${im.url}`)} className={`w-full mx-auto ${maxW.className}`}>
      {maxW.node}
      {r.renderImage ? r.renderImage(im, variant) : <Image src={im.url} alt={im.alt} width={im.width} height={im.height} sizes={sizes} className="w-full h-auto rounded-xl" />}
    </div>
  );
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

function Heading({ s }: { s: PublishedSection }) {
  return (
    <>
      {s.title && <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-snug text-pretty">{s.title}</h3>}
      {s.subtitle && <p className="m-0 font-semibold text-eu-ink-2 text-[length:var(--fs-16)] leading-snug">{s.subtitle}</p>}
    </>
  );
}
function Body({ s }: { s: PublishedSection }) {
  return <>{s.body?.split(/\n{2,}/).map((p, k) => <p key={k} className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-[1.7] max-w-[68ch]">{p}</p>)}</>;
}
function Foot({ s }: { s: PublishedSection }) {
  return s.footnote ? <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)] leading-snug max-w-[80ch]">{s.footnote}</p> : null;
}
function FeatureList({ s, r }: { s: PublishedSection; r: Render }) {
  if (!s.features.length) return null;
  return (
    <ul className="m-0 p-0 list-none grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))] mt-1">
      {s.features.map((f, k) => <li key={k} {...mark(r, featKey(s, f, k))} className="flex items-start gap-3 min-w-0"><Icon f={f} r={r} /><span className="grid gap-0.5 min-w-0 break-words hyphens-auto"><span className="text-eu-ink font-semibold text-[length:var(--fs-15)] leading-snug">{f.label}</span>{f.text && <span className="text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{f.text}</span>}</span></li>)}
    </ul>
  );
}
function Stats({ s }: { s: PublishedSection }) {
  if (!s.stats?.length) return null;
  return (
    <dl className="m-0 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
      {s.stats.map((x, k) => (
        <div key={k} className="rounded-xl bg-eu-chip px-4 py-4">
          <dd className="m-0 font-heading font-extrabold text-eu-navy text-[length:var(--fs-32)] leading-none tabular-nums">{x.value}</dd>
          <dt className="mt-2 text-eu-ink-2 font-semibold text-[length:var(--fs-15)] leading-snug">{x.label}</dt>
        </div>
      ))}
    </dl>
  );
}
/**
 * Φωτογραφία σε σταθερό πλαίσιο (4:3, κινητό 16:9 και χαμηλό), ώστε όλες οι ενότητες να έχουν το ίδιο μέτρο: μια κάθετη
 * λεπτομέρεια δεν τεντώνει πια την ενότητα στα 600px. Πολύ φαρδιές / ψηλές εικόνες (διαγράμματα) χωρούν ολόκληρες.
 */
function Framed({ im, sizes, r, variant = "main" }: { im: SectionImage; sizes: string; r: Render; variant?: "main" | "more" }) {
  const ratio = im.width / Math.max(1, im.height);
  // κομμένες φωτογραφίες (κύκλοι, προϊόν σε λευκό) και διαγράμματα χωρούν ολόκληρα· οι υπόλοιπες γεμίζουν το πλαίσιο
  const contain = variant === "more" || ratio < 0.7 || ratio > 2.2;
  const fit = contain ? "[&_img]:object-contain [&_img]:object-top" : "[&_img]:object-cover bg-eu-surface";
  return (
    <div {...mark(r, `img:${im.url}`)} className={`relative w-full aspect-video max-h-44 @2xl:aspect-[4/3] @2xl:max-h-80 rounded-xl overflow-hidden [&_img]:size-full [&_img]:rounded-none ${fit}`}>
      {r.renderImage ? r.renderImage(im, variant) : <Image src={im.url} alt={im.alt} width={im.width} height={im.height} sizes={sizes} />}
    </div>
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
      <span {...mark(r, featKey(s, f, 0))} className="rounded-2xl bg-eu-surface p-2 @2xl:p-3 shrink-0 @2xl:row-span-2 @2xl:self-start"><Icon f={f} r={r} /></span>
      <div className="grid gap-1 min-w-0"><Heading s={s} />{!sameText(f.label, s.title) && <p className="m-0 text-eu-ink font-semibold text-[length:var(--fs-15)]">{f.label}</p>}</div>
      <div className="col-span-2 @2xl:col-span-1 @2xl:col-start-2 grid gap-2 min-w-0">
        <Body s={s} />
        {f.text && !sameText(f.text, f.label) && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">{f.text}</p>}
        <Foot s={s} />
      </div>
    </div>
  );
}

/** Φωτογραφία αριστερά (5/12), κείμενο δεξιά στοιχισμένο στην κορυφή — πάντα την ίδια πλευρά, για μία ευθεία ανάγνωσης. */
function Split({ im, sizes, r, children }: { im: SectionImage; sizes: string; r: Render; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 @2xl:gap-8 items-start">
      <Framed im={im} sizes={sizes} r={r} />
      <div className="grid gap-3 content-start min-w-0">{children}</div>
    </div>
  );
}

function Section({ s, layout, sizes, r }: { s: PublishedSection; layout: SectionLayout; sizes: string; r: Render }) {
  const [main, ...more] = s.images;
  switch (layout) {
    case "hero":
      return (
        <section className="grid gap-4">
          {main && <div {...mark(r, `img:${main.url}`)} className={`rounded-xl overflow-hidden max-h-[26rem] [&_img]:w-full [&_img]:h-auto [&_img]:max-h-[26rem] [&_img]:object-cover [&_img]:rounded-none ${main.size && main.size !== "full" ? slotW(main, "") : "w-full"}`}>{r.renderImage ? r.renderImage(main, "main") : <Image src={main.url} alt={main.alt} width={main.width} height={main.height} sizes="(min-width: 1024px) 760px, 100vw" />}</div>}
          <div className="grid gap-2"><Heading s={s} /><Body s={s} /></div>
          <FeatureList s={s} r={r} />
          <Foot s={s} />
        </section>
      );
    case "features":
      // χωρίς εικονίδια (π.χ. πίνακας προδιαγραφών): πυκνή λίστα, όχι δεκάδες κάρτες
      if (!s.features.some((f) => f.iconUrl)) return (
        <section className="grid gap-4">
          <div className="grid gap-2"><Heading s={s} /><Body s={s} /></div>
          {main && <div className="@2xl:w-5/12"><Framed im={main} sizes={sizes} r={r} /></div>}
          <ul className="m-0 p-0 list-none grid gap-x-6 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
            {s.features.map((f, k) => <li key={k} {...mark(r, featKey(s, f, k))} className="flex gap-2 text-eu-ink-2 text-[length:var(--fs-15)] leading-snug border-b border-eu-line-2 pb-2"><span className="mt-[0.5em] size-1.5 rounded-full bg-eu-yellow shrink-0" aria-hidden /><span>{f.text ? <><strong className="text-eu-ink">{f.label}</strong> — {f.text}</> : f.label}</span></li>)}
          </ul>
          <Foot s={s} />
        </section>
      );
      // κάρτες με εξήγηση: λίστα σε δύο στήλες — εικονίδιο αριστερά, τίτλος, κανονικό κείμενο
      if (s.features.some((f) => f.text || f.label.length > 48)) return (
        <section className="grid gap-5">
          <div className="grid gap-2"><Heading s={s} /><Body s={s} /></div>
          {main && <div className="@2xl:w-5/12"><Framed im={main} sizes={sizes} r={r} /></div>}
          <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 gap-x-8 gap-y-5">
            {s.features.map((f, k) => (
              <li key={k} {...mark(r, featKey(s, f, k))} className="flex items-start gap-3 min-w-0">
                {f.iconUrl ? <span className="rounded-lg bg-eu-surface p-1.5 shrink-0 [&_img]:size-8"><Icon f={f} r={r} /></span> : <span className="mt-2 size-2 rounded-full bg-eu-yellow shrink-0" aria-hidden />}
                <div className="grid gap-1 min-w-0">
                  <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] leading-snug text-pretty">{f.label}</h4>
                  {f.text && !sameText(f.text, f.label) && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed text-pretty">{f.text}</p>}
                </div>
              </li>
            ))}
          </ul>
          <Foot s={s} />
        </section>
      );
      // σύντομες λειτουργίες με εικονίδιο: πυκνή λίστα (εικονίδιο + ετικέτα), όχι πλέγμα από κάρτες — 33 κάρτες ήταν 17 οθόνες στο κινητό
      return (
        <section className="grid gap-4">
          <div className="grid gap-2"><Heading s={s} /><Body s={s} /></div>
          {main && <div className="@2xl:w-5/12"><Framed im={main} sizes={sizes} r={r} /></div>}
          <ul className="m-0 p-0 list-none grid grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 gap-x-4 gap-y-3">
            {s.features.map((f, k) => (
              <li key={k} {...mark(r, featKey(s, f, k))} className="flex items-center gap-3 min-w-0">
                {f.iconUrl ? <span className="shrink-0 [&_img]:size-8"><Icon f={f} r={r} /></span> : <span className="size-1.5 rounded-full bg-eu-yellow shrink-0" aria-hidden />}
                <span className="min-w-0 break-words hyphens-auto text-eu-ink text-[length:var(--fs-14)] leading-snug">{f.label}</span>
              </li>
            ))}
          </ul>
          <Foot s={s} />
        </section>
      );
    case "stats":
      return (
        <section className="grid gap-4">
          <Heading s={s} />
          <Stats s={s} />
          {main ? <Split im={main} sizes={sizes} r={r}><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></Split> : <div className="grid gap-3"><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></div>}
        </section>
      );
    case "gallery":
      return (
        <section className="grid gap-4">
          {(s.title || s.subtitle || s.body) && <div className="grid gap-2"><Heading s={s} /><Body s={s} /></div>}
          {/* κινητό: δύο φωτογραφίες αρκούν */}
          <div className="grid gap-4 grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @max-2xl:[&>figure:nth-child(n+3)]:hidden">
            {s.images.map((im, k) => <figure key={k} className="m-0 grid gap-2 content-start"><Framed im={im} variant="more" sizes="(min-width: 1024px) 260px, 50vw" r={r} />{im.alt && <figcaption className="text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{im.alt}</figcaption>}</figure>)}
          </div>
          <FeatureList s={s} r={r} /><Foot s={s} />
        </section>
      );
    case "badges":
      return (
        <section className="grid gap-4">
          <Heading s={s} />
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {s.images.map((im, k) => <div key={k} className="w-[min(100%,28rem)] [&_img]:max-h-20 [&_img]:w-auto [&_img]:rounded-none"><Img im={im} variant="more" sizes="(min-width: 1024px) 420px, 90vw" r={r} /></div>)}
          </div>
          <Body s={s} /><Foot s={s} />
        </section>
      );
    case "text":
      if (oneIcon(s)) return <section><IconText s={s} r={r} /></section>;
      return <section className="grid gap-3 max-w-[72ch]"><Heading s={s} /><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></section>;
    case "split":
    default:
      return (
        <section className="grid gap-4">
          {main ? <Split im={main} sizes={sizes} r={r}><Heading s={s} /><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></Split>
            : oneIcon(s) ? <IconText s={s} r={r} /> : <div className="grid gap-3 max-w-[78ch]"><Heading s={s} /><Body s={s} /><FeatureList s={s} r={r} /><Foot s={s} /></div>}
          {/* δευτερεύουσες φωτογραφίες: μικρές, στη στήλη του κειμένου — και καθόλου στο κινητό */}
          {more.length > 0 && <div className="hidden @2xl:grid grid-cols-3 gap-4 @2xl:ml-[calc(5/12*100%+0.75rem)]">{more.map((im, k) => <Framed key={k} im={im} variant="more" sizes="220px" r={r} />)}</div>}
        </section>
      );
  }
}

const MIN_HERO_W = 640;

export function ProductSections({ sections, sizes = "(min-width: 1024px) 380px, 100vw", renderImage, renderIcon, editable, sel }: { sections: PublishedSection[]; sizes?: string } & Render) {
  if (!sections.length) return null;
  const r: Render = { renderImage, renderIcon, editable, sel };
  // λέξεις με τόνους από όλο το κείμενο του προϊόντος, για τους τίτλους που ήρθαν με ΚΕΦΑΛΑΙΑ
  const corpus = sections.flatMap((x) => [x.body, x.footnote, ...x.features.flatMap((f) => [f.label, f.text])]).filter(Boolean).join(" ");
  return (
    <div className="@container grid gap-8 @2xl:gap-12">
      {sections.map((s0) => {
        const seen = new Set<string>(); // το ίδιο εικονίδιο από δύο banners («Λειτουργία ύπνου» δύο φορές)
        const features = s0.features.map(splitFeature).filter((f) => { const k = flat(f.label); if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; });
        const s = { ...s0, title: s0.title && calmTitle(s0.title, corpus), subtitle: s0.subtitle && calmTitle(s0.subtitle, corpus), features };
        const layout0 = s.layout ?? autoLayout({ images: s.images.map((i) => ({ kind: "product", ratio: i.width / Math.max(1, i.height), overlayText: false })), features: s.features.length, stats: s.stats?.length ?? 0, textChars: (s.body ?? "").length });
        // «hero» μόνο με φωτογραφία που αντέχει το πλάτος — αλλιώς δίπλα στο κείμενο, στο πραγματικό της μέγεθος
        const layout = layout0 === "hero" && (s.images[0]?.width ?? 0) < MIN_HERO_W ? "split" : layout0;
        const el = <Section s={s} layout={layout} sizes={sizes} r={r} />;
        return editable ? <div key={s.id} {...mark(r, `sec:${s.id}`)}>{el}</div> : <Fragment key={s.id}>{el}</Fragment>;
      })}
    </div>
  );
}
