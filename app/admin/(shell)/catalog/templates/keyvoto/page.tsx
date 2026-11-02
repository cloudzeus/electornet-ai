import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { getKeyvotoConfig } from "@/lib/keyvoto/client";
import { KeyvotoExplorer } from "@/components/admin/catalog/keyvoto/KeyvotoExplorer";

export const metadata = { title: "Keyvoto PIM" };
export const dynamic = "force-dynamic";

/**
 * Περιεχόμενο προϊόντων από το Keyvoto (PIM των προμηθευτών): δοκιμή της σύνδεσης και δείγμα προϊόντων με όλα τους τα
 * πεδία. Είναι το πρώτο βήμα της ίδιας διαδρομής που έχουν τα XML feeds — αντιστοίχιση, λίστα ελέγχου, εισαγωγή.
 */
export default async function KeyvotoPage() {
  await requirePermission("catalog.products.write");
  const c = await getKeyvotoConfig();
  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog/templates" className="inline-flex items-center gap-1 min-h-11 md:min-h-9 w-fit font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Templates &amp; excel</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Boxes className="size-4" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Keyvoto PIM</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Το Keyvoto είναι η πλατφόρμα όπου οι προμηθευτές δημοσιεύουν το περιεχόμενο των προϊόντων τους — περιγραφές, χαρακτηριστικά και φωτογραφίες — και μας το μοιράζονται σε καταλόγους. Εδώ δοκιμάζεις τη σύνδεση και βλέπεις τι ακριβώς στέλνει ο κάθε εκδότης. Η αντιστοίχιση των πεδίων και η εισαγωγή γίνονται στο επόμενο βήμα, όπως στα XML feeds.</p>
      </div>
      <KeyvotoExplorer configured={!!c} enabled={!!c?.enabled} account={c?.businessAccountId ?? ""} />
    </div>
  );
}
