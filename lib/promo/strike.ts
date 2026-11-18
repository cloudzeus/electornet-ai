/**
 * Η διαγραμμένη τιμή που δείχνει η βιτρίνα δίπλα στην τιμή προσφοράς.
 * Πρώτα η χαμηλότερη τιμή 30 ημερών (Omnibus), όταν είναι πάνω από την τιμή προσφοράς. Όταν δεν είναι — π.χ. σε προσφορά
 * «Διαγραμμένες τιμές SoftOne», όπου η τιμή web είναι ήδη η μειωμένη και το ιστορικό δεν έχει υψηλότερη — δείχνεται η
 * αρχική τιμή της προσφοράς (listPrice), για να μη μείνει προσφορά χωρίς διαγραμμένη τιμή. `omnibus` = αν είναι η 30ήμερη.
 */
export function strikePrice(price: number, list: number, lowest30: number | null | undefined): { was: number; omnibus: boolean } | null {
  if (!(price > 0)) return null;
  if (lowest30 != null && lowest30 > price) return { was: lowest30, omnibus: true };
  if (list > price) return { was: list, omnibus: false };
  return null;
}

/**
 * Η «Αρχική Τιμή Web» του SoftOne (σε ευρώ) ως διαγραμμένη τιμή σε λεπτά, μόνο όταν είναι πάνω από την τιμή web· αλλιώς 0.
 * Ισχύει για κάθε είδος που την έχει, ακόμη κι αν δεν είναι σε καλάθι προσφοράς.
 */
export function initialStrikeCents(unitCents: number, initialEur: number | null | undefined): number {
  const was = Math.round((initialEur ?? 0) * 100);
  return unitCents > 0 && was > unitCents ? was : 0;
}
