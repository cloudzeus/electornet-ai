import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, History } from "lucide-react";
import { db } from "@/lib/db";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { connTypeInfo, type ConnType } from "@/lib/partner-portal/connection-types";
import { engine, engineConfigured } from "@/lib/b2b-engine/client";
import { ConnectionSetup, type ConnView } from "@/components/synergaton/connection/ConnectionSetup";
import type { LocRow } from "@/components/synergaton/connection/LocationMapper";
import { CONN_STATUS } from "@/components/synergaton/log-kinds";
import { Badge, ButtonLink, Callout, Card, CardHead, fmtDateTime, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Σύνδεση" };

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePortalUser();
  const base = await portalBase();
  const { id } = await params;
  const c = await db.partnerConnection.findFirst({ where: { id, partnerId: u.partner.id } });
  if (!c) notFound();
  const info = connTypeInfo(c.type);
  if (!info) notFound();
  const [stores, batches] = await Promise.all([
    db.store.findMany({ where: { partnerId: u.partner.id }, orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, branch: { select: { s1BranchId: true, code: true } } } }),
    engineConfigured() ? engine.batches(id, 8) : Promise.resolve(null),
  ]);
  const view: ConnView = {
    id: c.id, type: c.type as ConnType, label: c.label, status: c.status, active: c.active,
    config: (c.config ?? {}) as Record<string, unknown>, secretKeys: c.secretKeys, storeIds: c.storeIds,
    lastTest: (c.lastTest ?? null) as ConnView["lastTest"], lastOkAt: c.lastOkAt?.toISOString() ?? null,
    locationMap: Array.isArray(c.locationMap) ? (c.locationMap as LocRow[]) : null,
  };
  const [tone, label] = CONN_STATUS[c.status] ?? ["neutral", c.status];
  return (
    <div className="grid gap-5 min-w-0">
      <Link href={`${base}/syndesi`} className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11 w-fit"><ChevronLeft className="size-4" aria-hidden /> Όλες οι συνδέσεις</Link>
      <PageHead eyebrow="Σύνδεση αποθέματος" title={c.label ?? info.title} sub={info.blurb} action={<Badge tone={tone}>{label}</Badge>} />
      {!engineConfigured() && <Callout tone="warn" title="Η μηχανή αποθέματος δεν είναι ρυθμισμένη σε αυτό το περιβάλλον">Οι έλεγχοι και η αποθήκευση στοιχείων πρόσβασης δεν θα λειτουργήσουν μέχρι να οριστούν B2B_ENGINE_URL και B2B_ENGINE_SECRET.</Callout>}
      <div data-help="portal.connection-wizard">
        <ConnectionSetup conn={view} base={base} stores={stores.map((s) => ({ id: s.id, name: s.name, city: s.city, s1BranchId: s.branch?.s1BranchId ?? null, code: s.branch?.code ?? null }))} />
      </div>
      {batches?.ok && batches.data.batches.length > 0 && (
        <Card data-help="portal.connection-batches">
          <CardHead icon={History} title="Τελευταίοι συγχρονισμοί" action={<ButtonLink href={`${base}/istoriko?c=${c.id}`} variant="ghost" size="sm">Όλο το ιστορικό</ButtonLink>} />
          <ul className="m-0 p-0 list-none divide-y divide-eu-line">
            {batches.data.batches.map((b) => (
              <li key={b.id} className="px-4 sm:px-5 py-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center text-[length:var(--fs-14)]">
                <span className="min-w-0"><b className="block">{fmtDateTime(b.receivedAt)}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">{b.source === "push" ? "Αποστολή" : b.source === "upload" ? "Ανέβασμα" : "Αυτόματη ανάγνωση"} · {b.mode === "full" ? "πλήρες" : "αλλαγές"}{b.error ? ` · ${b.error}` : ""}</span></span>
                <span className="text-right tabular-nums"><Badge tone={b.status === "processed" ? "good" : b.status === "failed" ? "bad" : "info"}>{b.accepted.toLocaleString("el-GR")} δεκτές</Badge>{b.rejected > 0 && <span className="block text-[#b3261e] text-[length:var(--fs-12)]">{b.rejected} απορρίφθηκαν</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
