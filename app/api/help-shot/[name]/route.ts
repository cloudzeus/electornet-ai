import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@/lib/auth";

/** Screenshots του wiki: μόνο για συνδεδεμένο προσωπικό (δείχνουν τη διαχείριση — όχι δημόσια). */
export async function GET(_req: Request, { params }: RouteContext<"/api/help-shot/[name]">) {
  if (!(await auth())?.user) return new Response("unauthorized", { status: 401 });
  const { name } = await params;
  if (!/^[a-z0-9.-]+-(d|m)\.jpg$/.test(name)) return new Response("not found", { status: 404 });
  try {
    const buf = await readFile(join(process.cwd(), "help-shots", name));
    return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
