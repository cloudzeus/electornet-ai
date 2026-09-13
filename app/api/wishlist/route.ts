import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
import { listIds, addItems, removeItems } from "@/lib/wishlist/repo";

/** GET → { authenticated, ids, lists } · POST { add?: string[], remove?: string[], listId? } (signed-in customers only). */
export async function GET() {
  const c = await getCustomerSession();
  if (!c) return NextResponse.json({ authenticated: false, ids: [], lists: [] }, { headers: { "cache-control": "no-store" } });
  return NextResponse.json({ authenticated: true, ...(await listIds(c.id)) }, { headers: { "cache-control": "no-store" } });
}
export async function POST(req: Request) {
  const c = await getCustomerSession();
  if (!c) return NextResponse.json({ authenticated: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { add?: string[]; remove?: string[]; listId?: string; source?: string };
  if (b.add?.length) await addItems(c.id, b.add.slice(0, 200), b.listId ?? null, b.source === "merge" ? "merge" : "web");
  if (b.remove?.length) await removeItems(c.id, b.remove, b.listId ?? null);
  return NextResponse.json({ authenticated: true, ...(await listIds(c.id)) });
}
