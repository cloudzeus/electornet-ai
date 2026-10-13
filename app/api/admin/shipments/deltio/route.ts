import { requirePermission } from "@/lib/rbac/guard";
import { deltioPdf } from "@/lib/couriers/deltio";

/** GET ?ids=a,b[&labels=1] → δελτίο παράδοσης (A4) — με labels=1 ακολουθούν οι ετικέτες στο ίδιο PDF («Εκτύπωση όλων»). */
export async function GET(req: Request) {
  await requirePermission("orders.read");
  const q = new URL(req.url).searchParams;
  const ids = (q.get("ids") ?? "").split(",").filter(Boolean).slice(0, 200);
  const labels = q.get("labels") === "1";
  try {
    const pdf = await deltioPdf(ids, labels);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${labels ? "apostoles" : "deltio-paradosis"}-${day}.pdf"`, "cache-control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Σφάλμα", { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
