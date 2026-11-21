import { Facets as ClientFacets } from "./Facets";
import { getSetting } from "@/lib/settings/store";

/** Τα φίλτρα με τη ρύθμιση «Απόκρυψη πλήθους στα φίλτρα» (Ρυθμίσεις › Γενικά) διαβασμένη στον server. */
export async function Facets(props: Omit<React.ComponentProps<typeof ClientFacets>, "hideCounts">) {
  const hideCounts = (await getSetting("general").catch(() => ({ data: {} as Record<string, unknown> }))).data.hideFacetCounts === true;
  return <ClientFacets {...props} hideCounts={hideCounts} />;
}
