import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { calendarData } from "@/lib/promo/admin";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { PromoCalendar } from "@/components/admin/promos/PromoCalendar";

export const metadata = { title: "Ημερολόγιο προσφορών" };
export const dynamic = "force-dynamic";

const DAYS = 42;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Δευτέρα της εβδομάδας (τοπική ώρα Ελλάδας ≈ UTC για ημέρες) */
function monday(s?: string) {
  const d = s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Έξι εβδομάδες με μια ματιά: ποια προσφορά τρέχει πότε, πού επικαλύπτονται και τι ισχύει σε κάθε προϊόν κάθε ημέρα. */
export default async function PromoCalendarPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requirePermission("catalog.promos.write");
  const { from: f } = await searchParams;
  const from = monday(f);
  const data = await calendarData(from, DAYS);
  const shift = (w: number) => iso(new Date(from.getTime() + w * 7 * 86400_000));
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="calendar" active="calendar" title="Ημερολόγιο & επικαλύψεις" lead="Κάθε μπάρα είναι μια προσφορά. Η ζώνη πάνω δείχνει τις ημέρες όπου δύο προσφορές πέφτουν στα ίδια προϊόντα: κίτρινο όταν ανταγωνίζονται ως εκπτώσεις τιμής (κερδίζει η καλύτερη για τον πελάτη), μπλε όταν απλώς συνδυάζονται."
        actions={<div className="flex gap-2"><Link href={`?from=${shift(-4)}`} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><ChevronLeft className="size-4" aria-hidden /> 4 εβδ.</Link><Link href="?" className="inline-flex items-center rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Σήμερα</Link><Link href={`?from=${shift(4)}`} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">4 εβδ. <ChevronRight className="size-4" aria-hidden /></Link></div>} />
      <PromoCalendar from={from.toISOString()} promos={data.promos} days={data.days} />
    </div>
  );
}
