import type { Metadata } from "next";
import { Checkout } from "@/components/checkout/Checkout";
import { getStores } from "@/lib/data/repo";
import { pickupStoreIds } from "@/lib/stores/repo";
import { getPublicSettings } from "@/lib/settings/store";
import { enabledVivaPays } from "@/lib/payments/viva-core";
import { vivaConfig } from "@/lib/payments/viva";
import { klarnaConfig } from "@/lib/payments/klarna";
import { bankTransfer } from "@/lib/payments/bank-transfer";
import { bankNames } from "@/lib/payments/bank-accounts";

export const metadata: Metadata = { title: "Ολοκλήρωση αγοράς" };

export default async function CheckoutPage() {
  const [all, pickup, pub, viva, klarna, bank] = await Promise.all([getStores(), pickupStoreIds(), getPublicSettings(), vivaConfig(), klarnaConfig(), bankTransfer()]);
  const stores = all.filter((s) => pickup.has(s.id));
  // οι τρόποι Viva μόνο όταν η Viva έχει ρυθμιστεί (Client ID / secret)· αλλιώς μόνο αντικαταβολή / κατάθεση / στο κατάστημα
  const vivaPays = viva ? enabledVivaPays(pub.payments ?? {}) : [];
  const partner = String(pub.shipping?.boxnowPartnerId ?? "").trim();
  return (
    <div className="eu-container">
      <Checkout stores={stores.map((s) => ({ id: s.id, slug: s.slug, name: s.name, city: s.city, address: s.address, zip: s.zip, region: s.region, distanceKm: s.distanceKm, openUntil: s.openUntil, member: s.member, lat: s.lat, lng: s.lng }))} boxnowPartnerId={partner || null} vivaPays={vivaPays} cardInstMax={viva?.maxInstalments ?? 0} klarnaDirect={!!klarna} cod={pub.payments?.cod !== false} storePay={pub.payments?.payInStore === true} bankSub={bank.enabled ? bankNames(bank.accounts) : null} />
    </div>
  );
}
