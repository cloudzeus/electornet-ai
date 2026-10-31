import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { Pagination } from "@/components/admin/Pagination";
import { PUBLISH_CRITERIA, isPublishKey } from "@/lib/catalog/publish-ready";
import { getPublishGate, tallyPublish } from "@/lib/catalog/publish-ready-server";
import { GateForm } from "./GateForm";

export const metadata = { title: "Πληρότητα προϊόντων" };
export const dynamic = "force-dynamic";

const PAGE = 30;
const LABEL = Object.fromEntries(PUBLISH_CRITERIA.map((c) => [c.key, c.missing])) as Record<string, string>;
/** Πού διορθώνεται κάθε κενό (καρτέλα της σελίδας προϊόντος) */
const TAB: Record<string, string> = { photo: "media", specs: "content", dims: "dims", avail: "erp", web: "erp", category: "erp" };

/**
 * Πληρότητα: ποια ενεργά προϊόντα δεν περνούν τα κριτήρια δημοσίευσης (φωτογραφία, χαρακτηριστικά, διαστάσεις & βάρος,
 * web κατηγορία, διαθεσιμότητα), ο διακόπτης που τα κρύβει από τη βιτρίνα και η λίστα για διόρθωση.
 */
export default async function CompletenessPage({ searchParams }: { searchParams: Promise<{ m?: string; q?: string; page?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { m = "", q = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where: Prisma.ProductWhereInput = {
    active: true,
    publishMissing: isPublishKey(m) ? { has: m } : { isEmpty: false },
    ...(q.trim() ? { OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { sku: { contains: q.trim(), mode: "insensitive" } }, { erpCode: q.trim() }] } : {}),
  };
  const [gate, tally, rows, total] = await Promise.all([
    getPublishGate(),
    tallyPublish(),
    db.product.findMany({ where, orderBy: [{ category: { name: "asc" } }, { title: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, sku: true, publishReady: true, publishMissing: true, category: { select: { name: true } }, brand: { select: { name: true } } } }),
    db.product.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => `?${new URLSearchParams({ m, q, page: String(n) })}`;
  const num = (n: number) => n.toLocaleString("el-GR");
  const chip = (active: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] ${active ? "bg-eu-navy text-white border-eu-navy" : "bg-white text-eu-navy border-eu-line hover:border-eu-navy"}`;

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <Link href="/admin/catalog" className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Προϊόντα</Link>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Πληρότητα προϊόντων</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[86ch]">
          {num(tally.complete)} από {num(tally.active)} ενεργά προϊόντα είναι πλήρη. Ο έλεγχος είναι <b className={gate.enabled ? "text-eu-green" : "text-eu-ink"}>{gate.enabled ? "ενεργός — τα ημιτελή δεν φαίνονται στη βιτρίνα" : "κλειστός — φαίνονται όλα"}</b>. Ο κατάλογος ξαναμετριέται σε κάθε συγχρονισμό τιμών/αποθέματος.
        </p>
      </div>

      <GateForm initial={gate} tally={tally} canSettings={can(user.permissions, "settings.write")} canRecompute={can(user.permissions, "catalog.products.write")} />

      <section className="grid gap-3 min-w-0" aria-label="Ημιτελή προϊόντα" data-help="completeness.list">
        <nav aria-label="Τι λείπει" className="flex flex-wrap gap-1.5">
          <Link href="?" className={chip(!m)}>Όλα τα ημιτελή <span className="tabular-nums">{num(tally.active - tally.complete)}</span></Link>
          {PUBLISH_CRITERIA.filter((c) => tally.byKey[c.key] > 0).map((c) => (
            <Link key={c.key} href={`?m=${c.key}`} className={chip(m === c.key)}>{c.missing} <span className="tabular-nums">{num(tally.byKey[c.key])}</span></Link>
          ))}
        </nav>
        <form className="flex flex-wrap gap-2">
          {m && <input type="hidden" name="m" value={m} />}
          <label className="sr-only" htmlFor="pl-q">Αναζήτηση</label>
          <input id="pl-q" name="q" defaultValue={q} placeholder="Τίτλος, SKU, κωδικός ERP…" className="flex-1 min-w-0 basis-[14rem] rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)]" />
          <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Αναζήτηση</button>
        </form>
        <ul className="m-0 p-0 list-none rounded-2xl border border-eu-line bg-white divide-y divide-eu-line-2 min-w-0">
          {rows.map((r) => (
            <li key={r.id} className="p-3 grid gap-1.5 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                <Link href={`/admin/catalog/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline break-words min-w-0">{r.title}</Link>
                <span className="text-eu-muted text-[length:var(--fs-13)]">{r.brand.name} · {r.category.name} · {r.sku}</span>
                {!r.publishReady && <span className="rounded-full bg-eu-red/10 text-eu-red font-bold px-2 text-[length:var(--fs-13)]">δεν δημοσιεύεται</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.publishMissing.map((k) => (
                  <Link key={k} href={`/admin/catalog/${r.id}?tab=${TAB[k] ?? "content"}`} className="rounded-full bg-eu-chip text-eu-ink font-bold px-2.5 min-h-9 inline-flex items-center text-[length:var(--fs-13)] hover:bg-eu-yellow/30">{LABEL[k] ?? k}</Link>
                ))}
              </div>
            </li>
          ))}
          {!rows.length && <li className="p-8 text-center text-eu-muted">Κανένα ημιτελές προϊόν με αυτά τα κριτήρια.</li>}
        </ul>
        <div className="flex justify-center"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
      </section>
    </div>
  );
}
