import { CHECK_EXPLAIN, EXTRA_EXPLAIN, type Explain } from "@/lib/security/audit/explain";

/** «Τι ελέγχεται και γιατί»: ένα στοιχείο ανά έλεγχο + ο εξωτερικός φύλακας και ο dead man's switch, σε απλά ελληνικά. */
export function Explainer() {
  return (
    <div className="grid gap-4 min-w-0">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">
        Όλοι οι έλεγχοι κάνουν <b className="text-eu-ink">μόνο αναγνώσεις</b> (ανάγνωση βάσης, λίστα αρχείων, επίσκεψη στις σελίδες) — δεν αλλάζουν τίποτα.
        Κάθε εκτέλεση αποθηκεύεται ως αναφορά για 180 ημέρες. «Μερικός έλεγχος» σημαίνει ότι κάποιος έλεγχος δεν πρόλαβε να καλύψει όλο το διάστημα·
        «Σφάλμα ελέγχου» ότι δεν ολοκληρώθηκε — και τα δύο είναι ορατά, ποτέ «ΟΚ».
      </p>
      <ol className="m-0 p-0 list-none grid gap-3 @3xl:grid-cols-2 min-w-0">
        {CHECK_EXPLAIN.map((e) => <Item key={e.key} e={e} />)}
      </ol>
      <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Ανεξάρτητος έλεγχος από έξω</h4>
      <ol className="m-0 p-0 list-none grid gap-3 @3xl:grid-cols-2 min-w-0">
        {EXTRA_EXPLAIN.map((e) => <Item key={e.key} e={e} />)}
      </ol>
    </div>
  );
}

function Item({ e }: { e: Explain }) {
  return (
    <li className="rounded-xl border border-eu-line bg-white p-4 grid gap-1.5 content-start min-w-0">
      <div className="font-bold text-eu-ink text-[length:var(--fs-16)] break-words">{e.title}</div>
      <div className="text-eu-muted text-[length:var(--fs-13)] break-words">{e.when}</div>
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] break-words"><b className="text-eu-ink">Τι:</b> {e.what}</p>
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] break-words"><b className="text-eu-ink">Γιατί:</b> {e.why}</p>
    </li>
  );
}
