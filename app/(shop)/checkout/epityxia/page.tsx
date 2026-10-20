import type { Metadata } from "next";
import { OrderSuccess } from "@/components/checkout/OrderSuccess";
import { bankTransfer } from "@/lib/payments/bank-transfer";

export const metadata: Metadata = { title: "Η παραγγελία καταχωρήθηκε" };

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  const [{ no }, bank] = await Promise.all([searchParams, bankTransfer()]);
  return (
    <div className="eu-container">
      <OrderSuccess number={no ?? ""} bankAccounts={bank.accounts} />
    </div>
  );
}
