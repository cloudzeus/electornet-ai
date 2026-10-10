/**
 * Κείμενο SMS σε GSM-7 (160 χαρακτήρες ανά μήνυμα αντί για 70 σε Unicode): τα ελληνικά γράφονται κεφαλαία χωρίς τόνους,
 * με τα γράμματα που υπάρχουν στο GSM-7 (Δ Φ Γ Λ Ω Π Ψ Σ Θ Ξ) και τα υπόλοιπα με τα ίδια λατινικά (Α→A, Β→B …).
 * Καθαρές συναρτήσεις.
 */
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€\f";
const LOOKALIKE: Record<string, string> = { Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X" };

/** Ελληνικό κείμενο → GSM-7 (οι λατινικοί χαρακτήρες, τα ψηφία και τα σύμβολα μένουν ως έχουν). */
export function gsmGreek(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFD").replace(/[̀-ͯ]/g, "")) {
    if (/[α-ως]/.test(ch)) { const up = ch === "ς" ? "Σ" : ch.toUpperCase(); out += LOOKALIKE[up] ?? up; }
    else if (/[Α-Ω]/.test(ch)) out += LOOKALIKE[ch] ?? ch;
    else if (ch === "«" || ch === "»") out += '"';
    else if (ch === "–" || ch === "—") out += "-";
    else out += ch;
  }
  return out;
}

/** Μήκος σε χαρακτήρες GSM-7 (οι επεκταμένοι μετρούν 2) — null αν υπάρχει χαρακτήρας εκτός GSM-7. */
export function gsmLength(s: string): number | null {
  let n = 0;
  for (const ch of s) { if (GSM_BASIC.includes(ch)) n++; else if (GSM_EXT.includes(ch)) n += 2; else return null; }
  return n;
}

/** Κινητό ελληνικό σε διεθνή μορφή χωρίς «+» (3069XXXXXXXX) — αλλιώς null. */
export function greekMobile(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "").replace(/^00/, "").replace(/^30(?=69\d{8}$)/, "");
  return /^69\d{8}$/.test(d) ? `30${d}` : null;
}
