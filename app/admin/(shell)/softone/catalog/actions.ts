"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { syncWebCategories, syncSpecGroups, syncItems, syncCatalog, s1Alive } from "@/lib/softone/catalog";
import { refreshProductDocs, embedStale, semanticProducts } from "@/lib/vector/index";

const PATH = "/admin/softone/catalog";

export async function runCatalogSync(what: "webcat" | "specs" | "items-delta" | "items-full" | "all") {
  const user = await requirePermission("catalog.sync.run");
  const r = what === "webcat" ? [await syncWebCategories()] : what === "specs" ? [await syncSpecGroups()] : what === "items-delta" ? [await syncItems("delta")] : what === "items-full" ? [await syncItems("full")] : await syncCatalog("delta");
  await audit(user.id, "softone.catalog.sync", "S1SyncRun", what, null, r.map((x) => ({ kind: x.kind, ok: x.ok, fetched: x.fetched, created: x.created, updated: x.updated, error: x.error })));
  revalidatePath(PATH);
  return r;
}

export async function checkS1() {
  await requirePermission("catalog.sync.run");
  return s1Alive();
}

/** Κείμενα προϊόντων από τον καθρέφτη → ευρετήριο· μετά embeddings μόνο για ό,τι άλλαξε. */
export async function rebuildVectorIndex(embedLimit = 2000) {
  const user = await requirePermission("catalog.sync.run");
  const docs = await refreshProductDocs();
  const emb = await embedStale(embedLimit);
  await audit(user.id, "vector.index.rebuild", "VectorDoc", "product", null, { ...docs, ...emb });
  revalidatePath(PATH);
  return { docs, emb };
}

export async function testVectorSearch(query: string) {
  await requirePermission("catalog.products.read");
  const hits = await semanticProducts(query, {}, 6);
  return hits.map((h) => ({ refId: h.refId, title: h.title, score: Math.round(h.score * 1000) / 1000, exact: h.exact, brand: (h.meta?.brand as string) ?? null, price: (h.meta?.price as number) ?? null }));
}
