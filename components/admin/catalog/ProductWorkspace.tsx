import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleAlert } from "lucide-react";
import type { Readiness, TabId, TabState } from "@/lib/catalog/readiness";

/** Οι καρτέλες της σελίδας προϊόντος, με τη σειρά της δουλειάς (συχνότερα πρώτα). */
/** Οι καρτέλες του χώρου εργασίας: οι πέντε της ετοιμότητας και η «Set» (μόνο σε προϊόντα που πουλιούνται ως set). */
export type WorkspaceTab = TabId | "set";
export const TABS: { id: WorkspaceTab; label: string; short: string }[] = [
  { id: "media", label: "Εικόνες & βίντεο", short: "Εικόνες" },
  { id: "content", label: "Κείμενα & χαρακτηριστικά", short: "Κείμενα" },
  { id: "dims", label: "Διαστάσεις · AR · EPREL", short: "Διαστάσεις" },
  { id: "commerce", label: "Τιμή · προσφορές · stickers", short: "Τιμή" },
  { id: "set", label: "Set · μέλη", short: "Set" },
  { id: "erp", label: "ERP", short: "ERP" },
];
export const isTab = (v: string | undefined): v is WorkspaceTab => TABS.some((t) => t.id === v);

const DOT: Record<TabState, string> = { ok: "", warn: "bg-eu-amber", bad: "bg-eu-red" };

/** «Ετοιμότητα N/M» και οι ελλείψεις ως chips — κάθε chip ανοίγει την καρτέλα που τη διορθώνει. */
export function ReadinessBar({ r, href }: { r: Readiness; href: (t: TabId) => string }) {
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 100;
  const full = r.done === r.total;
  return (
    <section aria-label="Ετοιμότητα για το site" className="rounded-2xl border border-eu-line bg-white p-3 grid gap-2 min-w-0">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-15)] whitespace-nowrap">
          {full ? <CheckCircle2 className="size-4 text-eu-green" aria-hidden /> : <CircleAlert className="size-4 text-eu-amber" aria-hidden />} Ετοιμότητα {r.done}/{r.total}
        </span>
        <span className="flex-1 h-2 rounded-full bg-eu-surface overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Ποσοστό ετοιμότητας">
          <span className={`block h-full rounded-full ${full ? "bg-eu-green" : "bg-eu-amber"}`} style={{ width: `${pct}%` }} />
        </span>
      </div>
      {r.missing.length > 0 ? (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
          {r.missing.map((m) => (
            <li key={m.id}>
              <Link href={href(m.tab)} className={`inline-flex items-center gap-1 rounded-full px-2.5 min-h-9 font-bold text-[length:var(--fs-13)] ${m.level === "required" ? "bg-eu-red/10 text-eu-red hover:bg-eu-red/15" : "bg-eu-amber/15 text-eu-ink-2 hover:bg-eu-amber/25"}`}>
                {m.level === "required" && <AlertCircle className="size-3.5" aria-hidden />} {m.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Όλα έτοιμα για το site.</p>}
    </section>
  );
}

/** Λωρίδα καρτελών (σύνδεσμοι — η καρτέλα μένει στη διεύθυνση), με τελεία όπου κάτι λείπει. */
export function WorkspaceTabs({ active, states, href, hide = [] }: { active: WorkspaceTab; states: Record<TabId, TabState>; href: (t: WorkspaceTab) => string; hide?: WorkspaceTab[] }) {
  return (
    <nav aria-label="Ενότητες προϊόντος" className="grid grid-cols-3 @2xl:flex @2xl:flex-wrap gap-1 rounded-2xl bg-eu-surface p-1">
      {TABS.filter((t) => !hide.includes(t.id)).map((t) => {
        const on = t.id === active, st = t.id === "set" ? "ok" : states[t.id];
        return (
          <Link key={t.id} href={href(t.id)} aria-current={on ? "page" : undefined} scroll={false}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 @2xl:px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${on ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}>
            <span className="@4xl:hidden">{t.short}</span><span className="hidden @4xl:inline">{t.label}</span>
            {st !== "ok" && <span className={`size-2 rounded-full ${DOT[st]}`} aria-label={st === "bad" ? "λείπει κάτι απαραίτητο" : "λείπει κάτι προτεινόμενο"} />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Μια ενότητα μέσα σε καρτέλα: τίτλος, ορατή εξήγηση, περιεχόμενο. */
export function WorkspaceSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0">
      <div className="grid gap-0.5">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{title}</h3>
        {hint && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
