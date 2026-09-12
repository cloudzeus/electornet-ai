import Link from "next/link";
import { Breadcrumbs } from "./Breadcrumbs";
import { PageIntro } from "./PageIntro";
import type { Policy } from "@/lib/data/types";
import { StickySidebar } from "@/components/fluid/StickySidebar";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("policy");

const NAV = [
  { href: "/tropoi-pliromis", label: "Τρόποι πληρωμής" },
  { href: "/tropoi-apostolis", label: "Τρόποι αποστολής" },
  { href: "/epistrofes", label: "Επιστροφές" },
  { href: "/syxnes-erotiseis", label: "Συχνές ερωτήσεις" },
  { href: "/oroi-chrisis", label: "Όροι χρήσης" },
  { href: "/aporrito", label: "Απόρρητο" },
  { href: "/cookies", label: "Cookies" },
  { href: "/oikonomika-stoixeia", label: "Οικονομικά στοιχεία" },
  { href: "/epikoinonia", label: "Επικοινωνία" },
];

/** Turns bare URLs and emails inside verbatim text into links. */
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+|[\w.+-]+@[\w-]+\.[\w.]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noreferrer"
        className="text-eu-blue underline"
      >
        {p.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    ) : /^[\w.+-]+@/.test(p) ? (
      <a key={i} href={`mailto:${p}`} className="text-eu-blue underline">
        {p}
      </a>
    ) : (
      p
    ),
  );
}

/** Shared layout for policy / help pages: sidebar nav + sectioned content, source link to euronics.gr. */
export function PolicyPage({
  policy,
  children,
}: {
  policy: Policy;
  children?: React.ReactNode;
}) {
  return (
    <div className="eu-container">
      <Breadcrumbs
        items={[
          { label: "Εξυπηρέτηση", href: "/syxnes-erotiseis" },
          { label: policy.title },
        ]}
      />
      <PageIntro
        kicker="Εξυπηρέτηση"
        title={policy.title}
        lead={policy.intro}
      />
      <div className="eu-canvas eu-gutter pb-12 grid grid-cols-1 @3xl:grid-cols-[220px_minmax(0,1fr)] gap-8 items-stretch">
        <StickySidebar className="min-w-0">
          <nav aria-label={c.exypiretisi}>
            <ul className="m-0 p-0 list-none flex flex-wrap @3xl:flex-col gap-1">
              {NAV.map((n) => (
                <li key={n.href} className="shrink-0">
                  <Link
                    href={n.href}
                    aria-current={
                      n.href === `/${policy.slug}` ? "page" : undefined
                    }
                    className={`inline-flex rounded-full @3xl:rounded-md px-3.5 py-2.5 min-h-11 items-center font-semibold text-[length:var(--fs-15)] ${n.href === `/${policy.slug}` ? "bg-eu-navy text-white" : "bg-eu-surface @3xl:bg-transparent text-eu-ink-2 hover:bg-eu-chip"}`}
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </StickySidebar>
        <div className="max-w-[760px] grid grid-cols-1 gap-6">
          {policy.sections.map((s, si) => (
            <section key={si}>
              {s.title && (
                <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)] mb-2">
                  {s.title}
                </h2>
              )}
              {s.body.map((p, i) =>
                p.startsWith("## ") ? (
                  <h3
                    key={i}
                    className="m-0 mt-3 mb-1.5 font-bold text-eu-ink text-[length:var(--fs-16)]"
                  >
                    {p.slice(3)}
                  </h3>
                ) : (
                  <p
                    key={i}
                    className="m-0 mb-2 text-eu-ink-2 text-[length:var(--fs-16)] leading-relaxed break-words"
                  >
                    {linkify(p)}
                  </p>
                ),
              )}
            </section>
          ))}
          {children}
          {policy.sourceUrl && (
            <p className="m-0 text-eu-muted-2 text-[length:var(--fs-13-5)] border-t border-eu-line pt-3">
              {policy.verbatim
                ? `Κείμενο αυτούσιο από το euronics.gr (${policy.updated ?? ""})`
                : "Κείμενο συμπυκνωμένο από την τρέχουσα σελίδα του euronics.gr"}{" "}
              ·{" "}
              <a
                href={policy.sourceUrl}
                className="underline"
                rel="noreferrer"
                target="_blank"
              >
                {c.pigi}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
