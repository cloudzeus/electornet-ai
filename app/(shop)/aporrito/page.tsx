import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyPage } from "@/components/site/PolicyPage";
import { getPolicy } from "@/lib/data/repo";
import { sitePolicy } from "@/lib/data/policies-social";
import { publicOrigin } from "@/lib/account/oauth-flow";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPolicy("aporrito");
  return p ? { title: p.title, description: p.intro } : {};
}

export default async function Page({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const p = await getPolicy("aporrito");
  if (!p) notFound();
  // οι διευθύνσεις του κειμένου ακολουθούν το domain που ανοίγει τη σελίδα (dev, demo, live)
  return <PolicyPage policy={sitePolicy(p, await publicOrigin())} zones={{ page: "aporrito", preview: (await searchParams).preview === "1" }} />;
}
