import { NextResponse } from "next/server";
import { placeOrder, type PlaceInput } from "@/lib/checkout/place";

export const maxDuration = 30;

/** POST: ολοκλήρωση παραγγελίας. Όλα τα ποσά υπολογίζονται ξανά στον server. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as PlaceInput | null;
  if (!b) return NextResponse.json({ ok: false, error: "Κενό αίτημα." }, { status: 400 });
  // η δοκιμαστική εκτέλεση (αναιρείται στο τέλος) επιτρέπεται μόνο εκτός production
  if (b.dryRun && process.env.NODE_ENV === "production") b.dryRun = false;
  const r = await placeOrder(b);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
