import Link from "next/link";
import { Check } from "lucide-react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("stepper");

/**
 * Checkout progress: Καλάθι → Στοιχεία & παράδοση → Πληρωμή → Επιβεβαίωση.
 * Done steps are links (you can always go back), the current one is
 * highlighted, the bar underneath shows how far you are.
 */
export function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = [
    { t: "Καλάθι", href: "/kalathi" },
    { t: "Στοιχεία & παράδοση", href: "/checkout" },
    { t: "Πληρωμή", href: "/checkout" },
    { t: "Επιβεβαίωση", href: undefined },
  ];
  return (
    <nav aria-label={c.vimata_agoras} className="py-5 @lg:py-6">
      <ol className="m-0 p-0 list-none grid grid-cols-4 gap-1 @md:gap-2">
        {steps.map((s, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          const inner = (
            <>
              <span className={`size-8 @md:size-9 rounded-full inline-flex items-center justify-center font-extrabold text-[length:var(--fs-15)] shrink-0 ${state === "done" ? "bg-eu-green text-white" : state === "current" ? "bg-eu-navy text-white" : "bg-eu-surface-2 text-eu-muted-2"}`}>
                {state === "done" ? <Check className="size-4" aria-hidden /> : n}
              </span>
              <span className={`font-bold text-[length:var(--fs-14)] @md:text-[length:var(--fs-15)] leading-tight ${state === "todo" ? "text-eu-muted-2" : "text-eu-ink"} hidden @md:inline`}>{s.t}</span>
            </>
          );
          return (
            <li key={s.t} className="grid gap-2" aria-current={state === "current" ? "step" : undefined}>
              {state === "done" && s.href ? (
                <Link href={s.href} className="flex items-center gap-2 min-h-10 hover:text-eu-blue">
                  {inner}
                </Link>
              ) : (
                <span className="flex items-center gap-2 min-h-10">{inner}</span>
              )}
              <span className={`h-1.5 rounded-full ${state === "todo" ? "bg-eu-surface-2" : state === "done" ? "bg-eu-green" : "bg-eu-navy"}`} aria-hidden />
            </li>
          );
        })}
      </ol>
      <div className="@md:hidden mt-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
        Βήμα {step} από 4 · {steps[step - 1].t}
      </div>
    </nav>
  );
}
