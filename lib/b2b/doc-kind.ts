/** Είδος παραστατικού από το όνομα του τύπου (FPRMS.NAME) του SoftOne. */
export type DocKind = "order" | "sale" | "credit" | "cancel" | "delivery" | "offer" | "other";
export const KIND_LABEL: Record<DocKind, string> = { order: "Παραγγελία", sale: "Τιμολόγιο / απόδειξη", credit: "Πιστωτικό", cancel: "Ακυρωτικό", delivery: "Δελτίο", offer: "Προσφορά / προτιμολόγιο", other: "Άλλο" };

export function docKind(name: string): DocKind {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/ΑΚΥΡΩ/.test(n)) return "cancel";
  if (/ΠΑΡΑΓΓΕΛ/.test(n)) return "order";
  if (/ΠΡΟ-|ΠΡΟΤΙΜΟΛ|ΠΡΟΣΦΟΡ/.test(n)) return "offer";
  if (/ΠΙΣΤΩΤ|ΑΠΟΔΕΙΞΗ ΕΠΙΣΤΡΟΦ/.test(n)) return "credit";
  if (/ΤΙΜΟΛΟΓ|ΑΠΟΔΕΙΞ|ΑΠΟΔ\./.test(n)) return "sale";
  if (/ΔΕΛΤΙΟ|PKP|PKS/.test(n)) return "delivery";
  return "other";
}
