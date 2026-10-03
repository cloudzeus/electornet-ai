import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { ContactForm } from "@/components/site/ContactForm";
import { PageZone, ZonesPreviewBar } from "@/components/site/PageZone";

export const metadata: Metadata = { title: "Επικοινωνία", description: "MEGA ELECTRICS ΑΕΒΕ · Δαμάσκου Σταμάτη 12, Αχαρνές · 210 483 5143 · info@euronics.gr" };

/** Contact: real details from euronics.gr/contactus, hours, live chat entry, form with subject routing. */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  return (
    <div className="eu-container">
      <ZonesPreviewBar preview={preview} />
      <Breadcrumbs items={[{ label: "Επικοινωνία" }]} />
      <PageIntro kicker="Είμαστε εδώ" title="Επικοινωνία" lead="Τηλεφωνικές παραγγελίες, ερωτήσεις για παραγγελία, service ή συνεργασία. Δευτέρα–Παρασκευή 09:00–17:00." />
      <PageZone page="epikoinonia" zone="top" preview={preview} />
      <div className="eu-canvas eu-gutter pb-12 grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <ContactForm />
        <aside className="grid gap-3">
          <div className="bg-eu-navy text-white rounded-xl p-5 grid gap-3 text-[length:var(--fs-15)]">
            <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide">MEGA ELECTRICS ΑΕΒΕ · Euronics Ελλάδα</div>
            <a href="tel:2104835143" className="flex items-center gap-2 font-bold text-[length:var(--fs-16)] hover:text-eu-yellow">
              <Phone className="size-4" aria-hidden /> 210 483 5143-6
            </a>
            <a href="mailto:info@euronics.gr" className="flex items-center gap-2 text-eu-on-dark hover:text-white">
              <Mail className="size-4" aria-hidden /> info@euronics.gr · eshop@euronics.gr
            </a>
            <div className="flex items-start gap-2 text-eu-on-dark">
              <MapPin className="size-4 shrink-0 mt-0.5" aria-hidden /> Δαμάσκου Σταμάτη 12, 136 71 Αχαρνές
            </div>
            <div className="flex items-center gap-2 text-eu-on-dark">
              <Clock className="size-4" aria-hidden /> Δευ–Παρ 09:00–17:00
            </div>
            <a href="https://maps.google.com/?q=38.0778184,23.7510866" target="_blank" rel="noreferrer" className="rounded-full bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-15)] py-3 min-h-11 inline-flex items-center justify-center hover:bg-eu-yellow-dark">
              Οδηγίες
            </a>
          </div>
          <button type="button" className="rounded-xl border-2 border-eu-line bg-white p-4 flex items-center gap-3 text-left hover:border-eu-blue">
            <MessageCircle className="size-6 text-eu-blue shrink-0" aria-hidden />
            <span>
              <span className="block font-bold text-eu-ink text-[length:var(--fs-16)]">Live chat</span>
              <span className="block text-eu-muted text-[length:var(--fs-14)]">Δευ–Παρ 09:00–17:00 · μέση αναμονή 2′</span>
            </span>
          </button>
          <div className="bg-eu-surface rounded-xl p-4 text-[length:var(--fs-15)] text-eu-ink-2">
            Ψάχνεις κατάστημα;{" "}
            <Link href="/katastimata" className="text-eu-blue underline font-bold">
              350 καταστήματα με τηλέφωνο και ωράριο
            </Link>
            .
          </div>
          <PageZone page="epikoinonia" zone="aside" preview={preview} />
        </aside>
      </div>
      <PageZone page="epikoinonia" zone="bottom" preview={preview} />
    </div>
  );
}
