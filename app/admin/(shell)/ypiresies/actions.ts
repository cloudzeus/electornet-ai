"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { FIXTURE_SERVICES, invalidateServices } from "@/lib/services/catalog";

const PERM = "cms.pages.write";
const done = () => { invalidateServices(); revalidatePath("/admin/ypiresies"); revalidatePath("/ypiresies", "layout"); revalidatePath("/"); };
type R = { ok: true; id?: string; message: string } | { ok: false; error: string };

/** Μία φορά: οι 13 υπηρεσίες του σχεδίου → βάση (όσες υπάρχουν ήδη, π.χ. από παραγγελίες, συμπληρώνονται). */
export async function importServicesAction(): Promise<R> {
  const user = await requirePermission(PERM);
  let n = 0;
  for (const [i, s] of FIXTURE_SERVICES.entries()) {
    const data = { no: i + 1, title: s.title, blurb: s.blurb, body: s.body ?? null, priceFrom: s.priceFrom != null ? new Prisma.Decimal(s.priceFrom) : null, addonAt: (s.addonAt ?? []) as Prisma.InputJsonValue, faq: (s.faq ?? []) as Prisma.InputJsonValue, steps: (s.steps ?? []) as Prisma.InputJsonValue, active: true };
    await db.service.upsert({ where: { slug: s.slug }, update: data, create: { slug: s.slug, ...data } });
    n++;
  }
  await audit(user.id, "services.import", "Service", null, null, { count: n });
  done();
  return { ok: true, message: `Μεταφέρθηκαν ${n} υπηρεσίες — μπορείς πλέον να τις επεξεργαστείς.` };
}

export type ServiceInput = { id: string | null; slug: string; title: string; blurb: string; body: string; priceFrom: string; steps: string[]; faq: { q: string; a: string }[]; addonAt: string[]; image: string; active: boolean };

export async function saveServiceAction(input: ServiceInput): Promise<R> {
  const user = await requirePermission(PERM);
  const title = input.title.trim(), blurb = input.blurb.trim();
  if (title.length < 3) return { ok: false, error: "Ο τίτλος θέλει τουλάχιστον 3 χαρακτήρες." };
  if (blurb.length < 5) return { ok: false, error: "Γράψε μια σύντομη περιγραφή (εμφανίζεται στις κάρτες)." };
  const slug = slugify(input.slug.trim() || title).slice(0, 80);
  if (!slug) return { ok: false, error: "Η διεύθυνση (slug) δεν είναι έγκυρη." };
  const price = input.priceFrom.trim() === "" ? null : Number(input.priceFrom.replace(",", "."));
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 100000)) return { ok: false, error: "Η τιμή «από» πρέπει να είναι αριθμός ≥ 0 (ή κενή)." };
  const clash = await db.service.findFirst({ where: { slug, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
  if (clash) return { ok: false, error: `Υπάρχει ήδη υπηρεσία με διεύθυνση «${slug}».` };
  const data = {
    slug, title: title.slice(0, 80), blurb: blurb.slice(0, 200), body: input.body.trim() || null,
    priceFrom: price != null ? new Prisma.Decimal(price) : null,
    steps: input.steps.map((x) => x.trim()).filter(Boolean).slice(0, 12) as Prisma.InputJsonValue,
    faq: input.faq.map((x) => ({ q: x.q.trim(), a: x.a.trim() })).filter((x) => x.q && x.a).slice(0, 20) as Prisma.InputJsonValue,
    addonAt: input.addonAt.filter((x) => ["pdp", "checkout", "delivery"].includes(x)) as Prisma.InputJsonValue,
    image: input.image.trim() || null, active: input.active,
  };
  if (input.id) {
    const before = await db.service.findUnique({ where: { id: input.id } });
    if (!before) return { ok: false, error: "Η υπηρεσία δεν βρέθηκε." };
    await db.service.update({ where: { id: input.id }, data });
    await audit(user.id, "services.update", "Service", input.id, before, data);
    done();
    return { ok: true, id: input.id, message: "Αποθηκεύτηκε — ισχύει σε όλο το site." };
  }
  const max = await db.service.aggregate({ _max: { no: true } });
  const row = await db.service.create({ data: { ...data, no: (max._max.no ?? 0) + 1 } });
  await audit(user.id, "services.create", "Service", row.id, null, data);
  done();
  return { ok: true, id: row.id, message: "Η νέα υπηρεσία δημιουργήθηκε." };
}

export async function reorderServicesAction(ids: string[]): Promise<R> {
  const user = await requirePermission(PERM);
  await db.$transaction(ids.slice(0, 200).map((id, i) => db.service.update({ where: { id }, data: { no: i + 1 } })));
  await audit(user.id, "services.reorder", "Service", null, null, { ids });
  done();
  return { ok: true, message: "Η σειρά αποθηκεύτηκε." };
}

export async function toggleServiceAction(id: string, active: boolean): Promise<R> {
  const user = await requirePermission(PERM);
  await db.service.update({ where: { id }, data: { active } });
  await audit(user.id, active ? "services.activate" : "services.deactivate", "Service", id, null, null);
  done();
  return { ok: true, message: active ? "Ενεργή — φαίνεται στο site." : "Ανενεργή — δεν φαίνεται πουθενά στο site." };
}

/** Διαγραφή μόνο αν δεν έχει πουληθεί ποτέ (αλλιώς κρατιέται για τις παραγγελίες — απενεργοποίηση). */
export async function deleteServiceAction(id: string): Promise<R> {
  const user = await requirePermission(PERM);
  const s = await db.service.findUnique({ where: { id }, include: { _count: { select: { orderLines: true } } } });
  if (!s) return { ok: false, error: "Η υπηρεσία δεν βρέθηκε." };
  if (s._count.orderLines) return { ok: false, error: `Υπάρχει σε ${s._count.orderLines} παραγγελίες, γι' αυτό δεν διαγράφεται. Κάν' την ανενεργή.` };
  await db.service.delete({ where: { id } });
  await audit(user.id, "services.delete", "Service", id, s, null);
  done();
  return { ok: true, message: "Διαγράφηκε." };
}
