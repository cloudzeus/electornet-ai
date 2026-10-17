import { unsubscribeRecipient } from "@/lib/newsletter/events";

/** Προσωπικός σύνδεσμος διαγραφής του newsletter προσφοράς (List-Unsubscribe). */
type Ctx = { params: Promise<{ token: string }> };

const page = (token: string, qs = "") => `/newsletter/u/${encodeURIComponent(token)}${qs}`;
/** Σχετικό Location: δεν εξαρτάται από το origin πίσω από proxy. */
const see = (to: string) => new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store" } });

/** Το GET δεν διαγράφει (οι σαρωτές email ανοίγουν τους συνδέσμους): πάει στη σελίδα με το κουμπί. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  return see(page(token));
}

/**
 * RFC 8058 one-click (`List-Unsubscribe=One-Click`) ή φόρμα της σελίδας. Πάντα 200/303, ακόμη και για άγνωστο token
 * (δεν αποκαλύπτουμε αν υπάρχει)· ιδεμπότητα στο `unsubscribeRecipient`. Σφάλμα βάσης → 500, ώστε να ξαναδοκιμάσει ο πάροχος.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.text().catch(() => "");
  const oneClick = /(^|&)List-Unsubscribe=One-Click(&|$)/i.test(body);
  await unsubscribeRecipient(token, oneClick ? "one-click" : "link");
  if (!oneClick && (req.headers.get("accept") ?? "").includes("text/html")) return see(page(token, "?done=1"));
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
