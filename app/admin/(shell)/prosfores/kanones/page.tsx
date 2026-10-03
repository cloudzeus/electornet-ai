import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getPromoPolicy } from "@/lib/promo/policy";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { PolicyForm } from "@/components/admin/promos/PolicyForm";

export const metadata = { title: "Κανόνες προσφορών" };
export const dynamic = "force-dynamic";

/** Δικλείδες, κανόνες επικάλυψης, όρια έγκρισης και κουπόνια καλωσορίσματος — τα αλλάζει ο υπεύθυνος προσφορών. */
export default async function PromoRulesPage() {
  await requirePermission("catalog.promos.write");
  const [policy, coupons] = await Promise.all([
    getPromoPolicy(),
    db.promotion.findMany({ where: { mechanism: { startsWith: "coupon" }, status: { in: ["active", "scheduled"] }, held: false }, orderBy: { createdAt: "desc" }, select: { code: true, name: true } }),
  ]);
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="rules" active="rules" title="Κανόνες & δικλείδες" lead="Ισχύουν για κάθε προσφορά, όπως κι αν δημιουργήθηκε. Η μηχανή τους εφαρμόζει στο καλάθι, στις έτοιμες τιμές της βιτρίνας και στον προσομοιωτή." />
      <PolicyForm initial={policy} coupons={coupons} />
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-3" aria-labelledby="ov-h">
        <h3 id="ov-h" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Πώς λύνονται οι επικαλύψεις</h3>
        <ol className="m-0 pl-5 grid gap-2 text-eu-ink-2 text-[length:var(--fs-15)]">
          <li><strong>Μία έκπτωση τιμής ανά προϊόν:</strong> μένει η καλύτερη για τον πελάτη. Η «αποκλειστική» κερδίζει πάντα και μπλοκάρει κουπόνια στο προϊόν.</li>
          <li><strong>1+1, 2ο −Χ %, κλίμακες:</strong> μπαίνουν μόνο αν δίνουν περισσότερα από τις απλές εκπτώσεις στα ίδια προϊόντα.</li>
          <li><strong>Κουπόνια:</strong> στο καλάθι, μοιρασμένα αναλογικά στις γραμμές· «όχι μαζί με έκπτωση τιμής» = μόνο σε προϊόντα χωρίς προσφορά.</li>
          <li><strong>Δώρα, δωρεάν υπηρεσίες, δωρεάν μεταφορικά:</strong> συνδυάζονται με όλα.</li>
          <li><strong>Δικλείδες:</strong> μέγιστη έκπτωση ανά γραμμή και ποτέ κάτω από το κόστος (όταν το ERP δίνει κόστος) — εκτός από τα πολλά τεμάχια, όπου το δωρεάν τεμάχιο είναι εξ ορισμού 100 %.</li>
          <li><strong>Ανενεργά μέχρι διευκρίνιση</strong> (εγκατάσταση, δωροεπιταγές, κληρώσεις, τράπεζες): δεν εφαρμόζονται ποτέ, ό,τι κι αν γράφει η κατάσταση.</li>
        </ol>
      </section>
    </div>
  );
}
