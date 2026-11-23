import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("pagination");
// στο κινητό μόνο βελάκι: η λέξη δεν χωρά δίπλα στους αριθμούς στα 360px (μένει ως aria-label)
const STEP = "rounded-full border border-eu-line size-10 sm:w-auto sm:px-3 inline-flex items-center justify-center whitespace-nowrap font-semibold text-[length:var(--fs-15)] hover:border-eu-blue";

/** Numbered pagination that keeps every other query param. */
export function Pagination({ page, pages, basePath, params }: { page: number; pages: number; basePath: string; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  // με «…» και στις δύο πλευρές η σειρά δεν χωρά στα 360px: στο κινητό κρύβονται οι γείτονες (τους καλύπτουν τα βελάκια)
  const tight = page > 3 && page < pages - 2;
  return (
    <nav aria-label={c.selides} className="flex flex-wrap items-center justify-center gap-1 mt-8">
      {page > 1 && (
        <Link href={href(page - 1)} aria-label={c.proigoymeni} className={STEP}>
          <ChevronLeft className="size-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">{c.proigoymeni}</span>
        </Link>
      )}
      {nums.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && nums[i - 1] !== p - 1 && <span className="text-eu-muted-2 px-1">…</span>}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={`size-10 ${tight && Math.abs(p - page) === 1 ? "hidden sm:inline-flex" : "inline-flex"} items-center justify-center rounded-full font-bold text-[length:var(--fs-15)] ${p === page ? "bg-eu-navy text-white" : "border border-eu-line hover:border-eu-blue"}`}>
            {p}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} aria-label={c.epomeni} className={STEP}>
          <ChevronRight className="size-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">{c.epomeni}</span>
        </Link>
      )}
    </nav>
  );
}
