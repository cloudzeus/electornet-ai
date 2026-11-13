import { homeDeals } from "@/lib/cms/home-deals";
import { CartProvider } from "@/components/commerce/CartProvider";
import { CartGateDialog } from "@/components/commerce/CartGateDialog";
import { cartGates } from "@/lib/promo/cart-gate";
import { QuickBuySheet } from "@/components/commerce/QuickBuySheet";
import { MiniCart } from "@/components/commerce/MiniCart";
import { QuickViewSheet } from "@/components/commerce/QuickViewSheet";
import { getMegaMenuData, getCategoryTree } from "@/lib/data/repo";
import { CompareTray } from "@/components/commerce/CompareTray";
import { AnnouncementBar } from "@/components/site/AnnouncementBar";
import { SiteHeader } from "@/components/site/SiteHeader";
import { StickyHeader } from "@/components/site/StickyHeader";
import { MegaNav } from "@/components/site/MegaNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CookieConsent } from "@/components/site/CookieConsent";
import { MySpaceProvider } from "@/components/space/MySpaceProvider";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { getSettings } from "@/lib/cms/settings-server";
import { MySpaceSheet } from "@/components/space/MySpaceSheet";
import { AdvisorProvider } from "@/components/advisor/AdvisorContext";
import { AdvisorOrb } from "@/components/advisor/AdvisorOrb";
import { AdvisorGreeting } from "@/components/advisor/AdvisorGreeting";
import { SnapSheet } from "@/components/snap/SnapSheet";
import { AutoReveal } from "@/components/motion/AutoReveal";
import { ExitIntent } from "@/components/site/ExitIntent";

/** Shop frame: terms rail, header, mega nav, page, footer + the three drawers (mini-cart, quick buy, compare). */
export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const [suggestions, menu, settings, tree, gates] = await Promise.all([
    homeDeals({ source: "auto", limit: 4 }).then((d) => d.products.slice(0, 4)).catch(() => []),
    getMegaMenuData(),
    getSettings(),
    getCategoryTree(),
    cartGates().catch(() => []),
  ]);
  return (
    <SettingsProvider settings={settings}>
      <CartProvider gates={gates}>
        <MySpaceProvider>
          <AdvisorProvider>
            {/* WCAG 2.4.1: φαίνεται μόνο όταν πάρει εστίαση με Tab */}
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1000] focus:rounded-lg focus:bg-white focus:text-eu-navy focus:font-bold focus:px-4 focus:py-3">
              Μετάβαση στο περιεχόμενο
            </a>
            <AnnouncementBar
              zoneNo={1}
              left={settings.site.announcement.left}
              right={settings.site.announcement.right}
              accent={settings.site.announcement.accent}
            />
            <StickyHeader>
              <SiteHeader />
              <MegaNav data={menu} categories={tree} />
            </StickyHeader>
            <main id="main" className="flex-1 bg-white">
              {children}
            </main>
            <SiteFooter />
            <MiniCart suggestions={suggestions} />
            <QuickBuySheet />
            <CartGateDialog />
            <QuickViewSheet />
            <CompareTray />
            <CookieConsent />
            <MySpaceSheet />
            <AdvisorOrb />
            <AdvisorGreeting />
            <SnapSheet />
            <AutoReveal />
            <ExitIntent />
          </AdvisorProvider>
        </MySpaceProvider>
      </CartProvider>
    </SettingsProvider>
  );
}
