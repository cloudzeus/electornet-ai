import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Gift, Sparkles } from "lucide-react";
import { getCustomerSession } from "@/lib/account/session";
import { myOffers } from "@/lib/promo/personal";
import { CopyCoupon } from "@/components/promo/CopyCoupon";

export const metadata: Metadata = { title: "Οι προσφορές μου" };

/** Οι προσωπικοί κωδικοί του πελάτη: για ποιο προϊόν / κατηγορία, γιατί, μέχρι πότε. */
export default async function MyOffersPage() {
  const me = await getCustomerSession();
  if (!me) {
    return (
      <div className="grid gap-4">
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Οι προσφορές μου</h1>
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] max-w-[60ch]">Με λογαριασμό παίρνεις προσφορές μόνο για σένα: για προϊόντα της λίστας σου, για την αντικατάσταση παλιάς συσκευής, για ό,τι ταιριάζει με τις αγορές σου.</p>
        <Link href="/syndesi?next=/logariasmos/prosfores" className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 inline-flex items-center hover:bg-eu-blue">Σύνδεση</Link>
      </div>
    );
  }
  const offers = await myOffers(me.id, me.email ?? "");
  const until = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "long" }) : null);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Οι προσφορές μου</h1>
        <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-15)]">Προσωπικοί κωδικοί μίας χρήσης. Πάτησε «Αντιγραφή» και γράψε τον στο καλάθι — ή άνοιξε το προϊόν.</p>
      </div>
      {offers.length ? (
        <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 gap-3">
          {offers.map((o) => (
            <li key={o.code} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 content-start">
              <div className="flex items-start gap-3">
                {o.target?.image ? <span className="relative size-20 shrink-0 rounded-xl border border-eu-line-2 bg-white overflow-hidden"><Image src={o.target.image} alt="" fill sizes="80px" className="object-contain p-1.5" unoptimized={o.target.image.startsWith("http")} /></span> : <span className="size-20 shrink-0 rounded-xl bg-eu-chip grid place-items-center text-eu-blue"><Gift className="size-8" aria-hidden /></span>}
                <div className="min-w-0 grid gap-0.5">
                  <span className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)]"><Sparkles className="size-3.5" aria-hidden /> {o.reason ?? "Μόνο για σένα"}</span>
                  <span className="font-heading font-extrabold text-eu-red text-[length:var(--fs-26)] leading-none">{o.value}</span>
                  {o.target && <Link href={o.target.href} className="font-bold text-eu-ink text-[length:var(--fs-15)] hover:text-eu-blue hover:underline line-clamp-2">{o.target.kind === "category" ? `Σε όλα: ${o.target.title}` : o.target.title}</Link>}
                </div>
              </div>
              <CopyCoupon code={o.code} />
              <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">{until(o.expiresAt) ? `Ισχύει έως ${until(o.expiresAt)}` : "Χωρίς λήξη"} · μία χρήση{o.target ? " · μόνο για το παραπάνω" : ""}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-2xl bg-eu-surface p-5 text-eu-ink-2 text-[length:var(--fs-15)]">Δεν έχεις προσωπική προσφορά αυτή τη στιγμή. Πρόσθεσε προϊόντα στη <Link href="/lista" className="font-bold text-eu-blue hover:underline">λίστα σου</Link> ή δήλωσε τις συσκευές σου στις <Link href="/logariasmos/eggyiseis" className="font-bold text-eu-blue hover:underline">εγγυήσεις</Link> — θα σε ειδοποιήσουμε όταν έχουμε κάτι για σένα.</p>
      )}
    </div>
  );
}
