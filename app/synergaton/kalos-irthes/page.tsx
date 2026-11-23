import { getPortalUser, portalBase } from "@/lib/partner-portal/session";
import { INTRO_VIDEO } from "@/lib/partner-portal/intro";
import { IntroVideo } from "@/components/synergaton/IntroVideo";

export const metadata = { title: "Καλώς ήρθες" };
export const dynamic = "force-dynamic";

/** Παρουσίαση της πύλης (video 45″), μετά «Είσοδος». Ανοίγει από το «Δες την παρουσίαση» της σελίδας εισόδου. */
export default async function IntroPage() {
  const base = await portalBase();
  const href = (await getPortalUser()) ? base || "/" : `${base}/eisodos`;
  return <IntroVideo landscape={INTRO_VIDEO.landscape} portrait={INTRO_VIDEO.portrait} hq={INTRO_VIDEO.hq} download={INTRO_VIDEO.uhd} href={href} />;
}
