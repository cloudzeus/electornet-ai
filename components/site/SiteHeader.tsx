import Image from "next/image";
import Link from "next/link";
import { Heart, Phone, User } from "lucide-react";
import { SearchBox } from "./SearchBox";
import { CartButton } from "./CartButton";
import { MobileMenu } from "./MobileMenu";
import { ZoneBadge } from "./ZoneBadge";
import { getCategoryTree } from "@/lib/data/repo";
import { MySpaceButton } from "@/components/space/MySpaceSheet";
import { getSettings } from "@/lib/cms/settings";

/**
 * Zone 2 — dark brand-blue header. The yellow search button is the
 * brightest point of the page: that is where we want the first click.
 * Phone orders stay first-level for the white-goods audience.
 *
 * Adaptive: on phones the row collapses to burger · logo · cart and the
 * search box drops to a second full-width line (still visible, never
 * hidden behind an icon).
 */
export async function SiteHeader() {
  const [{ site }, navCategories] = await Promise.all([getSettings(), getCategoryTree()]);
  return (
    <header className="relative bg-eu-navy text-white eu-container">
      <ZoneBadge no={2} />
      <div className="eu-full eu-gutter-wide py-2.5 @lg:py-[18px] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 @md:gap-3 @lg:gap-6">
        <div className="flex items-center gap-2">
          <MobileMenu categories={navCategories} />
          <Link href="/" aria-label="euronics — αρχική σελίδα" className="block shrink-0">
            <Image src="/design/logo-on-blue.svg" alt="euronics" width={132} height={34} priority className="h-[22px] @sm:h-[26px] @lg:h-[34px] w-auto" />
          </Link>
        </div>

        <div className="hidden @md:block min-w-0">
          <SearchBox categories={navCategories} />
        </div>

        <div className="flex items-center gap-1.5 @md:gap-3 @lg:gap-[18px] justify-end">
          <a
            href={`tel:${site.contact.phone}`}
            className="hidden @7xl:flex flex-col items-center text-white font-semibold text-[length:var(--fs-13-5)] leading-tight hover:text-eu-yellow"
          >
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden /> {site.contact.phoneDisplay}
            </span>
            <span className="text-eu-on-dark-2 font-normal mt-0.5">{site.contact.phoneLabel}</span>
          </a>
          <span className="hidden @7xl:block w-px h-[26px] bg-eu-navy-line" aria-hidden />
          <MySpaceButton className="hidden @6xl:flex" />
          <Link
            href="/lista"
            className="hidden @lg:flex flex-col items-center gap-0.5 text-eu-on-dark-2 font-semibold text-[length:var(--fs-13-5)] hover:text-white min-h-11 justify-center"
          >
            <Heart className="size-4" aria-hidden />
            Λίστα
          </Link>
          <Link
            href="/logariasmos"
            className="hidden @lg:flex flex-col items-center gap-0.5 text-eu-on-dark-2 font-semibold text-[length:var(--fs-13-5)] hover:text-white min-h-11 justify-center"
          >
            <User className="size-4" aria-hidden />
            Λογαριασμός
          </Link>
          <CartButton />
        </div>

        <div className="col-span-3 @md:hidden pt-0.5">
          <SearchBox compact categories={navCategories} />
        </div>
      </div>
    </header>
  );
}
