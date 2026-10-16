/**
 * Μοντέλο παραγγελιών για τη διαχείριση — καθαρές συναρτήσεις (server + browser): ετικέτες, τόνοι, επιτρεπτές αλλαγές
 * κατάστασης ανά τρόπο παράδοσης και η «επόμενη ενέργεια» που προτείνεται στο προσωπικό.
 */
export type OrderStatus = "pending" | "paid" | "processing" | "shipped" | "ready-for-pickup" | "delivered" | "cancelled" | "returned";
export type Fulfilment = "courier" | "click-collect" | "appointment";
export type Tone = "neutral" | "info" | "good" | "warn" | "bad";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; help: string }> = {
  pending: { label: "Νέα", tone: "warn", help: "Καταχωρήθηκε — αναμένεται πληρωμή ή επιβεβαίωση (αντικαταβολή, τραπεζική μεταφορά)." },
  paid: { label: "Πληρώθηκε", tone: "info", help: "Η πληρωμή ολοκληρώθηκε — έτοιμη για επεξεργασία." },
  processing: { label: "Σε επεξεργασία", tone: "info", help: "Συλλογή / συσκευασία, έκδοση voucher ή προετοιμασία στο κατάστημα." },
  shipped: { label: "Στάλθηκε", tone: "info", help: "Στον courier — η κατάσταση ενημερώνεται αυτόματα από την παρακολούθηση." },
  "ready-for-pickup": { label: "Έτοιμη για παραλαβή", tone: "good", help: "Περιμένει τον πελάτη στο κατάστημα." },
  delivered: { label: "Παραδόθηκε", tone: "good", help: "Ολοκληρώθηκε." },
  cancelled: { label: "Ακυρώθηκε", tone: "neutral", help: "Ακυρώθηκε — οι χρήσεις κουπονιού και προσφορών επιστράφηκαν." },
  returned: { label: "Επιστράφηκε", tone: "bad", help: "Επιστράφηκε στο κατάστημα." },
};
export const isOrderStatus = (v: unknown): v is OrderStatus => typeof v === "string" && v in ORDER_STATUS;
export const statusLabel = (s: string) => (isOrderStatus(s) ? ORDER_STATUS[s].label : s);

export const FULFILMENT: Record<Fulfilment, string> = { courier: "Courier", "click-collect": "Παραλαβή από κατάστημα", appointment: "Παράδοση με ραντεβού" };
export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Εκκρεμεί", tone: "warn" }, processing: { label: "Σε εξέλιξη", tone: "info" }, review: { label: "Σε έλεγχο", tone: "warn" },
  paid: { label: "Πληρώθηκε", tone: "good" }, failed: { label: "Απέτυχε", tone: "bad" }, cancelled: { label: "Ακυρώθηκε", tone: "neutral" },
  refunded: { label: "Επιστράφηκαν", tone: "neutral" }, "partially-refunded": { label: "Μερική επιστροφή", tone: "warn" },
};
export const ERP_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  preview: { label: "Προσχέδιο", tone: "neutral", help: "Το παραστατικό είναι έτοιμο· η αποστολή στο SoftOne δεν είναι ενεργή ακόμη." },
  "awaiting-payment": { label: "Αναμονή πληρωμής", tone: "warn", help: "Θα ετοιμαστεί μόλις ολοκληρωθεί η πληρωμή." },
  queued: { label: "Σε ουρά", tone: "info", help: "Θα σταλεί στο SoftOne." },
  sent: { label: "Στάλθηκε", tone: "good", help: "Καταχωρήθηκε στο SoftOne." },
  failed: { label: "Απέτυχε", tone: "bad", help: "Η αποστολή στο SoftOne απέτυχε — δες το σφάλμα." },
};
export const RETURN_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Αίτημα", tone: "warn" }, approved: { label: "Εγκρίθηκε", tone: "info" }, received: { label: "Παραλήφθηκε", tone: "info" },
  refunded: { label: "Επιστράφηκαν χρήματα", tone: "good" }, rejected: { label: "Απορρίφθηκε", tone: "neutral" },
};
/** το κουμπί που οδηγεί σε κάθε κατάσταση επιστροφής (ενέργεια, όχι κατάσταση) */
export const RETURN_ACTION: Record<string, string> = { approved: "Έγκριση", rejected: "Απόρριψη", received: "Παραλαβή προϊόντων", refunded: "Επιστροφή χρημάτων" };
/** επιτρεπτές αλλαγές κατάστασης ενός αιτήματος επιστροφής */
export const RETURN_NEXT: Record<string, string[]> = { requested: ["approved", "rejected"], approved: ["received", "rejected"], received: ["refunded"], refunded: [], rejected: [] };

/**
 * Επιτρεπτές επόμενες καταστάσεις. Η αποστολή με courier γίνεται «Στάλθηκε» από τα vouchers (κλείσιμο ημέρας /
 * πρώτη κίνηση) — εδώ επιτρέπεται και χειροκίνητα για αποστολές εκτός συστήματος.
 */
export function nextStatuses(status: string, fulfilment: string): OrderStatus[] {
  const cc = fulfilment === "click-collect", appt = fulfilment === "appointment";
  switch (status) {
    case "pending": return ["paid", "processing", "cancelled"];
    case "paid": return [...(cc ? ["ready-for-pickup" as const] : []), "processing", "cancelled"];
    case "processing": return cc ? ["ready-for-pickup", "cancelled"] : appt ? ["delivered", "cancelled"] : ["shipped", "cancelled"];
    case "shipped": return ["delivered", "returned"];
    case "ready-for-pickup": return ["delivered", "cancelled"];
    case "delivered": return ["returned"];
    default: return [];
  }
}
export const canTransition = (from: string, to: string, fulfilment: string) => nextStatuses(from, fulfilment).includes(to as OrderStatus);

