"use client";

import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "./nav";
import { bestMatch } from "./nav-match";

/** Header title from the nav map (client, so it follows soft navigation). */
export function AdminTitle({ fallback }: { fallback: string }) {
  const path = usePathname();
  const item = bestMatch(path, ADMIN_NAV.flatMap((g) => g.items));
  return <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{item?.label ?? fallback}</h1>;
}
