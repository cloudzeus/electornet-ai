"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavCategory } from "@/lib/data/nav";
import { navUtility } from "@/lib/data/nav";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("mobileMenu");

/** Phones/tablets: the mega menu becomes an accordion drawer, one level open at a time, all keyboard reachable. */
export function MobileMenu({ categories }: { categories: NavCategory[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Sheet>
      <SheetTrigger
        className="@lg:hidden inline-flex items-center justify-center size-11 rounded-full text-white hover:bg-eu-navy-2"
        aria-label={c.menoy}
      >
        <Menu className="size-6" aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-[380px] p-0 gap-0 bg-white">
        <div className="p-4 border-b border-eu-line">
          <SheetTitle className="font-extrabold text-eu-ink text-[length:var(--fs-17)]">{c.katigories}</SheetTitle>
        </div>
        <nav aria-label={c.katigories} className="overflow-y-auto">
          <ul className="m-0 p-0 list-none">
            {categories.map((c) => {
              const isOpen = open === c.slug;
              return (
                <li key={c.slug} className="border-b border-eu-line-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : c.slug)}
                    className="w-full flex items-center justify-between px-4 py-3 min-h-12 font-semibold text-eu-ink text-[length:var(--fs-16)]"
                  >
                    <span>
                      {c.label} <span className="text-eu-muted-2 font-normal text-[length:var(--fs-14)]">· {c.count}</span>
                    </span>
                    <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {isOpen && (
                    <ul className="m-0 p-0 pb-2 list-none bg-eu-surface">
                      <li>
                        <Link href={`/k/${c.slug}`} className="block px-6 py-2.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-15)]">
                          Όλα · {c.label}
                        </Link>
                      </li>
                      {c.children.map((ch) => (
                        <li key={ch.slug}>
                          <Link href={`/k/${c.slug}/${ch.slug}`} className="block px-6 py-2.5 min-h-11 text-eu-ink-2 text-[length:var(--fs-15)]">
                            {ch.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {navUtility.map((u) => (
              <li key={u.slug} className="border-b border-eu-line-2">
                <Link
                  href={`/${u.slug}`}
                  className={`block px-4 py-3 min-h-12 font-bold text-[length:var(--fs-16)] ${u.tone === "offer" ? "text-eu-red" : "text-eu-ink"}`}
                >
                  {u.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
