import Link from "next/link";
import { ZoneBadge } from "./ZoneBadge";

interface Props {
  left: string[];
  right: string[];
  accent?: { label: string; href: string };
  zoneNo?: number;
}

/** Zone 1 — the *terms* rail: network, shipping, instalments, withdrawal. Legal info the law wants reachable. */
export function AnnouncementBar({ left, right, accent, zoneNo }: Props) {
  return (
    <div className="relative bg-eu-navy text-eu-on-dark-2 eu-container">
      <ZoneBadge no={zoneNo} />
      <div className="eu-full eu-gutter-wide flex justify-between items-center gap-4 py-2.5 font-semibold text-[length:var(--fs-13-5)] tracking-wide overflow-hidden">
        <ul className="flex gap-4 @lg:gap-6 m-0 p-0 list-none whitespace-nowrap min-w-0">
          {left.map((t, i) => (
            <li key={t} className={`${i === 0 ? "text-white" : ""} ${i >= 1 ? "hidden @md:block" : ""} ${i >= 2 ? "@md:hidden @6xl:block" : ""}`}>
              {t}
            </li>
          ))}
        </ul>
        <ul className="hidden @5xl:flex gap-5 m-0 p-0 list-none whitespace-nowrap shrink-0">
          {right.map((t) => (
            <li key={t}>{t}</li>
          ))}
          {accent && (
            <li>
              <Link href={accent.href} className="text-eu-yellow hover:underline">
                {accent.label}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
