import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleAlert } from "lucide-react";
import type { Readiness, TabId, TabState } from "@/lib/catalog/readiness";

/** Οι καρτέλες της σελίδας προϊόντος, με τη σειρά της δουλειάς (συχνότερα πρώτα). */
/** Οι καρτέλες του χώρου εργασίας: οι πέντε της ετοιμότητας και η «Σετ» (σε προϊόντα-σετ και σε κύρια είδη σετ). */
export type WorkspaceTab = TabId | "set" | "overview";
export const TABS: { id: WorkspaceTab; label: string; short: string }[] = [
  { id: "overview", label: "Επισκόπηση", short: "Σύνοψη" },
  { id: "media", label: "Εικόνες & βίντεο", short: "Εικόνες" },
  { id: "content", label: "Κείμενα & χαρακτηριστικά", short: "Κείμενα" },
  { id: "dims", label: "Διαστάσεις · AR · EPREL", short: "Διαστάσεις" },
  { id: "commerce", label: "Τιμή · προσφορές · stickers", short: "Τιμή" },
  { id: "set", label: "Σετ", short: "Σετ" },
  { id: "erp", label: "ERP", short: "ERP" },
];
export const isTab = (v: string | undefined): v is WorkspaceTab => TABS.some((t) => t.id === v);

const DOT: Record<TabState, string> = { ok: "", warn: "bg-eu-amber", bad: "bg-eu-red" };

/** «Ετοιμότητα N/M» σε μία γραμμή, με τις ελλείψεις ως μικρά chips — κάθε chip ανοίγει την καρτέλα που τη διορθώνει. */
export function ReadinessBar({ r, href }: { r: Readiness; href: (t: WorkspaceTab) => string }) {
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 100;
  const full = r.done === r.total;
  return (
    <section aria-label="Ετοιμότητα για το site" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-eu-line bg-white px-3 py-2 min-w-0">
      <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-13)] whitespace-nowrap">
        {full ? <CheckCircle2 className="size-4 text-eu-green" aria-hidden /> : <CircleAlert className="size-4 text-eu-amber" aria-hidden />} Ετοιμότητα {r.done}/{r.total}
        <span className="w-20 h-1.5 rounded-full bg-eu-surface overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Ποσοστό ετοιμότητας">
          <span className={`block h-full rounded-full ${full ? "bg-eu-green" : "bg-eu-amber"}`} style={{ width: `${pct}%` }} />
        </span>
      </span>
      {r.missing.length > 0 ? (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-1">
          {r.missing.map((m) => (
            <li key={m.id}>
              <Link href={href(m.tab)} className={`inline-flex items-center gap-1 rounded-full px-2 min-h-8 md:min-h-7 font-semibold text-[length:var(--fs-12)] ${m.level === "required" ? "bg-eu-red/10 text-eu-red hover:bg-eu-red/15" : "bg-eu-amber/15 text-eu-ink-2 hover:bg-eu-amber/25"}`}>
                {m.level === "required" && <AlertCircle className="size-3.5" aria-hidden />} {m.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Όλα έτοιμα για το site.</span>}
    </section>
  );
}

/** Λωρίδα καρτελών (σύνδεσμοι — η καρτέλα μένει στη διεύθυνση), με τελεία όπου κάτι λείπει. */
export function WorkspaceTabs({ active, states, href, hide = [] }: { active: WorkspaceTab; states: Record<TabId, TabState>; href: (t: WorkspaceTab) => string; hide?: WorkspaceTab[] }) {
  return (
    <nav data-help="product.tabs" aria-label="Ενότητες προϊόντος" className="grid grid-cols-3 @2xl:flex @2xl:flex-wrap gap-0.5 rounded-xl bg-eu-surface p-0.5">
      {TABS.filter((t) => !hide.includes(t.id)).map((t) => {
        const on = t.id === active, st = t.id === "set" || t.id === "overview" ? "ok" : states[t.id];
        return (
          <Link key={t.id} href={href(t.id)} aria-current={on ? "page" : undefined} scroll={false}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 @2xl:px-2.5 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${on ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}>
            <span className="@4xl:hidden">{t.short}</span><span className="hidden @4xl:inline">{t.label}</span>
            {st !== "ok" && <span className={`size-2 rounded-full ${DOT[st]}`} aria-label={st === "bad" ? "λείπει κάτι απαραίτητο" : "λείπει κάτι προτεινόμενο"} />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Μια ενότητα μέσα σε καρτέλα: τίτλος, σύντομη εξήγηση (μία γραμμή όπου χωράει), περιεχόμενο. */
export function WorkspaceSection({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="grid min-w-0">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight">{title}</h3>
          {hint && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)] leading-snug">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
