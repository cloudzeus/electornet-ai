/**
 * **Κλιματιστικά σε δύο μονάδες** — καθαρή λογική (χωρίς βάση ή δίκτυο).
 *
 * Ένα split κλιματιστικό είναι δύο ξεχωριστά είδη: η **εσωτερική** και η **εξωτερική** μονάδα, με δικό τους κωδικό και
 * barcode. Στο SoftOne ενώνονται σε «Set ειδών» (SPCS) με κύριο είδος την εσωτερική, που κουβαλά όλη την τιμή· η
 * εξωτερική δεν ανεβαίνει καν στο site.
 *
 * Ένα feed προμηθευτή όμως τα στέλνει **και τα δύο ως κανονικά προϊόντα**. Αν περάσουν έτσι, η βιτρίνα βγάζει δύο
 * καρτέλες για το ίδιο κλιματιστικό — και η μία είναι ένα μηχάνημα που δεν αγοράζει κανείς μόνο του. Εδώ απλώς τα
 * **αναγνωρίζουμε** για να ειδοποιηθεί ο χρήστης· το σετ στήνεται στο ERP, δεν το φτιάχνει η εισαγωγή.
 */

export type AcSide = "in" | "out";

const plain = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
/** Οι ενδείξεις στο όνομα, από την πιο ρητή προς την πιο γενική. Το «ΕΣΩΤΕΡΙΚΟ/Η» γράφεται και με λατινικά. */
const IN_NAME = /(^|[^A-Z0-9])(INV\.?\s?IN|IN\.?\s?UNIT|INDOOR|[ΕE][ΣS][ΩW]?[ΤT][ΕE][ΡPR][ΙI][ΚK])/;
const OUT_NAME = /(^|[^A-Z0-9])(INV\.?\s?OUT|OUT\.?\s?UNIT|OUTDOOR|[ΕE][ΞX][ΩW][ΤT][ΕE][ΡPR][ΙI][ΚK])/;
/** Κωδικός ζεύγους: ίδιος κωδικός που αλλάζει μόνο στο τελευταίο γράμμα, i ↔ o (20.709HTi / 20.709HTo). */
const CODE_SIDE = /^(.+[A-Za-z0-9])([io])$/;

/** Είναι αυτό το είδος μονάδα κλιματιστικού, και ποια; `null` = δεν φαίνεται. */
export function acSide(name: string, code: string): AcSide | null {
  const n = plain(name);
  if (IN_NAME.test(n)) return "in";
  if (OUT_NAME.test(n)) return "out";
  // Ο κωδικός μόνος του είναι αδύναμη ένδειξη: τον δεχόμαστε μόνο όταν το όνομα μιλά για κλιματιστικό.
  const m = CODE_SIDE.exec((code ?? "").trim());
  if (m && /(^|[^A-Z])(INVERTER|SPLIT|BTU|TOYOTOMI|[ΚK]ΛΙΜΑΤΙ[ΣS]|AIR\s?COND)/.test(n)) return m[2].toLowerCase() === "i" ? "in" : "out";
  return null;
}

/** Το μοντέλο στο οποίο ανήκουν και οι δύο μονάδες: ο κωδικός χωρίς το τελικό i/o, αλλιώς το όνομα χωρίς την ένδειξη. */
const modelKey = (name: string, code: string): string => {
  const m = CODE_SIDE.exec((code ?? "").trim());
  if (m) return `c:${m[1].toUpperCase()}`;
  return `n:${plain(name).replace(IN_NAME, " ").replace(OUT_NAME, " ").replace(/[^A-Z0-9]+/g, " ").trim()}`;
};

export interface AcRow { key: string; name: string }
export interface AcPair { model: string; inner: AcRow; outer: AcRow }

/**
 * Τα ζεύγη εσωτερικής / εξωτερικής μονάδας μέσα σε ένα feed. Μονάδα χωρίς το ταίρι της **δεν** επιστρέφεται: μπορεί
 * κάλλιστα να πωλείται μόνη της (ανταλλακτικό, αντικατάσταση) και δεν θέλουμε ψεύτικο συναγερμό.
 */
export function acPairs(rows: AcRow[], max = 20): AcPair[] {
  const by = new Map<string, { in?: AcRow; out?: AcRow }>();
  for (const r of rows ?? []) {
    const side = acSide(r.name, r.key);
    if (!side) continue;
    const k = modelKey(r.name, r.key);
    const g = by.get(k) ?? {};
    if (!g[side]) g[side] = r;
    by.set(k, g);
  }
  const out: AcPair[] = [];
  for (const [model, g] of by) if (g.in && g.out) out.push({ model, inner: g.in, outer: g.out });
  return out.slice(0, Math.max(0, max));
}
