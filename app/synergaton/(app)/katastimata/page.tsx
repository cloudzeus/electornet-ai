import Link from "next/link";
import { ChevronRight, Clock, Eye, EyeOff, MapPin, Phone, Store } from "lucide-react";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { partnerStores } from "@/lib/partner-portal/data";
import { hoursOf, servicesOf, STORE_SERVICES } from "@/lib/partner-portal/store-profile";
import { db } from "@/lib/db";
import { branchesWriteEnabled } from "@/lib/softone/branch-write";
import { MemberAadeCheck } from "@/components/synergaton/MemberAadeCheck";
import { ago, Badge, Callout, Card, Empty, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Καταστήματα" };

export default async function StoresPage() {
  const u = await requirePortalUser();
  const base = await portalBase();
  const [stores, changes, toErp] = await Promise.all([
    partnerStores(u.partner.id),
    db.partnerChange.groupBy({ by: ["entityId"], where: { partnerId: u.partner.id, entity: "Store" }, _max: { createdAt: true } }),
    branchesWriteEnabled(),
  ]);
  const lastChange = new Map(changes.map((c) => [c.entityId, c._max.createdAt]));
  return (
    <div className="grid gap-5 min-w-0">
      <PageHead eyebrow="Προφίλ" title="Τα καταστήματά σας" sub="Ό,τι αλλάζετε εδώ φαίνεται αμέσως στο euronics.gr (σελίδα καταστήματος, χάρτης, επιλογή παραλαβής). Κάθε αλλαγή κρατιέται στο ιστορικό." />
      <Callout tone="info" title="Επωνυμία, διεύθυνση και ΑΦΜ έρχονται από το SoftOne της Euronics">Για αλλαγή σε αυτά, μιλήστε με τον υπεύθυνο συνεργατών. Εδώ ορίζετε τηλέφωνα, email, ωράριο και υπηρεσίες.{toErp ? " Τηλέφωνα και email γράφονται αυτόματα και στο υποκατάστημά σας στο SoftOne." : ""}</Callout>
      <MemberAadeCheck />
      {stores.length ? (
        <ul data-help="portal.stores-list" className="m-0 p-0 list-none grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {stores.map((s) => {
            const h = hoursOf(s.hours), sv = servicesOf(s.services), when = lastChange.get(s.id);
            const issues = [!s.phone && !s.mobile ? "χωρίς τηλέφωνο" : null, !h.length ? "χωρίς ωράριο" : null, s.lat === 0 && s.lng === 0 ? "χωρίς σημείο στον χάρτη" : null].filter(Boolean) as string[];
            return (
              <Card as="li" key={s.id}>
                <Link href={`${base}/katastimata/${s.id}`} className="group grid gap-3 p-4 sm:p-5 h-full rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-eu-blue/40">
                  <div className="flex items-start gap-3">
                    <span className="grid place-items-center size-11 rounded-xl bg-eu-chip text-eu-blue shrink-0"><Store className="size-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <b className="block font-heading text-[length:var(--fs-16)] text-eu-ink leading-snug break-words">{s.name}</b>
                      <span className="flex items-center gap-1 text-eu-ink-3 text-[length:var(--fs-13)]"><MapPin className="size-3.5 shrink-0" aria-hidden />{[s.address, s.zip, s.city].filter(Boolean).join(", ")}</span>
                    </div>
                    <ChevronRight className="size-5 text-eu-muted group-hover:text-eu-navy group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" aria-hidden />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.active ? <Badge tone="good" icon={false}><Eye className="size-3.5" aria-hidden /> Ορατό στο eshop</Badge> : <Badge tone="neutral" icon={false}><EyeOff className="size-3.5" aria-hidden /> Κρυφό</Badge>}
                    {s.branch?.isCenter && <Badge tone="info" icon={false}>Έδρα</Badge>}
                    {issues.map((i) => <Badge key={i} tone="warn">{i}</Badge>)}
                  </div>
                  <dl className="m-0 grid grid-cols-2 gap-2 text-[length:var(--fs-13)]">
                    <div className="min-w-0"><dt className="text-eu-muted flex items-center gap-1"><Phone className="size-3.5" aria-hidden />Τηλέφωνο</dt><dd className="m-0 font-bold truncate">{s.phone || s.mobile || "—"}</dd></div>
                    <div className="min-w-0"><dt className="text-eu-muted flex items-center gap-1"><Clock className="size-3.5" aria-hidden />Ωράριο</dt><dd className="m-0 font-bold">{h.length ? `${h.length} ημέρες` : "—"}</dd></div>
                  </dl>
                  <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)] mt-auto">{sv.length ? sv.map((k) => STORE_SERVICES.find((x) => x.key === k)?.label ?? k).join(" · ") : "Καμία υπηρεσία δηλωμένη"}{when ? ` · αλλαγή ${ago(when)}` : ""}</p>
                </Link>
              </Card>
            );
          })}
        </ul>
      ) : <Card><Empty icon={Store} title="Δεν βρέθηκαν καταστήματα">Τα καταστήματα συνδέονται από τα υποκαταστήματά σας στο SoftOne. Επικοινωνήστε με την Euronics.</Empty></Card>}
    </div>
  );
}
