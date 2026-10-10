import { requirePermission } from "@/lib/rbac/guard";
import { shipmentLabels } from "@/lib/couriers/shipments";

/** GET ?ids=a,b → οι ετικέτες της Γενικής σε ένα PDF (για εκτύπωση πριν το κλείσιμο ημέρας). */
export async function GET(req: Request) {
  await requirePermission("orders.read");
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 50);
  try {
    const pdf = await shipmentLabels(ids);
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="geniki-vouchers.pdf"`, "cache-control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Σφάλμα", { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
