"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import type { SavePick, SearchMode } from "@/lib/catalog/dims-missing";

/** Μία παρτίδα αναζήτησης (έως 20 προϊόντα). Το `web` κοστίζει (~$0,01 το προϊόν) και το `eprel`/`web` αποθηκεύουν ό,τι βρουν ως χαρακτηριστικά. */
export async function searchDimsAction(ids: string[], mode: SearchMode) {
  const user = await requirePermission(mode === "content" ? "catalog.products.read" : "catalog.products.write");
  if (!Array.isArray(ids) || !["content", "eprel", "web"].includes(mode)) return { proposals: [], failed: [], costUsd: 0 };
  const { searchBatch } = await import("@/lib/catalog/dims-missing");
  const r = await searchBatch(ids.filter((x) => typeof x === "string").slice(0, 20), mode);
  if (mode !== "content") await audit(user.id, `catalog.dims-missing.search-${mode}`, "Product", null, null, { n: ids.length, found: r.proposals.filter((p) => p.status !== "none").length, costUsd: r.costUsd });
  return r;
}

/** Αποθήκευση επιλεγμένων προτάσεων (έως 10 ανά κλήση): SoftOne (αν είναι ανοιχτό) και eshop, και ξαναμέτρημα πληρότητας. */
export async function saveDimsAction(picks: SavePick[]) {
  const user = await requirePermission("catalog.products.write");
  const [{ saveOne }, { itemWriteEnabled }, { projectPublishReady }, { resetCatalogCache }] = await Promise.all([import("@/lib/catalog/dims-missing"), import("@/lib/softone/item-write"), import("@/lib/catalog/publish-ready-server"), import("@/lib/data/db-catalog")]);
  const s1On = await itemWriteEnabled();
  const out = [];
  for (const pick of (Array.isArray(picks) ? picks : []).slice(0, 10)) {
    const r = await saveOne(pick, s1On).catch((e: Error) => { console.error("[dims-missing] save", pick.productId, e); return { id: pick.productId, ok: false, s1: "error" as const, message: "Η αποθήκευση απέτυχε. Δοκίμασε ξανά." }; });
    out.push(r);
    if (r.ok) await audit(user.id, "catalog.dims-missing.save", "Product", pick.productId, null, { dims: pick.dims ? [pick.dims.w, pick.dims.h, pick.dims.d, pick.dims.label] : null, weight: pick.weight ? [pick.weight.kg, pick.weight.label] : null, s1: r.s1, note: r.message });
  }
  const done = out.filter((r) => r.ok).map((r) => r.id);
  if (done.length) { await projectPublishReady(done); resetCatalogCache(); revalidatePath("/admin/catalog/dimensions/missing"); }
  return out;
}
