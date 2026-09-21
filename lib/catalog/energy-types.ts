/**
 * Ποιοι τύποι προϊόντος έχουν ευρωπαϊκή ενεργειακή ετικέτα — και σε ποια ομάδα του EPREL ζουν.
 * Ένας πίνακας για δύο δουλειές: (α) πού ψάχνουμε στο EPREL, (β) **πού επιτρέπεται να δείξουμε ενεργειακή
 * πληροφόρηση στη βιτρίνα**. Σε τύπο χωρίς ετικέτα (σκούπες, καφετιέρες, σίδερα, ακουστικά…) δεν δείχνουμε
 * ούτε κλάση, ούτε φίλτρο, ούτε «πόσο ρεύμα καίει;» — ακόμη κι αν η περιγραφή του ERP γράφει κάπου «Α».
 * Καθαρό module: το διαβάζουν και server και client.
 */
const lower = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ");

/** Τύπος προϊόντος (όνομα ομάδας SoftOne) → ομάδες του EPREL, νεότερος κανονισμός πρώτα. */
const GROUPS: [RegExp, string[]][] = [
  [/πλυντηρια-στεγνωτηρια|πλυντηριο-στεγνωτηριο/, ["washerdriers2019", "washerdriers"]],
  [/πλυντηρια ρουχων/, ["washingmachines2019", "washingmachines"]],
  [/στεγνωτηρια/, ["tumbledryers20232534", "tumbledriers"]],
  [/πλυντηρια πιατων/, ["dishwashers2019", "dishwashers"]],
  [/ψυγει|καταψυκτ|συντηρητ|οινοψυκτ|side by side|ντουλαπεσ/, ["refrigeratingappliances2019", "refrigeratingappliances"]],
  [/τηλεορασ|οθονεσ υπολογιστ|monitor/, ["electronicdisplays", "televisions"]],
  [/κλιματιστ/, ["airconditioners"]],
  [/φουρνοι(?! μικροκυματων)|^φουρνοσ|κουζινεσ|set εντοιχισμου/, ["ovens"]],
  [/απορροφητηρ/, ["rangehoods"]],
  [/θερμοσιφων/, ["waterheaters", "hotwaterstoragetanks"]],
  [/^κινητα - smartphones|^tablets/, ["smartphonestablets20231669"]],
  [/θερμαντικ|θερμοπομπ|αεροθερμ|καλοριφερ|θερμαστρ/, ["localspaceheaters"]],
];
export const eprelGroupsFor = (typeName: string) => GROUPS.find(([re]) => re.test(lower(typeName)))?.[1] ?? null;
/**
 * Πού ΔΕΙΧΝΟΥΜΕ ενεργειακή πληροφόρηση. Κινητά και tablets έχουν καταχώριση στο EPREL από το 2025 (την κρατάμε: αντοχή
 * μπαταρίας, επισκευασιμότητα), αλλά «ενεργειακή κλάση» σε tablet δεν είναι κριτήριο αγοράς — στη βιτρίνα είναι θόρυβος.
 */
export const hasEnergyLabel = (typeName: string) => { const g = eprelGroupsFor(typeName); return g !== null && !g.includes("smartphonestablets20231669"); };

/** Ερώτηση προς τον σύμβουλο που αφορά ρεύμα / κατανάλωση — δεν προτείνεται εκεί όπου δεν υπάρχει ενεργειακή ετικέτα. */
export const isEnergyQuestion = (q: string) => /ρευμα|καταναλωσ|ενεργει|kwh/.test(lower(q));
