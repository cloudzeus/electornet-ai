import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyPage } from "@/components/site/PolicyPage";
import { getPolicy } from "@/lib/data/repo";
import { sitePolicy } from "@/lib/data/policies-social";
import { envOrigin } from "@/lib/account/oauth-flow";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPolicy("cookies");
  return p ? { title: p.title, description: p.intro } : {};
}

export default async function Page({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const p = await getPolicy("cookies");
  if (!p) notFound();
  // οι διευθύνσεις του κειμένου έχουν το domain του .env (AUTH_URL), όχι αυτό από το οποίο άνοιξε η σελίδα
  return <PolicyPage policy={sitePolicy(p, await envOrigin())} zones={{ page: "cookies", preview: (await searchParams).preview === "1" }} />;
}
