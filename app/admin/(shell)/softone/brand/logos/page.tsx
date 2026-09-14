import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { logoStats } from "@/lib/brandfetch/brands";
import { Pagination } from "@/components/admin/Pagination";
import { FindLogosButton } from "../../SyncButtons";
import { LogoReview, type LogoRow } from "./LogoReview";

export const metadata = { title: "Λογότυπα μαρκών" };
export const dynamic = "force-dynamic";

const PAGE = 24;

const TABS = [
  { key: "pending", label: "Προς έγκριση" },
  { key: "approved", label: "Εγκεκριμένα" },
  { key: "rejected", label: "Απορριφθέντα" },
  { key: "none", label: "Χωρίς εύρεση" },
] as const;

/**
 * Έλεγχος λογοτύπων που βρήκε το Brandfetch. Ο διαχειριστής βλέπει την εικόνα
 * δίπλα στο όνομα της μάρκας και εγκρίνει ή απορρίπτει· με την έγκριση το
 * αρχείο κατεβαίνει και ανεβαίνει στο δικό μας Bunny CDN.
 */
export default async function BrandLogosPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  await requirePermission("settings.integrations.write");
  const { tab = "pending", q = "", page: p = "1" } = await searchParams;
  const status = TABS.some((t) => t.key === tab) ? tab : "pending";
  const page = Math.max(1, Number(p) || 1);

  const where = {
    active: true,
    logoStatus: status,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { domain: { contains: q, mode: "insensitive" as const } }, { domainSuggest: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, stats] = await Promise.all([
    db.brand.findMany({ where, orderBy: [{ logoScore: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, name: true, code: true, domain: true, domainSuggest: true, logo: true, logoCdn: true, logoScore: true, logoStatus: true, logoSource: true } }),
    db.brand.count({ where }),
    logoStats(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => `?${new URLSearchParams({ tab: status, q, page: String(n) })}`;
  const counts: Record<string, number> = { pending: stats.pending, approved: stats.approved, rejected: stats.rejected, none: stats.total - stats.pending - stats.approved - stats.rejected - stats.unsearched };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/softone/brand" className="inline-flex items-center gap-1.5 font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase no-underline hover:underline"><ArrowLeft className="size-4" aria-hidden /> Μάρκες</Link>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Λογότυπα μαρκών</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Η αναζήτηση ονόματος είναι ασαφής, γι&apos; αυτό κανένα λογότυπο δεν μπαίνει μόνο του. Δες την εικόνα δίπλα στο όνομα και επιβεβαίωσε: με την έγκριση το αρχείο κατεβαίνει και αποθηκεύεται στο δικό μας CDN (Bunny), στον φάκελο «Λογότυπα μαρκών» της βιβλιοθήκης πολυμέσων.</p>
        </div>
        <FindLogosButton pending={stats.unsearched} />
      </div>

      <p className="m-0 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-13)] text-eu-ink-3">
        <b className="text-eu-ink">{stats.withUpload.toLocaleString("el-GR")}</b> λογότυπα στο δικό μας CDN · <b className="text-eu-ink">{stats.pending.toLocaleString("el-GR")}</b> περιμένουν έγκριση · <b className="text-eu-ink">{stats.unsearched.toLocaleString("el-GR")}</b> μάρκες δεν έχουν αναζητηθεί ακόμη, από <b className="text-eu-ink">{stats.total.toLocaleString("el-GR")}</b> συνολικά.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`?${new URLSearchParams({ tab: t.key, q })}`} aria-current={t.key === status ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full px-4 min-h-10 font-bold text-[length:var(--fs-14)] no-underline ${t.key === status ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink hover:bg-eu-surface-2"}`}>
            {t.label}<span className="tabular-nums opacity-70">{(counts[t.key] ?? 0).toLocaleString("el-GR")}</span>
          </Link>
        ))}
        <form className="flex-1 min-w-[220px] flex gap-2">
          <input type="hidden" name="tab" value={status} />
          <input name="q" defaultValue={q} placeholder="Αναζήτηση μάρκας ή domain…" aria-label="Αναζήτηση" className="flex-1 min-w-0 rounded-full border border-eu-line px-4 min-h-10 text-[length:var(--fs-14)]" />
          <button className="rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)]">Αναζήτηση</button>
        </form>
      </div>

      <LogoReview key={`${status}:${page}:${q}`} rows={rows as LogoRow[]} status={status} />

      <div className="flex justify-center">
        <Pagination page={page} pages={pages} total={total} label="μάρκες" href={href} />
      </div>
    </>
  );
}
