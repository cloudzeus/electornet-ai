import type { Metadata } from "next";
import Image from "@/components/ui/Image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { getGuidesFull } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Οδηγοί αγοράς & blog", description: "Πρώτα καταλαβαίνεις, μετά αγοράζεις: οδηγοί για κλιματιστικά, laptops, ενεργειακή ετικέτα, Renew." };

const TONE = { blue: "text-eu-blue", red: "text-eu-red", green: "text-eu-green" };

export default async function GuidesPage() {
  const guides = await getGuidesFull();
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Οδηγοί" }]} />
      <PageIntro kicker="Οδηγοί αγοράς & blog" title="Πρώτα καταλαβαίνεις, μετά αγοράζεις" lead="Κάθε οδηγός τελειώνει σε αγοραστική διαδρομή — γιατί το περιεχόμενο εδώ είναι το κανάλι για ερωτήματα πρώιμης πρόθεσης." />
      <div className="eu-canvas eu-gutter pb-12">
        <ul className="m-0 p-0 list-none grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-4">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link href={`/odigoi/${g.slug}`} className="flex flex-col h-full rounded-xl border border-eu-line bg-white overflow-hidden hover:border-eu-blue group">
                <div className="relative h-[160px] bg-eu-placeholder">{g.image && <Image src={g.image} alt="" fill sizes="400px" className="object-cover" />}</div>
                <div className="p-4 flex flex-col flex-1">
                  <div className={`font-extrabold text-[length:var(--fs-13)] tracking-wide mb-2 ${TONE[g.tone]}`}>
                    {g.kicker} · {g.minutes}′{g.date ? ` · ${new Date(g.date).toLocaleDateString("el-GR", { day: "numeric", month: "short" })}` : ""}
                  </div>
                  <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-[1.22] mb-2 group-hover:text-eu-blue">{g.title}</h2>
                  <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">{g.excerpt}</p>
                  <span className="font-extrabold text-eu-blue text-[length:var(--fs-14)] mt-auto pt-3">{g.cta}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
