/** Ελληνικές ετικέτες για ό,τι αποθηκεύεται ως κωδικός στις παραγγελίες. */
const PAY: Record<string, string> = {
  card: "Κάρτα", apple: "Apple Pay", google: "Google Pay", paypal: "PayPal", iris: "IRIS", klarna: "Klarna", revolut: "Revolut Pay",
  "no-card": "Δόσεις χωρίς κάρτα", bank: "Κατάθεση σε τράπεζα", cod: "Αντικαταβολή", store: "Στο κατάστημα",
};
export const payLabel = (m: string | null | undefined) => (m ? PAY[m] ?? m : "—");
