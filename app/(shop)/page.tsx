import { getHomeLayout } from "@/lib/cms/home.layout";
import { renderZones } from "@/lib/cms/render";
import { getDevice } from "@/lib/device";
import type { RenderContext } from "@/lib/cms/zones";
import { ZonesToggle } from "@/components/site/ZonesToggle";
import { AdSlot } from "@/components/promo/AdSlot";

/**
 * Homepage = zones resolved from the CMS layout for *this* request
 * (device, audience, schedule, A/B bucket), rendered by the widget
 * registry. The frame (header, nav, footer, drawers) lives in the
 * (shop) layout.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const [{ device, saveData }, layout, sp] = await Promise.all([getDevice(), getHomeLayout(), searchParams]);
  const ctx: RenderContext = { now: new Date(), device, audience: "guest", saveData, bucket: 0 };
  const [main, preFooter] = await Promise.all([renderZones(layout.zones, ctx, "main"), renderZones(layout.zones, ctx, "pre-footer")]);
  return (
    <>
      <ZonesToggle enabled={sp.zones === "1"} />
      {main}
      <AdSlot slot="home-strip" className="eu-canvas eu-gutter py-6" />
      {preFooter}
    </>
  );
}
