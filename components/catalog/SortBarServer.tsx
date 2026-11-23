import { SortBar as ClientSortBar } from "./SortBar";
import { hideCounts } from "@/lib/catalog/hide-counts";

/** Ίδιο μοτίβο με τα φίλτρα: ο διακόπτης «Απόκρυψη πλήθους προϊόντων» διαβάζεται στον server και περνά ως prop. */
export async function SortBar(props: Omit<React.ComponentProps<typeof ClientSortBar>, "hideTotal">) {
  return <ClientSortBar {...props} hideTotal={await hideCounts()} />;
}
