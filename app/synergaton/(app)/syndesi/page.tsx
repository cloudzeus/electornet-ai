import Link from "next/link";
import { ChevronRight, Plus, PlugZap, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { connTypeInfo } from "@/lib/partner-portal/connection-types";
import { onboardingOf } from "@/lib/partner-portal/data";
import type { SetupAdvice } from "@/lib/partner-portal/ai";
import { CONN_STATUS } from "@/components/synergaton/log-kinds";
import { ago, Badge, ButtonLink, Callout, Card, Empty, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Σύνδεση αποθέματος" };

export default async function ConnectionsPage() {
  const u = await requirePortalUser();
  const base = await portalBase();
  const [conns, stores] = await Promise.all([
    db.partnerConnection.findMany({ where: { partnerId: u.partner.id }, orderBy: { createdAt: "asc" } }),
    db.store.findMany({ where: { partnerId: u.partner.id }, select: { id: true, name: true } }),
  ]);
  const advice = onboardingOf(u.partner.onboarding).advice as SetupAdvice | undefined;
  const covered = new Set(conns.filter((c) => c.active).flatMap((c) => ((c.locationMap ?? []) as { storeId: string | null }[]).map((l) => l.storeId).filter(Boolean)));
  const missing = stores.filter((s) => !covered.has(s.id));
  return (
    <div className="grid gap-5 min-w-0">
      <PageHead eyebrow="Απόθεμα" title="Σύνδεση αποθέματος" sub="Από εδώ στέλνετε τη διαθεσιμότητα κάθε καταστήματος στο euronics.gr. Μόνο ανάγνωση από το σύστημά σας — δεν γράφουμε ποτέ τίποτα σε αυτό."
        action={conns.length > 0 && <ButtonLink href={`${base}/syndesi/nea`} variant="primary"><Plus className="size-4" aria-hidden /> Νέα σύνδεση</ButtonLink>} />
      {conns.length > 0 && missing.length > 0 && <Callout tone="warn" title={`${missing.length} ${missing.length === 1 ? "κατάστημα δεν παίρνει" : "καταστήματα δεν παίρνουν"} απόθεμα`}>{missing.map((s) => s.name).join(", ")} — ολοκληρώστε την αντιστοίχιση ή ενεργοποιήστε τη σύνδεση.</Callout>}
      {conns.length ? (
        <ul data-help="portal.connections-list" className="m-0 p-0 list-none grid gap-3 md:grid-cols-2">
          {conns.map((c) => {
            const info = connTypeInfo(c.type), [tone, label] = CONN_STATUS[c.status] ?? ["neutral", c.status];
            const mapped = ((c.locationMap ?? []) as { storeId: string | null }[]).filter((l) => l.storeId).length;
            return (
              <Card as="li" key={c.id}>
                <Link href={`${base}/syndesi/${c.id}`} className="group grid gap-3 p-4 sm:p-5 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-eu-blue/40">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="grid place-items-center size-11 rounded-xl bg-eu-chip text-eu-navy shrink-0"><PlugZap className="size-5" aria-hidden /></span>
                      <span className="min-w-0"><b className="block font-heading text-[length:var(--fs-17)] break-words">{c.label ?? info?.title}</b><span className="block text-eu-ink-3 text-[length:var(--fs-13)]">{info?.automatic ? "Αυτόματος συγχρονισμός" : "Ανεβάζετε εσείς αρχείο"}</span></span>
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <dl className="m-0 grid grid-cols-3 gap-2 text-[length:var(--fs-13)]">
                    <div><dt className="text-eu-ink-3">Καταστήματα</dt><dd className="m-0 font-bold tabular-nums">{mapped || c.storeIds.length}</dd></div>
                    <div><dt className="text-eu-ink-3">Τελ. έλεγχος</dt><dd className="m-0 font-bold">{c.lastTestAt ? ago(c.lastTestAt) : "—"}</dd></div>
                    <div><dt className="text-eu-ink-3">Τελ. επιτυχία</dt><dd className="m-0 font-bold">{c.lastOkAt ? ago(c.lastOkAt) : "—"}</dd></div>
                  </dl>
                  <span className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)]">{c.active ? "Ρυθμίσεις" : "Συνέχεια ρύθμισης"} <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden /></span>
                </Link>
              </Card>
            );
          })}
        </ul>
      ) : (
        <Card>
          <Empty icon={PlugZap} title="Δεν έχετε ακόμη σύνδεση" action={<ButtonLink href={`${base}/syndesi/nea`} variant="brand" size="lg"><Plus className="size-4" aria-hidden /> Νέα σύνδεση</ButtonLink>}>
            {advice ? <span className="inline-flex items-center gap-1.5"><Sparkles className="size-4 text-[#8a6500]" aria-hidden /> Ο βοηθός πρότεινε: <b>{connTypeInfo(advice.type)?.title}</b></span> : <>Δεν ξέρετε ποιον τρόπο να διαλέξετε; <Link className="text-eu-blue font-bold hover:underline" href={`${base}/ksekinima`}>Απαντήστε σε 10 σύντομες ερωτήσεις</Link>.</>}
          </Empty>
        </Card>
      )}
    </div>
  );
}
