import { redirect } from "next/navigation";

/** Τα σετ ζουν πια στον κατάλογο μαζί με τα είδη (φίλτρο «Τύπος: Σετ»)· η παλιά σελίδα «Bundles · sets» οδηγεί εκεί. */
export default async function SetsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(`/admin/catalog?type=set${q ? `&q=${encodeURIComponent(q)}` : ""}`);
}
