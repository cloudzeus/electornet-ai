import path from "node:path";

/**
 * Τοπικό αρχείο από διαδρομή που ήρθε ως URL («/uploads/…»): επιστρέφει την απόλυτη διαδρομή ΜΟΝΟ αν μένει μέσα στο
 * `base` (όχι «/uploads/../../.env»)· αλλιώς null. Καθαρή συνάρτηση (μόνο υπολογισμός διαδρομών, χωρίς δίσκο).
 */
export function resolveInside(base: string, rel: string): string | null {
  if (typeof rel !== "string" || rel.includes("\0")) return null;
  const root = path.resolve(base);
  const full = path.resolve(root, "." + path.posix.sep + rel.replace(/^[/\\]+/, ""));
  return full.startsWith(root + path.sep) ? full : null;
}
