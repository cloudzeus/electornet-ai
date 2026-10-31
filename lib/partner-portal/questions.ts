import type { ConnType } from "./connection-types";

/** Το ερωτηματολόγιο αρχικοποίησης (κοινό server/client) και η πρόταση με κανόνες όταν ο βοηθός δεν απαντά. */
export type Q = { key: string; label: string; help?: string; multi?: boolean; options: { value: string; label: string; hint?: string }[] };
export type QStep = { key: string; title: string; hint: string; questions: Q[] };

export const QUESTION_STEPS: QStep[] = [
  {
    key: "system", title: "Τα συστήματά σας", hint: "Για να προτείνουμε τον πιο εύκολο τρόπο σύνδεσης.",
    questions: [
      { key: "erp", label: "Πού κρατάτε αποθήκη και τιμολόγηση;", options: [{ value: "softone", label: "SoftOne" }, { value: "entersoft", label: "Entersoft" }, { value: "epsilon", label: "Epsilon / Galaxy / Pylon" }, { value: "other-erp", label: "Άλλο ERP" }, { value: "excel", label: "Excel ή χειρόγραφα" }] },
      { key: "eshop", label: "Έχετε δικό σας eshop;", options: [{ value: "woocommerce", label: "WooCommerce" }, { value: "shopify", label: "Shopify" }, { value: "other-eshop", label: "Άλλη πλατφόρμα" }, { value: "none", label: "Όχι" }] },
    ],
  },
  {
    key: "stock", title: "Το απόθεμά σας", hint: "Η διαθεσιμότητα δείχνεται ανά κατάστημα — θέλουμε να ξέρουμε πώς είναι οργανωμένη.",
    questions: [
      { key: "layout", label: "Πώς είναι οργανωμένο το απόθεμα;", options: [{ value: "per-store", label: "Χωριστά ανά κατάστημα", hint: "κάθε κατάστημα δική του αποθήκη" }, { value: "central", label: "Μία κεντρική αποθήκη" }, { value: "both", label: "Κεντρική + καταστήματα" }] },
      { key: "ean", label: "Τα είδη σας έχουν EAN (barcode);", options: [{ value: "all", label: "Όλα ή σχεδόν όλα" }, { value: "most", label: "Τα περισσότερα" }, { value: "few", label: "Λίγα" }, { value: "unknown", label: "Δεν ξέρω" }] },
      { key: "freq", label: "Πόσο συχνά θέλετε να ενημερώνεται;", options: [{ value: "live", label: "Όσο πιο συχνά γίνεται" }, { value: "daily", label: "Μία-δύο φορές τη μέρα" }, { value: "weekly", label: "Όποτε ανεβάζω αρχείο" }] },
    ],
  },
  {
    key: "help", title: "Τεχνική υποστήριξη", hint: "Για να ξέρουμε ποιος θα κάνει τις ρυθμίσεις.",
    questions: [
      { key: "it", label: "Έχετε τεχνικό ή εταιρεία πληροφορικής;", options: [{ value: "inhouse", label: "Ναι, δικό μας" }, { value: "vendor", label: "Ναι, εξωτερική" }, { value: "none", label: "Όχι" }] },
      { key: "feed", label: "Βγάζετε ήδη feed για Skroutz / BestPrice;", options: [{ value: "yes", label: "Ναι" }, { value: "no", label: "Όχι" }, { value: "unknown", label: "Δεν ξέρω" }] },
    ],
  },
];

/** Πρόταση με απλούς κανόνες — ίδια λογική που δίνουμε και στον βοηθό ως πλαίσιο. */
export function ruleAdvice(a: Record<string, string>): { type: ConnType; why: string } {
  if (a.erp === "softone" && a.it !== "none") return { type: "softone-ws", why: "Έχετε SoftOne και τεχνική υποστήριξη: διαβάζουμε αυτόματα το απόθεμα ανά υποκατάστημα, χωρίς δική σας εργασία μετά." };
  if (a.eshop === "woocommerce" && a.layout !== "per-store") return { type: "woocommerce", why: "Το WooCommerce σας έχει ήδη ενημερωμένο απόθεμα· αρκεί ένα κλειδί ανάγνωσης." };
  if (a.feed === "yes") return { type: "feed-url", why: "Βγάζετε ήδη feed: μπορούμε να το διαβάζουμε όπως είναι, με αντιστοίχιση στηλών." };
  return { type: "manual", why: "Ο πιο γρήγορος τρόπος να ξεκινήσετε σήμερα: ανεβάζετε ένα Excel και αργότερα περνάτε σε αυτόματο τρόπο." };
}
