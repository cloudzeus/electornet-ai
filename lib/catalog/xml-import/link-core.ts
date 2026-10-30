import type { MappingConfig } from "@/lib/catalog/foreign-import/core";

/**
 * **Ο σύνδεσμος της γραμμής του feed με το είδος που έφτιαξε** — καθαρή λογική, χωρίς βάση.
 *
 * Γιατί υπάρχει: η εισαγωγή περνά από τη μηχανή του Excel, που δουλεύει με αριθμούς γραμμής (`rowNo`) και δεν ξέρει
 * τίποτα για `SupplierFeedItem`. Έτσι η γραμμή έμενε **χωρίς** `productId` / `pendingItemId`: η «Δημοσίευση» (που
 * μετρά γραμμές με προϊόν) έδειχνε πάντα μηδέν, και οι φωτογραφίες που είχαν ήδη ανέβει στο Bunny δεν δένονταν ποτέ
 * σε προϊόν — ξανακατέβαιναν από τον προμηθευτή στην έγκριση του νέου είδους.
 *
 * Η αντιστοίχιση γίνεται σε δύο βήματα: υπάρχον είδος → MTRL → προϊόν του καταλόγου· νέο είδος → εγγραφή αναμονής
 * (`PendingItem`), και το προϊόν της έρχεται αργότερα, στην έγκριση.
 */

export interface LinkRow {
  rowNo: number;
  itemId: string;
  productId: string | null;
  pendingItemId: string | null;
  mtrl: number | null;
}

export interface LinkPatch {
  itemId: string;
  data: { productId?: string; pendingItemId?: string; mtrl?: number };
}

/**
 * Τι πρέπει να γραφτεί σε κάθε γραμμή. Επιστρέφει **μόνο** τις γραμμές που αλλάζουν — καμία άσκοπη εγγραφή σε
 * παρτίδες των 2.500.
 */
export function linkRows(
  rows: LinkRow[],
  plan: Map<number, { mtrl?: number | null }>,
  productOfMtrl: Map<number, string>,
  pendingOfRow: Map<number, string>,
): LinkPatch[] {
  const out: LinkPatch[] = [];
  for (const r of rows) {
    const mtrl = plan.get(r.rowNo)?.mtrl ?? null;
    const data: LinkPatch["data"] = {};
    if (mtrl != null) {
      if (r.mtrl !== mtrl) data.mtrl = mtrl;
      const pid = productOfMtrl.get(mtrl);
      if (pid && r.productId !== pid) data.productId = pid;
    } else {
      const pi = pendingOfRow.get(r.rowNo);
      if (pi && r.pendingItemId !== pi) data.pendingItemId = pi;
    }
    if (Object.keys(data).length) out.push({ itemId: r.itemId, data });
  }
  return out;
}

/**
 * Η ίδια αντιστοίχιση **χωρίς τις στήλες φωτογραφιών**.
 *
 * Σε αυτή τη ροή οι φωτογραφίες είναι δική μας δουλειά: έχουν ήδη κατέβει, έγιναν WebP και μπήκαν στο Bunny με τη
 * σειρά που όρισε ο χρήστης. Αν τις δώσουμε και στη μηχανή, κατεβαίνουν **δεύτερη φορά** από τον προμηθευτή και το
 * προϊόν παίρνει δύο αντίγραφα της ίδιας εικόνας.
 */
export function mediaOff(config: MappingConfig): MappingConfig {
  return { ...config, columns: Object.fromEntries(Object.entries(config.columns).filter(([, t]) => t.kind !== "media")) };
}
