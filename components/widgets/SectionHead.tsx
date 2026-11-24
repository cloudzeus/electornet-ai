import Link from "next/link";

interface Props {
  id?: string;
  kicker: string;
  title: string | [string, string];
  link?: { label: string; href: string };
  tone?: "light" | "dark" | "offer";
}

/** Shared section header: kicker, two-line heavy title, one underlined link. data-look: τα χρώματα που ορίζει ο διαχειριστής στην «Εμφάνιση» (globals.css, .eu-look). */
export function SectionHead({ id, kicker, title, link, tone = "light" }: Props) {
  const dark = tone === "dark";
  const kickerColor = tone === "offer" ? "text-eu-red" : dark ? "text-eu-yellow" : "text-eu-blue";
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <div data-look="kicker" className={`font-extrabold text-[length:var(--fs-13)] tracking-wide mb-2 ${kickerColor}`}>{kicker}</div>
        <h2 id={id} data-look="title" className={`m-0 font-heading font-bold text-[length:var(--fs-30)] leading-[1.1] tracking-[-0.02em] ${dark ? "text-white" : "text-eu-ink"}`}>
          {Array.isArray(title) ? (
            <>
              {title[0]}
              <br className="hidden @md:block" /> {title[1]}
            </>
          ) : (
            title
          )}
        </h2>
      </div>
      {link && (
        <Link
          href={link.href}
          data-look="link"
          className={`hidden @sm:block shrink-0 font-extrabold text-[length:var(--fs-14)] border-b-[3px] border-eu-yellow pb-1 hover:text-eu-blue ${dark ? "text-eu-yellow" : "text-eu-ink"}`}
        >
          {link.label}
        </Link>
      )}
    </div>
  );
}
