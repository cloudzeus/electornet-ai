import { Facets as ClientFacets } from "./Facets";
import { hideCounts } from "@/lib/catalog/hide-counts";

/** Τα φίλτρα με τη ρύθμιση «Απόκρυψη πλήθους προϊόντων» (Ρυθμίσεις › Γενικά) διαβασμένη στον server. */
export async function Facets(props: Omit<React.ComponentProps<typeof ClientFacets>, "hideCounts">) {
  return <ClientFacets {...props} hideCounts={await hideCounts()} />;
}
