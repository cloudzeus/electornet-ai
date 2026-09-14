import Link from "next/link";
import { Database, AlertTriangle, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { getS1Config } from "@/lib/softone";
import { lookupStats } from "@/lib/softone/lookups";
import { SyncButton } from "./SyncButtons";

export const metadata = { title: "SoftOne ERP · πίνακες" };
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Reference tables synced from SoftOne into our own models, with the mapping the storefront uses. */
export default async function SoftonePage() {
  await requirePermission("settings.integrations.write");
  const [cfg, stats] = await Promise.all([getS1Config(), lookupStats()]);
  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Database className="size-3.5" aria-hidden /> SoftOne ERP</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Βασικοί πίνακες</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Φ.Π.Α., μονάδες, μάρκες, Δ.Ο.Υ., χώρες, νομοί και Τ.Κ., τρόποι πληρωμής και αποστολής, σειρές παραστατικών, αποθήκες. Διαβάζονται από το SoftOne (GetTable, μόνο ανάγνωση) στα δικά μας μοντέλα· εδώ ορίζεις τι σημαίνει το καθένα για το site.{cfg ? ` Σύνδεση: ${cfg.url.replace(/^https?:\/\//, "").split("/")[0]}, χρήστης ${cfg.username}.` : " Δεν έχουν οριστεί στοιχεία σύνδεσης (Ρυθμίσεις → SoftOne ERP)."}</p>
        </div>
        <SyncButton label="Συγχρονισμός όλων" />
      </div>
      <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
        {stats.map((s) => (
          <Link key={s.kind} href={`/admin/softone/${s.kind}`} className="group rounded-2xl bg-white border border-eu-line p-4 grid gap-2 hover:border-eu-blue transition-colors min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-tight">{s.label}</div>
                <div className="text-eu-muted text-[length:var(--fs-13)] font-mono">{s.table}</div>
              </div>
              <ChevronRight className="size-4 text-eu-muted group-hover:text-eu-blue shrink-0" aria-hidden />
            </div>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug line-clamp-2">{s.description}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
              <span><b className="text-eu-navy tabular-nums">{s.total}</b> εγγραφές</span>
              <span><b className="text-eu-navy tabular-nums">{s.active}</b> ενεργές</span>
              <span><b className="text-eu-navy tabular-nums">{s.linked}</b> από SoftOne</span>
              {s.missing > 0 && <span className="text-eu-amber font-bold inline-flex items-center gap-1"><AlertTriangle className="size-3.5" aria-hidden /> {s.missing} λείπουν πια</span>}
            </div>
            <div className="text-eu-muted text-[length:var(--fs-13)]">{s.last ? (s.last.ok ? `Τελευταίος συγχρονισμός ${fmt(s.last.at)} · ${s.last.fetched} γραμμές σε ${(s.last.ms / 1000).toFixed(1)} s` : `Απέτυχε ${fmt(s.last.at)}: ${s.last.error}`) : "Δεν έχει συγχρονιστεί ακόμη"}</div>
          </Link>
        ))}
      </div>
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Αυτόματος συγχρονισμός: <code>GET /api/cron/softone-lookups</code> με <code>Authorization: Bearer $CRON_SECRET</code> (π.χ. κάθε νύχτα). Το SoftOne παραμένει «κύριος» για τα δικά του πεδία· ό,τι αλλάζεις εδώ (ονόματα για το site, αντιστοιχίσεις, ενεργό/ανενεργό) δεν ξαναγράφεται από τον συγχρονισμό.</p>
    </div>
  );
}
