/**
 * JSON για inline `<script type="application/ld+json">` (και κάθε inline JSON σε script): το JSON.stringify ΔΕΝ κάνει
 * escape το «<», οπότε ένα όνομα προϊόντος / FAQ / καταστήματος με «</script><form…>» θα έκλεινε το script και θα
 * έβαζε HTML στη σελίδα. Εδώ γίνονται \u-escape τα < > & και U+2028 / U+2029 — το JSON μένει ισοδύναμο.
 */
const ESC: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };

export function jsonLd(obj: unknown): string {
  return (JSON.stringify(obj) ?? "null").replace(/[<>&\u2028\u2029]/g, (c) => ESC[c]);
}
