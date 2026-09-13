import "server-only";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { getCustomerSession } from "@/lib/account/session";
import { captureEvidence } from "@/lib/gdpr/evidence";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

export interface CartLineInput { productId: string; qty: number; variant?: string; addons?: { slug: string; title: string; price: number }[] }
const base = () => (process.env.AUTH_URL ?? "http://localhost:3111").replace(/\/$/, "");

/**
 * «Στείλε μου το καλάθι»: transactional email at the customer's explicit
 * request (no marketing consent needed, no unsubscribe link). Signed-in
 * customers get it on their account email; guests type one. The cart is
 * stored with a token so the link restores it on any device for 30 days.
 * Rate limit: 3 per email per hour.
 */
export async function emailCart(input: { email?: string | null; lines: CartLineInput[]; reason?: string | null; source?: string }) {
  const me = await getCustomerSession();
  const email = (me?.email ?? input.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false as const, error: "Μη έγκυρο email." };
  const clean = input.lines.filter((l) => l.productId && l.qty > 0).slice(0, 50);
  if (!clean.length) return { ok: false as const, error: "Το καλάθι είναι άδειο." };
  const recent = await db.savedCart.count({ where: { email, sentAt: { gte: new Date(Date.now() - 3600000) } } });
  if (recent >= 3) return { ok: false as const, error: "Έστειλες ήδη το καλάθι σου 3 φορές την τελευταία ώρα. Έλεγξε τα εισερχόμενα." };
  const products = await getProductsByIds(clean.map((l) => l.productId));
  const lines = clean.flatMap((l) => { const p = products.find((x) => x.id === l.productId); return p ? [{ ...l, product: p }] : []; });
  if (!lines.length) return { ok: false as const, error: "Τα προϊόντα δεν βρέθηκαν." };
  const total = lines.reduce((a, l) => a + l.product.price * l.qty + (l.addons ?? []).reduce((b, x) => b + x.price, 0), 0);
  const ev = await captureEvidence();
  const saved = await db.savedCart.create({ data: { customerId: me?.id ?? null, email, lines: clean as object[], total, reason: input.reason ?? null, source: input.source ?? "exit-intent", expiresAt: new Date(Date.now() + 30 * 86400000), ip: ev.ip, userAgent: ev.userAgent } });
  const cartUrl = `${base()}/kalathi?restore=${saved.token}`;
  const m = await renderTemplate("cart-emailed", { firstName: me?.firstName ?? "", lines: lines.map((l) => ({ title: l.product.title, brand: l.product.brand, image: l.product.image, qty: l.qty, unitPrice: l.product.price, addons: l.addons ?? [] })), total, cartUrl, reason: input.reason ?? "" });
  const r = await sendMail({ to: email, template: "cart-emailed", meta: { savedCartId: saved.id }, ...m });
  if (me) await db.customerEvent.create({ data: { customerId: me.id, kind: "cart-emailed", meta: { savedCartId: saved.id, total, reason: input.reason ?? null, lines: clean.length } } }).catch(() => null);
  return { ok: true as const, email, sent: r.ok, skipped: "skipped" in r ? !!r.skipped : false, token: saved.token };
}

/** Lines of a saved cart for restoring (marks openedAt on first open). */
export async function loadSavedCart(token: string) {
  const c = await db.savedCart.findUnique({ where: { token } });
  if (!c || c.expiresAt < new Date()) return null;
  if (!c.openedAt) await db.savedCart.update({ where: { id: c.id }, data: { openedAt: new Date() } });
  const lines = c.lines as unknown as CartLineInput[];
  const products = await getProductsByIds(lines.map((l) => l.productId));
  return { id: c.id, lines: lines.flatMap((l) => { const p = products.find((x) => x.id === l.productId); return p ? [{ product: p, qty: l.qty, variant: l.variant, addons: l.addons ?? [] }] : []; }) };
}
export async function markRestored(id: string) { await db.savedCart.update({ where: { id }, data: { restoredAt: new Date() } }).catch(() => null); }
