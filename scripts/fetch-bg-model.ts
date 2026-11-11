/** Build: κατεβάζει (μία φορά) το μοντέλο αφαίρεσης φόντου στο .models/ — βλ. lib/media/bg-model-file.ts. Δεν σταματά το build αν αποτύχει. */
import { ensureBgModel } from "../lib/media/bg-model-file";

ensureBgModel().then(
  (f) => console.log(`✓ μοντέλο αφαίρεσης φόντου: ${f}`),
  (e) => console.warn(`⚠ μοντέλο αφαίρεσης φόντου: ${(e as Error).message} — θα κατέβει την πρώτη φορά που χρειαστεί.`),
);
