import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Η σκηνή και το τηλεχειριστήριο ανοίγουν μόνο με το SKETS_KEY (?k=… στη σελίδα, header x-skets-key στα API). */
export function sketsKeyOk(k: string | null | undefined): boolean {
  const want = process.env.SKETS_KEY ?? "";
  if (!want || !k) return false;
  const a = Buffer.from(k), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const sketsReq = (req: Request) => sketsKeyOk(req.headers.get("x-skets-key") ?? new URL(req.url).searchParams.get("k"));
