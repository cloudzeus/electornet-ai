/** Αιτήματα αναπλήρωσης αποθέματος (πύλη ↔ διαχείριση): καταστάσεις, τρόποι αποστολής, γραμμές. Χωρίς server-only — τα χρησιμοποιούν και client components. */

export type RestockStatus = "requested" | "approved" | "ready" | "shipped" | "rejected" | "cancelled";
export type ShipMode = "bulk" | "express" | "pickup";
export type RestockLine = { variantId: string; erpCode: string | null; title: string; qty: number };
type Tone = "neutral" | "info" | "good" | "warn" | "bad";

export const RESTOCK_STATUS: Record<RestockStatus, { label: string; tone: Tone; help: string }> = {
  requested: { label: "Αναμένει έγκριση", tone: "warn", help: "Το αίτημα στάλθηκε στην Euronics." },
  approved: { label: "Εγκρίθηκε", tone: "info", help: "Έγινε παραγγελία αναπλήρωσης· ετοιμάζεται." },
  ready: { label: "Έτοιμο για παραλαβή", tone: "good", help: "Περιμένει στο κατάστημα παραλαβής." },
  shipped: { label: "Στάλθηκε", tone: "good", help: "Τα προϊόντα στάλθηκαν στο κατάστημα." },
  rejected: { label: "Δεν εγκρίθηκε", tone: "bad", help: "Η Euronics δεν μπορεί να το καλύψει — δείτε την απάντηση." },
  cancelled: { label: "Ακυρώθηκε", tone: "neutral", help: "Το αίτημα ακυρώθηκε." },
};
export const SHIP_MODE: Record<ShipMode, { label: string; help: string }> = {
  bulk: { label: "Στην επόμενη μαζική αποστολή", help: "Μαζί με την επόμενη τακτική αποστολή προς το κατάστημα." },
  express: { label: "Άμεσα", help: "Ξεχωριστή αποστολή, όσο γίνεται πιο γρήγορα." },
  pickup: { label: "Παραλαβή από το πλησιέστερο κατάστημα", help: "Το παίρνετε εσείς από κοντινό κατάστημα που έχει απόθεμα — η Euronics σας λέει ποιο." },
};

export const isShipMode = (v: unknown): v is ShipMode => v === "bulk" || v === "express" || v === "pickup";
export const modeOf = (r: { approvedMode?: string | null; shipMode: string }): ShipMode => (isShipMode(r.approvedMode) ? r.approvedMode : isShipMode(r.shipMode) ? r.shipMode : "bulk");
/** Ετικέτα κατάστασης· στην παραλαβή το «shipped» σημαίνει «Παραλήφθηκε». */
export function restockStatusOf(status: string, mode?: ShipMode) {
  if (status === "shipped" && mode === "pickup") return { label: "Παραλήφθηκε", tone: "good" as Tone, help: "Το μέλος παρέλαβε τα προϊόντα." };
  return status in RESTOCK_STATUS ? RESTOCK_STATUS[status as RestockStatus] : { label: status, tone: "neutral" as Tone, help: "" };
}
export const linesOf = (v: unknown): RestockLine[] => (Array.isArray(v) ? (v as RestockLine[]).filter((l) => l && typeof l.title === "string" && Number(l.qty) > 0) : []);
/** Ανοιχτό αίτημα = δεν μπορεί να γίνει δεύτερο για την ίδια παραγγελία. */
export const OPEN_RESTOCK: RestockStatus[] = ["requested", "approved", "ready"];
export const MAX_QTY = 99;
