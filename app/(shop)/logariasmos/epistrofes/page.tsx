import type { Metadata } from "next";
import { accountOrders, accountReturns, requireCustomer } from "@/lib/account/data";
import { ReturnForm } from "@/components/account/ReturnForm";

export const metadata: Metadata = { title: "Επιστροφές" };

const STATUS: Record<string, string> = { requested: "Καταχωρήθηκε", approved: "Εγκρίθηκε", received: "Παραλήφθηκε", refunded: "Επιστράφηκαν τα χρήματα", rejected: "Απορρίφθηκε" };

/** Επιστροφές: αίτημα για παραγγελίες e-shop (οι αγορές καταστημάτων επιστρέφονται στο κατάστημα) και τα αιτήματα που έχεις κάνει. */
export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const me = await requireCustomer("/logariasmos/epistrofes");
  const [{ order }, orders, returns] = await Promise.all([searchParams, accountOrders(me.id), accountReturns(me.id)]);
  const eligible = orders.filter((o) => o.channel === "eshop" && ["paid", "processing", "shipped", "ready-for-pickup", "delivered"].includes(o.status));
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Επιστροφές προϊόντων</h1>
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">14 ημερολογιακές ημέρες από την παραλαβή. Επιλέγεις παραγγελία, προϊόντα και λόγο· λαμβάνεις κωδικό RMA και οδηγίες.</p>
      <ReturnForm orders={eligible.map((o) => ({ number: o.number, date: o.date, lines: o.lines.map((l, i) => ({ id: `${l.productId}-${i}`, title: l.title, qty: l.qty })) }))} preselect={order} />
      {returns.length > 0 && (
        <section className="grid gap-2" aria-labelledby="my-returns">
          <h2 id="my-returns" className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Τα αιτήματά μου</h2>
          <ul className="m-0 p-0 list-none grid gap-2">
            {returns.map((r) => (
              <li key={r.id} className="bg-white rounded-xl border border-eu-line p-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--fs-15)]">
                <span className="font-extrabold text-eu-ink tabular-nums">{r.rma}</span>
                <span className="text-eu-ink-3">{r.orderNumber} · {new Date(r.createdAt).toLocaleDateString("el-GR")}</span>
                <span className="min-w-0 flex-1 basis-48 text-eu-ink-2">{r.lines.map((l) => `${l.qty} × ${l.title}`).join(" · ")}</span>
                <span className="rounded-full bg-eu-chip text-eu-blue font-bold px-2.5 py-1 text-[length:var(--fs-13)]">{STATUS[r.status] ?? r.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
