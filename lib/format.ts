const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const eurInt = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 });

/** 449 → "449 €" (design: whole euros in cards) */
/** Προϊόν της βάσης χωρίς τιμή ακόμη (Product.noPrice → price 0): ποτέ «0 €» στην οθόνη. */
export const NO_PRICE = "Τιμή στο κατάστημα";
export function priceShort(v: number) {
  if (!(v > 0)) return NO_PRICE;
  return Number.isInteger(v) ? `${eurInt.format(v)} €` : eur.format(v).replace(" ", " ");
}
/** 449 → "449,00 €" */
export function priceLong(v: number) {
  if (!(v > 0)) return NO_PRICE;
  return eur.format(v).replace(" ", " ");
}
export function discountPct(price: number, was?: number) {
  if (!was || was <= price) return null;
  return Math.round(((was - price) / was) * 100);
}
/** Instalment without card: n equal monthly payments, rounded to cents. */
export function instalment(price: number, months = 12) {
  return Math.round((price / months) * 100) / 100;
}
export function weekday(d: Date) {
  return new Intl.DateTimeFormat("el-GR", { weekday: "short", day: "numeric", month: "numeric" }).format(d);
}
