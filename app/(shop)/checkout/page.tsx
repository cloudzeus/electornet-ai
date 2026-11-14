import type { Metadata } from "next";
import { Checkout } from "@/components/checkout/Checkout";
import { getStores } from "@/lib/data/repo";
import { getPublicSettings } from "@/lib/settings/store";
import { enabledVivaPays } from "@/lib/payments/viva-core";
import { vivaConfig } from "@/lib/payments/viva";
import { klarnaConfig } from "@/lib/payments/klarna";
import { bankTransfer } from "@/lib/payments/bank-transfer";
import { bankNames } from "@/lib/payments/bank-accounts";

export const metadata: Metadata = { title: "Ολοκλήρωση αγοράς" };

export default async function CheckoutPage() {
  const [stores, pub, viva, klarna, bank] = await Promise.all([getStores(), getPublicSettings(), vivaConfig(), klarnaConfig(), bankTransfer()]);
  // οι τρόποι Viva μόνο όταν η Viva έχει ρυθμιστεί (Client ID / secret)· αλλιώς το checkout μένει όπως ήταν
  const vivaPays = viva ? enabledVivaPays(pub.payments ?? {}) : [];
  const partner = String(pub.shipping?.boxnowPartnerId ?? "").trim();
  // Χωρίς ρυθμισμένη Viva το checkout δείχνει την εφεδρική λίστα· ΚΑΙ αυτή σέβεται πλέον τους διακόπτες των
  // Πληρωμών, ώστε ένας κλειστός τρόπος (π.χ. Revolut Pay) να μη φαίνεται πουθενά στον πελάτη.
  const p = (pub.payments ?? {}) as Record<string, unknown>;
  const payOn = { apple: p.applePay !== false, google: p.googlePay !== false, revolut: p.revolutPay !== false, iris: p.iris !== false };
  return (
    <div className="eu-container">
      <Checkout stores={stores.map((s) => ({ id: s.id, slug: s.slug, name: s.name, city: s.city, address: s.address, zip: s.zip, region: s.region, distanceKm: s.distanceKm, openUntil: s.openUntil, member: s.member, lat: s.lat, lng: s.lng }))} boxnowPartnerId={partner || null} vivaPays={vivaPays} payOn={payOn} klarnaDirect={!!klarna} bankSub={bank.enabled ? bankNames(bank.accounts) : null} />
    </div>
  );
}
