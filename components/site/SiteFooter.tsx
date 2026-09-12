import { copyOf } from "@/lib/cms/copy";
import Image from "next/image";
import Link from "next/link";

const c = copyOf("footer");

const cols: { title: string; links: { label: string; href: string }[] }[] = [
  { title: "Αγορές", links: [{ label: "Τρόποι πληρωμής", href: "/tropoi-pliromis" }, { label: "Τρόποι & χρόνοι αποστολής", href: "/tropoi-apostolis" }, { label: "Δόσεις χωρίς κάρτα", href: "/ypiresies/xrimatodotisi" }, { label: "Παραλαβή σε 2 ώρες", href: "/ypiresies/paralavi-2-ores" }, { label: "Κάρτες δώρου", href: "/kartes-dorou" }, { label: "Euronics Renew", href: "/renew" }] },
  { title: "Εξυπηρέτηση", links: [{ label: "Παρακολούθηση παραγγελίας", href: "/entopismos" }, { label: "Επιστροφές προϊόντων", href: "/epistrofes" }, { label: "Εγγυήσεις & service", href: "/ypiresies/syntirisi-episkeyi" }, { label: "Ανακύκλωση ΑΗΗΕ", href: "/ypiresies/anakyklosi-aiie" }, { label: "Συχνές ερωτήσεις", href: "/syxnes-erotiseis" }, { label: "Επικοινωνία", href: "/epikoinonia" }] },
  { title: "Χρήσιμα links", links: [{ label: "Χάρτης πλοήγησης", href: "/proionta" }, { label: "Δίκτυο καταστημάτων", href: "/katastimata" }, { label: "Οικονομικά στοιχεία", href: "/oikonomika-stoixeia" }, { label: "Οι υπηρεσίες μας", href: "/ypiresies" }, { label: "Τρόποι πληρωμής", href: "/tropoi-pliromis" }, { label: "Τρόποι αποστολής", href: "/tropoi-apostolis" }, { label: "Πολιτική Επιστροφών", href: "/epistrofes" }, { label: "Ποιοι είμαστε", href: "/etaireia" }, { label: "Νέα & ανακοινώσεις", href: "/nea" }, { label: "Έξυπνος οδηγός αγοράς", href: "/odigos-agoras" }, { label: "Οδηγοί & blog", href: "/odigoi" }] },
  { title: "Νομικά", links: [{ label: "Όροι Χρήσης", href: "/oroi-chrisis" }, { label: "Πολιτική Απορρήτου", href: "/aporrito" }, { label: "Πολιτική Cookies", href: "/cookies" }, { label: "Εναλλακτική επίλυση διαφορών", href: "/oroi-chrisis" }, { label: "Πλατφόρμα ΗΕΔ της ΕΕ", href: "https://ec.europa.eu/consumers/odr" }] },
];

/** DSA trader details, WEEE registry and ADR reachable on every page. */
export function SiteFooter() {
  return (
    <footer className="bg-eu-navy text-eu-on-dark-2 eu-container">
      <div className="eu-canvas eu-gutter pt-8 pb-5">
        <div className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-5 gap-6 text-[length:var(--fs-14)] leading-[1.95] mb-6">
          {cols.map((c) => (
            <div key={c.title}>
              <h2 className="m-0 mb-2.5 font-extrabold text-white text-[length:var(--fs-13-5)] tracking-wide">{c.title}</h2>
              <ul className="m-0 p-0 list-none">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h2 className="m-0 mb-2.5 font-extrabold text-white text-[length:var(--fs-13-5)] tracking-wide">{c.epikoinonia}</h2>
            <address className="not-italic">
              {c.damaskoy_stamati_12_136}
              <br />
              <a href="tel:00302104835143" className="hover:text-white">+30 210 4835143 - 6</a>
              <br />
              <a href="tel:00302104835190" className="hover:text-white">+30 210 4835190</a>
              <br />
              <a href="mailto:info@euronics.gr" className="hover:text-white">info@euronics.gr</a>
            </address>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-white">
              <a href="https://www.facebook.com/euronics.gr/" target="_blank" rel="noreferrer" className="hover:text-eu-yellow">Facebook</a>
              <a href="https://www.instagram.com/euronics.gr/" target="_blank" rel="noreferrer" className="hover:text-eu-yellow">Instagram</a>
              <a href="https://www.youtube.com/euronicsgreece" target="_blank" rel="noreferrer" className="hover:text-eu-yellow">YouTube</a>
              <a href="https://www.google.com/maps/place/Euronics+Greece+(Mega+Electrics+AEBE)/@38.0778184,23.7510866,15z" target="_blank" rel="noreferrer" className="hover:text-eu-yellow">Google Maps</a>
              <a href="https://www.euronics.com/" target="_blank" rel="noreferrer" className="hover:text-eu-yellow">Euronics International</a>
            </div>
          </div>
        </div>
        <div className="border-t border-eu-navy-line pt-4 flex flex-wrap justify-between items-center gap-4 text-[length:var(--fs-13-5)] leading-relaxed">
          <p className="m-0">
            {c.euronics_2026_mega_electrics}
            <br />
            {c.oi_times_perilamvanoyn_fpa}
          </p>
          <Image src="https://www.euronics.gr/Themes/Uptown/Content/img/credit_cards_final.png" alt={c.tropoi_pliromis} width={220} height={22} className="h-[22px] w-auto" unoptimized />
        </div>
      </div>
    </footer>
  );
}
