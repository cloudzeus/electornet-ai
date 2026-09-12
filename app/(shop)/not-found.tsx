import Link from "next/link";
import Image from "next/image";
import { SearchBox } from "@/components/site/SearchBox";
import { getSettings } from "@/lib/cms/settings";

/** 404 with the shop frame, search and the four most useful exits. */
export default async function NotFound() {
  const { advisor } = await getSettings();
  return (
    <div className="eu-container">
      <div className="eu-canvas eu-gutter py-14 max-w-[640px] text-center mx-auto">
        <Image src={advisor.avatar} alt="" width={110} height={232} className="mx-auto mb-4 eu-float drop-shadow-[0_18px_24px_rgba(18,42,88,.25)]" priority />
        <div className="font-extrabold text-eu-yellow-dark text-[length:var(--fs-13-5)] tracking-wide mb-2">Σφάλμα 404</div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-32)] leading-[1.1]">{advisor.notFound.title}</h1>
        <p className="m-0 mt-2 text-eu-muted text-[length:var(--fs-16)]">{advisor.notFound.body}</p>
        <div className="my-6 text-left">
          <SearchBox />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {[["/", "Αρχική"], ["/prosfores", "Προσφορές"], ["/proionta", "Όλα τα προϊόντα"], ["/katastimata", "Καταστήματα"], ["/entopismos", "Παρακολούθηση παραγγελίας"]].map(([h, t]) => (
            <Link key={h} href={h} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-11 inline-flex items-center hover:bg-eu-surface">
              {t}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
