import "server-only";
import { getSetting } from "@/lib/settings/store";

/**
 * «Απόκρυψη πλήθους προϊόντων» (Ρυθμίσεις › Γενικά › Λειτουργία): κρύβει ΚΑΘΕ αριθμό αποτελεσμάτων στις λίστες — δίπλα
 * στις επιλογές των φίλτρων και το σύνολο της λίστας (επικεφαλίδα κατηγορίας, γραμμή πάνω από τα προϊόντα). Χρήσιμο όσο
 * ο κατάλογος συμπληρώνεται και τα πλήθη δεν ταιριάζουν ακόμη με το παλιό site.
 */
export async function hideCounts(): Promise<boolean> {
  const s = await getSetting("general").catch(() => ({ data: {} as Record<string, unknown> }));
  return s.data.hideFacetCounts === true;
}
