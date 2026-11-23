import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyPage } from "@/components/site/PolicyPage";
import { getPolicy } from "@/lib/data/repo";
import { infoMeta } from "@/lib/seo/pages";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPolicy("tropoi-apostolis");
  return p ? infoMeta(p) : {};
}

export default async function Page({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const p = await getPolicy("tropoi-apostolis");
  if (!p) notFound();
  return <PolicyPage policy={p} zones={{ page: "tropoi-apostolis", preview: (await searchParams).preview === "1" }} />;
}
