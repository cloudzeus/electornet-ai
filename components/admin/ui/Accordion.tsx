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
    <details id={id} open={defaultOpen} className="group/acc rounded-xl border border-eu-line bg-white min-w-0 scroll-mt-24 [&[open]]:border-eu-line-2">
      <summary className="list-none cursor-pointer flex items-center gap-3 px-3 @md:px-4 min-h-14 py-2 rounded-xl hover:bg-eu-surface/60 focus-visible:outline-2 focus-visible:outline-eu-blue [&::-webkit-details-marker]:hidden">
        {icon && <span className="size-8 shrink-0 grid place-items-center rounded-lg bg-eu-surface text-eu-blue">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-heading font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight">{title}</span>
          {summary && <span className="block text-eu-muted text-[length:var(--fs-13)] leading-snug truncate">{summary}</span>}
        </span>
        {badge && <span className="shrink-0">{badge}</span>}
        <ChevronDown className="size-4 shrink-0 text-eu-muted transition-transform group-open/acc:rotate-180" aria-hidden />
      </summary>
      <div className="px-3 @md:px-4 pb-4 pt-1 min-w-0">{children}</div>
    </details>
  );
}
