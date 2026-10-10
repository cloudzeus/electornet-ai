import type { Metadata } from "next";
import { Checkout } from "@/components/checkout/Checkout";
import { getStores } from "@/lib/data/repo";
import { getPublicSettings } from "@/lib/settings/store";
import { enabledVivaPays } from "@/lib/payments/viva-core";
import { vivaConfig } from "@/lib/payments/viva";

export const metadata: Metadata = { title: "Ολοκλήρωση αγοράς" };

export default async function CheckoutPage() {
  const [stores, pub, viva] = await Promise.all([getStores(), getPublicSettings(), vivaConfig()]);
  // οι τρόποι Viva μόνο όταν η Viva έχει ρυθμιστεί (Client ID / secret)· αλλιώς το checkout μένει όπως ήταν
  const vivaPays = viva ? enabledVivaPays(pub.payments ?? {}) : [];
  const partner = String(pub.shipping?.boxnowPartnerId ?? "").trim();
  return (
    <div className="eu-container">
      <Checkout stores={stores.map((s) => ({ id: s.id, slug: s.slug, name: s.name, city: s.city, address: s.address, zip: s.zip, region: s.region, distanceKm: s.distanceKm, openUntil: s.openUntil }))} boxnowPartnerId={partner || null} vivaPays={vivaPays} />
    </div>
  );
}
