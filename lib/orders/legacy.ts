import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Παραγγελίες του παλιού eshop: δεν έχουν δική μας `Order`· υπάρχουν ως `Purchase` (kind=order) από τον συγχρονισμό του
 * SoftOne (σειρές 7005–7009, 7152, 7006). Μόνο αναγνώσεις — δεν αλλάζουν από τη διαχείριση.
 */

type F = { q?: string; from?: string; to?: string };
const day = (s: string | undefined, end: boolean) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? "23:59:59.999" : "00:00:00"}`) : null);

export function legacyWhere(f: F): Prisma.PurchaseWhereInput {
  const and: Prisma.PurchaseWhereInput[] = [{ source: "softone", kind: "order" }];
  const t = f.q?.trim();
  if (t) {
    const digits = t.replace(/\D/g, "");
    and.push({ OR: [
      { docNo: { contains: t, mode: "insensitive" } },
      // το SoftOne κρατά τα ονόματα με κεφαλαία
      { recipient: { path: ["name"], string_contains: t.toLocaleUpperCase("el-GR") } }, { recipient: { path: ["name"], string_contains: t } },
      ...(digits.length >= 6 ? [{ recipient: { path: ["phone"], string_contains: digits } }] : []),
      ...(/^\d+$/.test(t) ? [{ s1Findoc: Number(t) }] : []),
      { lines: { some: { title: { contains: t, mode: "insensitive" } } } },
      { customer: { OR: [{ email: { contains: t, mode: "insensitive" } }, { lastName: { contains: t, mode: "insensitive" } }] } },
    ] });
  }
  const from = day(f.from, false), to = day(f.to, true);
  if (from || to) and.push({ date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  return { AND: and };
}

/** Γραμμές της λίστας παραγγελιών, στο ίδιο σχήμα με τις νέες (`legacy: true`). */
export async function legacyRows(ids: string[]) {
  const ps = await db.purchase.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, docNo: true, s1Findoc: true, date: true, status: true, total: true, recipient: true, seriesName: true,
      customer: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
      lines: { orderBy: { lineNo: "asc" }, select: { title: true, qty: true, productId: true } },
      _count: { select: { docs: true } },
    },
  });
  const thumbs = await thumbsOf(ps.map((p) => p.lines[0]?.productId));
  return ps.map((p) => {
    const r = (p.recipient ?? {}) as { name?: string; company?: string; address?: string };
    const thumb = thumbs.get(p.lines[0]?.productId ?? "") ?? null;
    return {
      legacy: true as const, id: p.id, number: p.docNo || String(p.s1Findoc ?? ""), createdAt: p.date.toISOString(), status: p.status ?? "pending", seriesName: p.seriesName,
      fulfilment: "", paymentMethod: null as string | null, paymentStatus: null as string | null, instalments: 1,
      total: Number(p.total ?? 0), discount: 0, coupon: null as string | null,
      name: r.name || `${p.customer?.firstName ?? ""} ${p.customer?.lastName ?? ""}`.trim() || "Πελάτης λιανικής",
      company: r.company ?? p.customer?.company ?? null, email: p.customer?.email ?? null, city: null as string | null,
      customerId: p.customer?.id ?? null, invoice: false,
      items: p.lines.reduce((a, l) => a + Number(l.qty), 0), firstItem: p.lines[0]?.title ?? null, more: Math.max(0, p.lines.length - 1), thumb,
      erp: null as string | null, shipment: null as { status: string; voucher: string | null; carrier: string } | null, store: null as string | null,
      returns: 0, notes: 0, docs: p._count.docs,
    };
  });
}

/** Πρώτη εικόνα ανά προϊόν (οι γραμμές του SoftOne κρατούν μόνο το productId). */
async function thumbsOf(ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map<string, string>();
  const ms = await db.media.findMany({ where: { productId: { in: want }, kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, select: { productId: true, thumbUrl: true, url: true } });
  const out = new Map<string, string>();
  for (const m of ms) if (m.productId && !out.has(m.productId)) out.set(m.productId, m.thumbUrl ?? m.url);
  return out;
}

/** Η καρτέλα μιας παλιάς παραγγελίας. */
export async function legacyOrder(id: string) {
  const p = await db.purchase.findFirst({
    where: { id, source: "softone", kind: "order" },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      docs: { orderBy: { date: "asc" }, select: { id: true, kind: true, docNo: true, date: true, total: true, seriesName: true } },
      customer: { select: { id: true, firstName: true, lastName: true, email: true, mobile: true, phone: true } },
    },
  });
  return p && { ...p, thumbs: Object.fromEntries(await thumbsOf(p.lines.map((l) => l.productId))) };
}
export type LegacyOrder = NonNullable<Awaited<ReturnType<typeof legacyOrder>>>;
