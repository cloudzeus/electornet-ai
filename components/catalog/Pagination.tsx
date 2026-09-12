import Link from "next/link";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("pagination");

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
  return (
    <nav aria-label={c.selides} className="flex items-center justify-center gap-1 mt-8">
      {page > 1 && (
        <Link href={href(page - 1)} className="rounded-full border border-eu-line px-3 min-h-10 inline-flex items-center font-semibold text-[length:var(--fs-15)] hover:border-eu-blue">
          {c.proigoymeni}
        </Link>
      )}
      {nums.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && nums[i - 1] !== p - 1 && <span className="text-eu-muted-2 px-1">…</span>}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={`size-10 inline-flex items-center justify-center rounded-full font-bold text-[length:var(--fs-15)] ${p === page ? "bg-eu-navy text-white" : "border border-eu-line hover:border-eu-blue"}`}>
            {p}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} className="rounded-full border border-eu-line px-3 min-h-10 inline-flex items-center font-semibold text-[length:var(--fs-15)] hover:border-eu-blue">
          {c.epomeni}
        </Link>
      )}
    </nav>
  );
}
