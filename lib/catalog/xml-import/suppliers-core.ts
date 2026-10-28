/**
 * Προμηθευτές του SoftOne — καθαρή λογική (χωρίς βάση, δίκτυο ή server-only).
 *
 * Το `SOSOURCE` ΔΕΝ είναι πεδίο του TRDR σε αυτή την εγκατάσταση (το GetTable σκάει), άρα η λίστα έρχεται από τον
 * browser του αντικειμένου `SUPPLIER`. Εκεί το TRDR δεν είναι στήλη: κρύβεται στο `ZOOMINFO` ως «SUPPLIER;347», και ο
 * κωδικός έρχεται με κενό μπροστά (« Π0001»). Αυτά τα δύο τα καθαρίζει το `parseSupplierRow`.
 */

export interface SupplierRow {
  s1Trdr: number;
  code: string;
  name: string;
  afm: string | null;
}

/** Κανονικοποίηση για σύγκριση κειμένου: πεζά, χωρίς τόνους, ένα κενό ανάμεσα. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Γραμμή του browser `SUPPLIER` → προμηθευτής. Σειρά στηλών: ZOOMINFO, CODE, NAME, AFM.
 * Γραμμή χωρίς αναγνωρίσιμο TRDR ή χωρίς όνομα → `null`: δεν την μαντεύουμε, την αγνοούμε.
 */
export function parseSupplierRow(row: string[]): SupplierRow | null {
  const [zoom = "", code = "", name = "", afm = ""] = row;
  // Μόνο η μορφή «<object>;<id>» μετράει — ένας σκέτος αριθμός μπορεί να είναι οτιδήποτε άλλο.
  const i = zoom.indexOf(";");
  if (i < 0) return null;
  const id = zoom.slice(i + 1).trim();
  if (!/^\d+$/.test(id)) return null;
  const s1Trdr = Number(id);
  const clean = name.trim();
  if (!s1Trdr || !clean) return null;
  return { s1Trdr, code: code.trim(), name: clean, afm: afm.trim() || null };
}

/**
 * Ο browser `SUPPLIER` δίνει **κάθε προμηθευτή δύο φορές** (η λίστα του έχει δύο διατάξεις στηλών, γι' αυτό και το
 * `totalcount` είναι διπλάσιο: 664 γραμμές = 332 προμηθευτές). Κρατάμε την πρώτη εμφάνιση κάθε TRDR, με τη σειρά.
 */
export function dedupeSuppliers(rows: SupplierRow[]): SupplierRow[] {
  const seen = new Set<number>();
  return rows.filter((s) => (seen.has(s.s1Trdr) ? false : (seen.add(s.s1Trdr), true)));
}

/** Αναζήτηση στη λίστα: κωδικός, όνομα ή ΑΦΜ. Κενό ερώτημα δεν φιλτράρει. */
export function matchesQuery(s: { code: string; name: string; afm: string | null }, q: string): boolean {
  const needle = norm(q);
  if (!needle) return true;
  return [s.code, s.name, s.afm ?? ""].some((v) => norm(v).includes(needle));
}
