/** Standard phrases of the voice advisor. Pre-generated once («Προθέρμανση») and served from the audio cache for ever after. */
export const PRESET_PHRASES: { key: string; text: string; group: "greeting" | "wait" | "confirm" | "error" | "bye" }[] = [
  { key: "welcome", group: "greeting", text: "Καλώς ήρθες στη Euronics! Είμαι ο Ερμής. Πώς μπορώ να βοηθήσω;" },
  { key: "welcome-back", group: "greeting", text: "Καλώς ήρθες ξανά! Τι ψάχνουμε σήμερα;" },
  { key: "listening", group: "wait", text: "Σε ακούω." },
  { key: "thinking", group: "wait", text: "Μια στιγμή, το κοιτάζω." },
  { key: "wait", group: "wait", text: "Παρακαλώ περίμενε λίγο." },
  { key: "confirm-proceed", group: "confirm", text: "Θέλεις να προχωρήσουμε;" },
  { key: "confirm-cart", group: "confirm", text: "Να το βάλω στο καλάθι σου;" },
  { key: "confirm-store", group: "confirm", text: "Θέλεις να σε καλέσει το κατάστημα της γειτονιάς σου;" },
  { key: "not-heard", group: "error", text: "Δεν σε άκουσα καθαρά. Μπορείς να το επαναλάβεις;" },
  { key: "mic-denied", group: "error", text: "Δεν έχω πρόσβαση στο μικρόφωνο. Γράψε μου την ερώτησή σου." },
  { key: "error", group: "error", text: "Κάτι πήγε στραβά. Δοκίμασε ξανά ή ζήτα άνθρωπο από το κατάστημα." },
  { key: "bye", group: "bye", text: "Ευχαριστώ! Καλή συνέχεια." },
  { key: "bye-store", group: "bye", text: "Τα λέμε στο κατάστημα. Αντίο!" },
];
export const PRESET_GROUP_LABEL: Record<string, string> = { greeting: "Καλωσόρισμα", wait: "Αναμονή", confirm: "Επιβεβαίωση", error: "Σφάλματα", bye: "Αποχαιρετισμός" };
