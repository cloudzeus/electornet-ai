/**
 * Ποια στήλη ενός Excel τιμών είναι ο κωδικός, ποια η τιμή προσφοράς και ποια (προαιρετικά) η «τιμή πριν».
 * Χωρίς κεφαλίδα: 1η = κωδικός, 2η = τιμή προσφοράς.
 */
export function priceColumns(first: string[]): { hasHead: boolean; code: number; price: number; before: number } {
  const head = first.map((h) => h.toLocaleLowerCase("el-GR"));
  const isCode = (h: string) => /κωδ|sku|code|ean|barcode/.test(h);
  const isBefore = (h: string) => /πριν|αρχικ|παλι|προηγ|before|old|list|was/.test(h);
  const isPrice = (h: string) => /ειδικ|νέα|νεα|τελικ|προσφ|τώρα|τωρα|special|new|offer|price|τιμ/.test(h);
  if (!head.some((h) => isCode(h) || isPrice(h))) return { hasHead: false, code: 0, price: 1, before: -1 };
  const code = Math.max(0, head.findIndex(isCode));
  const before = head.findIndex((h, i) => i !== code && isBefore(h));
  const price = head.findIndex((h, i) => i !== code && i !== before && isPrice(h));
  return { hasHead: true, code, price: price < 0 ? (code === 0 ? 1 : 0) : price, before };
}

/** «1.199,00 €» ή «1199.5» → λεπτά· null όταν δεν είναι θετικός αριθμός. */
export function priceCents(raw: string | undefined): number | null {
  const s = (raw ?? "").replace(/[€\s]/g, "");
  const num = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return s && Number.isFinite(num) && num > 0 ? Math.round(num * 100) : null;
}
