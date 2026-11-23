import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyPage } from "@/components/site/PolicyPage";
import { getPolicy } from "@/lib/data/repo";
import { infoMeta } from "@/lib/seo/pages";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPolicy("prosvasimotita");
  return p ? infoMeta(p) : {};
}

export default async function Page() {
  const p = await getPolicy("prosvasimotita");
  if (!p) notFound();
  return <PolicyPage policy={p} />;
}
