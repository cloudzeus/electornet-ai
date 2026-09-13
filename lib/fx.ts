import "server-only";
import { db } from "@/lib/db";

/**
 * USD→EUR rate per day (ECB reference rates via frankfurter.app, no key).
 * Cached in FxRate; weekends/holidays resolve to the last published rate.
 * Fallback: latest cached rate, then FX_USD_EUR_FALLBACK (0.92).
 */
export async function usdEurRate(day = new Date().toISOString().slice(0, 10)): Promise<number> {
  const cached = await db.fxRate.findUnique({ where: { day_base_quote: { day, base: "USD", quote: "EUR" } } }).catch(() => null);
  if (cached) return cached.rate;
  try {
    const res = await fetch(`https://api.frankfurter.app/${day}?from=USD&to=EUR`, { signal: AbortSignal.timeout(6000), next: { revalidate: 3600 } });
    if (res.ok) {
      const j = (await res.json()) as { rates?: { EUR?: number } };
      const rate = j.rates?.EUR;
      if (rate) {
        await db.fxRate.upsert({ where: { day_base_quote: { day, base: "USD", quote: "EUR" } }, update: { rate }, create: { day, base: "USD", quote: "EUR", rate } }).catch(() => null);
        return rate;
      }
    }
  } catch {
    /* offline */
  }
  const last = await db.fxRate.findFirst({ where: { base: "USD", quote: "EUR" }, orderBy: { day: "desc" } }).catch(() => null);
  return last?.rate ?? Number(process.env.FX_USD_EUR_FALLBACK ?? 0.92);
}
