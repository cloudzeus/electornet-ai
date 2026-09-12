import { ZoneBadge } from "@/components/site/ZoneBadge";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("newsletter");

/** Zone 12 — one newsletter (the current site has two on one page), separate un-prechecked consent (GDPR). */
export function NewsletterBand({ zoneNo }: { zoneNo?: number }) {
  return (
    <section className="relative bg-eu-surface border-t border-eu-line eu-container" aria-labelledby="nl-title">
      <ZoneBadge no={zoneNo} />
      <div className="eu-canvas eu-gutter py-6 grid grid-cols-1 @lg:grid-cols-2 gap-5 @lg:gap-[30px] items-center">
        <div>
          <h2 id="nl-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-21)] leading-[1.2] mb-1.5">
            {c.mathe_protos_tis_pragmatikes}
          </h2>
          <p className="m-0 text-eu-muted text-[length:var(--fs-15)] leading-[1.55]">{c.ena_email_tin_evdomada}</p>
        </div>
        <form action="/newsletter" method="post">
          <div className="flex gap-2 mb-2">
            <label htmlFor="nl-email" className="sr-only">
              {c.to_email_soy}
            </label>
            <input id="nl-email" name="email" type="email" required placeholder={c.to_email_soy} className="flex-1 min-w-0 rounded-full bg-white border border-eu-line text-eu-ink placeholder:text-eu-muted-2 px-4 py-3 text-[length:var(--fs-15)] outline-none focus-visible:ring-2 ring-eu-blue" />
            <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue">
              {c.eggrafi}
            </button>
          </div>
          <label className="flex items-start gap-2 text-eu-muted text-[length:var(--fs-13-5)] leading-[1.45] cursor-pointer">
            <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-eu-blue" />
            <span>
              Συμφωνώ να λαμβάνω εμπορική επικοινωνία και έχω διαβάσει την{" "}
              <a href="/aporrito" className="text-eu-blue underline">
                {c.politiki_aporritoy}
              </a>
              .
            </span>
          </label>
        </form>
      </div>
    </section>
  );
}
