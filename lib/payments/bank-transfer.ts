import "server-only";
import { getPublicSettings } from "@/lib/settings/store";
import { usableAccounts, type BankAccount } from "./bank-accounts";

/**
 * Η «Κατάθεση σε τράπεζα» είναι διαθέσιμη μόνο όταν είναι ενεργή στις Ρυθμίσεις → Πληρωμές ΚΑΙ υπάρχει τουλάχιστον ένας
 * πλήρης λογαριασμός — αλλιώς ο πελάτης θα έμενε χωρίς IBAN (checkout και server της παραγγελίας). Οι λογαριασμοί
 * επιστρέφονται και όταν ο τρόπος έχει κλείσει: μια παλιότερη παραγγελία με κατάθεση (σελίδα επιτυχίας, επανάληψη του
 * email) χρειάζεται ακόμη το IBAN.
 */
export async function bankTransfer(): Promise<{ enabled: boolean; accounts: BankAccount[] }> {
  const pay = (await getPublicSettings()).payments ?? {};
  const accounts = usableAccounts(pay.bankAccounts);
  return { enabled: pay.bankTransfer === true && accounts.length > 0, accounts };
}
