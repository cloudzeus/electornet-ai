import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { DeviceProvider } from "@/components/fluid/DeviceProvider";
import { getDevice } from "@/lib/device";
import { getPublicSettings } from "@/lib/settings/store";
import { Analytics } from "@/components/site/Analytics";
import { cleanAnalyticsIds } from "@/lib/security/analytics-ids";
import { headers } from "next/headers";
import { NonceProvider } from "@/components/ui/SxStyleTag";
import "./globals.css";

// Brand typeface "Euronics" is proprietary. Manrope (variable, Greek +
// Latin from ONE family) replaces the Poppins+Manrope pair: mixing two
// families per glyph gave Greek text different weights and metrics.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["greek", "latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const pub = await getPublicSettings();
  const gsc = pub.analytics?.gsc as string | undefined;
  return {
    ...(gsc ? { verification: { google: gsc } } : {}),
  ...BASE_METADATA,
  };
}

const BASE_METADATA: Metadata = {
  title: { default: "euronics.gr — Πρόταση ανασχεδιασμού", template: "%s · euronics" },
  description: "Νέο frontend euronics.gr: 350 καταστήματα, 12 υπηρεσίες, αγορά σε ένα βήμα.",
  // Το Safari του iPhone κάνει μόνο του συνδέσμους τους μεγάλους αριθμούς (κωδικός, EAN) και αλλάζει το HTML πριν
  // φορτώσει το React — σφάλμα hydration. Τα τηλέφωνα καταστημάτων είναι ήδη ρητοί σύνδεσμοι tel:.
  formatDetection: { telephone: false, address: false, email: false, date: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d428a",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ device, touch, saveData }, pub, h] = await Promise.all([getDevice(), getPublicSettings(), headers()]);
  // τα IDs μπαίνουν σε inline scripts: μόνο [A-Za-z0-9_-] (ο έλεγχος της φόρμας ρυθμίσεων τρέχει μόνο στον browser)
  const analytics = cleanAnalyticsIds(pub.analytics);
  return (
    <html
      lang="el"
      data-device={device}
      className={`${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-eu-ink">
        <NonceProvider nonce={h.get("x-nonce") ?? undefined}><DeviceProvider initial={{ device, touch, saveData }}>{children}</DeviceProvider></NonceProvider>
        <Analytics {...analytics} nonce={h.get("x-nonce") ?? undefined} />
      </body>
    </html>
  );
}
