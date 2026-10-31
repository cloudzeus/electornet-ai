import { getPortalUser, portalBase } from "@/lib/partner-portal/session";
import { INTRO_VIDEO } from "@/lib/partner-portal/intro";
import { IntroVideo } from "@/components/synergaton/IntroVideo";

export const metadata = { title: "Καλώς ήρθες" };
export const dynamic = "force-dynamic";

/** Πρώτη σελίδα της πύλης για όσους δεν έχουν συνδεθεί: video 45″ με τις δυνατότητες, μετά «Είσοδος». */
export default async function IntroPage() {
  const base = await portalBase();
  const href = (await getPortalUser()) ? base || "/" : `${base}/eisodos`;
  return <IntroVideo landscape={INTRO_VIDEO.landscape} portrait={INTRO_VIDEO.portrait} href={href} />;
}
