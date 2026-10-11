import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Ενότητα που ανοιγοκλείνει (native <details>: πληκτρολόγιο και αναγνώστες οθόνης χωρίς JavaScript). Για σελίδες με πολλές
 * ενότητες, όπως η καρτέλα προϊόντος: ο τίτλος, μια γραμμή περίληψης και δεξιά μια μικρή ένδειξη (π.χ. «4 φωτογραφίες»).
 */
export function AccordionItem({ title, summary, badge, icon, defaultOpen = false, id, children }: {
  title: string; summary?: ReactNode; badge?: ReactNode; icon?: ReactNode; defaultOpen?: boolean; id?: string; children: ReactNode;
}) {
  return (
    <details id={id} open={defaultOpen} className="group/acc rounded-xl border border-eu-line bg-white min-w-0 scroll-mt-24">
      <summary className="list-none cursor-pointer flex items-center gap-2.5 px-3 min-h-12 md:min-h-11 py-1.5 rounded-xl hover:bg-eu-surface/60 focus-visible:outline-2 focus-visible:outline-eu-blue [&::-webkit-details-marker]:hidden">
        {icon && <span className="size-7 shrink-0 grid place-items-center rounded-md bg-eu-surface text-eu-blue">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-heading font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight">{title}</span>
          {summary && <span className="block text-eu-muted text-[length:var(--fs-12)] leading-snug truncate">{summary}</span>}
        </span>
        {badge && <span className="shrink-0">{badge}</span>}
        <ChevronDown className="size-4 shrink-0 text-eu-muted transition-transform group-open/acc:rotate-180" aria-hidden />
      </summary>
      <div className="px-3 pb-3 pt-0.5 min-w-0">{children}</div>
    </details>
  );
}