/** Ποιες αλλαγές στέλνουν email στον πελάτη (με επιλογή «Ειδοποίηση πελάτη»). */
export const NOTIFY_ON: Partial<Record<OrderStatus, string>> = { cancelled: "order-cancelled", "ready-for-pickup": "order-ready-for-pickup", delivered: "order-delivered" };

export type NextAction =
  | { kind: "status"; to: OrderStatus; label: string; hint: string }
  | { kind: "voucher"; label: string; hint: string }
  | { kind: "none"; label: string; hint: string };

/** Η μία προτεινόμενη επόμενη ενέργεια (κύριο κουμπί της καρτέλας). */
export function nextAction(o: { status: string; fulfilment: string; paymentMethod: string | null; hasShipment: boolean }): NextAction {
  const cc = o.fulfilment === "click-collect";
  switch (o.status) {
    case "pending":
      return o.paymentMethod === "cod"
        ? { kind: "status", to: "processing", label: "Επιβεβαίωση & επεξεργασία", hint: "Αντικαταβολή: ξεκίνα την προετοιμασία." }
        : o.paymentMethod === "bank" || o.paymentMethod === "bank-transfer"
          ? { kind: "status", to: "paid", label: "Η πληρωμή ελήφθη", hint: "Επιβεβαίωσε ότι πιστώθηκε η τραπεζική μεταφορά." }
          : { kind: "none", label: "Αναμονή πληρωμής", hint: "Η online πληρωμή δεν έχει ολοκληρωθεί· ακυρώνεται αυτόματα μετά από 24 ώρες." };
    case "paid":
      return cc ? { kind: "status", to: "ready-for-pickup", label: "Έτοιμη για παραλαβή", hint: "Όταν τα προϊόντα είναι στο κατάστημα." } : { kind: "status", to: "processing", label: "Σε επεξεργασία", hint: "Ξεκίνα τη συλλογή και τη συσκευασία." };
    case "processing":
      if (cc) return { kind: "status", to: "ready-for-pickup", label: "Έτοιμη για παραλαβή", hint: "Ο πελάτης παίρνει email με τον κωδικό παραλαβής." };
      if (o.fulfilment === "appointment") return { kind: "status", to: "delivered", label: "Παραδόθηκε", hint: "Μετά την παράδοση / εγκατάσταση." };
      return o.hasShipment ? { kind: "none", label: "Περιμένει τον courier", hint: "Voucher εκδόθηκε — η κατάσταση αλλάζει με το κλείσιμο ημέρας ή την πρώτη κίνηση." } : { kind: "voucher", label: "Έκδοση voucher", hint: "Βάρος και τεμάχια από τα προϊόντα." };
    case "shipped": return { kind: "none", label: "Σε μεταφορά", hint: "Η παράδοση καταγράφεται αυτόματα από την παρακολούθηση του courier." };
    case "ready-for-pickup": return { kind: "status", to: "delivered", label: "Παραλήφθηκε", hint: "Ο πελάτης πήρε την παραγγελία." };
    default: return { kind: "none", label: ORDER_STATUS[o.status as OrderStatus]?.label ?? o.status, hint: "" };
  }
}

/** Τα 4 στάδια της πορείας (Καταχώρηση → Πληρωμή → Αποστολή / Στο κατάστημα → Παράδοση / Παραλαβή). */
export function orderSteps(status: string, fulfilment: string): { label: string; state: "done" | "current" | "todo" | "bad" }[] {
  const cc = fulfilment === "click-collect";
  const labels = ["Καταχώρηση", "Πληρωμή", cc ? "Στο κατάστημα" : fulfilment === "appointment" ? "Ραντεβού" : "Αποστολή", cc ? "Παραλαβή" : "Παράδοση"];
  if (status === "cancelled" || status === "returned") return labels.map((label, i) => ({ label: i === 3 ? (status === "cancelled" ? "Ακυρώθηκε" : "Επιστράφηκε") : label, state: i === 3 ? "bad" : "done" }));
  const rank: Record<string, number> = { pending: 0, paid: 1, processing: 1, shipped: 2, "ready-for-pickup": 2, delivered: 3 };
  const r = rank[status] ?? 0;
  return labels.map((label, i) => ({ label, state: i < r || status === "delivered" ? "done" : i === r ? "current" : "todo" }));
}

/** Ονοματεπώνυμο / email / τηλέφωνο από το στιγμιότυπο αποστολής της παραγγελίας. */
export type ShipTo = { firstName?: string; lastName?: string; email?: string; phone?: string; street?: string; number?: string; floor?: string; city?: string; zip?: string; region?: string; notes?: string; carrier?: string; carrierName?: string; locker?: { id?: string; name?: string; address?: string; zip?: string } };
export const nameOf = (s: ShipTo) => `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
export const addressOf = (s: ShipTo) => s.locker ? `Θυρίδα BOX NOW: ${[s.locker.name, s.locker.address, s.locker.zip].filter(Boolean).join(", ")}` : [[s.street, s.number].filter(Boolean).join(" ") + (s.floor ? `, ${s.floor}ος` : ""), [s.zip, s.city].filter(Boolean).join(" ")].filter((x) => x.trim()).join(", ");

/** Αριθμός παραγγελίας / email / τηλέφωνο / όνομα για την αναζήτηση της λίστας. */
export function searchKind(q: string): "number" | "email" | "phone" | "text" {
  const t = q.trim();
  if (/^eur-?\d/i.test(t) || /^\d{8}-\d{3,4}$/.test(t)) return "number";
  if (t.includes("@")) return "email";
  if (/^[+\d\s()-]{6,}$/.test(t) && t.replace(/\D/g, "").length >= 6) return "phone";
  return "text";
}
