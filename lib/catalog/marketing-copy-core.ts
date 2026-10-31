import { parseDescription, toPlainText } from "@/lib/softone/describe";

/**
 * Περιγραφές με AI — το καθαρό κομμάτι (χωρίς βάση / δίκτυο, για tests):
 *  - το κείμενο του AI δεν πρέπει να περιέχει γραμμές «ετικέτα: τιμή»: η αναλυτική περιγραφή του SoftOne διαβάζεται από το
 *    `parseDescription` και τέτοιες γραμμές θα γίνονταν χαρακτηριστικά στο site.
 *  - στην αναλυτική περιγραφή αλλάζει ΜΟΝΟ το κείμενο: οι γραμμές χαρακτηριστικών του ERP μένουν όπως ήταν, από κάτω.
 */
const isSpecLine = (line: string) => parseDescription(line).specs.length === 1;

/** Καθαρό κείμενο: χωρίς markdown, χωρίς γραμμές που θα διαβάζονταν ως χαρακτηριστικά, μία κενή γραμμή ανάμεσα σε παραγράφους. */
export function cleanCopy(text: string): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*|__|^#+\s*/gm, "")
    .split("\n")
    .map((l) => l.trim())
    .map((l) => (l && isSpecLine(l) ? l.replace(/\s*:\s*/, " — ") : l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Νέα αναλυτική περιγραφή: το νέο κείμενο επάνω και κάτω οι γραμμές χαρακτηριστικών του ERP (ίδια σειρά, ίδια γραφή). */
export function replaceMemoText(current: string | null | undefined, text: string): string {
  const raw = String(current ?? "");
  const lines = (/<[a-z][^>]*>/i.test(raw) ? toPlainText(raw) : raw).replace(/\r\n?/g, "\n").split("\n");
  const specs = lines.map((l) => l.trim()).filter((l) => l && isSpecLine(l));
  const body = cleanCopy(text);
  return (body && specs.length ? [body, "", ...specs] : body ? [body] : specs).join("\n");
}

export interface CategoryExample { title: string; summary: string | null; description: string }

/**
 * Παραδείγματα ύφους από την ίδια κατηγορία: περιγραφές με ουσιαστικό κείμενο (όχι δύο γραμμές, όχι σεντόνι), πρώτα όσες
 * είναι πιο κοντά στις ~900 χαρακτήρες, μία ανά μάρκα όσο γίνεται.
 */
export function pickExamples(rows: { title: string; brand: string; summary: string | null; description: string | null }[], max = 3): CategoryExample[] {
  const ok = rows.filter((r) => r.description && r.description.length >= 250 && r.description.length <= 3000);
  ok.sort((a, b) => Math.abs(a.description!.length - 900) - Math.abs(b.description!.length - 900));
  const out: CategoryExample[] = [], brands = new Set<string>();
  for (const pass of [true, false]) for (const r of ok) {
    if (out.length >= max) break;
    if (out.some((x) => x.title === r.title) || (pass && brands.has(r.brand))) continue;
    brands.add(r.brand); out.push({ title: r.title, summary: r.summary, description: r.description!.slice(0, 1200) });
  }
  return out;
}
