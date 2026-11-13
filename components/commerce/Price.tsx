import { NO_PRICE } from "@/lib/format";

const whole = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 });
// τα δεκαδικά στο μισό μέγεθος, κολλημένα πάνω δεξιά από τα ευρώ
const SMALL = "inline-block align-top text-[0.5em] leading-none mt-[0.14em] ml-[0.06em]";

/**
 * Τιμή-τίτλος (κάρτα, σελίδα προϊόντος, banner): ακέραια ευρώ μεγάλα, δεκαδικά στο 50 % πάνω δεξιά.
 * `short`: ακέραιη τιμή χωρίς «,00» (όπως το priceShort). `euroSmall`: και το «€» μικρό πάνω, δίπλα στα δεκαδικά (banners).
 */
export function Price({ value, short, euroSmall }: { value: number; short?: boolean; euroSmall?: boolean }) {
  if (!(value > 0)) return <>{NO_PRICE}</>;
  const cents = Math.round(value * 100), dec = cents % 100;
  const decimals = short && dec === 0 ? "" : `,${String(dec).padStart(2, "0")}`;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {whole.format(Math.floor(cents / 100))}
      {(decimals || euroSmall) && <span className={SMALL}>{decimals}{euroSmall ? "€" : ""}</span>}
      {!euroSmall && "\u00a0€"}
    </span>
  );
}
