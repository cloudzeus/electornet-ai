import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sketsKeyOk } from "@/lib/skets/auth";
import Remote from "@/components/skets/Remote";

export const metadata: Metadata = { title: "Ερμής — τηλεχειριστήριο", robots: { index: false, follow: false } };

/** Τηλεχειριστήριο του χειριστή (κινητό): /ermis-live/remote?k=<SKETS_KEY>. */
export default async function Page({ searchParams }: PageProps<"/ermis-live/remote">) {
  const sp = await searchParams;
  const k = typeof sp.k === "string" ? sp.k : "";
  if (!sketsKeyOk(k)) notFound();
  return <Remote k={k} />;
}
