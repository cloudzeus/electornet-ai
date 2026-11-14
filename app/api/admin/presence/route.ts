import { auth } from "@/lib/auth";
import { recordPresence } from "@/lib/staff-report/presence";

/** Ping παρουσίας του προσωπικού (κάθε λεπτό από το AdminShell). Μόνο με συνεδρία διαχείρισης· δεν επιστρέφει τίποτα. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const path = (await req.text()).slice(0, 200);
  if (!/^\/admin(\/[\w\-./[\]]*)?$/.test(path)) return new Response(null, { status: 400 });
  await recordPresence(session.user.id, path).catch((e) => console.error("[presence]", e));
  return new Response(null, { status: 204 });
}
