import Link from "next/link";
import { ChevronLeft, Upload } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { NopImport } from "@/components/admin/customers/NopImport";

export const metadata = { title: "Εισαγωγή από nopCommerce" };

export default async function NopImportPage() {
  await requirePermission("customers.write");
  return (
    <div className="grid gap-4 min-w-0">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 min-h-11 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline w-fit"><ChevronLeft className="size-4" aria-hidden /> Πελάτες</Link>
      <div className="grid gap-1">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Upload className="size-4" aria-hidden /> Πελάτες</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Εισαγωγή από το σημερινό eshop (nopCommerce)</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[75ch]">Ανέβασε την εξαγωγή πελατών (Customers → Export to Excel ή XML) και, χωριστά, των συνδρομητών newsletter (Promotions → Newsletter subscribers → Export). Πρώτα γίνεται <strong>διασταύρωση</strong> με όσους ήδη έχουμε — τίποτα δεν γράφεται πριν πατήσεις «Εφαρμογή». Κωδικοί δεν μεταφέρονται και κανένα email δεν στέλνεται· οι πελάτες ορίζουν νέο κωδικό με «Ξέχασα τον κωδικό».</p>
      </div>
      <NopImport />
    </div>
  );
}
