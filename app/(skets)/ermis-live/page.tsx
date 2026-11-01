import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sketsKeyOk } from "@/lib/skets/auth";
import snapshot from "@/lib/skets/snapshot.json";
import type { Snapshot } from "@/lib/skets/types";
import Stage from "@/components/skets/StageClient";

export const metadata: Metadata = { title: "Ερμής — σκηνή", robots: { index: false, follow: false } };

/** Η σκηνή του σκετς στον προβολέα: /ermis-live?k=<SKETS_KEY> (&prova=1 → η κλήση πάει στο SKETS_TEST_TO · &dry=1 → προσομοιωμένη κλήση, χωρίς τηλέφωνο). */
export default async function Page({ searchParams }: PageProps<"/ermis-live">) {
  const sp = await searchParams;
  const k = typeof sp.k === "string" ? sp.k : "";
  if (!sketsKeyOk(k)) notFound();
  return <Stage snap={snapshot as Snapshot} k={k} rehearsal={sp.prova === "1" || sp.dry === "1"} dry={sp.dry === "1"} />;
}
