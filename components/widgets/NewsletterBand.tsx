import { ZoneBadge } from "@/components/site/ZoneBadge";
import { copyOf } from "@/lib/cms/copy";
import { NewsletterForm } from "./NewsletterForm";
import { activeConsentText } from "@/lib/gdpr/consent";

const c = copyOf("newsletter");

/** Zone 12 — one newsletter (the current site has two on one page), separate un-prechecked consent (GDPR). */
export async function NewsletterBand({ zoneNo }: { zoneNo?: number }) {
  const consentText = (await activeConsentText("newsletter").catch(() => null))?.text ?? "Συμφωνώ να λαμβάνω εμπορική επικοινωνία (newsletter) από τη Euronics και έχω διαβάσει την Πολιτική Απορρήτου.";
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
        <NewsletterForm consentText={consentText} labels={{ email: c.to_email_soy, submit: c.eggrafi, privacy: c.politiki_aporritoy }} />
      </div>
    </section>
  );
}
