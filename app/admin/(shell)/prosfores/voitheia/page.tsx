import Link from "next/link";
import { Clock, BookOpen, MessageCircleQuestion, Route, Map } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { FAQ, GLOSSARY, GUIDES, PAGE_HELP } from "@/lib/promo/help";
import { STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";

export const metadata = { title: "Βοήθεια προσφορών" };

const LIFE: { s: PromoStatus; t: string }[] = [
  { s: "draft", t: "Αποθηκεύτηκε χωρίς δημοσίευση. Δεν τη βλέπει κανείς· δοκιμάζεται στον Προσομοιωτή." },
  { s: "pending", t: "Ξεπερνά τα όρια και περιμένει έγκριση από δεύτερο πρόσωπο." },
  { s: "scheduled", t: "Δημοσιεύτηκε με μελλοντική έναρξη· ξεκινά μόνη της." },
  { s: "active", t: "Τρέχει: φαίνεται στη βιτρίνα και εφαρμόζεται στο καλάθι." },
  { s: "paused", t: "Σταμάτησε προσωρινά· με «Συνέχεια» ξαναρχίζει." },
  { s: "ended", t: "Πέρασε η λήξη ή εξαντλήθηκαν χρήσεις / budget." },
  { s: "archived", t: "Αποσύρθηκε οριστικά· μένει στις αναφορές." },
];
const PAGES: { key: keyof typeof PAGE_HELP; href: string }[] = [
  { key: "list", href: "/admin/prosfores" }, { key: "calendar", href: "/admin/prosfores/imerologio" }, { key: "coupons", href: "/admin/prosfores/kouponia" },
  { key: "segments", href: "/admin/prosfores/koina" }, { key: "tags", href: "/admin/prosfores/etiketes" }, { key: "sim", href: "/admin/prosfores/prosomoiotis" },
  { key: "rules", href: "/admin/prosfores/kanones" }, { key: "report", href: "/admin/prosfores/anafores" }, { key: "landing", href: "/admin/prosfores/selides" },
  { key: "ads", href: "/admin/prosfores/theseis" }, { key: "excel", href: "/admin/prosfores/excel" }, { key: "ermis", href: "/admin/prosfores/ermis" },
];

/** Κέντρο βοήθειας του διαχειριστικού προσφορών. */
export default async function PromoHelpPage() {
  await requirePermission("catalog.promos.write");
  const h3 = "m-0 font-extrabold text-eu-navy text-[length:var(--fs-17)] inline-flex items-center gap-2";
  return (
    <div className="grid gap-6 min-w-0">
      <PromoTabs active="help" title="Βοήθεια" lead="Πώς στήνεις προσφορές, κουπόνια, landing pages και banners — με οδηγούς βήμα-βήμα, τι σημαίνει κάθε όρος και απαντήσεις στα πιο συχνά. Σε κάθε σελίδα υπάρχει και το πλαίσιο «Τι κάνω εδώ;», και σε κάθε πεδίο το «i»." />

      <section className="grid gap-3" aria-labelledby="g-h">
        <h3 id="g-h" className={h3}><Route className="size-5" aria-hidden /> Οδηγοί βήμα-βήμα</h3>
        <div className="grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-3 gap-3">
          {GUIDES.map((g) => (
            <article key={g.key} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2 content-start">
              <div className="flex items-start justify-between gap-2"><h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-16)]">{g.title}</h4><span className="shrink-0 inline-flex items-center gap-1 text-eu-muted text-[length:var(--fs-13)]"><Clock className="size-3.5" aria-hidden /> ~{g.minutes}′</span></div>
              <ol className="m-0 pl-5 grid gap-1 text-eu-ink-2 text-[length:var(--fs-14)] leading-relaxed">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="l-h">
        <h3 id="l-h" className={h3}><BookOpen className="size-5" aria-hidden /> Η ζωή μιας προσφοράς</h3>
        <ol className="m-0 p-0 list-none grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-4 gap-2">
          {LIFE.map((x) => <li key={x.s} className="rounded-xl bg-white border border-eu-line p-3 grid gap-1"><span className={`justify-self-start rounded-full px-2.5 py-0.5 font-bold text-[length:var(--fs-13)] ${STATUS_LABEL[x.s].tone}`}>{STATUS_LABEL[x.s].label}</span><span className="text-eu-ink-2 text-[length:var(--fs-14)]">{x.t}</span></li>)}
        </ol>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[80ch]">Όταν αλλάζεις μια προσφορά που τρέχει, δημιουργείται νέα <strong>έκδοση</strong>. Οι παραγγελίες που έγιναν πριν κρατούν τους όρους της προηγούμενης. Αν η αλλαγή θέλει έγκριση, η προηγούμενη έκδοση μένει σε ισχύ μέχρι να εγκριθεί.</p>
      </section>

      <section className="grid gap-3" aria-labelledby="p-h">
        <h3 id="p-h" className={h3}><Map className="size-5" aria-hidden /> Ποια σελίδα για τι</h3>
        <ul className="m-0 p-0 list-none grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-3 gap-2">
          {PAGES.map((p) => <li key={p.key}><Link href={p.href} className="block rounded-xl bg-white border border-eu-line p-3 hover:border-eu-navy h-full"><span className="block font-bold text-eu-ink text-[length:var(--fs-15)]">{PAGE_HELP[p.key].title}</span><span className="block text-eu-ink-3 text-[length:var(--fs-14)]">{PAGE_HELP[p.key].what}</span></Link></li>)}
        </ul>
      </section>

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-6 items-start">
        <section className="grid gap-3" aria-labelledby="f-h">
          <h3 id="f-h" className={h3}><MessageCircleQuestion className="size-5" aria-hidden /> Συχνές ερωτήσεις</h3>
          {FAQ.map((f) => <details key={f.q} className="rounded-xl bg-white border border-eu-line p-4"><summary className="cursor-pointer font-bold text-eu-ink text-[length:var(--fs-15)] min-h-8">{f.q}</summary><p className="m-0 mt-2 text-eu-ink-2 text-[length:var(--fs-14)] leading-relaxed">{f.a}</p></details>)}
        </section>
        <section className="grid gap-3" aria-labelledby="gl-h">
          <h3 id="gl-h" className={h3}><BookOpen className="size-5" aria-hidden /> Γλωσσάρι</h3>
          <dl className="m-0 rounded-2xl bg-white border border-eu-line divide-y divide-eu-line">
            {GLOSSARY.map((g) => <div key={g.term} className="p-3 grid gap-0.5"><dt className="font-bold text-eu-ink text-[length:var(--fs-15)]">{g.term}</dt><dd className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]">{g.def}</dd></div>)}
          </dl>
        </section>
      </div>
    </div>
  );
}
