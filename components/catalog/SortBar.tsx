"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Ruler } from "lucide-react";
import { useMySpace } from "@/components/space/MySpaceProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("sortBar");

const SORTS: { v: string; label: string }[] = [
  { v: "relevance", label: "Προτεινόμενα" },
  { v: "price-asc", label: "Τιμή αύξουσα" },
  { v: "price-desc", label: "Τιμή φθίνουσα" },
  { v: "discount", label: "Μεγαλύτερη έκπτωση" },
  { v: "rating", label: "Αξιολόγηση" },
  { v: "newest", label: "Νεότερα" },
];

/** `fit`: η λίστα έχει προϊόντα όπου ο χώρος είναι κριτήριο (μεγάλες συσκευές, τηλεοράσεις) — μόνο τότε προσφέρεται ο έλεγχος. */
export function SortBar({ total, page, pages, fit = false }: { total: number; page: number; pages: number; fit?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (!v) next.delete(k);
    else next.set(k, v);
    if (k !== "page") next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const view = sp.get("view") ?? "grid";
  const { space, checking, setChecking } = useMySpace();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="text-eu-muted text-[length:var(--fs-15)]">
        <strong className="text-eu-ink">{total}</strong> προϊόντα{pages > 1 ? ` · σελίδα ${page} από ${pages}` : ""}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {space && fit && (
          <button type="button" aria-pressed={checking} onClick={() => setChecking(!checking)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 min-h-10 font-semibold text-[length:var(--fs-15)] cursor-pointer transition-colors ${checking ? "bg-eu-navy border-eu-navy text-white" : "bg-white border-eu-line text-eu-ink hover:border-eu-navy"}`}>
            <Ruler className="size-4" aria-hidden /> Τι χωράει στον χώρο μου
          </button>
        )}
        <label htmlFor="sort" className="sr-only">
          {c.taxinomisi}
        </label>
        <select id="sort" value={sp.get("sort") ?? "relevance"} onChange={(e) => setParam("sort", e.target.value === "relevance" ? null : e.target.value)} className="rounded-full border border-eu-line bg-white px-3 py-2 text-[length:var(--fs-15)] font-semibold min-h-10">
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="hidden @md:inline-flex rounded-full border border-eu-line overflow-hidden" role="group" aria-label={c.provoli}>
          <button type="button" aria-pressed={view === "grid"} onClick={() => setParam("view", null)} className={`size-10 inline-flex items-center justify-center ${view === "grid" ? "bg-eu-navy text-white" : "text-eu-muted hover:bg-eu-surface"}`} aria-label={c.plegma}>
            <LayoutGrid className="size-4" aria-hidden />
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setParam("view", "list")} className={`size-10 inline-flex items-center justify-center ${view === "list" ? "bg-eu-navy text-white" : "text-eu-muted hover:bg-eu-surface"}`} aria-label={c.lista}>
            <List className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
