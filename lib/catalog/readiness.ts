/**
 * Ετοιμότητα ενός προϊόντος για το site: ποιοι έλεγχοι ισχύουν, ποιοι λείπουν και σε ποια καρτέλα της σελίδας
 * προϊόντος διορθώνονται. Καθαρή συνάρτηση — τα δεδομένα τα μαζεύει η σελίδα.
 */
export type TabId = "media" | "content" | "dims" | "commerce" | "erp";
export type CheckLevel = "required" | "recommended";
export type TabState = "ok" | "warn" | "bad";

export interface ReadinessInput {
  /** ορατές φωτογραφίες */
  photos: number;
  /** η κύρια φωτογραφία είναι κάτω από 600 px· null = άγνωστο / χωρίς φωτογραφία */
  mainLowRes: boolean | null;
  description: boolean;
  specs: number;
  /** needed: κατηγορίες με AR ή «χωράει στον χώρο μου» */
  dims: { needed: boolean; present: boolean };
  /** needed: η κατηγορία έχει υποχρεωτική ενεργειακή ετικέτα */
  energy: { needed: boolean; present: boolean };
  /** applies: η κατηγορία υποστηρίζει AR */
  ar: { applies: boolean; on: boolean; reason: string | null };
  price: number | null;
}
export interface Check { id: string; tab: TabId; level: CheckLevel; ok: boolean; label: string }
export interface Readiness { checks: Check[]; done: number; total: number; missing: Check[]; tabs: Record<TabId, TabState> }

export function productReadiness(i: ReadinessInput): Readiness {
  const checks: Check[] = [];
  const add = (applies: boolean, c: Check) => { if (applies) checks.push(c); };
  add(true, { id: "photo", tab: "media", level: "required", ok: i.photos > 0, label: "Χωρίς φωτογραφία" });
  add(i.photos > 0, { id: "photos4", tab: "media", level: "recommended", ok: i.photos >= 4, label: `${i.photos} ${i.photos === 1 ? "φωτογραφία" : "φωτογραφίες"} · προτείνονται 4+` });
  add(i.photos > 0 && i.mainLowRes !== null, { id: "photoSize", tab: "media", level: "recommended", ok: i.mainLowRes === false, label: "Μικρή κύρια φωτογραφία (κάτω από 600 px)" });
  add(true, { id: "description", tab: "content", level: "required", ok: i.description, label: "Χωρίς περιγραφή" });
  add(true, { id: "specs", tab: "content", level: "recommended", ok: i.specs >= 5, label: i.specs === 0 ? "Χωρίς χαρακτηριστικά" : `Μόνο ${i.specs} χαρακτηριστικά` });
  add(i.dims.needed, { id: "dims", tab: "dims", level: "required", ok: i.dims.present, label: "Χωρίς διαστάσεις" });
  add(i.energy.needed, { id: "energy", tab: "dims", level: "required", ok: i.energy.present, label: "Χωρίς ενεργειακή ετικέτα EPREL" });
  add(i.ar.applies, { id: "ar", tab: "dims", level: "recommended", ok: i.ar.on, label: `AR ανενεργό${i.ar.reason ? `: ${i.ar.reason}` : ""}` });
  add(true, { id: "price", tab: "commerce", level: "required", ok: (i.price ?? 0) > 0, label: "Χωρίς τιμή" });

  const missing = checks.filter((c) => !c.ok).sort((a, b) => (a.level === b.level ? 0 : a.level === "required" ? -1 : 1));
  const tabs: Record<TabId, TabState> = { media: "ok", content: "ok", dims: "ok", commerce: "ok", erp: "ok" };
  for (const c of missing) if (tabs[c.tab] !== "bad") tabs[c.tab] = c.level === "required" ? "bad" : "warn";
  return { checks, done: checks.filter((c) => c.ok).length, total: checks.length, missing, tabs };
}
